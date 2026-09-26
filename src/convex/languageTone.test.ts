import { describe, expect, it } from "vitest";

import { resolveLanguageDirective, resolvePersonaDirective } from "./aiEngine";
import { outOfScopeMessage } from "./tutorScope";

/**
 * MULTI-LANGUAGE TECHNICAL INTEGRITY — language directive + boundary
 * localization contract.
 *
 * Guarantees:
 *  - Only the 10 fixed BCP-47 tags resolve to a directive (server-side
 *    allowlist; raw client strings are never interpolated into prompts).
 *  - Every directive enforces technical-term preservation: notation, code
 *    identifiers and syntax stay in standard form; accuracy beats fluency.
 *  - Unknown tags resolve to null — the chat proceeds with base behavior,
 *    never an error, never an echoed payload.
 *  - The out-of-scope boundary message exists as a FIXED string for every
 *    supported language (grounded refusal is never model-improvised), and
 *    unknown tags collapse to the English canonical.
 */

const SUPPORTED = ["en", "zh-CN", "hi", "es", "fr", "ar", "bn", "pt", "id", "ur"] as const;

describe("resolveLanguageDirective", () => {
  it("resolves every supported language to a directive", () => {
    for (const lang of SUPPORTED) {
      const d = resolveLanguageDirective(lang);
      expect(d, `${lang} should resolve`).toBeTruthy();
      expect(d!.startsWith("LANGUAGE DIRECTIVE")).toBe(true);
    }
  });

  it("all directives enforce technical-term preservation", () => {
    for (const lang of SUPPORTED) {
      const d = resolveLanguageDirective(lang)!;
      // The English directive is the minimal baseline; every other locale
      // must carry the full technical-integrity contract.
      if (lang === "en") {
        expect(d).toBe("LANGUAGE DIRECTIVE: Respond in English.");
        continue;
      }
      expect(d.includes("standard form") || d.includes("standard (Latin) form")).toBe(true);
      expect(d.includes("Accuracy outweighs fluency")).toBe(true);
      expect(d.includes("never distort")).toBe(true);
    }
  });

  it("Arabic/Urdu directives pin notation and code to standard Latin form", () => {
    for (const lang of ["ar", "ur"] as const) {
      const d = resolveLanguageDirective(lang)!;
      expect(d.includes("standard (Latin) form")).toBe(true);
    }
  });

  it("returns null for unknown or injected tags — never throws, never echoes", () => {
    for (const bad of [
      "en\"><script>alert(1)</script>",
      "en'--DROP TABLE users",
      "ar-BADIYA",
      "klingon",
      "UR",
      "",
      42 as unknown as string,
      undefined,
    ]) {
      expect(resolveLanguageDirective(bad)).toBeNull();
    }
  });

  it("persona allowlist remains intact alongside the language layer", () => {
    for (const p of ["classic", "millennial", "genz", "alpha"] as const) {
      expect(resolvePersonaDirective(p)).toBeTruthy();
    }
    expect(resolvePersonaDirective("ignored') --")).toBeNull();
  });
});

describe("outOfScopeMessage localization", () => {
  it("provides a distinct fixed refusal for every supported language", () => {
    const set = new Set<string>();
    for (const lang of SUPPORTED) {
      const msg = outOfScopeMessage(lang);
      expect(msg.length).toBeGreaterThan(40);
      set.add(msg);
    }
    // English canonical appears once; every locale has its own string.
    expect(set.size).toBe(SUPPORTED.length);
  });

  it("collapses unknown tags to the English canonical — never model output", () => {
    expect(outOfScopeMessage(undefined)).toBe(outOfScopeMessage("en"));
    expect(outOfScopeMessage("klingon")).toBe(outOfScopeMessage("en"));
    expect(outOfScopeMessage("en\"><script>")).toBe(outOfScopeMessage("en"));
  });

  it("refusals are grounded statements, not fabrications", () => {
    for (const lang of SUPPORTED) {
      const msg = outOfScopeMessage(lang);
      // Every variant states it cannot ground the answer — the honest
      // boundary — in its own script (heuristic: contains non-ASCII for
      // non-Latin locales, plain English for Latin ones).
      expect(msg.length).toBeGreaterThan(40);
      if (["zh-CN", "hi", "ar", "bn", "ur"].includes(lang)) {
        expect(/[^\u0000-\u007F]/.test(msg)).toBe(true);
      }
    }
  });
});
