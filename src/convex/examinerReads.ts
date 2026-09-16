import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * User-scoped reads for the AI Examiner (queries must stay out of the
 * "use node" action module). Identity always comes from the auth session —
 * a caller can only ever see their own evaluations.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db
      .query("examinerEvaluations")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

/** Storage side-effect for the examiner action (actions can't touch ctx.db). */
export const insertInternal = internalMutation({
  args: {
    userId: v.id("users"),
    materialId: v.optional(v.id("materials")),
    conceptLabel: v.string(),
    question: v.string(),
    studentAnswer: v.string(),
    marksAwarded: v.number(),
    marksTotal: v.number(),
    breakdown: v.array(
      v.object({
        criterion: v.string(),
        status: v.union(v.literal("met"), v.literal("partial"), v.literal("missed")),
        detail: v.string(),
      }),
    ),
    missingPoints: v.array(v.string()),
    errors: v.array(v.string()),
    modelAnswer: v.string(),
    howToImprove: v.string(),
    nextMove: v.string(),
    scheme: v.union(v.literal("provided"), v.literal("provisional")),
    model: v.string(),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("examinerEvaluations", { ...a, createdAt: Date.now() });
  },
});
