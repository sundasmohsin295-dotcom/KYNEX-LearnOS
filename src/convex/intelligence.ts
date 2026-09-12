import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  calibration, gapRadar, masterScore, memoryStatus, oracle, dailyBrief,
  beatYourPastSelf, proveIt, rescuePlan, quickMissionPlan,
  personalBest as bestSession,
  type IntelInput,
  type AttemptRecord,
} from "./intel";
import { ensureProfiles } from "./gamification";
import { logAuditEvent } from "./security";

/**
 * KYNEX Intelligence backend — the analysis layer of the Academic Twin.
 *
 * Zero trust: identity always comes from the auth session, every row is read
 * through by-user indices (another user's rows are never visible to these
 * queries), and no function accepts a learner id from the client. All
 * analytics are deterministic computations over the caller's own data —
 * no AI fabrication, no invented exam statistics.
 */

const DAY = 86400000;

interface AttemptDoc extends Doc<"quizAttempts"> {}

interface LoadedIntel {
  input: IntelInput;
  attemptsRaw: AttemptDoc[];
  reviewRows: Doc<"reviews">[];
  cardKeyById: Map<Id<"flashcards">, string | undefined>;
}

/** Assemble the shared intel input from the caller's own rows. */
async function loadIntel(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<LoadedIntel> {
  const now = Date.now();

  const masteryRows = await ctx.db
    .query("masteryScores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const attemptsRaw = (await ctx.db
    .query("quizAttempts")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(120)) as AttemptDoc[];

  const flashcards = await ctx.db
    .query("flashcards")
    .withIndex("by_user_due", (q) => q.eq("userId", userId))
    .collect();

  const reviewRows = await ctx.db
    .query("reviews")
    .withIndex("by_user_reviewed", (q) => q.eq("userId", userId))
    .order("desc")
    .take(120);

  const mistakeRows = await ctx.db
    .query("mistakes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const examRows = await ctx.db
    .query("exams")
    .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("examDate", now))
    .collect();

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  // ---- GPA state from the student's own Lab data (deterministic) ----
  const gpaSemesters = await ctx.db
    .query("gpaSemesters")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const gpaCourseRows = await ctx.db
    .query("gpaCourses")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const coursesBySem = new Map<Id<"gpaSemesters">, Doc<"gpaCourses">[]>();
  for (const c of gpaCourseRows) {
    const list = coursesBySem.get(c.semesterId) ?? [];
    list.push(c);
    coursesBySem.set(c.semesterId, list);
  }
  let gradedPoints = 0;
  let gradedCredits = 0;
  for (const s of gpaSemesters) {
    for (const c of coursesBySem.get(s._id) ?? []) {
      if (c.creditHours <= 0) continue;
      if (c.gradePoint != null && Number.isFinite(c.gradePoint)) {
        gradedPoints += c.gradePoint * c.creditHours;
        gradedCredits += c.creditHours;
      }
    }
  }
  const currentCgpa =
    gradedCredits > 0 ? Math.round((gradedPoints / gradedCredits) * 100) / 100 : null;
  // projected: graded history + in-progress courses at their entered expected
  // grade point (ungraded in-progress courses hold at the current average).
  let projPoints = 0;
  let projCredits = 0;
  for (const s of gpaSemesters) {
    if (s.status !== "in_progress") continue;
    for (const c of coursesBySem.get(s._id) ?? []) {
      if (c.creditHours <= 0) continue;
      projCredits += c.creditHours;
      projPoints += (c.gradePoint ?? currentCgpa ?? 0) * c.creditHours;
    }
  }
  const projectedCgpa =
    currentCgpa !== null && projCredits > 0
      ? Math.round(((gradedPoints + projPoints) / (gradedCredits + projCredits)) * 100) / 100
      : currentCgpa;

  // distinct study days in the last 14
  const sessions = await ctx.db
    .query("studySessions")
    .withIndex("by_user_created", (q) =>
      q.eq("userId", userId).gte("createdAt", now - 14 * DAY),
    )
    .collect();
  const dayKeys = new Set(
    sessions.map((s) => new Date(s.createdAt).toISOString().slice(0, 10)),
  );  const attempts = attemptsRaw
    .filter((a) => a.status === "completed" && a.answers.length > 0)
    .map((a) => ({
      status: a.status,
      completedAt: a.completedAt,
      examMode: a.examMode === true,
      examDurationSec: a.examDurationSec,
      negativeMarking: a.negativeMarking === true,
      answers: a.answers.map((x) => ({
        correct: x.correct,
        confidence: x.confidence,
      })),
      questions: a.questions.map((q) => ({
        concept: q.concept,
        difficulty: q.difficulty,
        type: q.type,
      })),
      examTiming: a.examTiming,
    }));

  const input: IntelInput = {
    now,
    mastery: masteryRows.map((m) => ({
      conceptKey: m.conceptKey,
      conceptLabel: m.conceptLabel,
      materialId: m.materialId ?? null,
      subjectId: m.subjectId ?? null,
      correct: m.correct,
      attempts: m.attempts,
      lastPracticedAt: m.lastPracticedAt,
    })),
    attempts: attempts as AttemptRecord[],
    flashcards: flashcards.map((f) => ({
      conceptKey: f.conceptKey ?? undefined,
      dueAt: f.dueAt,
      lapses: f.lapses,
      reps: f.reps,
    })),
    reviews: reviewRows.map((r) => ({
      flashcardId: r.flashcardId,
      grade: r.grade,
      reviewedAt: r.reviewedAt,
    })),
    mistakes: mistakeRows.map((m) => ({
      conceptKey: m.conceptKey,
      conceptLabel: m.conceptLabel,
      category: m.category,
      timesMissed: m.timesMissed,
      resolved: m.resolved,
      createdAt: m.createdAt,
    })),
    exams: examRows.map((e) => ({ title: e.title, examDate: e.examDate })),
    gpa: {
      currentCgpa,
      targetCgpa: profile?.targetCgpa ?? null,
      projectedCgpa,
    },
    studyDays14: dayKeys.size,
  };

  const cardKeyById = new Map(
    flashcards.map((f) => [f._id, f.conceptKey ?? undefined] as const),
  );
  return { input, attemptsRaw, reviewRows, cardKeyById };
}

/** Prove-It evidence counters: per-concept application / novel(hard) answers. */
function evidenceCounters(attemptsRaw: AttemptDoc[]) {
  const applied = new Map<string, { total: number; correct: number }>();
  const novel = new Map<string, { total: number; correct: number }>();
  for (const a of attemptsRaw) {
    if (a.status !== "completed") continue;
    for (let i = 0; i < a.answers.length; i++) {
      const q = a.questions[i];
      const ans = a.answers[i];
      if (!q || !ans) continue;
      const key = q.concept.toLowerCase().trim();
      if (q.type === "application") {
        const cur = applied.get(key) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (ans.correct) cur.correct += 1;
        applied.set(key, cur);
      }
      if (q.difficulty === "hard") {
        const cur = novel.get(key) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (ans.correct) cur.correct += 1;
        novel.set(key, cur);
      }
    }
  }
  return { applied, novel };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The full intelligence snapshot (Academic Twin feed). */
export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const { input, attemptsRaw, reviewRows, cardKeyById } = await loadIntel(ctx, userId);
    const { applied, novel } = evidenceCounters(attemptsRaw);

    const recalledKeys = new Set<string>();
    for (const r of reviewRows) {
      if (r.grade === "again") continue;
      const k = cardKeyById.get(r.flashcardId);
      if (k) recalledKeys.add(k);
    }

    return {
      brief: dailyBrief(input, bestSession(input.attempts)),
      oracle: oracle(input),
      gaps: gapRadar(input),
      master: masterScore(input),
      calibration: calibration(input.attempts),
      memory: memoryStatus(input),
      proveIt: proveIt(input, applied, novel, recalledKeys),
      you: beatYourPastSelf(input.attempts, input.reviews),
      evidenceDays: input.studyDays14,
      generatedAt: input.now,
    };
  },
});

/** Compact feed for the Command Center hero strip. */
export const dailyBriefQuery = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const { input } = await loadIntel(ctx, userId);
    return {
      brief: dailyBrief(input, bestSession(input.attempts)),
      oracle: oracle(input),
      quickMission: quickMissionPlan(input, 20),
      generatedAt: input.now,
    };
  },
});

/** Standalone Oracle result + personal best (GPA risk engine). */
export const oracleQuery = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const { input, attemptsRaw } = await loadIntel(ctx, userId);
    void attemptsRaw;
    return {
      oracle: oracle(input),
      personalBest: bestSession(input.attempts),
      generatedAt: input.now,
    };
  },
});

/** Gap Radar + Confidence Calibration + Master Score (signature diagnostics). */
export const diagnostics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const { input } = await loadIntel(ctx, userId);
    return {
      gaps: gapRadar(input),
      calibration: calibration(input.attempts),
      master: masterScore(input),
      generatedAt: input.now,
    };
  },
});

/** Memory Engine status rows. */
export const memoryQuery = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const { input } = await loadIntel(ctx, userId);
    return {
      rows: memoryStatus(input).slice(0, 12),
      generatedAt: input.now,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations — create REAL missions from the intelligence layer
// ---------------------------------------------------------------------------

/** Start the ONE highest-impact quick mission (default 20 minutes). */
export const startQuickMission = mutation({
  args: { minutes: v.optional(v.number()) },
  handler: async (ctx, { minutes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const { input } = await loadIntel(ctx, userId);
    const plan = quickMissionPlan(input, minutes ?? 20);

    // One active mission at a time — retire the previous one.
    const active = await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    for (const m of active) {
      await ctx.db.delete(m._id);
    }

    const now = Date.now();
    const id = await ctx.db.insert("missions", {
      userId,
      title: plan.title,
      description: plan.description,
      kind: plan.kind,
      targetCount: plan.targetCount,
      progress: 0,
      xpReward: 60 + Math.min(60, Math.round(plan.minutes * 2)),
      conceptKey: plan.conceptKey,
      conceptLabel: plan.conceptLabel,
      materialId: (plan.materialId ?? undefined) as Id<"materials"> | undefined,
      status: "active",
      createdAt: now,
    });
    await logAuditEvent(ctx, userId, "quick_mission_insertion", plan.kind);
    return id;
  },
});

/** Emergency recovery plan — REAL missions for a realistic time budget. */
export const startRescuePlan = mutation({
  args: {
    hours: v.number(),
    situation: v.optional(v.string()),
  },
  handler: async (ctx, { hours, situation }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!Number.isFinite(hours) || hours < 1 || hours > 12) {
      throw new Error("Available time must be between 1 and 12 hours.");
    }
    const cleanSituation = (situation ?? "").trim().slice(0, 120);
    const { input } = await loadIntel(ctx, userId);
    const plan = rescuePlan(input, hours);
    if (plan.steps.length === 0) {
      throw new Error("Not enough learning evidence yet — run one practice session first.");
    }

    const active = await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    for (const m of active) {
      await ctx.db.delete(m._id);
    }

    const now = Date.now();
    for (const step of plan.steps) {
      await ctx.db.insert("missions", {
        userId,
        title: step.title,
        description: step.description,
        kind: step.kind,
        targetCount: step.targetCount,
        progress: 0,
        xpReward: 40 + step.minutes,
        conceptKey: step.conceptKey,
        conceptLabel: step.conceptLabel,
        materialId: (step.materialId ?? undefined) as Id<"materials"> | undefined,
        status: "active",
        createdAt: now + (step.order - 1),
      });
    }
    await logAuditEvent(ctx, userId, "rescue_plan_started_v2", cleanSituation || "unspecified");
    await ensureProfiles(ctx);
    return { created: plan.steps.length, summary: plan.summary, honestNote: plan.honestNote };
  },
});
