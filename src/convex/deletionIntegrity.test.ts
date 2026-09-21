import { expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Module glob for convex-test — must include `_generated` so the runner can
// locate the modules root. `import.meta.glob` is a Vite macro available at
// runtime under vitest; the cast keeps the Convex push analyzer (which does
// not load Vite's ambient types) happy.
const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.*s");

/**
 * DELETION INTEGRITY + SAFE-FAILURE SUITE
 *
 * 1. Deleting a material must remove its flashcards AND their review history.
 *    (Historical bug: reviews survived as orphaned evidence, inflating
 *    streak/DNA aggregations that read reviews by user.)
 * 2. Failure paths must never throw on a deleted record — a background AI
 *    action failing on a resource the user deleted mid-run must not mask
 *    the real error or corrupt state.
 */

type TConvex = TestConvex<typeof schema>;

async function createUser(t: TConvex, name: string): Promise<Id<"users">> {
  return await t.run(
    (ctx) => ctx.db.insert("users", { name }) as Promise<Id<"users">>,
  );
}

function identityFor(userId: Id<"users">, sessionId = "sess1") {
  return {
    issuer: "https://convex.test",
    subject: `${userId}|${sessionId}`,
    tokenIdentifier: `https://convex.test|${userId}|${sessionId}`,
  };
}

const TEXT =
  "Photosystem II splits water to replace electrons lost from chlorophyll. ".repeat(
    30,
  );

test("deleting a material removes its flashcards AND their reviews (no orphaned evidence)", async () => {
  const t = convexTest(schema, modules);
  const userId = await createUser(t, "Dana");
  const dana = identityFor(userId);

  const materialId = await t.withIdentity(dana).mutation(api.materials.createText, {
    title: "Photosynthesis chapter",
    text: TEXT,
    kind: "text",
  });

  // A flashcard owned by this material + two review rows on it.
  const cardId = await t.run(async (ctx) => {
    const uid = userId;
    return (await ctx.db.insert("flashcards", {
      userId: uid,
      materialId: materialId as Id<"materials">,
      conceptKey: "photosystem-ii",
      conceptLabel: "Photosystem II",
      front: "What does Photosystem II do?",
      back: "Splits water to replace lost electrons.",
      ease: 2.5,
      dueAt: Date.now(),
      reps: 2,
      lapses: 0,
      createdAt: Date.now(),
    })) as Id<"flashcards">;
  });
  const reviewIds = await t.run(async (ctx) => {
    const out: Id<"reviews">[] = [];
    for (const grade of ["good", "again"] as const) {
      out.push(
        (await ctx.db.insert("reviews", {
          userId,
          flashcardId: cardId,
          grade,
          reviewedAt: Date.now(),
        })) as Id<"reviews">,
      );
    }
    return out;
  });
  expect(reviewIds).toHaveLength(2);

  // Delete the material through the public (owner-checked) path.
  await t.withIdentity(dana).mutation(api.materials.remove, { id: materialId });

  // Material, card, and every review are gone — nothing orphaned.
  expect(await t.withIdentity(dana).query(api.materials.get, { id: materialId })).toBeNull();
  const leftoverCards = await t.run((ctx) =>
    ctx.db.query("flashcards").withIndex("by_material", (q) => q.eq("materialId", materialId)).collect(),
  );
  expect(leftoverCards).toHaveLength(0);
  const leftoverReviews = await t.run(async (ctx) => {
    const out = [];
    for (const id of reviewIds) {
      out.push(await ctx.db.get(id));
    }
    return out;
  });
  expect(leftoverReviews.every((r) => r === null)).toBe(true);
});

test("failInternal on an already-deleted attempt is a silent no-op", async () => {
  const t = convexTest(schema, modules);
  const userId = await createUser(t, "Evan");
  const evan = identityFor(userId);
  const materialId = await t.withIdentity(evan).mutation(api.materials.createText, {
    title: "Kinematics notes",
    text: TEXT,
    kind: "text",
  });
  const attemptId = await t.withIdentity(evan).mutation(api.learning.startQuiz, {
    materialId,
    count: 3,
    difficulty: "medium",
    mode: "practice",
  });

  // Simulate deletion while generation is in flight.
  await t.run(async (ctx) => ctx.db.delete(attemptId));

  // Must not throw — a background failure path must stay safe. (If this
  // threw, the AI action's catch would abort before persisting anything.)
  await t.mutation(internal.learning.failInternal, {
    attemptId,
    error: "AI provider unreachable",
  });
});

test("markFailedInternal on an already-deleted material is a silent no-op", async () => {
  const t = convexTest(schema, modules);
  const userId = await createUser(t, "Faye");
  const faye = identityFor(userId);
  const materialId = await t.withIdentity(faye).mutation(api.materials.createText, {
    title: "To be deleted mid-analysis",
    text: TEXT,
    kind: "text",
  });

  await t.run(async (ctx) => ctx.db.delete(materialId));

  // Must not throw — same rule: failure paths never mask themselves.
  await t.mutation(internal.materials.markFailedInternal, {
    id: materialId,
    error: "Malformed AI response",
  });
});

test("failInternal still marks a LIVE attempt as failed (guard did not overcorrect)", async () => {
  const t = convexTest(schema, modules);
  const userId = await createUser(t, "Gita");
  const gita = identityFor(userId);
  const materialId = await t.withIdentity(gita).mutation(api.materials.createText, {
    title: "Thermodynamics",
    text: TEXT,
    kind: "text",
  });
  const attemptId = await t.withIdentity(gita).mutation(api.learning.startQuiz, {
    materialId,
    count: 3,
    difficulty: "medium",
    mode: "practice",
  });

  await t.mutation(internal.learning.failInternal, {
    attemptId,
    error: "Provider timeout",
  });

  const attempt = await t.withIdentity(gita).query(api.learning.getQuizAttempt, {
    id: attemptId,
  });
  expect(attempt?.status).toBe("failed");
  expect(attempt?.error).toMatch(/timeout/i);
});
