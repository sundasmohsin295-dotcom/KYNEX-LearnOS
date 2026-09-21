import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { materialKindValidator } from "./schema";
import { awardXp, generateNextMission } from "./gamification";
import { enforceRateLimit, logAuditEvent } from "./security";

/** Hard server-side content ceiling — protects the DB and the AI wallet. */
export const MAX_MATERIAL_CHARS = 400_000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("materials")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** All subjects for the sidebar / library grouping. */
export const listSubjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("subjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("materials") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const m = await ctx.db.get(id);
    return m && m.userId === userId ? m : null;
  },
});

/** List materials that reached "ready" status with a completed analysis. */
export const listReady = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("materials")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all.filter((m) => m.status === "ready" && m.analysis);
  },
});

/** Create a material from pasted text / plain content. The AI analysis action
 *  is triggered separately from the client. */
export const createText = mutation({
  args: {
    title: v.string(),
    text: v.string(),
    kind: materialKindValidator,
    sourceUrl: v.optional(v.string()),
    subjectId: v.optional(v.id("subjects")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceRateLimit(ctx, "textIngest", userId);

    const text = args.text.trim();
    if (text.length < 40) {
      throw new Error("Content is too short to analyze (need at least a paragraph).");
    }
    if (text.length > MAX_MATERIAL_CHARS) {
      throw new Error(
        "That document is too large to process. Please split it into smaller sections.",
      );
    }

    // The optional subject must belong to the caller — never trust a client id.
    let subjectId: typeof args.subjectId = undefined;
    if (args.subjectId) {
      const subject = await ctx.db.get(args.subjectId);
      if (subject && subject.userId === userId) subjectId = args.subjectId;
    }

    const now = Date.now();
    const words = text.split(/\s+/).filter(Boolean).length;
    const id = await ctx.db.insert("materials", {
      userId,
      subjectId,
      title: (args.title.trim().slice(0, 200) || "Untitled material").slice(0, 120),
      kind: args.kind,
      sourceUrl: args.sourceUrl,
      status: "processing",
      processingStage: "receiving",
      charCount: text.length,
      wordCount: words,
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // chunk for retrieval (first N chars per chunk)
    const CHUNK = 4000;
    const chunks: string[] = [];
    for (let i = 0; i < Math.min(text.length, 60000); i += CHUNK) {
      chunks.push(text.slice(i, i + CHUNK));
    }
    for (let i = 0; i < chunks.length; i++) {
      await ctx.db.insert("materialChunks", {
        userId,
        materialId: id,
        idx: i,
        text: chunks[i],
      });
    }
    await ctx.db.patch(id, { chunkCount: chunks.length });

    return id;
  },
});

/** Explicitly mark a material as failed — never pretend success. */
export const markFailed = mutation({
  args: { id: v.id("materials"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const m = await ctx.db.get(id);
    if (!m || m.userId !== userId) throw new Error("Material not found");
    await ctx.db.patch(id, {
      status: "failed",
      error: error.slice(0, 500),
      processingStage: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Delete a material the caller owns, cascading to chunks, conversations,
 *  messages, quiz attempts and flashcards. Audited. */
export const remove = mutation({
  args: { id: v.id("materials") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const m = await ctx.db.get(id);
    if (!m || m.userId !== userId) return;

    // cascade delete related rows
    for (const c of await ctx.db
      .query("materialChunks")
      .withIndex("by_material", (q) => q.eq("materialId", id))
      .collect()) {
      await ctx.db.delete(c._id);
    }
    for (const conv of await ctx.db
      .query("conversations")
      .withIndex("by_material", (q) => q.eq("materialId", id))
      .collect()) {
      for (const msg of await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .collect()) {
        await ctx.db.delete(msg._id);
      }
      await ctx.db.delete(conv._id);
    }
    for (const q of await ctx.db
      .query("quizAttempts")
      .withIndex("by_material", (q) => q.eq("materialId", id))
      .collect()) {
      await ctx.db.delete(q._id);
    }
    for (const f of await ctx.db
      .query("flashcards")
      .withIndex("by_material", (q) => q.eq("materialId", id))
      .collect()) {
      // Review history is evidence tied to this card — remove it too, so no
      // orphaned reviews survive the material (integrity of streak/DNA
      // aggregations that read reviews by user).
      for (const r of await ctx.db
        .query("reviews")
        .withIndex("by_card", (q) => q.eq("flashcardId", f._id))
        .collect()) {
        await ctx.db.delete(r._id);
      }
      await ctx.db.delete(f._id);
    }
    await ctx.db.delete(id);
    await logAuditEvent(ctx, userId, "material_deleted", "cascade");
  },
});

/** Internal: fetch a material (for server-side actions). */
export const getInternal = internalQuery({
  args: { id: v.id("materials") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/** Internal: fetch the text chunks of a material (for AI actions). */
export const getChunksInternal = internalQuery({
  args: { materialId: v.id("materials") },
  handler: async (ctx, { materialId }) => {
    return await ctx.db
      .query("materialChunks")
      .withIndex("by_material", (q) => q.eq("materialId", materialId))
      .order("asc")
      .collect();
  },
});

/** Internal: mark a material as failed from a server-side action. */
export const markFailedInternal = internalMutation({
  args: { id: v.id("materials"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    // The material may have been deleted while analysis ran — never throw
    // from a failure path (a throw here would mask the real AI error).
    if (!(await ctx.db.get(id))) return;
    await ctx.db.patch(id, {
      status: "failed",
      error: error.slice(0, 500),
      processingStage: undefined,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: award XP after successful analysis (from AI action). */
export const awardXpInternal = internalMutation({
  args: { amount: v.number(), reason: v.string() },
  handler: async (ctx, { amount, reason }) => {
    await awardXp(ctx, amount, reason);
  },
});

/** Internal: generate the next best mission (from AI action). */
export const generateMissionInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    await generateNextMission(ctx);
  },
});

/** Internal: bump the processing stage visible in the UI. */
export const setStageInternal = internalMutation({
  args: { id: v.id("materials"), stage: v.string() },
  handler: async (ctx, { id, stage }) => {
    await ctx.db.patch(id, { processingStage: stage, updatedAt: Date.now() });
  },
});

/** Internal: store the completed analysis. */
export const completeInternal = internalMutation({
  args: { id: v.id("materials"), analysis: v.any() },
  handler: async (ctx, { id, analysis }) => {
    await ctx.db.patch(id, {
      status: "ready",
      processingStage: undefined,
      analysis,
      updatedAt: Date.now(),
    });
  },
});

/** Internal: attach subject at creation from the client action. */
export const setSubjectInternal = internalMutation({
  args: { id: v.id("materials"), subjectName: v.string() },
  handler: async (ctx, { id, subjectName }) => {
    const m = await ctx.db.get(id);
    if (!m) return;
    const existing = await ctx.db
      .query("subjects")
      .withIndex("by_user", (q) => q.eq("userId", m.userId))
      .collect();
    const match = existing.find(
      (s) => s.name.toLowerCase() === subjectName.toLowerCase(),
    );
    if (match) {
      await ctx.db.patch(id, { subjectId: match._id });
    } else {
      const sid = await ctx.db.insert("subjects", {
        userId: m.userId,
        name: subjectName,
      });
      await ctx.db.patch(id, { subjectId: sid });
    }
  },
});
