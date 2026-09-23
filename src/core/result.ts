/**
 * KYNEX Core — monadic Result type.
 *
 * Framework-agnostic error handling for every critical processing function
 * (network, database, parsing, AI). Functions return `Result<T, E>` instead
 * of throwing, so failure becomes a value the type system forces callers to
 * handle — failures can never silently crash the runtime or be ignored.
 *
 * Used by the data pipeline (src/core/pipeline.ts), the tutor scope gate
 * (src/convex/tutorScope.ts) and the readiness engine (src/convex/readiness.ts).
 * No dependencies, no platform APIs — safe in browser, Node and Convex runtimes.
 */

// ---------------------------------------------------------------------------
// Error taxonomy — one stable classification shared across all layers
// ---------------------------------------------------------------------------

export type KynexErrorKind =
  | "validation" // caller/input failed schema or invariant checks
  | "network" // fetch/transport failure, offline, timeout
  | "database" // persistence or query failure
  | "ai" // AI provider unavailable, rejected, or ungrounded
  | "unauthorized" // missing or invalid identity
  | "conflict" // state collision (stale write, duplicate, replay)
  | "unknown"; // unexpected — must never be silently swallowed

export interface KynexError {
  kind: KynexErrorKind;
  /** Safe, user-facing message. Never contains internals or secrets. */
  message: string;
  /** Machine-readable detail for logs (already sanitized upstream). */
  detail?: string;
  /** True when retrying the same operation could plausibly succeed. */
  retryable: boolean;
}

/** Build a KynexError. `retryable` defaults to false — fail closed. */
export function kynexError(
  kind: KynexErrorKind,
  message: string,
  opts?: { detail?: string; retryable?: boolean },
): KynexError {
  return { kind, message, detail: opts?.detail, retryable: opts?.retryable ?? false };
}

/** Convert an unknown thrown value into a sanitized KynexError. Raw stacks
 *  and provider internals never survive this function. */
export function toKynexError(raw: unknown, fallbackKind: KynexErrorKind = "unknown"): KynexError {
  if (isKynexError(raw)) return raw;
  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string" && raw.trim().length > 0
        ? raw
        : "Something went wrong.";
  // Cap length so a hostile payload can't blow up logs or storage.
  const safe = message.trim().slice(0, 300);
  const retryable =
    raw instanceof Error &&
    /timeout|timed out|network|econn|enotfound|etimedout|unavailable|502|503|504|rate limit|429/i.test(
      raw.message,
    );
  return kynexError(fallbackKind, safe, { retryable });
}

/** Structural guard — true only for genuine KynexError-shaped objects. */
export function isKynexError(value: unknown): value is KynexError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    typeof v.message === "string" &&
    typeof v.retryable === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Result — the Ok | Err union
// ---------------------------------------------------------------------------

export type Result<T, E = KynexError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Wrap a success value. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Wrap a failure value. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Type guard for the success branch. */
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

/** Type guard for the failure branch. */
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/** Transform the success value; failures pass through untouched. */
export function map<T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

/** Transform the failure value (e.g. reclassify an error kind). */
export function mapErr<T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(fn(r.error));
}

/** Chain another fallible computation onto a success (monadic bind). The
 *  callback itself returns a Result, so short-circuiting stays explicit. */
export function andThen<T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

/** Recover from a failure with a fallback value. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Execute a (possibly throwing) synchronous function, capturing any throw
 *  as an Err. This is the bridge from throw-based code into the Result world. */
export function tryCatch<T>(fn: () => T, kind: KynexErrorKind = "unknown"): Result<T, KynexError> {
  try {
    return ok(fn());
  } catch (e) {
    return err(toKynexError(e, kind));
  }
}

/** Async bridge: await a (possibly rejecting) promise, capturing any rejection
 *  as an Err so a network drop can never surface as an unhandled rejection. */
export async function tryCatchAsync<T>(
  fn: () => Promise<T>,
  kind: KynexErrorKind = "unknown",
): Promise<Result<T, KynexError>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(toKynexError(e, kind));
  }
}

/** Collect a list of Results into one Result of a list — fails fast with the
 *  first error, matching the semantics of sequential pipelines. */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
