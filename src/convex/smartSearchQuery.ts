import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  buildSearchResults,
  emptySearchMessage,
  groupRows,
  type RawConcept,
  type RawConversation,
  type RawExaminer,
  type RawFlashcard,
  type RawMaterial,
  type RawMessage,
  type RawMission,
  type RawMistake,
} from "./smartSearch";

/**
 * KYNEX Smart Search (§33) — one contextual query across the student's whole
 * workspace: subjects' materials, concepts (with mastery state), notes/
 * conversations, messages, mistakes, flashcards, missions and examiner
 * evaluations.
 *
 * Zero trust: identity comes from the auth session only, every read uses a
 * by-user index (another user's rows are never visible), and no result leaves
 * without real backing data. Deterministic ranking — no AI, no fabrication.
 */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || q.trim().length < 2) {
      return { groups: [], empty: null, query: q };
    }

    const now = Date.now();

    // --- Materials (Vault) -------------------------------------------------
    const materials = await ctx.db
      .query("materials")
      .withIndex("by_user", (iq) => iq.eq("userId", userId))
      .collect();
    const rawMaterials: RawMaterial[] = materials.map((m) => ({
      _id: m._id,
      title: m.title,
      kind: m.kind,
      status: m.status,
      wordCount: m.wordCount,
    }));

    // --- Concepts with mastery (knowledge-graph view of the Vault) ---------
    const mastery = await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (iq) => iq.eq("userId", userId))
      .collect();
    const masteryByKey = new Map(mastery.map((m) => [m.conceptKey, m]));
    const rawConcepts: RawConcept[] = [];
    for (const m of materials) {
      const a = m.analysis;
      if (!a) continue;
      for (const c of a.concepts) {
        const key = c.name.toLowerCase().trim();
        const row = masteryByKey.get(key);
        const acc =
          row && row.attempts > 0
            ? Math.round((row.correct / row.attempts) * 100)
            : null;
        const state: RawConcept["masteryState"] =
          !row || row.attempts === 0
            ? "new"
            : acc !== null && acc >= 85 && row.attempts >= 3
              ? "mastered"
              : acc !== null && acc < 60
                ? "weak"
                : "learning";
        rawConcepts.push({
          key,
          label: c.name,
          materialId: m._id,
          masteryState: state,
          accuracy: acc,
          difficulty: c.difficulty,
        });
      }
    }

    // --- Conversations ------------------------------------------------------
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user", (iq) => iq.eq("userId", userId))
      .collect();
    const convTitleById = new Map(conversations.map((c) => [c._id, c.title]));
    const rawConversations: RawConversation[] = conversations.map((c) => ({
      _id: c._id,
      title: c.title,
      starred: c.starred,
      materialTitle: c.materialId
        ? materials.find((m) => m._id === c.materialId)?.title ?? null
        : null,
    }));

    // --- Messages (recent slice — notes & past Q&A) --------------------------
    const rawMessages: RawMessage[] = [];
    for (const c of conversations.slice(0, 30)) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (iq) =>
          iq.eq("conversationId", c._id),
        )
        .take(60);
      for (const msg of msgs) {
        rawMessages.push({
          conversationId: msg.conversationId,
          conversationTitle: convTitleById.get(msg.conversationId) ?? "Conversation",
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    // --- Mistake Bank -------------------------------------------------------
    const mistakes = await ctx.db
      .query("mistakes")
      .withIndex("by_user", (iq) => iq.eq("userId", userId))
      .collect();
    const rawMistakes: RawMistake[] = mistakes.map((m) => ({
      _id: m._id,
      question: m.question,
      conceptLabel: m.conceptLabel,
      category: m.category,
      resolved: m.resolved,
      timesMissed: m.timesMissed,
    }));

    // --- Flashcards ---------------------------------------------------------
    const flashcards = await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (iq) => iq.eq("userId", userId))
      .take(400);
    const rawFlashcards: RawFlashcard[] = flashcards.map((f) => ({
      _id: f._id,
      front: f.front,
      back: f.back,
      dueAt: f.dueAt,
      now,
    }));

    // --- Missions -----------------------------------------------------------
    const missions = await ctx.db
      .query("missions")
      .withIndex("by_user_created", (iq) => iq.eq("userId", userId))
      .take(50);
    const rawMissions: RawMission[] = missions.map((m) => ({
      _id: m._id,
      title: m.title,
      kind: m.kind,
      status: m.status,
    }));

    // --- Examiner evaluations ----------------------------------------------
    const examiner = await ctx.db
      .query("examinerEvaluations")
      .withIndex("by_user", (iq) => iq.eq("userId", userId))
      .take(50);
    const rawExaminer: RawExaminer[] = examiner.map((e) => ({
      _id: e._id,
      question: e.question,
      conceptLabel: e.conceptLabel,
      marksAwarded: e.marksAwarded,
      marksTotal: e.marksTotal,
    }));

    const rows = buildSearchResults(q, {
      materials: rawMaterials,
      concepts: rawConcepts,
      conversations: rawConversations,
      messages: rawMessages,
      mistakes: rawMistakes,
      flashcards: rawFlashcards,
      missions: rawMissions,
      examiner: rawExaminer,
    });

    const groups = groupRows(rows);
    const empty =
      groups.length === 0 && q.trim().length >= 2
        ? emptySearchMessage(q)
        : null;

    return { groups, empty, query: q };
  },
});
