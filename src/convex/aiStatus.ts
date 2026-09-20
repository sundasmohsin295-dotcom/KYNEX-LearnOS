"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { createVlyIntegrations } from "@vly-ai/integrations";
import { classifyAiFailure } from "./aiEngine";

/**
 * KYNEX AI configuration health check (Phase 4).
 *
 * Distinguishes, with REAL evidence:
 *   READY                    — a live generation round-trip succeeded
 *   AUTHENTICATION_FAILED    — the provider rejected the credential (401/403)
 *   CONFIGURATION_REQUIRED   — no credential is present in the environment
 *   QUOTA / RATE / UNAVAILABLE / INVALID — classified provider failures
 *
 * Security: never returns (or logs) any secret value, header, or key. The
 * probe request/response contain no user data. It is rate-limited
 * (`aiProbe`, 4/hour) and not metered against the student's daily quota,
 * because it exists to explain platform configuration state honestly.
 */

export type AiStatus =
  | "READY"
  | "AUTHENTICATION_FAILED"
  | "CONFIGURATION_REQUIRED"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_REQUEST";

/** Map an internal failure classifier code to the public status taxonomy. */
export function statusFromCode(code: string): AiStatus {
  switch (code) {
    case "ai_key_rejected":
      return "AUTHENTICATION_FAILED";
    case "ai_not_configured":
      return "CONFIGURATION_REQUIRED";
    case "ai_rate_limited":
      return "RATE_LIMITED";
    case "ai_quota_exhausted":
      return "QUOTA_EXHAUSTED";
    case "ai_invalid_request":
      return "INVALID_REQUEST";
    default:
      return "PROVIDER_UNAVAILABLE";
  }
}

/** Whether the current AI configuration can serve real requests right now. */
export const aiStatus = action({
  args: {},
  returns: v.object({
    status: v.string(),
    message: v.string(),
    model: v.string(),
    checkedAt: v.number(),
    // Which configured path OTP verification email would take right now:
    // "otp-api" (dedicated key), "gateway" (shared integration key), or
    // "none" (email delivery cannot be attempted). Env-presence only —
    // no extra network probe, no secrets returned.
    emailPath: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await ctx.runQuery(api.securityGet.userId);
    if (!userId) throw new Error("Not authenticated");

    // Bounded: at most 4 live probes per user per hour.
    await ctx.runMutation(internal.security.rateLimitInternal, {
      key: "aiProbe",
      userId: userId as never,
    });

    const model = "gpt-4o-mini";
    const checkedAt = Date.now();
    const emailPath = process.env.FREEBUFF_OTP_API_KEY
      ? "otp-api"
      : process.env.VLY_INTEGRATION_KEY
        ? "gateway"
        : "none";

    if (!process.env.VLY_INTEGRATION_KEY) {
      return {
        status: "CONFIGURATION_REQUIRED" as AiStatus,
        message:
          "The AI service isn't connected for this deployment. Add the AI integration key in the project's API keys settings.",
        model,
        checkedAt,
        emailPath,
      };
    }

    const vly = createVlyIntegrations({
      deploymentToken: process.env.VLY_INTEGRATION_KEY,
      debug: false,
    });
    try {
      const res = await vly.ai.completion({
        model,
        messages: [
          { role: "system", content: "Health check. Reply with one word." },
          { role: "user", content: "Reply with the single word: ok" },
        ],
        maxTokens: 10,
        temperature: 0,
      });
      if (res.success && !!res.data?.choices?.[0]?.message?.content) {
        return {
          status: "READY" as AiStatus,
          message: "The AI service is connected and responding.",
          model,
          checkedAt,
          emailPath,
        };
      }
      const cls = classifyAiFailure(res.error ?? "Empty AI response");
      return {
        status: statusFromCode(cls.code),
        message: cls.userMessage,
        model,
        checkedAt,
        emailPath,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cls = classifyAiFailure(msg);
      return {
        status: statusFromCode(cls.code),
        message: cls.userMessage,
        model,
        checkedAt,
        emailPath,
      };
    }
  },
});
