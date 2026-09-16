import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { todayKey } from "./gamification";

/**
 * Notification intelligence — useful, personalized, limited, dismissible.
 *
 * Rules (all server-side):
 *  - Every nudge contains a REAL number from the student's own data.
 *  - No guilt ("you're falling behind"), no fake urgency, no shame.
 *  - Same kind+ref is deduplicated for 3 days; at most 4 shown, 12 stored.
 *  - Dismissal is persisted — a nudge never nags twice.
 */

const DEDUPE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_STORED = 12;
const MAX_SHOWN = 4;

/** Ensure at most MAX_STORED undiscmissed rows per user (oldest trimmed first). */
async function trimNudges(ctx: MutationCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("nudges")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  const live = rows.filter((n) => n.dismissedAt === undefined);
  for (const old of live.slice(MAX_STORED)) {
    await ctx.db.delete(old._id);
  }
}

/** Get-or-create a nudge row for (kind, ref) if it isn't duped/dismissed. */
async function upsertNudge(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: string,
  ref: string,
  body: string,
  targetRoute: string,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("nudges")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_STORED + 6);
  const match = existing.find((n) => n.kind === kind && n.ref === ref);
  if (match) {
    // Refresh the body if data changed, but never resurrect a dismissed nudge.
    if (match.dismissedAt !== undefined) return;
    if (match.body !== body) await ctx.db.patch(match._id, { body });
    return;
  }
  // If a nudge of this kind was dismissed within the dedupe window, skip.
  const recentlyDismissed = existing.some(
    (n) => n.kind === kind && n.dismissedAt !== undefined && now - n.dismissedAt < DEDUPE_MS,
  );
  if (recentlyDismissed) return;

  await ctx.db.insert("nudges", { userId, kind, ref, body, targetRoute, createdAt: now });
  await trimNudges(ctx, userId);
}

/**
 * Recompute all nudges for the caller from real data. Called from the client
 * on dashboard load — pure function of stored learning data, cheap queries only.
 */
export const refresh = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const now = Date.now();

    // ---- Signal 1: flashcards due for review (healthy, actionable) ----
    const dueCards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
      .collect();
    if (dueCards.length >= 5) {
      await upsertNudge(
        ctx,
        userId,
        "review_due",
        "review_due",
        `${dueCards.length} flashcards are ready for review — quick wins for your recall score.`,
        "/library",
      );
    }

    // ---- Signal 2: upcoming exams with weak, high-impact concepts ----
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gt("examDate", now),
      )
      .collect();
    const upcoming = exams
      .filter((e) => e.examDate < now + 30 * 86400000)
      .sort((a, b) => a.examDate - b.examDate)[0];
    if (upcoming) {
      const days = Math.max(1, Math.ceil((upcoming.examDate - now) / 86400000));
      const mastery = await ctx.db
        .query("masteryScores")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const weak = mastery.filter(
        (m) => m.attempts >= 2 && m.correct / m.attempts < 0.6,
      );
      if (weak.length > 0) {
        await upsertNudge(
          ctx,
          userId,
          "exam_gap",
          upcoming._id,
          `${days} day${days === 1 ? "" : "s"} until ${upcoming.title}: ${weak.length} concept${weak.length === 1 ? "" : "s"} still below 60% accuracy. A 10-minute mission on the weakest one is the best use of your time.`,
          "/dashboard",
        );
      }
    }

    // ---- Signal 3: an active mission is waiting (momentum, not guilt) ----
    const activeMission = await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();
    if (activeMission) {
      await upsertNudge(
        ctx,
        userId,
        "mission_waiting",
        activeMission._id,
        `"${activeMission.title}" is in progress — ${activeMission.progress}/${activeMission.targetCount} done. Picking it up keeps your momentum going.`,
        activeMission._id ? `/mission/${activeMission._id}` : "/dashboard",
      );
    }

    // ---- Signal 4: today's study goal status (progress framing only) ----
    const today = todayKey(now);
    const sessions = await ctx.db
      .query("studySessions")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdAt", now - 86400000),
      )
      .collect();
    const todayMinutes = sessions
      .filter((s) => todayKey(s.createdAt) === today)
      .reduce((n, s) => n + s.minutes, 0);
    const game = await ctx.db
      .query("gameProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (game && todayMinutes > 0 && todayMinutes < game.goalMinutesPerDay) {
      const left = game.goalMinutesPerDay - todayMinutes;
      await upsertNudge(
        ctx,
        userId,
        "goal_progress",
        today,
        `${todayMinutes} minutes studied today — ${left} more hits your daily goal.`,
        "/dashboard",
      );
    }
  },
});

/** Live nudges for the caller (max 4, newest first). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db
      .query("nudges")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_SHOWN);
    return rows.filter((n) => n.dismissedAt === undefined);
  },
});

/** Dismiss a nudge — persisted, and it won't come back for 3 days. */
export const dismiss = mutation({
  args: { id: v.id("nudges") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) return; // ownership check
    await ctx.db.patch(id, { dismissedAt: Date.now() });
  },
});
