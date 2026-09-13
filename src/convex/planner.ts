import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * KYNEX Study Planner — one persisted plan per day, built from the student's
 * real weak concepts, due recall cards and exam radar. Complete / skip /
 * reschedule all persist. Zero trust: identity from session, by-user reads.
 */

const DAY = 86400000;

interface PlanBlock {
  id: string;
  kind: "practice" | "review" | "recall" | "fix";
  title: string;
  minutes: number;
  status: "pending" | "completed" | "skipped";
  conceptKey?: string;
  materialId?: Id<"materials">;
}

function todayKeyUtc(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Build today's plan blocks from real state (no invented data). */
export const today = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const now = Date.now();
    const dayKey = todayKeyUtc(now);

    const stored = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .first();
    if (stored) return { plan: stored, blocks: stored.blocks as PlanBlock[] };

    // ---- Build blocks from real inputs ----
    const mastery = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const attempted = mastery.filter((m) => m.attempts >= 2);
    const weak = [...attempted]
      .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)
      .slice(0, 2);

    const now2 = Date.now();
    const dueCards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now2))
      .take(12);

    const nextExam = (
      await ctx.db
        .query("exams")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("examDate", now))
        .order("asc")
        .take(1)
    )[0];

    const blocks: PlanBlock[] = [];
    let id = 0;
    for (const w of weak) {
      if (w.materialId) {
        blocks.push({
          id: `b${id++}`,
          kind: "fix",
          title: `Fix: ${w.conceptLabel}`,
          minutes: 10,
          status: "pending",
          conceptKey: w.conceptKey,
          materialId: w.materialId,
        });
      }
    }
    if (dueCards.length > 0) {
      blocks.push({
        id: `b${id++}`,
        kind: "recall",
        title: `Recall: ${dueCards.length} due cards`,
        minutes: 8,
        status: "pending",
      });
    }
    if (nextExam) {
      const days = Math.max(0, Math.ceil((nextExam.examDate - now) / DAY));
      blocks.push({
        id: `b${id++}`,
        kind: "practice",
        title: `Exam prep: ${nextExam.title} (${days}d)`,
        minutes: 15,
        status: "pending",
      });
    }

    return { plan: null, blocks, suggestedExamDate: nextExam?.examDate ?? null };
  },
});

/** Persist the generated plan for today (creates the stored row). */
export const savePlan = mutation({
  args: {
    examDate: v.optional(v.number()),
  },
  handler: async (ctx, { examDate }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    const dayKey = todayKeyUtc(now);

    const existing = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("dayKey", dayKey))
      .first();
    if (existing) return { ok: true as const, planId: existing._id };

    // Recompute the same block logic server-side (never trust client blocks).
    const mastery = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const weak = [...mastery.filter((m) => m.attempts >= 2)]
      .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)
      .slice(0, 2);
    const dueCards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
      .take(12);
    const nextExam = (
      await ctx.db
        .query("exams")
        .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("examDate", now))
        .order("asc")
        .take(1)
    )[0];

    const blocks: PlanBlock[] = [];
    let id = 0;
    for (const w of weak) {
      if (w.materialId) {
        blocks.push({
          id: `b${id++}`,
          kind: "fix",
          title: `Fix: ${w.conceptLabel}`,
          minutes: 10,
          status: "pending",
          conceptKey: w.conceptKey,
          materialId: w.materialId,
        });
      }
    }
    if (dueCards.length > 0) {
      blocks.push({
        id: `b${id++}`,
        kind: "recall",
        title: `Recall: ${dueCards.length} due cards`,
        minutes: 8,
        status: "pending",
      });
    }
    if (nextExam) {
      const days = Math.max(0, Math.ceil((nextExam.examDate - now) / DAY));
      blocks.push({
        id: `b${id++}`,
        kind: "practice",
        title: `Exam prep: ${nextExam.title} (${days}d)`,
        minutes: 15,
        status: "pending",
      });
    }
    if (blocks.length === 0) {
      throw new Error("Nothing to plan yet — practice once or add exam dates first.");
    }

    const planId = await ctx.db.insert("studyPlans", {
      userId,
      dayKey,
      examDate: examDate ?? nextExam?.examDate,
      blocks: blocks as unknown as Array<
        PlanBlock & { materialId?: Id<"materials"> }
      >,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, planId };
  },
});

/** Mark one block completed / skipped. Ownership-checked. */
export const setBlockStatus = mutation({
  args: {
    planId: v.id("studyPlans"),
    blockId: v.string(),
    status: v.union(v.literal("completed"), v.literal("skipped"), v.literal("pending")),
  },
  handler: async (ctx, { planId, blockId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(planId);
    if (!plan || plan.userId !== userId) {
      return { ok: false as const }; // foreign id → denial, no leak
    }
    const blocks = (plan.blocks as PlanBlock[]).map((b) =>
      b.id === blockId ? { ...b, status } : b,
    );
    await ctx.db.patch(planId, { blocks, updatedAt: Date.now() });

    // A completed practice/fix block is genuine learning activity.
    const block = (plan.blocks as PlanBlock[]).find((b) => b.id === blockId);
    if (status === "completed" && block && (block.kind === "practice" || block.kind === "fix")) {
      await ctx.db.insert("studySessions", {
        userId,
        minutes: Math.min(120, Math.max(1, Math.round(block.minutes))),
        kind: "planner",
        createdAt: Date.now(),
      });
    }
    return { ok: true as const };
  },
});

/** Reschedule: move a block to a different position within today's plan. */
export const reorderBlock = mutation({
  args: {
    planId: v.id("studyPlans"),
    blockId: v.string(),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { planId, blockId, direction }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(planId);
    if (!plan || plan.userId !== userId) return { ok: false as const };
    const blocks = [...(plan.blocks as PlanBlock[])];
    const i = blocks.findIndex((b) => b.id === blockId);
    if (i < 0) return { ok: false as const };
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= blocks.length) return { ok: true as const };
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    await ctx.db.patch(planId, { blocks, updatedAt: Date.now() });
    return { ok: true as const };
  },
});
