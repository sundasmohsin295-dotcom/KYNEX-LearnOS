import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { ensureProfiles, getAuthUserIdStrict } from "./gamification";
import { logAuditEvent } from "./security";

/**
 * Referral engine — genuine value, never spam, never forced.
 *
 * Design:
 *  - Codes are random, unique, and stored in `referrals` rows. The Invite
 *    page calls `ensureCodeRow` (a mutation) once to activate the code, so
 *    every shareable code is backed by a real owner row.
 *  - Redeemptions patch that row with refereeId. One shot, new accounts
 *    only (24h), never self-redemption.
 *  - Rewards are XP granted server-side — never by client input.
 *    Both sides get +250 XP: a real head start, not a paywall bypass.
 */

export const REFERRAL_REWARD_XP = 250;
const REDEEM_WINDOW_MS = 24 * 60 * 60 * 1000;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1, O/0 lookalikes

function makeCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `KYNEX-${out}`;
}

/** The caller's code + honest stats. `null` code = not activated yet. */
export const myReferral = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .first();
    const joined = row && row.refereeId !== undefined ? 1 : 0;

    return {
      code: row?.code ?? null,
      joined,
      totalRewardedXp: joined * REFERRAL_REWARD_XP,
    };
  },
});

/** Activate the caller's personal code (get-or-create, collision-safe). */
export const ensureCodeRow = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserIdStrict(ctx);
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .first();
    if (existing) return { code: existing.code };

    // Retry a few times in the (astronomically unlikely) collision case.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const clash = await ctx.db
        .query("referrals")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (clash) continue;
      await ctx.db.insert("referrals", {
        referrerId: userId,
        code,
        referrerRewarded: false,
        refereeRewarded: false,
        createdAt: Date.now(),
      });
      return { code };
    }
    throw new Error("Could not generate a referral code — please try again.");
  },
});

/** Redeem a friend's code — one shot, new accounts only, real XP for both. */
export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserIdStrict(ctx);
    const now = Date.now();
    const normalized = code.trim().toUpperCase();

    // --- Protection 1: new accounts only (24h window), so existing users
    // can't farm codes. Account age comes from the server-owned profile row.
    const { profile } = await ensureProfiles(ctx);
    if (now - profile._creationTime > REDEEM_WINDOW_MS) {
      return {
        ok: false as const,
        reason: "Referral codes can only be used within 24 hours of joining.",
      };
    }

    // --- Protection 2: one redemption per account, ever. The redeeming user
    // becomes the REFEREE on some code — check the referee index, not the
    // caller's own code row (its refereeId is always undefined). Convex
    // mutations are serializable, so concurrent redemptions cannot race past
    // this check.
    const priorRedemption = await ctx.db
      .query("referrals")
      .withIndex("by_referee", (q) => q.eq("refereeId", userId))
      .first();
    if (priorRedemption) {
      return { ok: false as const, reason: "You've already used a referral code." };
    }

    // --- Validate the code.
    const target = await ctx.db
      .query("referrals")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .first();
    if (!target) {
      return { ok: false as const, reason: "That code doesn't exist. Double-check it." };
    }
    // --- Protection 3: never your own code.
    if (target.referrerId === userId) {
      return { ok: false as const, reason: "That's your own code — invite a friend instead." };
    }
    // --- One shot per code.
    if (target.refereeId !== undefined) {
      return { ok: false as const, reason: "That code has already been used." };
    }

    await ctx.db.patch(target._id, {
      refereeId: userId,
      redeemedAt: now,
      refereeRewarded: true,
      referrerRewarded: true,
    });

    // --- Real rewards, granted server-side only.
    const friendGame = await ctx.db
      .query("gameProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (friendGame) {
      await ctx.db.patch(friendGame._id, { xp: friendGame.xp + REFERRAL_REWARD_XP, updatedAt: now });
    }
    // Referrer: direct grant — achievements re-check on their next action.
    const referrerGame = await ctx.db
      .query("gameProfiles")
      .withIndex("by_user", (q) => q.eq("userId", target.referrerId))
      .first();
    if (referrerGame) {
      await ctx.db.patch(referrerGame._id, {
        xp: referrerGame.xp + REFERRAL_REWARD_XP,
        updatedAt: now,
      });
    }

    await logAuditEvent(ctx, userId, "referral_redeemed", String(target.referrerId));
    return { ok: true as const, rewardedXp: REFERRAL_REWARD_XP };
  },
});

export type ReferralDoc = Doc<"referrals">;
