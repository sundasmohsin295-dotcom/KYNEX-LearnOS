import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  ensureProfiles,
  awardXp,
  generateNextMission,
  variableRewardXp,
} from "./gamification";
import { ACHIEVEMENT_META } from "./achievementMeta";
import { enforceRateLimit, logAuditEvent, logAccessDenied } from "./security";

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getConversation = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const c = await ctx.db.get(id);
    return c && c.userId === userId ? c : null;
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== userId) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", conversationId))
      .order("asc")
      .collect();
  },
});

export const createConversation = mutation({
  args: { materialId: v.optional(v.id("materials")), title: v.optional(v.string()) },
  handler: async (ctx, { materialId, title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // The optional material must belong to the caller — never store a client
    // supplied reference to someone else's study material.
    let ownedMaterialId: typeof materialId = undefined;
    if (materialId) {
      const material = await ctx.db.get(materialId);
      if (material && material.userId === userId) ownedMaterialId = materialId;
    }
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      userId,
      materialId: ownedMaterialId,
      title: title ?? "New chat",
      starred: false,
      archived: false,
      updatedAt: now,
      createdAt: now,
    });
    return id;
  },
});

export const renameConversation = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  handler: async (ctx, { id, title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) return;
    await ctx.db.patch(id, { title: title.slice(0, 120), updatedAt: Date.now() });
  },
});

export const starConversation = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) return;
    await ctx.db.patch(id, { starred: !c.starred });
  },
});

export const deleteConversation = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) return;
    for (const msg of await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", id))
      .collect()) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(id);
    await logAuditEvent(ctx, userId, "conversation_deleted", "with_messages");
  },
});

/** Public: save the user message, then the client triggers the AI action. */
export const appendUserMessage = mutation({
  args: { conversationId: v.id("conversations"), content: v.string() },
  handler: async (ctx, { conversationId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const conv = await ctx.db.get(conversationId);
    if (!conv || conv.userId !== userId) throw new Error("Conversation not found");

    // Server-side input validation: hard cap + strip control characters.
    // eslint-disable-next-line no-control-regex -- intentional: strips C0 control chars from chat input
    const text = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (text.length === 0) throw new Error("Message cannot be empty.");
    if (text.length > 4000) {
      throw new Error("Message is too long (4000 characters maximum).");
    }

    await ctx.db.insert("messages", {
      userId,
      conversationId,
      role: "user",
      content: text,
      createdAt: Date.now(),
    });
    const title = conv.title === "New chat" ? text.slice(0, 60) : conv.title;
    await ctx.db.patch(conversationId, { updatedAt: Date.now(), title });
    // small XP for genuine engagement
    await awardXp(ctx, 2, "Asked a question");
    await logStudySession(ctx, 1, "chat");
  },
});

/** Internal: store the assistant reply. */
export const appendAssistantInternal = internalMutation({
  args: { conversationId: v.id("conversations"), content: v.string() },
  handler: async (ctx, { conversationId, content }) => {
    await ctx.db.insert("messages", {
      userId: (await ctx.db.get(conversationId))!.userId,
      conversationId,
      role: "assistant",
      content,
      createdAt: Date.now(),
    });
    await ctx.db.patch(conversationId, { updatedAt: Date.now() });
  },
});

// ---------------------------------------------------------------------------
// Quiz attempts
// ---------------------------------------------------------------------------

export const getQuizAttempt = query({
  args: { id: v.id("quizAttempts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const q = await ctx.db.get(id);
    return q && q.userId === userId ? q : null;
  },
});

export const listQuizAttempts = query({
  args: { materialId: v.optional(v.id("materials")) },
  handler: async (ctx, { materialId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("quizAttempts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return materialId ? all.filter((q) => q.materialId === materialId) : all;
  },
});

export const startQuiz = mutation({
  args: {
    materialId: v.id("materials"),
    conceptKey: v.optional(v.string()),
    count: v.number(),
    difficulty: v.string(),
    mode: v.union(v.literal("diagnostic"), v.literal("practice")),
    missionId: v.optional(v.id("missions")),
    // ---- Exam Simulator options (validated server-side below) ----
    examMode: v.optional(v.boolean()),
    examMinutes: v.optional(v.number()),
    negativeMarking: v.optional(v.boolean()),
  },
  handler: async (ctx, { materialId, conceptKey, count, difficulty, mode, missionId, examMode, examMinutes, negativeMarking }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // IDOR FIX: the material must exist AND belong to the caller.
    const material = await ctx.db.get(materialId);
    if (!material || material.userId !== userId) {
      throw new Error("Material not found");
    }
    // IDOR FIX: an attached mission must belong to the caller — never accept a
    // client-supplied mission id to attach XP/progress to someone else's goal.
    if (missionId) {
      const mission = await ctx.db.get(missionId);
      if (!mission || mission.userId !== userId) {
        throw new Error("Mission not found");
      }
    }
    if (count < 1 || count > 20 || !Number.isInteger(count)) {
      throw new Error("Question count must be between 1 and 20.");
    }
    if (!["easy", "medium", "hard", "adaptive"].includes(difficulty)) {
      throw new Error("Invalid difficulty.");
    }
    if (conceptKey && conceptKey.length > 120) {
      throw new Error("Concept filter is too long.");
    }

    // Exam settings are validated server-side — the client cannot set an
    // arbitrary clock or change scoring rules the server enforces.
    const now = Date.now();
    const isExam = examMode === true;
    const minutes = isExam
      ? Math.min(180, Math.max(5, Math.round(examMinutes ?? count * 1.5)))
      : undefined;
    const durationSec = minutes !== undefined ? minutes * 60 : undefined;

    const id = await ctx.db.insert("quizAttempts", {
      userId,
      materialId,
      conceptFocus: conceptKey,
      mode,
      status: "generating",
      questions: [],
      answers: [],
      missionId,
      examMode: isExam,
      examDurationSec: durationSec,
      negativeMarking: isExam ? negativeMarking === true : undefined,
      examFlags: isExam ? [] : undefined,
      examTiming: isExam ? [] : undefined,
      createdAt: now,
    });
    return id;
  },
});

/** Internal: fill in generated questions. */
export const activateInternal = internalMutation({
  args: {
    attemptId: v.id("quizAttempts"),
    questions: v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
        whyWrong: v.array(v.string()),
        concept: v.string(),
        difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
        type: v.string(),
      }),
    ),
  },
  handler: async (ctx, { attemptId, questions }) => {
    await ctx.db.patch(attemptId, { status: "active", questions });
  },
});

// ---------------------------------------------------------------------------
// Exam Simulator — server-authoritative clock, flags, timing telemetry
// ---------------------------------------------------------------------------

/**
 * Start the exam clock. The deadline is stored server-side on first call so a
 * manipulated client clock cannot extend an exam. Called automatically by the
 * UI when the attempt becomes active.
 */
export const startExam = mutation({
  args: { attemptId: v.id("quizAttempts") },
  handler: async (ctx, { attemptId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const q = await ctx.db.get(attemptId);
    if (!q || q.userId !== userId) throw new Error("Quiz not found");
    if (!q.examMode || q.status !== "active") return { ok: false as const };
    if (q.examStartedAt) return { ok: true as const }; // idempotent
    const now = Date.now();
    const endsAt = now + (q.examDurationSec ?? 0) * 1000;
    await ctx.db.patch(attemptId, { examStartedAt: now, examEndsAt: endsAt });
    return { ok: true as const, endsAt };
  },
});

/** Toggle the review flag on a question (exam mode only). */
export const toggleExamFlag = mutation({
  args: { attemptId: v.id("quizAttempts"), index: v.number() },
  handler: async (ctx, { attemptId, index }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const q = await ctx.db.get(attemptId);
    if (!q || q.userId !== userId) throw new Error("Quiz not found");
    if (!q.examMode || q.status !== "active") return { ok: false as const };
    if (!q.examFlags || index < 0 || index >= q.questions.length) {
      return { ok: false as const };
    }
    const flags = [...q.examFlags];
    while (flags.length <= index) flags.push(false);
    flags[index] = !flags[index];
    await ctx.db.patch(attemptId, { examFlags: flags });
    return { ok: true as const };
  },
});

/**
 * Record how long a question took (seconds, integer). Appends in order so
 * examTiming stays parallel to answers. Clamped to the exam duration.
 */
export const recordTiming = mutation({
  args: { attemptId: v.id("quizAttempts"), seconds: v.number() },
  handler: async (ctx, { attemptId, seconds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const q = await ctx.db.get(attemptId);
    if (!q || q.userId !== userId) throw new Error("Quiz not found");
    if (!q.examMode || q.status !== "active") return { ok: false as const };
    if (!q.examTiming) return { ok: false as const };
    const s = Math.max(0, Math.min(q.examDurationSec ?? 10800, Math.round(seconds)));
    const timings = [...q.examTiming, s];
    await ctx.db.patch(attemptId, { examTiming: timings });
    return { ok: true as const };
  },
});

/** Internal: mark quiz generation failed. */
export const failInternal = internalMutation({
  args: { attemptId: v.id("quizAttempts"), error: v.string() },
  handler: async (ctx, { attemptId, error }) => {
    // The attempt may have been deleted while generation ran — never throw
    // from a failure path (a throw here would mask the real AI error).
    if (!(await ctx.db.get(attemptId))) return;
    await ctx.db.patch(attemptId, {
      status: "failed",
      error: error.slice(0, 500),
      completedAt: Date.now(),
    });
  },
});

export const answerQuestion = mutation({
  args: {
    attemptId: v.id("quizAttempts"),
    index: v.number(),
    selectedIndex: v.number(),
    confidence: v.union(
      v.literal("sure"),
      v.literal("probably"),
      v.literal("guess"),
    ),
  },
  handler: async (ctx, { attemptId, index, selectedIndex, confidence }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceRateLimit(ctx, "quizAnswer", userId);
    const q = await ctx.db.get(attemptId);
    if (!q || q.userId !== userId) throw new Error("Quiz not found");
    if (q.status !== "active") throw new Error("Quiz is not active");
    // Server-authoritative exam clock: late answers are rejected and the
    // attempt is closed. The client cannot argue with this timestamp.
    if (q.examMode && q.examEndsAt && Date.now() > q.examEndsAt) {
      const material2 = await ctx.db.get(q.materialId);
      await ctx.db.patch(attemptId, { status: "completed", completedAt: Date.now() });
      await logStudySession(ctx, 1, "exam");
      void material2;
      throw new Error("Time is up — this exam has been submitted automatically.");
    }
    if (q.answers.length !== index) throw new Error("Answer out of order");

    const question = q.questions[index];
    if (!question) throw new Error("Question not found");
    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= question.options.length
    ) {
      throw new Error("Invalid answer selection.");
    }
    const correct = selectedIndex === question.correctIndex;
    const nextAnswers = [...q.answers, { selectedIndex, confidence, correct }];
    await ctx.db.patch(attemptId, { answers: nextAnswers });
    return { correct };
  },
});

const CONFIDENCE_WEIGHT: Record<string, number> = { sure: 1, probably: 0.6, guess: 0.2 };

export const completeQuiz = mutation({
  args: { attemptId: v.id("quizAttempts") },
  handler: async (ctx, { attemptId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const q = await ctx.db.get(attemptId);
    if (!q || q.userId !== userId) throw new Error("Quiz not found");
    if (q.status === "completed") {
      // Idempotent replay: same result shape as the normal path, zeroed.
      return { xp: 0, leveledUp: false, newLevel: 0, accuracy: 0, correctCount: 0, total: 0 };
    }
    if (q.status !== "active") throw new Error("Quiz is not active");

    const material = await ctx.db.get(q.materialId);
    const now = Date.now();

    // update mastery scores per concept
    // Indexed read ONCE for the whole transaction, then an in-memory index —
    // the previous code re-collected every mastery row per answered question
    // (O(answers × rows)). Same semantics: Convex reads see this transaction's
    // own writes, mirrored here by updating the map when a row is inserted.
    const masteryRows = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (mq) => mq.eq("userId", userId))
      .collect();
    const masteryByKey = new Map(
      masteryRows.map((m) => [`${m.materialId ?? ""}|${m.conceptKey}`, m] as const),
    );
    for (let i = 0; i < q.answers.length; i++) {
      const question = q.questions[i];
      const answer = q.answers[i];
      if (!question || !answer) continue;
      const key = question.concept.toLowerCase().trim();
      const row = masteryByKey.get(`${q.materialId}|${key}`);
      if (row) {
        await ctx.db.patch(row._id, {
          correct: row.correct + (answer.correct ? 1 : 0),
          attempts: row.attempts + 1,
          confidenceSum: row.confidenceSum + (CONFIDENCE_WEIGHT[answer.confidence] ?? 0.5),
          confidenceCount: row.confidenceCount + 1,
          lastPracticedAt: now,
        });
      } else {
        const inserted = await ctx.db.insert("masteryScores", {
          userId,
          subjectId: material?.subjectId,
          materialId: q.materialId,
          conceptKey: key,
          conceptLabel: question.concept,
          correct: answer.correct ? 1 : 0,
          attempts: 1,
          confidenceSum: CONFIDENCE_WEIGHT[answer.confidence] ?? 0.5,
          confidenceCount: 1,
          lastPracticedAt: now,
        });
        // Keep the in-memory index coherent for a second answer to the same
        // concept later in this quiz (patch path must see the new row).
        // Built from the values just written — no extra read, no null path.
        masteryByKey.set(`${q.materialId}|${key}`, {
          _id: inserted,
          _creationTime: now,
          userId,
          subjectId: material?.subjectId,
          materialId: q.materialId,
          conceptKey: key,
          conceptLabel: question.concept,
          correct: answer.correct ? 1 : 0,
          attempts: 1,
          confidenceSum: CONFIDENCE_WEIGHT[answer.confidence] ?? 0.5,
          confidenceCount: 1,
          lastPracticedAt: now,
        });
      }
    }

    const correctCount = q.answers.filter((a) => a.correct).length;
    const answeredCount = q.answers.length;
    const accuracy = answeredCount > 0 ? correctCount / answeredCount : 0;

    // ---- Negative marking (exam mode only, server-decided) ----
    const negatives = q.negativeMarking
      ? q.answers.filter((a) => !a.correct).length
      : 0;
    const rawScore = correctCount - negatives;

    // XP rewards genuine learning — never modified by negative marking
    // (penalties affect exam score display, not the mastery reward loop).
    const xpEarned = Math.max(
      0,
      Math.round(correctCount * 12 + (accuracy === 1 && answeredCount >= 5 ? 60 : 0)),
    );

    // Variable reward: surprise burst after strong completed quizzes
    // (>=80% with 5+ answered). Deterministic seed; ~1/3 of qualifying runs.
    const accuracyPct = Math.round(accuracy * 100);
    const burst = variableRewardXp(
      `quiz:${q._id}:${correctCount}:${answeredCount}`,
      answeredCount >= 5 ? accuracyPct : null,
    );

    const { leveledUp, newLevel } = await awardXp(
      ctx,
      xpEarned + burst,
      burst > 0 ? `Quiz burst: ${material?.title ?? "practice"}` : `Quiz: ${material?.title ?? "practice"}`,
    );
    await logStudySession(ctx, Math.max(3, Math.round(answeredCount * 0.75)), q.examMode ? "exam" : "quiz");

    // ---- Mistake Bank: durable records for every wrong answer ----
    for (let i = 0; i < q.answers.length; i++) {
      const question = q.questions[i];
      const answer = q.answers[i];
      if (!question || !answer || answer.correct) continue;
      const key = question.concept.toLowerCase().trim();
      // classification heuristic — transparent, not magic:
      // confident wrong answer on an easy question => careless; hard question
      // => conceptual; low-confidence on hard => reasoning/application.
      const conf = answer.confidence;
      let category: "conceptual" | "calculation" | "careless" | "memory" | "misreading" | "time_pressure" | "reasoning" | "application";
      if (question.difficulty === "easy" && conf === "sure") {
        category = "careless";
      } else if (question.difficulty === "hard" && conf === "guess") {
        category = "reasoning";
      } else if (conf === "guess") {
        category = "memory";
      } else if (question.type === "application") {
        category = "application";
      } else if (question.difficulty === "hard") {
        category = "conceptual";
      } else {
        category = "memory";
      }

      // Merge repeated misses on the same concept+question-ish text.
      const existingMistakes = await ctx.db
        .query("mistakes")
        .withIndex("by_user_concept", (mq) =>
          mq.eq("userId", userId).eq("conceptKey", key),
        )
        .collect();
      const twin = existingMistakes.find(
        (m) => !m.resolved && m.question === question.question,
      );
      if (twin) {
        await ctx.db.patch(twin._id, { timesMissed: twin.timesMissed + 1, createdAt: now });
      } else {
        await ctx.db.insert("mistakes", {
          userId,
          materialId: q.materialId,
          attemptId: attemptId,
          questionIndex: i,
          question: question.question.slice(0, 500),
          yourAnswer: (question.options[answer.selectedIndex] ?? "").slice(0, 300),
          correctAnswer: (question.options[question.correctIndex] ?? "").slice(0, 300),
          explanation: question.explanation.slice(0, 1000),
          conceptKey: key,
          conceptLabel: question.concept.slice(0, 120),
          category,
          difficulty: question.difficulty,
          timesMissed: 1,
          resolved: false,
          createdAt: now,
        });
      }
    }

    // ---- Resolve past mistakes that this quiz just proved fixed ----
    const wrongKeys = new Set(
      q.answers
        .filter((a) => !a.correct)
        .map((a, i) => q.questions[i]?.concept.toLowerCase().trim())
        .filter((k): k is string => !!k),
    );
    if (correctCount > 0) {
      const openMistakes = await ctx.db
        .query("mistakes")
        .withIndex("by_user_resolved", (mq) =>
          mq.eq("userId", userId).eq("resolved", false),
        )
        .collect();
      for (const m of openMistakes) {
        const wasAnsweredCorrectly = q.answers.some((a, i) => {
          const concept = q.questions[i]?.concept.toLowerCase().trim();
          return a.correct && concept === m.conceptKey && !wrongKeys.has(m.conceptKey);
        });
        if (wasAnsweredCorrectly) {
          await ctx.db.patch(m._id, { resolved: true, resolvedAt: now });
        }
      }
    }

    // mission progress
    if (q.missionId) {
      const mission = await ctx.db.get(q.missionId);
      if (mission && mission.status === "active") {
        const progress = Math.min(mission.targetCount, mission.progress + correctCount);
        const completed = progress >= mission.targetCount;
        await ctx.db.patch(mission._id, {
          progress,
          status: completed ? "completed" : "active",
          completedAt: completed ? now : mission.completedAt,
        });
        if (completed) await awardXp(ctx, mission.xpReward, `Mission complete: ${mission.title}`);
      }
    }

    await ctx.db.patch(attemptId, {
      status: "completed",
      completedAt: now,
      examSubmitted: true,
    });
    const next = await generateNextMission(ctx, { materialId: q.materialId });
    void next;
    return {
      xp: xpEarned,
      leveledUp,
      newLevel,
      accuracy: Math.round(accuracy * 100),
      correctCount,
      total: answeredCount,
      // exam extras (undefined for practice mode)
      rawScore,
      negatives,
      negativeMarking: q.negativeMarking === true,
    };
  },
});

// ---------------------------------------------------------------------------
// Mistake Bank — every wrong answer, classified and resolvable
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mistake Bank — every wrong answer, classified and resolvable
// ---------------------------------------------------------------------------

/** The caller's mistake bank, unresolved first, then most recently fixed. */
export const listMistakes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { unresolved: [], resolved: [] };
    const all = await ctx.db
      .query("mistakes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const unresolved = all
      .filter((m) => !m.resolved)
      .sort((a, b) => b.timesMissed - a.timesMissed || b.createdAt - a.createdAt);
    const resolved = all
      .filter((m) => m.resolved)
      .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
    return { unresolved, resolved: resolved.slice(0, 50) };
  },
});

/** Manually mark a mistake fixed (owner-checked). */
export const resolveMistake = mutation({
  args: { id: v.id("mistakes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const m = await ctx.db.get(id);
    if (!m || m.userId !== userId) {
      // Deny path commits (returns the result) so the inline audit row
      // written by logAccessDenied survives the transaction.
      return await logAccessDenied(ctx, userId, "mistake.resolve", {
        crossUser: true,
      });
    }
    await ctx.db.patch(id, { resolved: true, resolvedAt: Date.now() });
    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// Knowledge Graph — concept nodes with mastery states + prerequisite edges
// ---------------------------------------------------------------------------

/**
 * Builds the caller's knowledge graph from real data: analysis concepts
 * (nodes) + analysis prerequisites (edges) + mastery scores (states).
 * Root-cause diagnosis: a failed concept with weak prerequisites points at
 * the root, not just the symptom.
 */
export const knowledgeGraph = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { nodes: [], edges: [], weakRoots: [] };

    const materials = await ctx.db
      .query("materials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const mastery = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const byKey = new Map(mastery.map((m) => [m.conceptKey, m]));

    // Node per unique concept across the Vault
    const nodes: Array<{
      key: string;
      label: string;
      state: "mastered" | "learning" | "weak" | "new";
      accuracy: number | null;
      materialId: Id<"materials">;
      materialTitle: string;
      difficulty: string;
    }> = [];
    const edges: Array<{ from: string; to: string; kind: "prereq" }> = [];

    for (const m of materials) {
      const a = m.analysis;
      if (!a) continue;
      for (const c of a.concepts) {
        const key = c.name.toLowerCase().trim();
        const row = byKey.get(key);
        const acc = row && row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : null;
        const state: "mastered" | "learning" | "weak" | "new" =
          !row || row.attempts === 0
            ? "new"
            : acc !== null && acc >= 85 && row.attempts >= 3
              ? "mastered"
              : acc !== null && acc < 60
                ? "weak"
                : "learning";
        nodes.push({
          key,
          label: c.name,
          state,
          accuracy: acc,
          materialId: m._id,
          materialTitle: m.title,
          difficulty: c.difficulty,
        });
      }
      // prerequisite edges between concepts that both exist as nodes
      for (const p of a.prerequisites ?? []) {
        const pk = p.toLowerCase().trim();
        if (!pk) continue;
        // ALSO: prereq → each concept of this material (root-cause edge)
        for (const c of a.concepts) {
          const ck = c.name.toLowerCase().trim();
          if (ck !== pk) {
            edges.push({ from: pk, to: ck, kind: "prereq" });
          }
        }
      }
    }

    // Weak roots: weak nodes whose prerequisites (in-graph) are also weak or new.
    const nodeKeys = new Set(nodes.map((n) => n.key));
    const weakRoots: Array<{ key: string; label: string; blockedBy: string[] }> = [];
    for (const n of nodes) {
      if (n.state !== "weak") continue;
      const blockedBy = edges
        .filter((e) => e.to === n.key && nodeKeys.has(e.from))
        .map((e) => e.from)
        .filter(
          (k) => {
            const state = nodes.find((x) => x.key === k)?.state;
            return state === "weak" || state === "new";
          },
        );
      if (blockedBy.length > 0) {
        weakRoots.push({
          key: n.key,
          label: n.label,
          blockedBy: [...new Set(blockedBy)].slice(0, 4),
        });
      }
    }
    weakRoots.sort((a, b) => b.blockedBy.length - a.blockedBy.length);

    // Deduplicate nodes across materials (same concept in two materials = one node)
    const seen = new Set<string>();
    const deduped = nodes.filter((n) => {
      if (seen.has(n.key)) return false;
      seen.add(n.key);
      return true;
    });

    return { nodes: deduped, edges, weakRoots: weakRoots.slice(0, 5) };
  },
});

// ---------------------------------------------------------------------------
// Flashcards / spaced repetition
// ---------------------------------------------------------------------------

export const dueFlashcards = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const cards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).lte("dueAt", now))
      .collect();
    return cards.slice(0, 40);
  },
});

export const flashcardCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { total: 0, due: 0 };
    const now = Date.now();
    const all = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId))
      .collect();
    return { total: all.length, due: all.filter((c) => c.dueAt <= now).length };
  },
});

export const reviewFlashcard = mutation({
  args: {
    cardId: v.id("flashcards"),
    grade: v.union(v.literal("again"), v.literal("hard"), v.literal("good"), v.literal("easy")),
  },
  handler: async (ctx, { cardId, grade }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const card = await ctx.db.get(cardId);
    if (!card || card.userId !== userId) throw new Error("Card not found");
    await enforceRateLimit(ctx, "review", userId);

    const now = Date.now();
    const DAY = 86400000;
    let ease = card.ease;
    let intervalDays: number;
    if (grade === "again") {
      ease = Math.max(1.3, card.ease - 0.2);
      intervalDays = 0; // due again in ~10 minutes
      await ctx.db.patch(cardId, { lapses: card.lapses + 1 });
    } else if (grade === "hard") {
      intervalDays = 1;
    } else if (grade === "good") {
      intervalDays = Math.max(1, Math.round(card.ease * 2));
    } else {
      ease = Math.min(3.0, card.ease + 0.15);
      intervalDays = Math.max(3, Math.round(card.ease * 3.5));
    }
    await ctx.db.patch(cardId, {
      ease,
      reps: card.reps + 1,
      dueAt: grade === "again" ? now + 10 * 60 * 1000 : now + intervalDays * DAY,
    });
    await ctx.db.insert("reviews", { userId, flashcardId: cardId, grade, reviewedAt: now });
    await awardXp(ctx, grade === "again" ? 2 : 5, "Flashcard review");
    await logStudySession(ctx, 0.5, "flashcards");
    return { dueAt: grade === "again" ? now + 600000 : now + intervalDays * DAY };
  },
});

/** Generate flashcards from a material's analysis (deterministic, no LLM). */
export const generateFlashcards = mutation({
  args: { materialId: v.id("materials") },
  handler: async (ctx, { materialId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const material = await ctx.db.get(materialId);
    if (!material || material.userId !== userId || !material.analysis) {
      throw new Error("Material not ready");
    }
    const a = material.analysis;
    const now = Date.now();
    // Single indexed fetch + in-memory dedupe. The old loop re-queried per
    // definition (N+1) and never deduped formula cards, so regenerating the
    // deck duplicated every formula card. Both fixed: generation is now
    // idempotent per (material, front).
    const existing = await ctx.db
      .query("flashcards")
      .withIndex("by_material", (q) => q.eq("materialId", materialId))
      .collect();
    const seen = new Set(existing.map((c) => `${c.conceptKey ?? ""}|${c.front}`));
    let created = 0;
    for (const d of a.definitions ?? []) {
      if (created >= 12) break;
      const key = d.term.toLowerCase().trim();
      const front = `What is ${d.term}?`;
      const dedupeKey = `${key}|${front}`;
      if (seen.has(dedupeKey)) continue;
      await ctx.db.insert("flashcards", {
        userId,
        materialId,
        conceptKey: key,
        conceptLabel: d.term,
        front,
        back: d.definition,
        ease: 2.5,
        dueAt: now,
        reps: 0,
        lapses: 0,
        createdAt: now,
      });
      seen.add(dedupeKey);
      created++;
    }
    for (const f of a.formulas ?? []) {
      if (created >= 16) break;
      const front = `${f.name} — what is the expression?`;
      const dedupeKey = `|${front}`;
      if (seen.has(dedupeKey)) continue;
      await ctx.db.insert("flashcards", {
        userId,
        materialId,
        front,
        back: `${f.expression}. ${f.note}`,
        ease: 2.5,
        dueAt: now,
        reps: 0,
        lapses: 0,
        createdAt: now,
      });
      seen.add(dedupeKey);
      created++;
    }
    return created;
  },
});

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export const listMissions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    // Same shape as the authenticated path — keeps the client contract stable.
    if (!userId) return { active: [], recent: [] };
    const active = await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
    const past = await ctx.db
      .query("missions")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    return { active, recent: past.filter((m) => m.status === "completed").slice(0, 5) };
  },
});

export const skipMission = mutation({
  args: { id: v.id("missions") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const m = await ctx.db.get(id);
    if (!m || m.userId !== userId) return;
    await ctx.db.delete(id);
    await generateNextMission(ctx);
  },
});

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const listAchievements = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { earned: [], all: [] };
    const earned = await ctx.db
      .query("achievements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return { earned, all: ACHIEVEMENT_META };
  },
});

/** Log a study session (shared helper). */
async function logStudySession(ctx: MutationCtx, minutes: number, kind: string) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return;
  await ctx.db.insert("studySessions", {
    userId,
    minutes,
    kind,
    createdAt: Date.now(),
  });
}

/** Create profile + game profile rows if they don't exist yet (used on first load). */
export const ensureGameProfile = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    await ensureProfiles(ctx, name);
  },
});
