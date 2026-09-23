import { internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Circuit breaker for the centralized AI provider path (callAI + Examiner).
 *
 * Purpose: when the provider fails persistently (rejected credential, outage,
 * quota), stop hammering it. Every protected call is gated before the network
 * round-trip; state transitions are persisted in `aiCircuitBreaker` so the
 * gate is real across isolates and restarts, not an in-memory pretend guard.
 *
 * State machine (classic pattern):
 *   closed   -> (threshold consecutive failures) -> open
 *   open     -> (cooldown elapsed, next call becomes the probe) -> half_open
 *   half_open-> success -> closed
 *            -> failure -> open (fresh cooldown)
 *
 * The gate error is classified as PROVIDER_UNAVAILABLE (retryable) so
 * upstream handling stays consistent. The aiStatus health probe is
 * deliberately independent of the breaker: it must be able to observe the
 * provider's true state even while the breaker is open.
 */

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt?: number;
  lastTransitionAt: number;
  lastFailureClass?: string;
}

export const BREAKER_CONFIG = {
  service: "ai_provider",
  /** Consecutive failed provider calls before the circuit opens. */
  failureThreshold: 3,
  /** How long an open circuit waits before allowing one probe call. */
  cooldownMs: 60_000,
} as const;

export function closedSnapshot(now: number): BreakerSnapshot {
  return { state: "closed", consecutiveFailures: 0, lastTransitionAt: now };
}

/** Decide whether a provider call may proceed right now. Pure. */
export function evaluateGate(
  s: BreakerSnapshot,
  now: number,
): { allowed: boolean; next: BreakerSnapshot; denyReason?: string } {
  if (s.state === "closed") return { allowed: true, next: s };
  if (s.state === "open") {
    const elapsed = s.openedAt !== undefined ? now - s.openedAt : Infinity;
    if (elapsed >= BREAKER_CONFIG.cooldownMs) {
      // Cooldown elapsed: allow this call as the half-open probe.
      return {
        allowed: true,
        next: { ...s, state: "half_open", lastTransitionAt: now },
      };
    }
    const waitSec = Math.max(
      1,
      Math.ceil((BREAKER_CONFIG.cooldownMs - elapsed) / 1000),
    );
    return {
      allowed: false,
      next: s,
      denyReason: `The AI service is temporarily unavailable after repeated failures. It automatically recovers in about ${waitSec} second${waitSec === 1 ? "" : "s"}; no request is being sent until then.`,
    };
  }
  // half_open: this call IS the probe. Concurrent probes are permitted —
  // each real outcome is applied to the same persisted state, which avoids
  // a stuck state if a probe crashes without recording.
  return { allowed: true, next: s };
}

/** Apply a successful provider call. Pure. */
export function applySuccess(
  s: BreakerSnapshot,
  now: number,
): { next: BreakerSnapshot; transition?: "closed" } {
  if (s.state === "closed") return { next: s };
  return {
    next: closedSnapshot(now),
    transition: s.state === "half_open" ? "closed" : undefined,
  };
}

/** Apply a failed provider call. Pure. */
export function applyFailure(
  s: BreakerSnapshot,
  now: number,
  failureClass: string,
): { next: BreakerSnapshot; transition?: "open" } {
  const failures = s.state === "closed" ? 1 : s.consecutiveFailures + 1;
  const shouldOpen = s.state === "half_open" || failures >= BREAKER_CONFIG.failureThreshold;
  if (shouldOpen && s.state !== "open") {
    return {
      next: {
        state: "open",
        consecutiveFailures: failures,
        openedAt: now,
        lastTransitionAt: now,
        lastFailureClass: failureClass,
      },
      transition: "open",
    };
  }
  return {
    next: { ...s, consecutiveFailures: failures, lastFailureClass: failureClass },
  };
}

// ---------------------------------------------------------------------------
// Convex persistence
// ---------------------------------------------------------------------------

async function loadSnapshot(ctx: MutationCtx): Promise<BreakerSnapshot> {
  const now = Date.now();
  const row = await ctx.db
    .query("aiCircuitBreaker")
    .withIndex("by_service", (q) => q.eq("service", BREAKER_CONFIG.service))
    .first();
  if (!row) return closedSnapshot(now);
  return {
    state: row.state,
    consecutiveFailures: row.consecutiveFailures,
    openedAt: row.openedAt,
    lastTransitionAt: row.lastTransitionAt,
    lastFailureClass: row.lastFailureClass,
  };
}

async function persist(ctx: MutationCtx, snap: BreakerSnapshot): Promise<void> {
  const row = await ctx.db
    .query("aiCircuitBreaker")
    .withIndex("by_service", (q) => q.eq("service", BREAKER_CONFIG.service))
    .first();
  if (row) {
    await ctx.db.patch(row._id, snap);
  } else {
    await ctx.db.insert("aiCircuitBreaker", { service: BREAKER_CONFIG.service, ...snap });
  }
}

async function recordEvent(
  ctx: MutationCtx,
  event: "breaker_open" | "breaker_closed",
  severity: "error" | "info",
  status: string,
  correlationId?: string,
): Promise<void> {
  await ctx.db.insert("reliabilityEvents", {
    service: BREAKER_CONFIG.service,
    event,
    severity,
    status,
    correlationId,
    at: Date.now(),
  });
}

/** Gate a provider call. Throws a safe, retryable error while open. */
export const gateInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const snap = await loadSnapshot(ctx);
    const { allowed, next, denyReason } = evaluateGate(snap, Date.now());
    if (next !== snap) await persist(ctx, next);
    if (!allowed) throw new Error(denyReason);
  },
});

/** Record a successful provider call (latency sample + recovery). */
export const recordSuccessInternal = internalMutation({
  args: { durationMs: v.number() },
  handler: async (ctx, { durationMs }) => {
    await ctx.db.insert("latencySamples", {
      service: BREAKER_CONFIG.service,
      durationMs: Math.max(0, Math.min(600_000, Math.round(durationMs))),
      ok: true,
      at: Date.now(),
    });
    const snap = await loadSnapshot(ctx);
    const { next, transition } = applySuccess(snap, Date.now());
    if (next !== snap) {
      await persist(ctx, next);
      if (transition === "closed") {
        await recordEvent(ctx, "breaker_closed", "info", "CLOSED");
      }
    }
  },
});

/** Record a failed provider call (latency sample + possible state change). */
export const recordFailureInternal = internalMutation({
  args: {
    failureClass: v.string(),
    durationMs: v.optional(v.number()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, { failureClass, durationMs, correlationId }) => {
    if (durationMs !== undefined) {
      await ctx.db.insert("latencySamples", {
        service: BREAKER_CONFIG.service,
        durationMs: Math.max(0, Math.min(600_000, Math.round(durationMs))),
        ok: false,
        at: Date.now(),
      });
    }
    const snap = await loadSnapshot(ctx);
    const { next, transition } = applyFailure(
      snap,
      Date.now(),
      failureClass.slice(0, 40),
    );
    if (next !== snap) {
      await persist(ctx, next);
      if (transition === "open") {
        await recordEvent(ctx, "breaker_open", "error", "OPEN", correlationId);
      }
    }
  },
});

/**
 * Breaker client for action handlers. The zero-cost no-op when telemetry
 * is bypassed (tests, status probe) keeps the gate honest: every production
 * AI path passes a real ctx.
 */
export interface BreakerOps {
  gate: () => Promise<void>;
  success: (durationMs: number) => void;
  failure: (failureClass: string, durationMs?: number, correlationId?: string) => void;
}

export function aiBreaker(ctx: ActionCtx): BreakerOps {
  return {
    // Awaited explicitly: the internal mutation resolves to null, but the
    // BreakerOps contract is Promise<void> — the gate's throw (when open)
    // must propagate, its return value must not leak through the type.
    gate: async () => {
      await ctx.runMutation(internal.circuitBreaker.gateInternal, {});
    },
    success: (durationMs) => {
      void ctx.runMutation(internal.circuitBreaker.recordSuccessInternal, { durationMs });
    },
    failure: (failureClass, durationMs, correlationId) => {
      void ctx.runMutation(internal.circuitBreaker.recordFailureInternal, {
        failureClass,
        durationMs,
        correlationId,
      });
    },
  };
}
