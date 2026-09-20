import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

const OTP_TTL_MINUTES = 15;

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * OTP_TTL_MINUTES, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const appName = process.env.VLY_APP_NAME || "KYNEX";

    // Two delivery paths, in priority order. SECURITY: provider keys are read
    // only from the server environment — never logged, never echoed.
    const otpKey = process.env.FREEBUFF_OTP_API_KEY;
    const vlyKey = process.env.VLY_INTEGRATION_KEY;

    // Path 1 (preferred when configured): direct OTP API.
    if (otpKey) {
      try {
        await axios.post(
          "https://auth.freebuff.app/send_otp",
          {
            to: email,
            otp: token,
            appName: appName,
          },
          {
            headers: {
              "x-api-key": otpKey,
            },
            timeout: 10_000,
          },
        );
        return;
      } catch {
        // Never surface provider error bodies (could include internal details).
        throw new Error("Could not send the verification email. Please try again in a moment.");
      }
    }

    // Path 2: platform email gateway on the shared integration key. Verified
    // contract: POST {base}/v1/email/send with a Bearer credential.
    if (vlyKey) {
      try {
        const res = await axios.post(
          "https://integrations.vly.ai/v1/email/send",
          {
            to: [email],
            from: "noreply@project.freebuff.dev",
            subject: `${appName} — your verification code`,
            text: `Your ${appName} verification code is ${token}. It expires in ${OTP_TTL_MINUTES} minutes.`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px">${appName}</h2>
  <p style="margin:0 0 16px;color:#444">Your verification code:</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${token}</p>
  <p style="margin:0;color:#666">This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can safely ignore this email.</p>
</div>`,
          },
          {
            headers: {
              Authorization: `Bearer ${vlyKey}`,
              "Content-Type": "application/json",
            },
            timeout: 15_000,
            // Inspect non-2xx responses ourselves so credential rejection gets
            // an actionable setup message instead of a generic retry message.
            validateStatus: () => true,
          },
        );
        if (res.status >= 200 && res.status < 300) return;
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            "Email verification isn't working: the platform integration key was rejected by the email service. Reconnect the key in the project's API keys settings, then try again.",
          );
        }
        throw new Error("Could not send the verification email. Please try again in a moment.");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Email verification")) throw e;
        throw new Error("Could not send the verification email. Please try again in a moment.");
      }
    }

    // Fail closed, without leaking any secret. The message names the exact
    // missing configuration so the project owner can act — never a fake
    // "verification sent".
    throw new Error(
      "Email verification isn't configured for this deployment yet. Connect the FREEBUFF_OTP_API_KEY key (or reconnect the platform integration key) in the project's API keys settings, then try again.",
    );
  },
});
