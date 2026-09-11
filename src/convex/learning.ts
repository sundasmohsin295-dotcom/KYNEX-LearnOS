import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  ensureProfiles,
  awardXp,
  generateNextMission,
} from "./gamification";
import { ACHIEVEMENT_META } from "./achievementMeta";
import { enforceRateLimit, logAuditEvent } from "./security";

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
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      userId,
      materialId,
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
  },
  handler: async (ctx, { materialId, conceptKey, count, difficulty, mode, missionId }) => {
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

    const id = await ctx.db.insert("quizAttempts", {
      userId,
      materialId,
      conceptFocus: conceptKey,
      mode,
      status: "generating",
      questions: [],
      answers: [],
      missionId,
      createdAt: Date.now(),
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

/** Internal: mark quiz generation failed. */
export const failInternal = internalMutation({
  args: { attemptId: v.id("quizAttempts"), error: v.string() },
  handler: async (ctx, { attemptId, error }) => {
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
    if (q.status === "completed") return { xp: 0, leveledUp: false, newLevel: 0, accuracy: 0 };
    if (q.status !== "active") throw new Error("Quiz is not active");

    const material = await ctx.db.get(q.materialId);
    const now = Date.now();

    // update mastery scores per concept
    for (let i = 0; i < q.answers.length; i++) {
      const question = q.questions[i];
      const answer = q.answers[i];
      if (!question || !answer) continue;
      const key = question.concept.toLowerCase().trim();
      const existing = await ctx.db
        .query("masteryScores")
        .withIndex("by_user", (mq) => mq.eq("userId", userId))
        .collect();
      const row = existing.find(
        (m) => m.conceptKey === key && m.materialId === q.materialId,
      );
      if (row) {
        await ctx.db.patch(row._id, {
          correct: row.correct + (answer.correct ? 1 : 0),
          attempts: row.attempts + 1,
          confidenceSum: row.confidenceSum + (CONFIDENCE_WEIGHT[answer.confidence] ?? 0.5),
          confidenceCount: row.confidenceCount + 1,
          lastPracticedAt: now,
        });
      } else {
        await ctx.db.insert("masteryScores", {
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
    const accuracy = q.answers.length > 0 ? correctCount / q.answers.length : 0;
    const xpEarned = Math.round(correctCount * 12 + (accuracy === 1 && q.answers.length >= 5 ? 60 : 0));

    const { leveledUp, newLevel } = await awardXp(ctx, xpEarned, `Quiz: ${material?.title ?? "practice"}`);
    await logStudySession(ctx, Math.max(3, Math.round(q.answers.length * 0.75)), "quiz");

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

    await ctx.db.patch(attemptId, { status: "completed", completedAt: now });
    const next = await generateNextMission(ctx, { materialId: q.materialId });
    void next;
    return {
      xp: xpEarned,
      leveledUp,
      newLevel,
      accuracy: Math.round(accuracy * 100),
      correctCount,
      total: q.answers.length,
    };
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
    let created = 0;
    for (const d of a.definitions ?? []) {
      const key = d.term.toLowerCase().trim();
      const existing = await ctx.db
        .query("flashcards")
        .withIndex("by_material", (q) => q.eq("materialId", materialId))
        .collect();
      if (existing.some((c) => (c.conceptKey ?? "") === key && c.front === `What is ${d.term}?`)) continue;
      await ctx.db.insert("flashcards", {
        userId,
        materialId,
        conceptKey: key,
        conceptLabel: d.term,
        front: `What is ${d.term}?`,
        back: d.definition,
        ease: 2.5,
        dueAt: now,
        reps: 0,
        lapses: 0,
        createdAt: now,
      });
      created++;
      if (created >= 12) break;
    }
    for (const f of a.formulas ?? []) {
      if (created >= 16) break;
      await ctx.db.insert("flashcards", {
        userId,
        materialId,
        front: `${f.name} — what is the expression?`,
        back: `${f.expression}. ${f.note}`,
        ease: 2.5,
        dueAt: now,
        reps: 0,
        lapses: 0,
        createdAt: now,
      });
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
    if (!userId) return [];
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
