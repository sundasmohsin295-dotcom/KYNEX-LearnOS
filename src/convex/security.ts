import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  internalQuery,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { todayKey } from "./gamification";

/**
 * Server-side security primitives.
 *
 * - `enforceRateLimit`: fixed-window rate limiting enforced INSIDE mutations
 *   and actions (never client-side). Throws a safe, generic error when the
 *   limit is exceeded — do not leak window internals to users.
 * - `logAuditEvent`: append-only security event logging. Never log message
 *   content, tokens, or any secret — only actor ids and action names.
 */

export interface RateLimitRule {
  /** Max operations allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Central registry of limits so behavior is consistent and auditable. */
export const RATE_LIMITS = {
  // Expensive AI operations — protect the wallet and the service.
  aiChat: { limit: 40, windowMs: 10 * 60_000 }, // 40 chats / 10 min
  aiAnalyze: { limit: 15, windowMs: 10 * 60_000 }, // 15 analyses / 10 min
  aiQuiz: { limit: 12, windowMs: 10 * 60_000 }, // 12 quiz generations / 10 min
  urlIngest: { limit: 8, windowMs: 10 * 60_000 }, // 8 URL fetches / 10 min
  aiProbe: { limit: 4, windowMs: 60 * 60_000 }, // AI health checks: 4/hour
  // Mutations
  textIngest: { limit: 20, windowMs: 10 * 60_000 }, // 20 materials / 10 min
  review: { limit: 240, windowMs: 10 * 60_000 }, // flashcard reviews
  quizAnswer: { limit: 120, windowMs: 10 * 60_000 },
  accountDelete: { limit: 2, windowMs: 60 * 60_000 },
  // Client crash reports from the global error boundary.
  clientError: { limit: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/**
 * Check + increment a fixed-window counter for `user:key`. Must be called
 * from a mutation or action ctx BEFORE doing expensive work. Throws a
 * generic error (safe to surface to the client) when exceeded.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  key: RateLimitKey,
  userId: string,
): Promise<void> {
  const rule = RATE_LIMITS[key];
  const now = Date.now();
  const bucketKey = `${userId}:${key}`;
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", bucketKey))
    .first();

  if (!existing || now - existing.windowStart >= rule.windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
    } else {
      await ctx.db.insert("rateLimits", {
        key: bucketKey,
        windowStart: now,
        count: 1,
      });
    }
    return;
  }

  if (existing.count >= rule.limit) {
    await logAuditEvent(ctx, userId, "rate_limit_hit", key);
    throw new Error(
      "You're going too fast — please wait a moment before trying again.",
    );
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

/** Action-context variant (internalMutation wrapper) for "use node" actions. */
export const rateLimitInternal = internalMutation({
  args: {
    key: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, { key, userId }) => {
    const known = RATE_LIMITS[key as RateLimitKey];
    if (!known) throw new Error("Unknown rate limit key");
    const now = Date.now();
    const bucketKey = `${userId}:${key}`;
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", bucketKey))
      .first();
    if (!existing || now - existing.windowStart >= known.windowMs) {
      if (existing) {
        await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
      } else {
        await ctx.db.insert("rateLimits", {
          key: bucketKey,
          windowStart: now,
          count: 1,
        });
      }
      return;
    }
    if (existing.count >= known.limit) {
      await logAuditEvent(ctx, userId, "rate_limit_hit", key);
      throw new Error(
        "You're going too fast — please wait a moment before trying again.",
      );
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
  },
});

/**
 * Append a security audit event. Content-free by design: only the actor id,
 * an action name and a short non-sensitive detail tag.
 */
export async function logAuditEvent(
  ctx: MutationCtx,
  userId: string | null,
  action: string,
  detail?: string,
): Promise<void> {
  const actorId: Id<"users"> | undefined = userId ? (userId as Id<"users">) : undefined;
  await ctx.db.insert("auditLogs", {
    userId: actorId,
    action,
    detail: detail?.slice(0, 120),
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Security event system — structured, content-free event names for the
// observability layer. Every helper below never logs message content,
// tokens, secrets, or unnecessary personal information.
// ---------------------------------------------------------------------------

/** Canonical security event names (keep additive — never rename existing). */
export const SECURITY_EVENTS = {
  ACCESS_DENIED: "access_denied",
  CROSS_USER_ACCESS_ATTEMPT: "cross_user_access_attempt",
  RATE_LIMIT_TRIGGERED: "rate_limit_triggered",
  AI_QUOTA_EXHAUSTED: "ai_quota_exhausted",
  FILE_REJECTED: "file_rejected",
  AI_INPUT_REJECTED: "ai_input_rejected",
  AI_OUTPUT_REJECTED: "ai_output_rejected",
  ACCOUNT_DELETED: "account_deleted",
  SESSION_REVOKED: "session_revoked",
} as const;

/** Generic internal event writer for "use node" actions (which cannot import
 *  mutation-context helpers directly). Content-free by contract. */
export const securityEventInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    action: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { userId, action, detail }) => {
    await ctx.db.insert("auditLogs", {
      userId,
      action: action.slice(0, 60),
      detail: detail?.slice(0, 120),
      createdAt: Date.now(),
    });
  },
});

/** Denial result every deny path must COMMIT (never throw) so the audit row
 *  written in the same transaction survives. `ok: false` doubles as the
 *  no-existence-oracle response shape for foreign/invalid ids. */
export type DenialResult = { ok: false };

/**
 * Log a failed authorization / ownership check and return the denial result
 * the caller must `return` directly. This is the single choke point for
 * "deny" paths so cross-user probing shows up in one queryable stream.
 * `detail` carries only an operation tag — never resource content.
 *
 * The audit row is written INLINE in the caller's transaction, so the deny
 * path must COMMIT (return the returned result) rather than throw — a thrown
 * mutation rolls back its whole transaction and would erase the audit event.
 * By returning the result from THIS function, the contract is structural:
 * the deny path is a `return await logAccessDenied(...)` statement and cannot
 * accidentally end in a throw that erases the audit row.
 */
export async function logAccessDenied(
  ctx: MutationCtx,
  userId: string | null,
  operation: string,
  opts?: { crossUser?: boolean },
): Promise<DenialResult> {
  await logAuditEvent(
    ctx,
    userId,
    opts?.crossUser
      ? SECURITY_EVENTS.CROSS_USER_ACCESS_ATTEMPT
      : SECURITY_EVENTS.ACCESS_DENIED,
    operation.slice(0, 60),
  );
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Server-authoritative plan + daily AI quotas (denial-of-wallet defense)
// ---------------------------------------------------------------------------

/** Daily AI quota per plan. Tuned so a free account cannot run the wallet
 *  hot even with scripted automation on top of the short-window rate limits. */
export const PLAN_LIMITS = {
  free: { dailyAnalysis: 10, dailyChat: 40, dailyQuiz: 8 },
  pro: { dailyAnalysis: 100, dailyChat: 500, dailyQuiz: 60 },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

/**
 * Read the caller's authoritative plan. Creates the free-tier row lazily.
 * ALWAYS derived from the server session — never from client input.
 */
export async function getAuthoritativePlan(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<PlanId> {
  const row = await ctx.db
    .query("plans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (row) {
    // An expired/canceled paid period silently downgrades to free —
    // fail closed rather than fail open.
    if (
      row.plan === "pro" &&
      row.periodEnd !== undefined &&
      row.periodEnd < Date.now()
    ) {
      return "free";
    }
    return row.plan;
  }
  await ctx.db.insert("plans", {
    userId,
    plan: "free",
    updatedAt: Date.now(),
  });
  return "free";
}

function dayKeyUtc(now: number): string {
  return todayKey(now); // gamification.todayKey is already UTC YYYY-MM-DD
}

interface DailyUsageRow {
  _id: Id<"aiUsageDaily">;
  analysisCount: number;
  chatCount: number;
  quizCount: number;
}

/** Quota key -> usage row field. */
function quotaField(key: "dailyAnalysis" | "dailyChat" | "dailyQuiz") {
  return key === "dailyAnalysis" ? "analysisCount" : key === "dailyChat" ? "chatCount" : "quizCount";
}

/** Load-or-create today's usage row for the user. */
async function getDailyUsage(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<DailyUsageRow> {
  const dayKey = dayKeyUtc(Date.now());
  const existing = await ctx.db
    .query("aiUsageDaily")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .first();
  if (existing) return existing as DailyUsageRow;
  const id = await ctx.db.insert("aiUsageDaily", {
    userId,
    dayKey,
    analysisCount: 0,
    chatCount: 0,
    quizCount: 0,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id)) as DailyUsageRow;
}

/**
 * Atomically consume one unit of daily AI quota. Throws a safe, generic
 * error when the plan's daily cap is exhausted — AFTER logging a security
 * event. Safe against concurrent bursts: the read-modify-write is a single
 * Convex transaction (mutations are serializable by design).
 */
export async function consumeDailyAiQuota(
  ctx: MutationCtx,
  key: "dailyAnalysis" | "dailyChat" | "dailyQuiz",
  userId: Id<"users">,
): Promise<void> {
  const plan = await getAuthoritativePlan(ctx, userId);
  const cap = PLAN_LIMITS[plan][key];
  const usage = await getDailyUsage(ctx, userId);
  const field = quotaField(key);
  const current = usage[field];
  if (current >= cap) {
    await logAuditEvent(ctx, userId, SECURITY_EVENTS.AI_QUOTA_EXHAUSTED, key);
    throw new Error(
      `You've reached today's ${key === "dailyChat" ? "chat" : key === "dailyQuiz" ? "quiz" : "analysis"} limit on the ${plan === "pro" ? "Pro" : "Free"} plan. It resets at midnight UTC.`,
    );
  }
  await ctx.db.patch(usage._id, { [field]: current + 1, updatedAt: Date.now() });
}

/**
 * Read a user's plan WITHOUT creating a row (safe from query contexts).
 * Same fail-closed rule as getAuthoritativePlan: unknown/expired => free.
 */
export async function readPlanOnly(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<PlanId> {
  const row = await ctx.db
    .query("plans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!row) return "free";
  if (
    row.plan === "pro" &&
    row.periodEnd !== undefined &&
    row.periodEnd < Date.now()
  ) {
    return "free";
  }
  return row.plan;
}

/** Read-only quota status for UI display (safe from query contexts). */
export async function readDailyQuota(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{
  plan: PlanId;
  analysisUsed: number;
  chatUsed: number;
  quizUsed: number;
  analysisCap: number;
  chatCap: number;
  quizCap: number;
}> {
  const plan = await readPlanOnly(ctx, userId);
  const caps = PLAN_LIMITS[plan];
  const dayKey = dayKeyUtc(Date.now());
  const usage = await ctx.db
    .query("aiUsageDaily")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
    .first();
  return {
    plan,
    analysisUsed: usage?.analysisCount ?? 0,
    chatUsed: usage?.chatCount ?? 0,
    quizUsed: usage?.quizCount ?? 0,
    analysisCap: caps.dailyAnalysis,
    chatCap: caps.dailyChat,
    quizCap: caps.dailyQuiz,
  };
}

// --- internal wrappers so "use node" actions and mutation layers can call ---

/** Consume one unit of daily AI quota (called from action/mutation code). */
export const consumeQuotaInternal = internalMutation({
  args: {
    key: v.union(
      v.literal("dailyAnalysis"),
      v.literal("dailyChat"),
      v.literal("dailyQuiz"),
    ),
    userId: v.id("users"),
  },
  handler: async (ctx, { key, userId }) => {
    await consumeDailyAiQuota(ctx, key, userId);
  },
});

/** Quota status for UI display (internal; public wrapper below scopes to caller). */
export const quotaStatusInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => readDailyQuota(ctx, userId),
});

/** The caller's own daily AI quota status (for honest UI meters). */
export const myQuotaStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await readDailyQuota(ctx, userId);
  },
});
