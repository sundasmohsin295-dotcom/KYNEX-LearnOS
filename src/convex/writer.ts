import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { normalizeUntrustedText } from "./aiSanitize";
import { enforceRateLimit, logAuditEvent } from "./security";

/**
 * CITATION-AWARE WRITER — backend.
 *
 * Every function re-verifies identity server-side (getAuthUserId / strict
 * throws) and ownership before any read or write. Stored text passes the
 * AI Perturbation Shield before persistence. Citations cascade with their
 * document; material deletion cascades into citations too (handled in
 * materials.remove and account.deleteMyAccount).
 */

const MAX_DOC_CHARS = 120_000;
const MAX_CITATION_CHARS = 4_000;

function cleanDoc(s: string) {
  return normalizeUntrustedText(s, MAX_DOC_CHARS);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("writerDocs")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("writerDocs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(id);
    return doc && doc.userId === userId ? doc : null;
  },
});

/** Citations for a document, ordered by their [n] anchor. */
export const listCitations = query({
  args: { docId: v.id("writerDocs") },
  handler: async (ctx, { docId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const doc = await ctx.db.get(docId);
    if (!doc || doc.userId !== userId) return [];
    return await ctx.db
      .query("citations")
      .withIndex("by_doc", (q) => q.eq("docId", docId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    materialId: v.optional(v.id("materials")),
    wordGoal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceRateLimit(ctx, "textIngest", userId);

    const title = normalizeUntrustedText(args.title, 200).trim();
    if (!title) throw new Error("Give your document a title first.");

    // The grounding material must belong to the caller — never trust the id.
    let materialId: typeof args.materialId = undefined;
    if (args.materialId) {
      const m = await ctx.db.get(args.materialId);
      if (m && m.userId === userId) materialId = args.materialId;
    }

    const now = Date.now();
    const docId = await ctx.db.insert("writerDocs", {
      userId,
      materialId,
      title: title || "Untitled document",
      content: cleanDoc(args.content),
      wordGoal:
        args.wordGoal !== undefined
          ? Math.max(0, Math.min(50_000, Math.round(args.wordGoal)))
          : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return docId;
  },
});

export const update = mutation({
  args: {
    id: v.id("writerDocs"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    wordGoal: v.optional(v.number()),
  },
  handler: async (ctx, { id, title, content, wordGoal }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Document not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (title !== undefined) {
      const t = normalizeUntrustedText(title, 200).trim();
      patch.title = t || doc.title;
    }
    if (content !== undefined) patch.content = cleanDoc(content);
    if (wordGoal !== undefined) {
      patch.wordGoal = Math.max(0, Math.min(50_000, Math.round(wordGoal)));
    }
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("writerDocs") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await deleteDocCascade(ctx, id);
    await logAuditEvent(ctx, userId, "writer_doc_deleted", doc.title.slice(0, 80));
  },
});

/** Add a citation to a paragraph of a document the caller owns. The source
 *  passage is normalized before storage so nothing smuggled persists. */
export const addCitation = mutation({
  args: {
    docId: v.id("writerDocs"),
    paragraphIndex: v.number(),
    sourceText: v.string(),
    materialId: v.optional(v.id("materials")),
    locator: v.optional(v.string()),
  },
  handler: async (ctx, { docId, paragraphIndex, sourceText, materialId, locator }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const doc = await ctx.db.get(docId);
    if (!doc || doc.userId !== userId) throw new Error("Document not found");

    const text = normalizeUntrustedText(sourceText, MAX_CITATION_CHARS).trim();
    if (text.length < 8) {
      throw new Error("Select a longer passage to cite.");
    }

    // Grounding material must be owned by the caller.
    let ownedMaterial: typeof materialId = undefined;
    if (materialId) {
      const m = await ctx.db.get(materialId);
      if (m && m.userId === userId) ownedMaterial = materialId;
    }

    const existing = await ctx.db
      .query("citations")
      .withIndex("by_doc", (q) => q.eq("docId", docId))
      .collect();
    const ord = existing.reduce((max, c) => Math.max(max, c.ord), 0) + 1;

    await ctx.db.insert("citations", {
      userId,
      docId,
      materialId: ownedMaterial ?? doc.materialId,
      paragraphIndex: Math.max(0, Math.round(paragraphIndex)),
      ord,
      sourceText: text,
      locator: locator
        ? normalizeUntrustedText(locator, 120).trim().slice(0, 120)
        : undefined,
      createdAt: Date.now(),
    });
    return ord;
  },
});

export const removeCitation = mutation({
  args: { citationId: v.id("citations") },
  handler: async (ctx, { citationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const c = await ctx.db.get(citationId);
    if (!c || c.userId !== userId) return;
    await ctx.db.delete(citationId);
  },
});

/** Shared cascade used by remove() and account deletion. */
export async function deleteDocCascade(ctx: MutationCtx, docId: Id<"writerDocs">) {
  for (const c of await ctx.db
    .query("citations")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .collect()) {
    await ctx.db.delete(c._id);
  }
  await ctx.db.delete(docId);
}
