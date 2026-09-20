import { describe, expect, test } from "vitest";
import { statusFromCode } from "./aiStatus";

/**
 * HEALTH-CHECK STATUS MAPPING SUITE
 *
 * Guarantees:
 *  - Every AI failure classifier code maps to a stable public status.
 *  - Unknown codes fail closed to PROVIDER_UNAVAILABLE (never READY).
 */

describe("statusFromCode", () => {
  test("maps every classifier code to the public status taxonomy", () => {
    expect(statusFromCode("ai_key_rejected")).toBe("AUTHENTICATION_FAILED");
    expect(statusFromCode("ai_not_configured")).toBe("CONFIGURATION_REQUIRED");
    expect(statusFromCode("ai_rate_limited")).toBe("RATE_LIMITED");
    expect(statusFromCode("ai_quota_exhausted")).toBe("QUOTA_EXHAUSTED");
    expect(statusFromCode("ai_invalid_request")).toBe("INVALID_REQUEST");
    expect(statusFromCode("ai_provider_unavailable")).toBe("PROVIDER_UNAVAILABLE");
    expect(statusFromCode("ai_provider_error")).toBe("PROVIDER_UNAVAILABLE");
  });

  test("unknown codes fail closed — never READY", () => {
    for (const code of ["", "unknown_code", "ai_ready_i_promise"]) {
      expect(statusFromCode(code)).not.toBe("READY");
      expect(statusFromCode(code)).toBe("PROVIDER_UNAVAILABLE");
    }
  });
});
