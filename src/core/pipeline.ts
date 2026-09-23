/**
 * KYNEX Core — async data-pipeline engine.
 *
 * A small, dependency-free orchestration layer for multi-stage async work
 * (material ingestion → extraction → validation → persistence; AI analysis;
 * batch operations). Built directly on the monadic Result module (./result)
 * so every stage failure is a typed value, never a throw that can crash the
 * runtime.
 *
 * Design properties:
 *  - Every stage runs inside a hard timeout (default 15s).
 *  - Every stage result passes through a caller-provided validator, so
 *    unvalidated data can never cross a stage boundary.
 *  - Retries are bounded and only applied to retryable failures (network
 *    classification from the Result error taxonomy).
 *  - Batch work runs with a bounded-concurrency scheduler — no unbounded
 *    Promise.all that can starve the runtime under load.
 *  - Short-circuit semantics: the first failed stage stops the pipeline with
 *    its exact error (no partial-success lies).
 */

import {
  type KynexError,
  type KynexErrorKind,
  err,
  ok,
  toKynexError,
  tryCatchAsync,
  type Result,
} from "./result";

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export interface StageContext {
  /** Values produced by earlier stages, keyed by stage name. */
  outputs: Readonly<Record<string, unknown>>;
  /** Abort signal — aborted when the pipeline is cancelled. */
  signal: AbortSignal;
}

export interface Stage<T> {
  /** Unique stage name — also the key its output is stored under. */
  name: string;
  /** The work. Must return a Result; thrown errors are captured as Errs. */
  run: (ctx: StageContext) => Promise<Result<T>> | Result<T>;
  /** Structural validator for this stage's output. A stage that returns
   *  invalid data is a failure, not a silent pass-through. */
  validate: (value: unknown) => value is T;
  /** Hard wall-clock limit for this stage. Default: 15_000 ms. */
  timeoutMs?: number;
  /** Max attempts for THIS stage (1 = no retry). Default: 1. */
  maxAttempts?: number;
  /** Optional friendly label used in error messages. */
  label?: string;
}

export interface PipelineOptions {
  /** Abort controller the caller can use to cancel the whole pipeline. */
  signal?: AbortSignal;
}

export interface PipelineOk {
  /** Final stage output. */
  value: unknown;
  /** All stage outputs by name. */
  outputs: Record<string, unknown>;
}

export type PipelineResult = Result<PipelineOk, KynexError>;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const DEFAULT_STAGE_TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reject with a timeout error unless the inner promise settles first.
 *  The losing branch's handle is cleared so nothing leaks. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

/** Execute stages sequentially, short-circuiting on the first failure.
 *  Every throw inside a stage is captured (tryCatchAsync) and classified,
 *  so the pipeline itself never throws. */
export async function runPipeline(
  stages: readonly Stage<unknown>[],
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const externalSignal = options.signal;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      return err({
        kind: "conflict",
        message: "The operation was cancelled before it started.",
        retryable: false,
      });
    }
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const outputs: Record<string, unknown> = {};

  try {
    for (const stage of stages) {
      if (controller.signal.aborted) {
        return err({
          kind: "conflict",
          message: "The operation was cancelled.",
          retryable: false,
        });
      }

      const label = stage.label ?? stage.name;
      const timeoutMs = stage.timeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS;
      const maxAttempts = Math.max(1, Math.floor(stage.maxAttempts ?? 1));

      let lastError: KynexError | undefined;
      let succeeded = false;

      for (let attempt = 1; attempt <= maxAttempts && !succeeded; attempt++) {
        if (attempt > 1) {
          // Bounded linear backoff between attempts (capped).
          await sleep(Math.min(250 * (attempt - 1), 1_000));
        }

        const stepResult: Result<unknown> = await (async () => {
          try {
            const step = stage.run({ outputs, signal: controller.signal });
            const resolved = await withTimeout(
              Promise.resolve(step),
              timeoutMs,
              label,
            );
            // Stage contract: run() resolves to a Result. Unwrap it — a stage
            // that returns Err short-circuits with its exact typed error,
            // never re-wrapped or re-classified.
            if (
              resolved !== null &&
              typeof resolved === "object" &&
              "ok" in resolved
            ) {
              return resolved as Result<unknown>;
            }
            // Defensive: a raw (non-Result) value from a JS caller counts as
            // success and still passes through this stage's validator.
            return ok(resolved) as Result<unknown>;
          } catch (e) {
            return err(toKynexError(e, "network"));
          }
        })();

        if (!stepResult.ok) {
          lastError = stepResult.error;
          // Only retry network-classified retryable failures.
          if (!stepResult.error.retryable) break;
          continue;
        }

        // Validate the stage output before it can cross the boundary.
        let validated: unknown;
        try {
          if (!stage.validate(stepResult.value)) {
            lastError = {
              kind: "validation",
              message: `${label} produced invalid data.`,
              detail: "stage output failed structural validation",
              retryable: false,
            };
            break;
          }
          validated = stepResult.value;
        } catch {
          lastError = {
            kind: "validation",
            message: `${label} produced invalid data.`,
            detail: "validator threw",
            retryable: false,
          };
          break;
        }

        outputs[stage.name] = validated;
        succeeded = true;
      }

      if (!succeeded) {
        return err(
          lastError ?? {
            kind: "unknown",
            message: `${label} failed for an unknown reason.`,
            retryable: false,
          },
        );
      }
    }

    const lastStage = stages[stages.length - 1];
    return ok({
      value: lastStage ? outputs[lastStage.name] : undefined,
      outputs,
    });
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

// ---------------------------------------------------------------------------
// mapWithConcurrency — bounded parallel execution
// ---------------------------------------------------------------------------

export interface ConcurrencyOutcome<T> {
  /** Results in input order. Failed items hold their exact error. */
  results: Result<T>[];
  /** Convenience counters. */
  okCount: number;
  errCount: number;
}

/** Run `fn` over every item with at most `limit` concurrent executions.
 *  One item failing never cancels the others (batch semantics), and a throw
 *  inside `fn` is captured per-item — the scheduler itself never throws. */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  fn: (item: TIn, index: number) => Promise<Result<TOut>> | Result<TOut>,
): Promise<ConcurrencyOutcome<TOut>> {
  const results: Result<TOut>[] = new Array(items.length);
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await fn(items[index], index);
      } catch (e) {
        results[index] = err(toKynexError(e, "unknown"));
      }
    }
  };

  const workers = Array.from({ length: safeLimit }, () => worker());
  await Promise.all(workers);

  let okCount = 0;
  let errCount = 0;
  for (const r of results) {
    if (r && r.ok) okCount++;
    else errCount++;
  }
  return { results, okCount, errCount };
}

// ---------------------------------------------------------------------------
// Small stage factories for common shapes
// ---------------------------------------------------------------------------

/** Build a stage from a throwing/promise-returning function with a validator. */
export function stage<T>(config: Stage<T>): Stage<T> {
  return config;
}

/** Simple structural validator for string values. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validator factory for arrays of strings with bounded length. */
export function isStringArrayOfLength(maxItems: number) {
  return (value: unknown): value is string[] =>
    Array.isArray(value) && value.length <= maxItems && value.every(isNonEmptyString);
}

/** Simple structural validator for finite numbers. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type { KynexErrorKind };
