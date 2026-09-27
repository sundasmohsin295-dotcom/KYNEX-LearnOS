import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  generateMissionPlan,
  masteryDeltaFromEvidence,
  classifyMissionError,
  type MissionEvidence,
  type TaskStatus,
} from "./missionMath";
import { enforceRateLimit, logAuditEvent } from "./security";

/**
 * KYNEX Mission Engine backend.
 *
 * Zero trust: identity comes only from the auth session; every mission/task
 * row is fetched AND ownership-re-checked before read or write. Answers are
 * validated and outcomes computed server-side — the client never sends a
 * score. Completion is idempotent. Cross-user ids return `ok:false` and are
 * audit-logged (committed, not thrown, so the audit row survives).
 */

const RATE_KEY = "quizAnswer" as const; // reuse the existing quizAnswer budget

async function getOwnedMission(
  ctx: QueryCtx | MutationCtx,
  missionId: Id<"missions">,
  userId: Id<"users">,
): Promise<Doc<"missions"> | null> {
  const m = await ctx.db.get(missionId);
  return m && m.userId === userId ? m : null;
}

async function getOwnedTask(
  ctx: QueryCtx | MutationCtx,
  taskId: Id<"missionTasks">,
  userId: Id<"users">,
): Promise<Doc<"missionTasks"> | null> {
  const t = await ctx.db.get(taskId);
  return t && t.userId === userId ? t : null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The caller's active mission with its full task list (mission screen feed). */
export const getActiveMission = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const mission = (
      await ctx.db
        .query("missions")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .order("desc")
        .take(1)
    )[0];
    if (!mission) return null;
    const tasks = await ctx.db
      .query("missionTasks")
      .withIndex("by_mission", (q) => q.eq("missionId", mission._id))
      .collect();
    return {
      mission,
      tasks: tasks.sort((a, b) => a.order - b.order),
    };
  },
});

/** One mission + tasks, ownership-checked (returns null for foreign ids). */
export const getMission = query({
  args: { missionId: v.id("missions") },
  handler: async (ctx, { missionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const mission = await getOwnedMission(ctx, missionId, userId);
    if (!mission) return null;
    const tasks = await ctx.db
      .query("missionTasks")
      .withIndex("by_mission", (q) => q.eq("missionId", missionId))
      .collect();
    return { mission, tasks: tasks.sort((a, b) => a.order - b.order) };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * One-click NEXT MOVE: create (or reuse) a real mission for the active one,
 * backed by tasks generated from the material's stored analysis. Returns the
 * missionId so the UI can navigate straight to the mission screen.
 */
export const startFromCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceRateLimit(ctx, "textIngest", userId); // mission creation budget

    // Reuse the current active mission if one exists (idempotent-ish UX).
    const existing = (
      await ctx.db
        .query("missions")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .order("desc")
        .take(1)
    )[0];
    if (existing) {
      const hasTasks = await ctx.db
        .query("missionTasks")
        .withIndex("by_mission", (q) => q.eq("missionId", existing._id))
        .first();
      if (hasTasks) return { missionId: existing._id, created: false as const };
    }

    // Locate the target: active mission's material/concept, else weakest
    // mastery concept, else newest ready material.
    let materialId = existing?.materialId;
    let conceptKey = existing?.conceptKey;
    let conceptLabel = existing?.conceptLabel;
    if (!materialId) {
      const mastery = await ctx.db
        .query("masteryScores")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const weak = mastery
        .filter((m) => m.attempts >= 2)
        .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0];
      if (weak) {
        materialId = weak.materialId ?? undefined;
        conceptKey = weak.conceptKey;
        conceptLabel = weak.conceptLabel;
      }
    }
    if (!materialId) {
      const newest = await ctx.db
        .query("materials")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("desc")
        .first();
      if (newest && newest.userId === userId) {
        materialId = newest._id;
      }
    }
    if (!materialId) {
      // Honest dependency state: the user genuinely has no learning material.
      // Never fabricate a mission from data that doesn't exist.
      throw new Error(
        "No learning material is available yet. Add one to the Vault first, then start a mission.",
      );
    }

    // OWNERSHIP CHECK — the material must belong to the caller.
    const material = await ctx.db.get(materialId);
    if (!material || material.userId !== userId) {
      throw new Error("Material not found.");
    }

    // DEPENDENCY STATE — a material that exists is not automatically usable.
    // Each upstream state gets its own honest message and next action.
    if (material.status !== "ready" || !material.analysis) {
      if (material.status === "processing") {
        throw new Error(
          "Material analysis is currently processing. Please wait for completion in the Vault before starting your mission.",
        );
      }
      const reason = material.error
        ? ` Reason: ${material.error}`
        : "";
      throw new Error(
        `Your material exists, but analysis has not completed yet.${reason} Open it in the Vault and retry analysis, then start the mission.`,
      );
    }

    // Stored accuracy for this concept (real evidence, shapes difficulty).
    let currentAccuracy: number | null = null;
    if (conceptKey) {
      const rows = await ctx.db
        .query("masteryScores")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const row = rows.find((m) => m.conceptKey === conceptKey);
      if (row && row.attempts > 0) {
        currentAccuracy = Math.round((row.correct / row.attempts) * 100);
      }
    }

    // Generate the task plan from the material's real analysis.
    const plan = generateMissionPlan({
      conceptKey: conceptKey ?? "",
      conceptLabel: conceptLabel ?? material.title,
      material: {
        title: material.title,
        analysis: material.analysis
          ? {
              summary: material.analysis.summary,
              deepExplanation: material.analysis.deepExplanation,
              concepts: material.analysis.concepts,
              definitions: material.analysis.definitions,
              formulas: material.analysis.formulas,
              examples: material.analysis.examples,
              misconceptions: material.analysis.misconceptions,
              remember: material.analysis.remember,
            }
          : null,
      },
      currentAccuracy,
    });
    if (!plan) {
      throw new Error(
        "This material doesn't have a structured analysis yet — run analysis from the material page first.",
      );
    }

    // Create or reuse the mission row, then insert tasks.
    const now = Date.now();
    const missionId =
      existing && !conceptKey === false ? existing._id : existing?._id ?? undefined;
    const finalMissionId: Id<"missions"> =
      missionId ??
      (await ctx.db.insert("missions", {
        userId,
        title: conceptLabel ? `Fix: ${conceptLabel}` : `Practice: ${material.title}`,
        description: plan.objective,
        kind: currentAccuracy !== null && currentAccuracy < 60 ? "fix_gap" : "practice",
        targetCount: plan.tasks.length,
        progress: 0,
        xpReward: 60 + plan.estimatedMinutes * 2,
        conceptKey: conceptKey ?? undefined,
        conceptLabel: conceptLabel ?? undefined,
        materialId,
        status: "active",
        createdAt: now,
      }));

    for (const t of plan.tasks) {
      await ctx.db.insert("missionTasks", {
        userId,
        missionId: finalMissionId,
        order: t.order,
        kind: t.kind,
        title: t.title,
        prompt: t.prompt,
        options: t.options,
        correctIndex: t.correctIndex,
        explanation: t.explanation?.slice(0, 900),
        hint: t.hint?.slice(0, 300),
        status: "pending",
      });
    }
    await logAuditEvent(ctx, userId, "mission_created", t_kind(plan.tasks.length));
    return { missionId: finalMissionId, created: true as const };
  },
});

/** tiny helper for audit detail */
function t_kind(n: number): string {
  return `tasks:${n}`;
}

/** The caller's most recent quiz attempt for a material (mission mistake lineage). */
async function lastQuizAttemptId(
  ctx: MutationCtx,
  userId: Id<"users">,
  materialId: Id<"materials"> | undefined,
): Promise<Id<"quizAttempts"> | null> {
  const rows = await ctx.db
    .query("quizAttempts")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(5);
  const found = materialId ? rows.find((r) => r.materialId === materialId) : rows[0];
  return found ? found._id : null;
}

/**
 * Submit an answer for one mission task. The outcome is computed HERE —
 * the client sends only the selection (or a self-graded recall result
 * plus confidence). Adaptive-difficulty info is returned to guide the UI.
 */
export const answerTask = mutation({
  args: {
    taskId: v.id("missionTasks"),
    selectedIndex: v.optional(v.number()),
    /** recall/challenge steps are self-graded against the model answer */
    selfGrade: v.optional(v.union(
      v.literal("correct"),
      v.literal("partial"),
      v.literal("incorrect"),
    )),
    confidence: v.optional(v.union(
      v.literal("sure"),
      v.literal("probably"),
      v.literal("guess"),
    )),
    seconds: v.optional(v.number()),
  },
  handler: async (ctx, { taskId, selectedIndex, selfGrade, confidence, seconds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceRateLimit(ctx, RATE_KEY, userId);

    const task = await getOwnedTask(ctx, taskId, userId);
    if (!task) {
      await logAuditEvent(ctx, userId, "access_denied", "mission_task_foreign");
      return { ok: false as const, verdict: "DENIED" as const };
    }
    const mission = await getOwnedMission(ctx, task.missionId, userId);
    if (!mission || mission.status !== "active") {
      return { ok: false as const, verdict: "MISSION_CLOSED" as const };
    }
    if (task.status !== "pending") {
      // Idempotent replay: report the stored outcome, change nothing.
      return { ok: true as const, verdict: verdictOf(task.status), replay: true as const };
    }

    let status: TaskStatus;
    if (task.kind === "practice") {
      if (
        selectedIndex === undefined ||
        !Number.isInteger(selectedIndex) ||
        !task.options ||
        selectedIndex < 0 ||
        selectedIndex >= task.options.length ||
        task.correctIndex === undefined
      ) {
        throw new Error("Invalid selection.");
      }
      status = selectedIndex === task.correctIndex ? "correct" : "incorrect";
    } else {
      // recall / challenge / explain: honest self-assessment against the model
      status = selfGrade ?? "skipped";
    }

    const secs =
      seconds !== undefined && Number.isFinite(seconds)
        ? Math.max(0, Math.min(3600, Math.round(seconds)))
        : null;

    await ctx.db.patch(task._id, {
      status,
      confidence,
      secondsSpent: secs ?? undefined,
      answeredAt: Date.now(),
    });

    // Advance mission progress (count graded steps, not explain steps).
    const tasks = await ctx.db
      .query("missionTasks")
      .withIndex("by_mission", (q) => q.eq("missionId", task.missionId))
      .collect();
    const graded = tasks.filter((t) => t.status !== "pending" && t.status !== "skipped");
    const done = tasks.filter(
      (t) => t.status !== "pending" && t.kind !== "explain",
    ).length;
    await ctx.db.patch(mission._id, {
      progress: Math.min(mission.targetCount, done),
    });

    const correctCount = graded.filter((t) => t.status === "correct").length;
    return {
      ok: true as const,
      verdict: verdictOf(status),
      correct: status === "correct",
      explanation: task.explanation,
      correctIndex: task.kind === "practice" ? task.correctIndex : undefined,
      adaptiveNext:
        status === "correct"
          ? secs !== null && secs <= 30
            ? "escalate" as const
            : "hold" as const
          : "repair" as const,
      progressSoFar: {
        answered: graded.length,
        correct: correctCount,
      },
    };
  },
});

function verdictOf(s: TaskStatus): "CORRECT" | "PARTIALLY CORRECT" | "INCORRECT" | "SKIPPED" {
  return s === "correct"
    ? "CORRECT"
    : s === "partial"
      ? "PARTIALLY CORRECT"
      : s === "incorrect"
        ? "INCORRECT"
        : "SKIPPED";
}

/**
 * Complete the mission: compute evidence from real task outcomes, apply the
 * honest mastery delta, record mistakes for wrong answers, award XP, mark
 * the mission completed. Idempotent.
 */
export const completeMission = mutation({
  args: { missionId: v.id("missions") },
  handler: async (ctx, { missionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mission = await getOwnedMission(ctx, missionId, userId);
    if (!mission) {
      await logAuditEvent(ctx, userId, "access_denied", "mission_complete_foreign");
      return { ok: false as const };
    }

    const tasks = await ctx.db
      .query("missionTasks")
      .withIndex("by_mission", (q) => q.eq("missionId", missionId))
      .collect();

    const gradedTasks = tasks.filter((t) => t.status !== "pending" && t.kind !== "explain");
    const answered = gradedTasks.length;
    const correct = gradedTasks.filter((t) => t.status === "correct").length;
    const skipped = tasks.filter((t) => t.status === "skipped").length;
    const confidentWrong = gradedTasks.filter(
      (t) => t.status !== "correct" && t.confidence === "sure",
    ).length;
    const lowConfidenceRight = gradedTasks.filter(
      (t) => t.status === "correct" && t.confidence === "guess",
    ).length;
    const timings = gradedTasks.map((t) => t.secondsSpent).filter((s): s is number => s != null);
    const avgSeconds =
      timings.length > 0 ? Math.round(timings.reduce((n, s) => n + s, 0) / timings.length) : null;
    const scorePct = answered > 0 ? Math.round((correct / answered) * 100) : null;

    const evidence: MissionEvidence = {
      correct, answered, skipped, confidentWrong, lowConfidenceRight, avgSeconds, scorePct,
    };

    // ---- Mastery before/after from REAL stored accuracy ----
    let beforePct: number | null = null;
    let delta: ReturnType<typeof masteryDeltaFromEvidence> = null;
    if (mission.conceptKey) {
      const rows = await ctx.db
        .query("masteryScores")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const row = rows.find((m) => m.conceptKey === mission.conceptKey);
      if (row && row.attempts > 0) {
        beforePct = Math.round((row.correct / row.attempts) * 100);
        delta = masteryDeltaFromEvidence(evidence, beforePct);
      }
      if (row && answered > 0) {
        // Fold mission answers into the stored accuracy (real evidence).
        await ctx.db.patch(row._id, {
          correct: row.correct + correct,
          attempts: row.attempts + answered,
          lastPracticedAt: Date.now(),
        });
      }
    }

    // ---- Mistakes for wrong graded answers (classified, real) ----
    let mistakesCreated = 0;
    for (const t of gradedTasks) {
      if (t.status === "correct") continue;
      const category = classifyMissionError(
        t.kind === "challenge" ? "challenge" : t.kind === "practice" ? "practice" : "recall",
        t.confidence,
        t.secondsSpent ?? null,
      );
      const dup = await ctx.db
        .query("mistakes")
        .withIndex("by_user_concept", (q) =>
          q.eq("userId", userId).eq("conceptKey", mission.conceptKey ?? ""),
        )
        .filter((q) => q.eq(q.field("question"), t.title))
        .first();
      if (dup) {
        await ctx.db.patch(dup._id, { timesMissed: dup.timesMissed + 1 });
      } else {
        await ctx.db.insert("mistakes", {
          userId,
          materialId: mission.materialId,
          // mistakes.attemptId points at quizAttempts; mission-origin mistakes
          // keep the quiz lineage of the concept's last quiz attempt instead
          // of mis-typing a missions id.
          attemptId: (await lastQuizAttemptId(ctx, userId, mission.materialId)) ?? "" as Id<"quizAttempts">,
          questionIndex: t.order,
          question: t.title.slice(0, 500),
          yourAnswer: t.confidence ? `answered (${t.confidence})` : "attempted",
          correctAnswer: (t.explanation ?? t.prompt).slice(0, 300),
          explanation: (t.explanation ?? "Review the model answer in the mission.").slice(0, 1000),
          conceptKey: mission.conceptKey ?? t.title.toLowerCase().slice(0, 120),
          conceptLabel: mission.conceptLabel ?? t.title.slice(0, 120),
          category: category === "confidence_calibration" ? "reasoning" : category,
          difficulty: t.kind === "challenge" ? "hard" : t.kind === "practice" ? "medium" : "easy",
          timesMissed: 1,
          resolved: false,
          createdAt: Date.now(),
        });
        mistakesCreated++;
      }
    }

    // ---- Mission completion (idempotent) ----
    const wasCompleted = mission.status === "completed";
    if (!wasCompleted) {
      // XP only for real graded performance — never for clicking through.
      const xpEarned = Math.max(0, correct * 10 + (scorePct === 100 && answered >= 3 ? 40 : 0));
      // Variable reward: a surprise burst after strong missions (>=80% with
      // real graded answers). Deterministic seed; ~1/3 of qualifying missions.
      const { awardXp, variableRewardXp } = await import("./gamification");
      const burst = variableRewardXp(
        `${mission._id}:${correct}:${answered}`,
        answered >= 3 ? scorePct : null,
      );
      await awardXp(ctx, xpEarned + burst, burst > 0 ? `Mission burst: ${mission.title}` : `Mission: ${mission.title}`);
      await ctx.db.insert("studySessions", {
        userId,
        minutes: Math.max(3, Math.round(answered * 1.5)),
        kind: "mission",
        createdAt: Date.now(),
      });
      await ctx.db.patch(mission._id, {
        status: "completed",
        progress: mission.targetCount,
        completedAt: Date.now(),
      });
      await logAuditEvent(ctx, userId, "mission_completed", `score:${scorePct ?? 0}`);
    }

    return {
      ok: true as const,
      alreadyDone: wasCompleted,
      evidence,
      mastery: delta,
      mistakesCreated,
      conceptLabel: mission.conceptLabel ?? null,
      missionTitle: mission.title,
    };
  },
});

/** Abandon (delete) an active mission — replaces it on the next NEXT MOVE. */
export const abandonMission = mutation({
  args: { missionId: v.id("missions") },
  handler: async (ctx, { missionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const mission = await getOwnedMission(ctx, missionId, userId);
    if (!mission) return { ok: false as const };
    for (const t of await ctx.db
      .query("missionTasks")
      .withIndex("by_mission", (q) => q.eq("missionId", missionId))
      .collect()) {
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(missionId);
    await logAuditEvent(ctx, userId, "mission_abandoned");
    return { ok: true as const };
  },
});
