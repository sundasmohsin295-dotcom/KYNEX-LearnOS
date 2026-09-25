/**
 * KYNEX Proactive Crash Telemetry (§1) — fingerprinting + aggregation.
 *
 * A render crash loop that hits an error boundary every 400ms must never
 * translate into one network write per crash. Every captured error gets a
 * cryptographic fingerprint (FNV-1a over kind + message + scope + component
 * stack head), and identical fingerprints within a batch merge into a single
 * sample with a `count`. Batches flush when they reach MAX_SAMPLES or after
 * FLUSH_MS — bounded, batched, and count-aware.
 *
 * Fingerprints are one-way hashes: no stacks, no raw component trees, nothing
 * reconstructable is ever persisted. The server stores the hash + count.
 */

import { subscribeToCrashes } from "./globalErrorHandler";

export interface CrashCaptureMeta {
  kind: "error" | "rejection";
  /** Already-sanitized message (safeCrashMessage) — never a raw stack. */
  message: string;
  /** Where it was caught, e.g. "RouteErrorBoundary:/twin". */
  scope?: string;
  route?: string;
  /** React componentStack from an error boundary (hashed, never stored raw). */
  componentStack?: string;
}

export interface CrashSample {
  fingerprint: string;
  kind: "error" | "rejection";
  message: string;
  /** How many crashes merged into this sample. */
  count: number;
  route: string;
  scope?: string;
  firstAt: number;
  lastAt: number;
}

/** FNV-1a 32-bit — fast, stable, dependency-free. Returns 8 hex chars. */
export function fingerprintCrash(input: {
  kind: string;
  message: string;
  scope?: string;
  componentStack?: string;
}): string {
  // The scope + first frame of the component stack differentiate "same
  // message, different component tree" without storing the tree itself.
  const stackHead = (input.componentStack ?? "").split("\n")[1]?.trim() ?? "";
  const material = `${input.kind}::${input.message}::${input.scope ?? ""}::${stackHead}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface AggregatorOptions {
  /** Transport for one batch. Failures are swallowed — telemetry must never crash the app. */
  send: (samples: CrashSample[]) => void | Promise<void>;
  now?: () => number;
  /** Unique fingerprints per batch. */
  maxSamples?: number;
  /** Flush this long after the first unflushed capture. */
  flushAfterMs?: number;
}

export const DEFAULT_MAX_SAMPLES = 10;
export const DEFAULT_FLUSH_MS = 30_000;

export class CrashAggregator {
  private readonly pending = new Map<string, CrashSample>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private readonly opts: AggregatorOptions;
  private readonly now: () => number;
  private readonly maxSamples: number;
  private readonly flushAfterMs: number;

  constructor(opts: AggregatorOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.maxSamples = opts.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.flushAfterMs = opts.flushAfterMs ?? DEFAULT_FLUSH_MS;
  }

  /**
   * Capture one crash. Recurring crashes with the same fingerprint merge
   * into a single sample (count++), so a crash loop costs one network write
   * per flush window — not one per crash.
   */
  capture(meta: CrashCaptureMeta): CrashSample {
    const fingerprint = fingerprintCrash(meta);
    const at = this.now();
    const existing = this.pending.get(fingerprint);
    if (existing) {
      existing.count += 1;
      existing.lastAt = at;
      return existing;
    }
    const sample: CrashSample = {
      fingerprint,
      kind: meta.kind,
      message: meta.message,
      count: 1,
      route: meta.route ?? "/",
      scope: meta.scope,
      firstAt: at,
      lastAt: at,
    };
    this.pending.set(fingerprint, sample);
    if (this.pending.size >= this.maxSamples) {
      void this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushAfterMs);
    }
    return sample;
  }

  /** Send the current batch immediately. Bounded send; errors swallowed. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) return;
    this.flushing = true;
    const batch = [...this.pending.values()];
    this.pending.clear();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.opts.send(batch);
    } catch {
      /* telemetry is best-effort by contract — never surface, never crash */
    } finally {
      this.flushing = false;
    }
  }

  /** Test/teardown helper. */
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// App singleton wiring
// ---------------------------------------------------------------------------

let aggregator: CrashAggregator | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Install app-wide crash telemetry. Subscribes to the global error handlers
 * (window errors + unhandled rejections) so boundary-escaping faults are
 * aggregated too; error boundaries additionally enrich captures with scope +
 * component stack via `captureBoundaryCrash`. Idempotent.
 */
export function installCrashTelemetry(
  send: (samples: CrashSample[]) => void,
): () => void {
  if (aggregator) return unsubscribe ?? (() => {});
  aggregator = new CrashAggregator({ send });
  unsubscribe = subscribeToCrashes((entry) => {
    aggregator?.capture({
      kind: entry.kind,
      message: entry.message,
      route: safeRoute(),
    });
  });
  return () => {
    unsubscribe?.();
    unsubscribe = null;
    aggregator?.dispose();
    aggregator = null;
  };
}

/** Access for tests. */
export function getAggregator(): CrashAggregator | null {
  return aggregator;
}

function safeRoute(): string {
  try {
    return window.location.pathname || "/";
  } catch {
    return "/";
  }
}
