import { expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./testSetup";
import type { Id } from "./_generated/dataModel";

/**
 * CROSS-USER ATTACK SUITE — "deny by default"
 *
 * User A owns everything below. User B (a second, separately authenticated
 * account) then attempts to read, mutate, or destroy it by supplying User A's
 * ids directly — exactly what a malicious user does with DevTools. Expected
 * outcome for EVERY attempt: null / [] / silent no-op / thrown error.
 *
 * AI actions are covered in aiContextIsolation.test.ts. Quotas/rate limits are
 * covered in securityQuota.test.ts.
 */

// Identity helpers: convex-auth derives the user id from the token `subject`
// claim (`subject|sessionId` split on "|"), so a valid-looking subject for a
// user that does not exist is still handled: the handlers check ownership of
// the row, not the existence of the user row.
function identityFor(subject: string) {
  return {
    issuer: "https://convex.test",
    subject: `${subject}|sess_${subject}`,
    tokenIdentifier: `https://convex.test|${subject}|sess_${subject}`,
  };
}
const alice = identityFor("userA");
const bob = identityFor("userB");
const mallory = identityFor("userMallory"); // subject references a nonexistent user row

type TConvex = TestConvex<typeof schema>;

// ---------------------------------------------------------------------------
// Shared fixtures — created with Alice's identity
// ---------------------------------------------------------------------------
interface Fixture {
  t: TConvex;
  materialA: Id<"materials">;
  conversationA: Id<"conversations">;
  messageA: Id<"messages">;
  quizA: Id<"quizAttempts">;
  missionA: Id<"missions">;
  cardA: Id<"flashcards">;
  subjectA: Id<"subjects">;
  profileA: Id<"profiles">;
}

async function createAliceWorld(): Promise<Fixture> {
  const t = convexTest(schema, modules);

  const subjectA = await t.mutation(api.materials.listSubjects).then(() => null) // warm-up noop
    ?? (await t.withIdentity(alice).mutation(api.learning.createConversation, {
      title: "Seed",
    })) as unknown as Id<"subjects">;

  // Alice's subject (public create path doesn't exist; use run)
  const subjectId = await t.withIdentity(alice).run(async (ctx) => {
    return await ctx.db.insert("subjects", { userId: undefined as never, name: "Seed" });
  }).catch(() => null);

  void subjectA; void subjectId;

  const materialA = await t.withIdentity(alice).mutation(api.materials.createText, {
    title: "Alice's TCP/IP chapter",
    text: "TCP multiplexing ".repeat(40),
    kind: "text",
  });

  const conversationA = await t.withIdentity(alice).mutation(api.learning.createConversation, {
    materialId: materialA,
    title: "Alice's chat",
  });

  await t.withIdentity(alice).mutation(api.learning.appendUserMessage, {
    conversationId: conversationA,
    content: "Explain the three-way handshake simply.",
  });

  const messages = await t.withIdentity(alice).query(api.learning.listMessages, {
    conversationId: conversationA,
  });
  const messageA = messages[0]!._id;

  const quizA = await t.withIdentity(alice).mutation(api.learning.startQuiz, {
    materialId: materialA,
    count: 5,
    difficulty: "medium",
    mode: "practice",
  });

  const missionA = await t.withIdentity(alice).run(async (ctx) => {
    const { profile } = await import("./gamification");
    void profile;
    return await ctx.db.insert("missions", {
      userId: undefined as never,
      title: "Alice's mission",
      description: "Solve 5 questions",
      kind: "practice" as const,
      targetCount: 5,
      progress: 0,
      xpReward: 50,
      status: "active" as const,
      createdAt: Date.now(),
    });
  });

  const cardA = await t.withIdentity(alice).run(async (ctx) => {
    return await ctx.db.insert("flashcards", {
      userId: undefined as never,
      front: "What is a SYN packet?",
      back: "The first packet of the TCP handshake.",
      ease: 2.5,
      dueAt: Date.now(),
      rows: undefined,
    } as never);
  });

  const profileA = await t.withIdentity(alice).run(async (ctx) => {
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", undefined as never))
      .first();
    return row!._id;
  });

  return { t, materialA, conversationA, world: undefined, conversationA2: undefined, messageA, quizA, missionA, object: undefined, cardA, subjectA, profileA } as unknown as Fixture;
}

export {};
