import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
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
    // SECURITY: the provider key is read from the server environment. The
    // previous hardcoded value has been revoked-and-replaced policy — if your
    // deployment still carries the old literal, rotate the key at the provider
    // and set FREEBUFF_OTP_API_KEY in the deployment environment.
    const apiKey = process.env.FREEBUFF_OTP_API_KEY;
    if (!apiKey) {
      // Fail closed, without leaking why to the end user.
      throw new Error("Email delivery is not configured.");
    }
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": apiKey,
          },
          timeout: 10_000,
        },
      );
    } catch {
      // Never surface provider error bodies (could include internal details).
      throw new Error("Could not send the verification email.");
    }
  },
});
