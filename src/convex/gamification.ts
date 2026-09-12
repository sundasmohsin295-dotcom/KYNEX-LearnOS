import { getAuthUserId } from "@convex-dev/auth/server";
import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

export const XP_PER_LEVEL = 250;

/** Level curve: each level needs a bit more XP than the last. */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
}

export function xpForLevel(level: number): number {
  return (level - 1) * XP_PER_LEVEL;
}

export function todayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function yesterdayKey(now: number): string {
  return new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Get-or-create the user's profile and game profile. */
export async function ensureProfiles(
  ctx: MutationCtx,
  displayName?: string,
): Promise<{ profile: Doc<"profiles">; game: Doc<"gameProfiles"> }> {
  const userId = await getAuthUserIdStrict(ctx);
  const now = Date.now();

  let profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!profile) {
    const id = await ctx.db.insert("profiles", {
      userId,
      name: displayName ?? "Learner",
      onboardingComplete: false,
      seededDemo: false,
    });
    profile = (await ctx.db.get(id)) as Doc<"profiles">;
  }

  let game = await ctx.db
    .query("gameProfiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!game) {
    const id = await ctx.db.insert("gameProfiles", {
      userId,
      xp: 0,
      level: 1,
      streakCount: 0,
      longestStreak: 0,
      goalMinutesPerDay: 30,
      createdAt: now,
      updatedAt: now,
    });
    game = (await ctx.db.get(id)) as Doc<"gameProfiles">;
  }

  return { profile, game };
}

/** Get the current user id inside mutations — throws if unauthenticated. */
export async function getAuthUserIdStrict(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/** Record an XP gain, update level + streak, and log the event. */
export async function awardXp(
  ctx: MutationCtx,
  amount: number,
  reason: string,
): Promise<{ leveledUp: boolean; newLevel: number; streak: number }> {
  const userId = await getAuthUserIdStrict(ctx);
  const now = Date.now();
  const { game } = await ensureProfiles(ctx);

  const xp = Math.max(0, game.xp + amount);
  const newLevel = levelForXp(xp);
  const leveledUp = newLevel > game.level;

  // streak: only counts days with genuine learning activity
  const today = todayKey(now);
  let streakCount = game.streakCount;
  let lastStudyDay = game.lastStudyDay;
  if (game.lastStudyDay !== today) {
    streakCount = game.lastStudyDay === yesterdayKey(now) ? game.streakCount + 1 : 1;
    lastStudyDay = today;
  }

  await ctx.db.patch(game._id, {
    xp,
    level: newLevel,
    streakCount,
    lastStudyDay,
    longestStreak: Math.max(game.longestStreak, streakCount),
    updatedAt: now,
  });
  await ctx.db.insert("xpEvents", { userId, amount, reason, createdAt: now });

  await maybeUnlockAchievements(ctx, userId);
  return { leveledUp, newLevel, streak: streakCount };
}

/** Log a study session (used for today's progress + smart break detection). */
export async function logSession(
  ctx: MutationCtx,
  kind: string,
  minutes: number,
) {
  const userId = await getAuthUserIdStrict(ctx);
  await ctx.db.insert("studySessions", {
    userId,
    kind,
    minutes,
    createdAt: Date.now(),
  });
  const { game } = await ensureProfiles(ctx);
  // touch streak when any learning happens
  const now = Date.now();
  const today = todayKey(now);
  if (game.lastStudyDay !== today) {
    const streakCount =
      game.lastStudyDay === yesterdayKey(now) ? game.streakCount + 1 : 1;
    await ctx.db.patch(game._id, {
      streakCount,
      lastStudyDay: today,
      longestStreak: Math.max(game.longestStreak, streakCount),
      updatedAt: now,
    });
  }
}

const ACHIEVEMENTS: Array<{ key: string; check: (s: Stats) => boolean }> = [
  { key: "first_material", check: (s) => s.materials >= 1 },
  { key: "first_quiz", check: (s) => s.quizzes >= 1 },
  { key: "quiz_perfect", check: (s) => s.hasPerfectQuiz },
  { key: "first_mastered", check: (s) => s.masteredConcepts >= 1 },
  { key: "mastered_five", check: (s) => s.masteredConcepts >= 5 },
  { key: "streak_3", check: (s) => s.longestStreak >= 3 },
  { key: "streak_7", check: (s) => s.longestStreak >= 7 },
  { key: "streak_30", check: (s) => s.longestStreak >= 30 },
  { key: "level_5", check: (s) => s.level >= 5 },
  { key: "level_10", check: (s) => s.level >= 10 },
  { key: "cards_50", check: (s) => s.reviewsDone >= 50 },
  { key: "questions_100", check: (s) => s.questionsAnswered >= 100 },
];

interface Stats {
  materials: number;
  quizzes: number;
  hasPerfectQuiz: boolean;
  masteredConcepts: number;
  longestStreak: number;
  level: number;
  reviewsDone: number;
  questionsAnswered: number;
}

/** Unlock any achievements whose criteria are now satisfied. */
export async function maybeUnlockAchievements(ctx: MutationCtx, userId: Id<"users">) {
  const owned = new Set(
    (
      await ctx.db
        .query("achievements")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((a) => a.key),
  );

  const stats = await collectStats(ctx, userId);
  const now = Date.now();
  for (const a of ACHIEVEMENTS) {
    if (!owned.has(a.key) && a.check(stats)) {
      await ctx.db.insert("achievements", { userId, key: a.key, earnedAt: now });
      // small XP reward for the badge itself
      const { game } = await ensureProfiles(ctx);
      await ctx.db.patch(game._id, { xp: game.xp + 40, updatedAt: now });
    }
  }
}

async function collectStats(ctx: MutationCtx, userId: Id<"users">): Promise<Stats> {
  const materials = await ctx.db
    .query("materials")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const quizzes = await ctx.db
    .query("quizAttempts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const mastery = await ctx.db
    .query("masteryScores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_user_reviewed", (q) => q.eq("userId", userId))
    .collect();
  const { game } = await ensureProfiles(ctx);

  return {
    materials: materials.length,
    quizzes: quizzes.length,
    hasPerfectQuiz: quizzes.some(
      (q) => q.status === "completed" && q.questions.length > 0 &&
        q.answers.length === q.questions.length && q.answers.every((a) => a.correct),
    ),
    masteredConcepts: mastery.filter((m) => m.attempts >= 3 && m.correct / m.attempts >= 0.85).length,
    longestStreak: game.longestStreak,
    level: game.level,
    reviewsDone: reviews.length,
    questionsAnswered: quizzes.reduce((n, q) => n + q.answers.length, 0),
  };
}

/** Create the next best mission for a user based on mastery data. */
export async function generateNextMission(
  ctx: MutationCtx,
  opts?: { materialId?: Id<"materials">; conceptKey?: string },
) {
  const userId = await getAuthUserIdStrict(ctx);
  const now = Date.now();

  // One active mission per user: prevents duplicate "next moves" when the
  // generator races (e.g. two analyses completing concurrently).
  const active = await ctx.db
    .query("missions")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .collect();
  if (active.length > 0) return active[0];

  const mastery = await ctx.db
    .query("masteryScores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  // priority: weak concept (with enough evidence) -> due flashcards -> learn something new
  const weak = mastery
    .filter((m) => m.attempts >= 2 && m.correct / m.attempts < 0.6)
    .filter((m) => !opts?.conceptKey || m.conceptKey === opts.conceptKey)
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0];

  if (weak) {
    const id = await ctx.db.insert("missions", {
      userId,
      title: `Fix: ${weak.conceptLabel}`,
      description: `Your accuracy is ${Math.round((weak.correct / weak.attempts) * 100)}%. Review the concept, then solve 8 targeted questions.`,
      kind: "fix_gap",
      targetCount: 8,
      progress: 0,
      xpReward: 120,
      conceptKey: weak.conceptKey,
      conceptLabel: weak.conceptLabel,
      materialId: opts?.materialId ?? weak.materialId,
      status: "active",
      createdAt: now,
    });
    return await ctx.db.get(id) as Doc<"missions">;
  }

  // due flashcards?
  const dueCards = await ctx.db
    .query("flashcards")
    .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
    .take(1);
  if (dueCards.length > 0) {
    const dueCount = (
      await ctx.db
        .query("flashcards")
        .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
        .collect()
    ).length;
    const id = await ctx.db.insert("missions", {
      userId,
      title: `Review ${Math.min(dueCount, 10)} due flashcards`,
      description: "Spaced repetition keeps what you already know from slipping away.",
      kind: "review",
      targetCount: Math.min(dueCount, 10),
      progress: 0,
      xpReward: 60,
      status: "active",
      createdAt: now,
    });
    return await ctx.db.get(id) as Doc<"missions">;
  }

  // else: practice newest material
  let material: Doc<"materials"> | null = null;
  if (opts?.materialId) {
    const m = await ctx.db.get(opts.materialId);
    // Never attach a mission to another user's material (defense in depth —
    // callers already verify ownership, but this helper is shared).
    material = m && m.userId === userId && m.status === "ready" ? m : null;
  } else {
    material =
      (await ctx.db
        .query("materials")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .first()) ?? null;
  }
  if (material && material.status === "ready") {
    const id = await ctx.db.insert("missions", {
      userId,
      title: `Practice: ${material.title}`,
      description: "Test yourself on the key concepts to find what still needs work.",
      kind: "practice",
      targetCount: 10,
      progress: 0,
      xpReward: 100,
      materialId: material._id,
      status: "active",
      createdAt: now,
    });
    return await ctx.db.get(id) as Doc<"missions">;
  }

  return null;
}
