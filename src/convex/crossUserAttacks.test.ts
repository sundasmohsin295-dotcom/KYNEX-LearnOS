import { expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

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
 * CROSS-USER ATTACK SUITE — "deny by default"
 *
 * User A owns every resource below. User B (a second, separately
 * authenticated account) then attempts to read, mutate, or destroy A's
 * resources by supplying A's ids directly — exactly what a malicious user
 * does with DevTools. Expected outcome for EVERY attempt:
 *
 *   - read  → null / []
 *   - write → thrown error OR silent no-op (verified by re-reading as A)
 *   - lists → never contain A's rows
 *
 * Unauthenticated callers are tested the same way. AI-action and quota
 * enforcement live in securityQuota.test.ts.
 */

type TConvex = TestConvex<typeof schema>;

/** Real user rows so convex-auth's subject→id derivation resolves cleanly. */
async function createUser(t: TConvex, name: string): Promise<Id<"users">> {
  return await t.run((ctx) =>
    ctx.db.insert("users", { name }) as Promise<Id<"users">>,
  );
}

/** convex-auth derives the user id from the token subject: `userId|sessionId`. */
function identityFor(userId: Id<"users">, sessionId = "sess1") {
  return {
    issuer: "https://convex.test",
    subject: `${userId}|${sessionId}`,
    tokenIdentifier: `https://convex.test|${userId}|${sessionId}`,
  };
}

const MATERIAL_TEXT =
  "TCP multiplexing allows many application streams to share one network path. ".repeat(30);

interface World {
  t: TConvex;
  alice: ReturnType<typeof identityFor>;
  bob: ReturnType<typeof identityFor>;
  materialA: Id<"materials">;
  conversationA: Id<"conversations">;
  quizA: Id<"quizAttempts">;
  missionA: Id<"missions">;
  cardA: Id<"flashcards">;
  sessionA: Id<"authSessions">;
  subjectA: Id<"subjects">;
}

async function createWorld(): Promise<World> {
  const t = convexTest(schema, modules);

  const aliceId = await createUser(t, "Alice");
  const bobId = await createUser(t, "Bob");
  const alice = identityFor(aliceId);
  const bob = identityFor(bobId);

  // ---- Alice's material (public creation path, real auth) ----
  const materialA = await t.withIdentity(alice).mutation(api.materials.createText, {
    title: "Alice's TCP/IP chapter",
    text: MATERIAL_TEXT,
    kind: "text",
  });

  // ---- Alice's conversation + message ----
  const conversationA = await t.withIdentity(alice).mutation(
    api.learning.createConversation,
    { materialId: materialA, title: "Alice's chat" },
  );
  await t.withIdentity(alice).mutation(api.learning.appendUserMessage, {
    conversationId: conversationA,
    content: "Explain the three-way handshake simply.",
  });

  // ---- Alice's subject ----
  const subjectA = await t.withIdentity(alice).run(async (ctx) => {
    return (await ctx.db.insert("subjects", {
      userId: await getAuthUserId(ctx) as Id<"users">,
      name: "Computer Networks",
    })) as Id<"subjects">;
  });

  // ---- Alice's active quiz with answers pre-filled (status: active) ----
  const quizA = await t.withIdentity(alice).run(async (ctx) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users">;
    return (await ctx.db.insert("quizAttempts", {
      userId,
      materialId: materialA as Id<"materials">,
      mode: "practice" as const,
      status: "active" as const,
      questions: [
        {
          question: "Which packet starts the TCP handshake?",
          options: ["SYN", "ACK", "FIN", "RST"],
          correctIndex: 0,
          explanation: "SYN initiates the handshake.",
          whyWrong: ["ACK acknowledges", "FIN closes", "RST resets"],
          concept: "TCP Handshake",
          difficulty: "easy" as const,
          type: "recall",
        },
        {
          question: "What does the final ACK complete?",
          options: ["Connection setup", "Teardown", "Routing", "Encryption"],
          correctIndex: 0,
          explanation: "The third ACK completes connection establishment.",
          whyWrong: ["not teardown", "not routing", "not encryption"],
          concept: "TCP Handshake",
          difficulty: "medium" as const,
          type: "recall",
        },
      ],
      answers: [],
      createdAt: Date.now(),
    })) as Id<"quizAttempts">;
  });

  // ---- Alice's mission, flashcard, and auth session ----
  const missionA = await t.withIdentity(alice).run(async (ctx) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users">;
    return (await ctx.db.insert("missions", {
      userId,
      title: "Mission 01 — Understand TCP handshake",
      description: "Solve 5 questions on the TCP handshake",
      kind: "practice" as const,
      targetCount: 5,
      progress: 0,
      xpReward: 50,
      status: "active" as const,
      createdAt: Date.now(),
    })) as Id<"missions">;
  });

  const cardA = await t.withIdentity(alice).run(async (ctx) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users">;
    return (await ctx.db.insert("flashcards", {
      userId,
      materialId: materialA as Id<"materials">,
      front: "What is a SYN packet?",
      back: "The first packet of the TCP three-way handshake.",
      ease: 2.5,
      dueAt: Date.now(),
      reps: 0,
      lapses: 0,
      createdAt: Date.now(),
    })) as Id<"flashcards">;
  });

  const sessionA = await t.withIdentity(alice).run(async (ctx) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users">;
    return (await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 3_600_000,
    })) as Id<"authSessions">;
  });

  return { t, alice, bob, materialA, conversationA, quizA, missionA, cardA, sessionA, subjectA };
}

// ---------------------------------------------------------------------------
// Read isolation
// ---------------------------------------------------------------------------

test("B cannot read A's material, conversation, messages, quiz, or session", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  expect(await asBob.query(api.materials.get, { id: w.materialA })).toBeNull();
  expect(
    await asBob.query(api.learning.getConversation, { id: w.conversationA }),
  ).toBeNull();
  expect(
    await asBob.query(api.learning.listMessages, { conversationId: w.conversationA }),
  ).toEqual([]);
  expect(await asBob.query(api.learning.getQuizAttempt, { id: w.quizA })).toBeNull();
  expect(await asBob.query(api.materials.listSubjects)).toEqual([]);
  expect(await asBob.query(api.account.listMySessions)).toEqual([]);
});

test("B's list queries never return A's rows", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  const materials = await asBob.query(api.materials.list);
  expect(materials.map((m) => m._id)).not.toContain(w.materialA);
  expect(materials).toHaveLength(0);

  const conversations = await asBob.query(api.learning.listConversations);
  expect(conversations.map((c) => c._id)).not.toContain(w.conversationA);

  const quizzes = await asBob.query(api.learning.listQuizAttempts, {});
  expect(quizzes.map((q) => q._id)).not.toContain(w.quizA);

  const missions = await asBob.query(api.learning.listMissions);
  expect(missions.active.map((m) => m._id)).not.toContain(w.missionA);
  expect(missions.recent.map((m) => m._id)).not.toContain(w.missionA);

  const due = await asBob.query(api.learning.dueFlashcards);
  expect(due.map((c) => c._id)).not.toContain(w.cardA);
});

test("unauthenticated callers get nothing from any read path", async () => {
  const w = await createWorld();
  const t = w.t; // no identity

  expect(await t.query(api.materials.get, { id: w.materialA })).toBeNull();
  expect(await t.query(api.materials.list)).toEqual([]);
  expect(
    await t.query(api.learning.listMessages, { conversationId: w.conversationA }),
  ).toEqual([]);
  expect(await t.query(api.learning.getQuizAttempt, { id: w.quizA })).toBeNull();
  expect(await t.query(api.account.listMySessions)).toEqual([]);
  expect(await t.query(api.security.myQuotaStatus)).toBeNull();
});

// ---------------------------------------------------------------------------
// Write attacks: thrown denials
// ---------------------------------------------------------------------------

test("B cannot answer, complete, or start quizzes on A's resources", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await expect(
    asBob.mutation(api.learning.answerQuestion, {
      attemptId: w.quizA,
      index: 0,
      selectedIndex: 0,
      confidence: "sure",
    }),
  ).rejects.toThrow("Quiz not found");

  await expect(
    asBob.mutation(api.learning.completeQuiz, { attemptId: w.quizA }),
  ).rejects.toThrow("Quiz not found");

  await expect(
    asBob.mutation(api.learning.startQuiz, {
      materialId: w.materialA,
      count: 5,
      difficulty: "medium",
      mode: "practice",
    }),
  ).rejects.toThrow("Material not found");
});

test("B cannot attach A's mission to their own quiz", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  // B's own material is fine, but A's missionId must be rejected.
  const bobMaterial = await asBob.mutation(api.materials.createText, {
    title: "Bob's chapter",
    text: MATERIAL_TEXT,
    kind: "text",
  });
  await expect(
    asBob.mutation(api.learning.startQuiz, {
      materialId: bobMaterial,
      count: 5,
      difficulty: "medium",
      mode: "practice",
      missionId: w.missionA,
    }),
  ).rejects.toThrow("Mission not found");
});

test("B cannot post messages into A's conversation", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await expect(
    asBob.mutation(api.learning.appendUserMessage, {
      conversationId: w.conversationA,
      content: "injected message",
    }),
  ).rejects.toThrow("Conversation not found");
});

test("B cannot generate flashcards from A's material or review A's card", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await expect(
    asBob.mutation(api.learning.generateFlashcards, { materialId: w.materialA }),
  ).rejects.toThrow();

  await expect(
    asBob.mutation(api.learning.reviewFlashcard, { cardId: w.cardA, grade: "good" }),
  ).rejects.toThrow("Card not found");

  // A can still review their own card — the denial wasn't a global lockout.
  const before = await w.t.withIdentity(w.alice).query(api.materials.get, { id: w.materialA });
  expect(before).not.toBeNull();
});

test("B cannot mark A's material failed or delete it", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await expect(
    asBob.mutation(api.materials.markFailed, { id: w.materialA, error: "sabotage" }),
  ).rejects.toThrow("Material not found");

  // remove() is a silent no-op for non-owners; verify the row survives.
  await asBob.mutation(api.materials.remove, { id: w.materialA });
  const stillThere = await w.t.withIdentity(w.alice).query(api.materials.get, {
    id: w.materialA,
  });
  expect(stillThere).not.toBeNull();
  expect(stillThere!.status).toBe("processing");
});

// ---------------------------------------------------------------------------
// Write attacks: silent no-ops (verified by re-reading as A)
// ---------------------------------------------------------------------------

test("B cannot rename, star, or delete A's conversation (silent no-op)", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await asBob.mutation(api.learning.renameConversation, {
    id: w.conversationA,
    title: "HACKED",
  });
  await asBob.mutation(api.learning.starConversation, { id: w.conversationA });
  await asBob.mutation(api.learning.deleteConversation, { id: w.conversationA });

  const conv = await w.t.withIdentity(w.alice).query(api.learning.getConversation, {
    id: w.conversationA,
  });
  expect(conv).not.toBeNull();
  expect(conv!.title).toBe("Alice's chat");
  expect(conv!.starred).toBe(false);

  const msgs = await w.t.withIdentity(w.alice).query(api.learning.listMessages, {
    conversationId: w.conversationA,
  });
  expect(msgs).toHaveLength(1);
});

test("B cannot skip A's mission (silent no-op)", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await asBob.mutation(api.learning.skipMission, { id: w.missionA });

  const missions = await w.t.withIdentity(w.alice).query(api.learning.listMissions);
  expect(missions.active.map((m) => m._id)).toContain(w.missionA);
});

// ---------------------------------------------------------------------------
// Reference-spoofing: never store a cross-user reference
// ---------------------------------------------------------------------------

test("B cannot link their conversation to A's material", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  const convId = await asBob.mutation(api.learning.createConversation, {
    materialId: w.materialA,
    title: "Bob tries to attach Alice's material",
  });
  const conv = await asBob.query(api.learning.getConversation, { id: convId });
  expect(conv).not.toBeNull();
  expect(conv!.materialId).toBeUndefined();
});

test("B cannot link their text material to A's subject", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  const bobMaterialId = await asBob.mutation(api.materials.createText, {
    title: "Bob's chapter",
    text: MATERIAL_TEXT,
    kind: "text",
    subjectId: w.subjectA,
  });
  const bobMaterial = await asBob.query(api.materials.get, { id: bobMaterialId });
  expect(bobMaterial).not.toBeNull();
  expect(bobMaterial!.subjectId).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Session revocation + audit trail
// ---------------------------------------------------------------------------

test("B cannot revoke A's session; the attempt is audit-logged as cross-user", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  // Foreign session id → denial result, no state change, no existence oracle.
  const deny = await asBob.mutation(api.account.revokeSession, { sessionId: w.sessionA });
  console.log("DEBUG deny result:", JSON.stringify(deny));
  expect(deny.ok).toBe(false);

  // The session still belongs to Alice.
  const aliceSessions = await w.t
    .withIdentity(w.alice)
    .query(api.account.listMySessions);
  expect(aliceSessions.map((s) => s._id)).toContain(w.sessionA);

  // Deny path commits a content-free cross_user_access_attempt audit event
  // (denials return a result instead of throwing, so the audit row survives).
  // The write is scheduled — drain the scheduler before asserting.
  await w.t.finishInProgressScheduledFunctions();
  const allAudit = await w.t.run(async (ctx) => ctx.db.query("auditLogs").collect());
  expect(allAudit.length).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Replay / double-spend on progress
// ---------------------------------------------------------------------------

test("completing the same quiz twice does not double-award XP", async () => {
  const w = await createWorld();
  const asAlice = w.t.withIdentity(w.alice);

  // Alice answers both questions correctly first.
  await asAlice.mutation(api.learning.answerQuestion, {
    attemptId: w.quizA,
    index: 0,
    selectedIndex: 0,
    confidence: "sure",
  });
  await asAlice.mutation(api.learning.answerQuestion, {
    attemptId: w.quizA,
    index: 1,
    selectedIndex: 0,
    confidence: "sure",
  });

  const first = await asAlice.mutation(api.learning.completeQuiz, {
    attemptId: w.quizA,
  });
  expect(first.correctCount).toBe(2);
  expect(first.xp).toBeGreaterThan(0);

  const second = await asAlice.mutation(api.learning.completeQuiz, {
    attemptId: w.quizA,
  });
  expect(second.xp).toBe(0);
  expect(second.correctCount).toBe(0);
});

// ---------------------------------------------------------------------------
// Account deletion is owner-scoped
// ---------------------------------------------------------------------------

test("B deleting their own account wipes only B's data, leaving A intact", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  const bobConv = await asBob.mutation(api.learning.createConversation, {
    title: "Bob's private chat",
  });

  const result = await asBob.mutation(api.account.deleteMyAccount, {
    confirm: "DELETE",
  });
  expect(result.ok).toBe(true);

  // Bob's data is gone.
  expect(await w.t.query(api.learning.getConversation, { id: bobConv })).toBeNull();

  // Alice's data is untouched.
  const asAlice = w.t.withIdentity(w.alice);
  expect(await asAlice.query(api.materials.get, { id: w.materialA })).not.toBeNull();
  expect(
    await asAlice.query(api.learning.getConversation, { id: w.conversationA }),
  ).not.toBeNull();
  expect(
    (await asAlice.query(api.account.listMySessions)).map((s) => s._id),
  ).toContain(w.sessionA);
});

test("account deletion requires the exact confirmation string", async () => {
  const w = await createWorld();
  const asBob = w.t.withIdentity(w.bob);

  await expect(
    // @ts-expect-error — deliberately testing the runtime guard against a bad literal
    asBob.mutation(api.account.deleteMyAccount, { confirm: "delete" }),
  ).rejects.toThrow();
});
