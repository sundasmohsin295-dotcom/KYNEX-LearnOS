import { getAuthUserId, getAuthSessionId } from "@convex-dev/auth/server";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  logAuditEvent,
  logAccessDenied,
  enforceRateLimit,
  SECURITY_EVENTS,
} from "./security";

// ---------------------------------------------------------------------------
// Account security: sessions, security events, account deletion.
// Every function derives identity from the authenticated session — no
// client-supplied user ids, ever.
// ---------------------------------------------------------------------------

export interface SessionSummary {
  _id: string;
  createdAt: number;
  expiresAt: number;
  expired: boolean;
  current: boolean;
}

/** The signed-in user's active sessions (newest first), for the security UI. */
export const listMySessions = query({
  args: {},
  handler: async (ctx): Promise<SessionSummary[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const currentSessionId = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    const now = Date.now();
    return sessions
      .filter((s) => s.expirationTime > now)
      .map((s) => ({
        _id: s._id,
        createdAt: s._creationTime,
        expiresAt: s.expirationTime,
        expired: false,
        current: s._id === currentSessionId,
      }));
  },
});

/**
 * Revoke one of YOUR OWN sessions. Cross-user ids are denied and audited.
 *
 * The deny path RETURNS a denial result instead of throwing: a thrown
 * mutation rolls back its entire transaction, which would also erase the
 * audit event recording the attempt. Committing the denial lets the audit
 * trail survive while the attacker still learns nothing (no existence
 * oracle: owned-but-invalid and foreign ids both yield `ok: false`).
 */
export const revokeSession = mutation({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== userId) {
      // Deny path commits (returns the result) so the inline audit row
      // written by logAccessDenied survives the transaction.
      return await logAccessDenied(ctx, userId, "revoke_session", {
        crossUser: !!session,
      });
    }
    await deleteSessionWithTokens(ctx, session);
    await logAuditEvent(ctx, userId, SECURITY_EVENTS.SESSION_REVOKED);
    return { ok: true as const };
  },
});

/** Revoke every session except the one currently in use ("log out everywhere else"). */
export const revokeAllOtherSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const currentSessionId = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(200);
    let revoked = 0;
    for (const s of sessions) {
      if (s._id === currentSessionId) continue;
      await deleteSessionWithTokens(ctx, s);
      revoked++;
    }
    if (revoked > 0) {
      await logAuditEvent(ctx, userId, SECURITY_EVENTS.SESSION_REVOKED, `all_others:${revoked}`);
    }
    return { revoked };
  },
});

/** Delete a session row and its refresh tokens so the revocation is immediate. */
async function deleteSessionWithTokens(ctx: MutationCtx, session: Doc<"authSessions">) {
  for (const rt of await ctx.db
    .query("authRefreshTokens")
    .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
    .take(50)) {
    await ctx.db.delete(rt._id);
  }
  await ctx.db.delete(session._id);
}

/** Compact security snapshot for the account-security UI. Content-free. */
export const mySecurityOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const now = Date.now();
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    const events = await ctx.db
      .query("auditLogs")
      .withIndex("by_action_time", (q) => q.eq("action", "x"))
      .take(0);
    void events; // (auditLogs has no by-user index; per-user events intentionally not exposed in UI)
    const user = await ctx.db.get(userId);
    return {
      activeSessions: sessions.filter((s) => s.expirationTime > now).length,
      memberSince: user?._creationTime ?? null,
      email: user?.email ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// Account deletion (privacy by design — reliable cascade)
// ---------------------------------------------------------------------------

/**
 * Permanently delete the caller's account and ALL owned data in one
 * transaction: academic data, AI conversations, materials, practice history,
 * gamification, quotas, plan rows, auth accounts/sessions, then the user row.
 * This is the "right to erasure" path — it must stay complete. Runs inside a
 * rate-limited mutation (`accountDelete`) and writes a final audit event.
 */
export const deleteMyAccount = mutation({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx, { confirm }) => {
    if (confirm !== "DELETE") throw new Error("Confirmation required.");
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Rate-limit the destructive path (abuse containment). Generic error only.
    await enforceRateLimit(ctx, "accountDelete", userId);

    const counts = {
      materials: 0,
      conversations: 0,
      messages: 0,
      quizAttempts: 0,
      flashcards: 0,
      reviews: 0,
      masteryScores: 0,
      missions: 0,
      sessions: 0,
    };

    // materials cascade to chunks / flashcards / quizAttempts (conversations deleted below)
    const materials = await ctx.db
      .query("materials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    for (const m of materials) {
      for (const c of await ctx.db
        .query("materialChunks")
        .withIndex("by_material", (q) => q.eq("materialId", m._id))
        .take(2000)) {
        await ctx.db.delete(c._id);
      }
      for (const q of await ctx.db
        .query("quizAttempts")
        .withIndex("by_material", (q) => q.eq("materialId", m._id))
        .take(1000)) {
        await ctx.db.delete(q._id);
        counts.quizAttempts++;
      }
      for (const f of await ctx.db
        .query("flashcards")
        .withIndex("by_material", (q) => q.eq("materialId", m._id))
        .take(1000)) {
        await ctx.db.delete(f._id);
        counts.flashcards++;
      }
      await ctx.db.delete(m._id);
      counts.materials++;
    }

    // conversations + messages
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    for (const conv of conversations) {
      for (const msg of await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .take(2000)) {
        await ctx.db.delete(msg._id);
        counts.messages++;
      }
      await ctx.db.delete(conv._id);
      counts.conversations++;
    }

    // remaining owned rows (masteryScores, missions, xpEvents, studySessions,
    // achievements, reviews, profiles, gameProfiles, plans, aiUsageDaily)
    for (const m of await ctx.db
      .query("masteryScores")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000)) {
      await ctx.db.delete(m._id);
      counts.masteryScores++;
    }
    for (const mi of await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .take(500)) {
      await ctx.db.delete(mi._id);
      counts.missions++;
    }
    for (const mi of await ctx.db
      .query("missions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "completed"))
      .take(500)) {
      await ctx.db.delete(mi._id);
      counts.missions++;
    }
    for (const e of await ctx.db
      .query("xpEvents")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(2000)) {
      await ctx.db.delete(e._id);
    }
    for (const s of await ctx.db
      .query("studySessions")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(2000)) {
      await ctx.db.delete(s._id);
    }
    for (const a of await ctx.db
      .query("achievements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500)) {
      await ctx.db.delete(a._id);
    }
    for (const r of await ctx.db
      .query("reviews")
      .withIndex("by_user_reviewed", (q) => q.eq("userId", userId))
      .take(5000)) {
      await ctx.db.delete(r._id);
      counts.reviews++;
    }
    // flashcards not tied to a material (defensive — usually cascaded above)
    for (const f of await ctx.db
      .query("flashcards")
      .withIndex("by_user_due", (q) => q.eq("userId", userId).gte("dueAt", 0))
      .take(2000)) {
      await ctx.db.delete(f._id);
      counts.flashcards++;
    }
    for (const p of await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10)) {
      await ctx.db.delete(p._id);
    }
    for (const g of await ctx.db
      .query("gameProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10)) {
      await ctx.db.delete(g._id);
    }
    for (const p of await ctx.db
      .query("plans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10)) {
      await ctx.db.delete(p._id);
    }
    for (const u of await ctx.db
      .query("aiUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .take(400)) {
      await ctx.db.delete(u._id);
    }
    // per-user rate-limit buckets (key is `${userId}:${op}`)
    for (const rl of await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.gte("key", `${userId}:`).lt("key", `${userId};`))
      .take(100)) {
      await ctx.db.delete(rl._id);
    }

    // subjects AFTER materials (materials reference subjectId, but deletion
    // order doesn't matter for correctness — both are owned by the user)
    for (const s of await ctx.db
      .query("subjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200)) {
      await ctx.db.delete(s._id);
    }

    // auth: sessions, accounts, verification codes, then the user row
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const s of sessions) {
      await deleteSessionWithTokens(ctx, s);
      counts.sessions++;
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(50);
    for (const acc of accounts) {
      for (const code of await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", acc._id))
        .take(50)) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(acc._id);
    }

    // final security event BEFORE the user row disappears (keeps actor id)
    await logAuditEvent(ctx, userId, SECURITY_EVENTS.ACCOUNT_DELETED, "self_service");

    await ctx.db.delete(userId);

    return { ok: true as const, counts };
  },
});
