import { internalMutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

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
  // Mutations
  textIngest: { limit: 20, windowMs: 10 * 60_000 }, // 20 materials / 10 min
  review: { limit: 240, windowMs: 10 * 60_000 }, // flashcard reviews
  quizAnswer: { limit: 120, windowMs: 10 * 60_000 },
  accountDelete: { limit: 2, windowMs: 60 * 60_000 },
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
