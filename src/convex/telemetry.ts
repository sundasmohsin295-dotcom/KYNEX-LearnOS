import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { enforceRateLimit } from "./security";
import { BREAKER_CONFIG, closedSnapshot } from "./circuitBreaker";

/**
 * SRE telemetry — every value shown in the Security & Reliability surfaces
 * comes from these real tables. Nothing is fabricated: when no data exists
 * the queries report `available: false` and the UI renders "Insufficient
 * data".
 *
 * Authorization model:
 *  - breakerState + latencyStats: public aggregates. Samples are anonymous
 *    round-trip timings; no user content exists in them.
 *  - recentEvents / myQcEvents / myClientErrors: require a signed-in user and
 *    return only content-free events / the caller's own records.
 *  - allClientErrors: server-side admin check via the KYNX_ADMIN_EMAILS
 *    environment variable. No admins configured => empty result, never a
 *    frontend-only gate.
 */

const MAX_MESSAGE = 300;

/** Server-side sanitize + cap for client-supplied error messages. */
function sanitizeClientMessage(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

async function currentUserId(ctx: QueryCtx): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  return userId ?? null;
}

/** Server-side admin check — the only gate for internal diagnostics. */
export async function isAdmin(ctx: QueryCtx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  const configured = (process.env.KYNEX_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length === 0) return false;
  return !!user?.email && configured.includes(user.email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Client error recording (global error boundary)
// ---------------------------------------------------------------------------

/** Called by the browser crash reporter. Rate-limited for signed-in users. */
export const recordClientError = mutation({
  args: {
    correlationId: v.string(),
    kind: v.union(v.literal("error"), v.literal("rejection")),
    message: v.string(),
    route: v.string(),
  },
  handler: async (ctx, { correlationId, kind, message, route }) => {
    const userId = await getAuthUserId(ctx);
    const clean = sanitizeClientMessage(message);
    if (!clean) return;
    if (userId) {
      await enforceRateLimit(ctx, "clientError", userId);
    }
    await ctx.db.insert("clientErrors", {
      userId: userId ?? undefined,
      correlationId: correlationId.slice(0, 24),
      kind,
      message: clean,
      route: sanitizeClientMessage(route).slice(0, 200) || "/",
      at: Date.now(),
    });
  },
});

/** The signed-in user's own crash reports (privacy: never anyone else's). */
export const myClientErrors = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("clientErrors")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
  },
});

/** All crash reports — admins only, enforced here on the server. */
export const allClientErrors = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isAdmin(ctx))) return { authorized: false as const, rows: [] };
    const rows = await ctx.db
      .query("clientErrors")
      .withIndex("by_at")
      .order("desc")
      .take(50);
    return { authorized: true as const, rows };
  },
});

// ---------------------------------------------------------------------------
// Circuit breaker + latency (real signals only)
// ---------------------------------------------------------------------------

export const breakerState = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("aiCircuitBreaker")
      .withIndex("by_service", (q) => q.eq("service", BREAKER_CONFIG.service))
      .first();
    if (!row) {
      return { ...closedSnapshot(Date.now()), service: BREAKER_CONFIG.service, known: false as const };
    }
    return {
      service: row.service,
      state: row.state,
      consecutiveFailures: row.consecutiveFailures,
      openedAt: row.openedAt,
      lastTransitionAt: row.lastTransitionAt,
      lastFailureClass: row.lastFailureClass,
      known: true as const,
    };
  },
});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** p50/p95/p99 over successful round trips in the last 24h + failure rate. */
export const latencyStats = query({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - 24 * 60 * 60_000;
    const samples = await ctx.db
      .query("latencySamples")
      .withIndex("by_service_at", (q) =>
        q.eq("service", BREAKER_CONFIG.service).gt("at", since),
      )
      .take(1000);
    if (samples.length === 0) {
      return { available: false as const, service: BREAKER_CONFIG.service };
    }
    const ok = samples.filter((s) => s.ok).map((s) => s.durationMs).sort((a, b) => a - b);
    const failures = samples.length - ok.length;
    if (ok.length === 0) {
      return {
        available: true as const,
        service: BREAKER_CONFIG.service,
        samples: samples.length,
        failures,
        failureRate: 1,
        available2: undefined,
        p50: null,
        p95: null,
        p99: null,
      };
    }
    return {
      available: true as const,
      service: BREAKER_CONFIG.service,
      samples: samples.length,
      failures,
      failureRate: failures / samples.length,
      p50: percentile(ok, 50),
      p95: percentile(ok, 95),
      p99: percentile(ok, 99),
    };
  },
});

// ---------------------------------------------------------------------------
// Reliability events + QC (factchecker) events
// ---------------------------------------------------------------------------

export const recentEvents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("reliabilityEvents")
      .withIndex("by_at")
      .order("desc")
      .take(30);
  },
});

export const myQcEvents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("qcEvents")
      .withIndex("by_user_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
  },
});

// ---------------------------------------------------------------------------
// Internal recorder used by the AI pipeline at real validation points
// ---------------------------------------------------------------------------

export const recordQcInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    source: v.string(),
    claimType: v.string(),
    result: v.union(
      v.literal("verified"),
      v.literal("flagged"),
      v.literal("needs_review"),
      v.literal("resolved"),
    ),
    reason: v.string(),
    severity: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    refId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("qcEvents", {
      userId: args.userId,
      source: args.source.slice(0, 30),
      claimType: args.claimType.slice(0, 40),
      result: args.result,
      reason: sanitizeClientMessage(args.reason),
      severity: args.severity,
      refId: args.refId,
      at: Date.now(),
    });
  },
});
