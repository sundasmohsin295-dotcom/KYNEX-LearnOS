import { describe, expect, test } from "vitest";
import { classifyAiFailure } from "./aiEngine";

/**
 * AI FAILURE CLASSIFICATION SUITE
 *
 * Guarantees:
 *  - Every classifiable provider failure maps to a stable, honest category.
 *  - Credential rejections are flagged non-retryable (a rejected key never
 *    succeeds by retrying — fail fast).
 *  - Transient provider/network errors are retryable.
 *  - Classification output contains no secret-like material and always
 *    produces a non-empty user-facing message.
 */

describe("classifyAiFailure", () => {
  test("credential rejection → ai_key_rejected, NOT retryable", () => {
    for (const msg of [
      "Unauthorized",
      "HTTP 401: invalid credentials",
      "403 Forbidden",
      "Invalid API key provided",
      "API key expired",
      "permission denied for this model",
    ]) {
      const cls = classifyAiFailure(msg);
      expect(cls.code).toBe("ai_key_rejected");
      expect(cls.retryable).toBe(false);
      expect(cls.userMessage).toContain("credential was rejected");
    }
  });

  test("missing configuration → ai_not_configured, NOT retryable", () => {
    for (const msg of ["", "provider not configured", "missing deployment token"]) {
      const cls = classifyAiFailure(msg);
      expect(cls.code).toBe("ai_not_configured");
      expect(cls.retryable).toBe(false);
    }
  });

  test("rate limit → retryable", () => {
    const cls = classifyAiFailure("429 too many requests");
    expect(cls.code).toBe("ai_rate_limited");
    expect(cls.retryable).toBe(true);
  });

  test("quota / billing exhaustion → NOT retryable", () => {
    const cls = classifyAiFailure("insufficient_quota: billing limit reached");
    expect(cls.code).toBe("ai_quota_exhausted");
    expect(cls.retryable).toBe(false);
  });

  test("network / provider outage → retryable", () => {
    for (const msg of [
      "fetch failed",
      "ETIMEDOUT after 15000ms",
      "503 Service Unavailable",
      "ECONNRESET",
      "network error while contacting gateway",
    ]) {
      const cls = classifyAiFailure(msg);
      expect(cls.code).toBe("ai_provider_unavailable");
      expect(cls.retryable).toBe(true);
    }
  });

  test("malformed request → invalid request, NOT retryable as-is", () => {
    const cls = classifyAiFailure("400 Bad Request: malformed payload");
    expect(cls.code).toBe("ai_invalid_request");
    expect(cls.retryable).toBe(false);
  });

  test("unknown failures are honest and retryable, never fake success", () => {
    const cls = classifyAiFailure("some totally unexpected gateway turbulence");
    expect(cls.code).toBe("ai_provider_error");
    expect(cls.retryable).toBe(true);
    expect(cls.userMessage.length).toBeGreaterThan(10);
  });

  test("never echoes provider internals or secret-like strings", () => {
    const secretish = "sk_live_abcdef0123456789";
    const cls = classifyAiFailure(`401 Unauthorized for key ${secretish}`);
    expect(cls.userMessage).not.toContain(secretish);
    expect(cls.userMessage).not.toMatch(/sk_[a-z0-9]{8,}/);
    expect(cls.userMessage).not.toContain("Bearer ");
  });
});
