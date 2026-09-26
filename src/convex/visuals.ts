import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * VISUAL EXPLANATIONS — reads, deletes and the validated-spec ingest.
 * Generation itself lives in the node gateway (aiEngine.generateVisual) so
 * every AI call shares one breaker/quota/telemetry pipeline.
 */

export const list = query({
  args: { materialId: v.optional(v.id("materials")) },
  handler: async (ctx, { materialId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (materialId) {
      const m = await ctx.db.get(materialId);
      if (!m || m.userId !== userId) return [];
      return await ctx.db
        .query("visualDiagrams")
        .withIndex("by_material", (q) => q.eq("materialId", materialId))
        .order("desc")
        .collect();
    }
    return await ctx.db
      .query("visualDiagrams")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("visualDiagrams") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const d = await ctx.db.get(id);
    return d && d.userId === userId ? d : null;
  },
});

export const remove = mutation({
  args: { id: v.id("visualDiagrams") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const d = await ctx.db.get(id);
    if (!d || d.userId !== userId) return;
    await ctx.db.delete(id);
  },
});

/** Persist the VALIDATED spec from the gateway action. Only schema-checked
 *  fields reach storage — nothing raw from the model passes through. */
export const ingestInternal = internalMutation({
  args: {
    userId: v.id("users"),
    materialId: v.id("materials"),
    title: v.string(),
    kind: v.union(
      v.literal("mindmap"),
      v.literal("flow"),
      v.literal("hierarchy"),
      v.literal("timeline"),
      v.literal("compare"),
    ),
    spec: v.object({
      root: v.string(),
      nodes: v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          parent: v.optional(v.string()),
          detail: v.optional(v.string()),
          when: v.optional(v.string()),
        }),
      ),
      edges: v.optional(
        v.array(
          v.object({
            from: v.string(),
            to: v.string(),
            label: v.optional(v.string()),
          }),
        ),
      ),
      sides: v.optional(
        v.object({
          leftTitle: v.string(),
          rightTitle: v.string(),
          left: v.array(v.string()),
          right: v.array(v.string()),
        }),
      ),
    }),
    model: v.string(),
  },
  handler: async (ctx, { userId, materialId, title, kind, spec, model }) => {
    return await ctx.db.insert("visualDiagrams", {
      userId,
      materialId,
      title,
      kind,
      spec,
      model,
      createdAt: Date.now(),
    });
  },
});
