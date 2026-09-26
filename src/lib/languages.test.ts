// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyLanguageAttributes,
  DEFAULT_LANGUAGE,
  isLanguage,
  isRtl,
  LANGUAGES,
  languageDef,
  loadLanguage,
  LANGUAGE_KEY,
  saveLanguage,
} from "./languages";
import { encodeStored } from "./storageCodec";

/**
 * GLOBAL LANGUAGE ENGINE — preference + RTL contract tests.
 *
 * Guarantees:
 *  - Exactly the 10 catalog languages are valid; injected/unknown values
 *    are rejected.
 *  - Arabic and Urdu are RTL; every other locale is LTR.
 *  - Persistence round-trips through the versioned envelope; poisoned or
 *    hand-tampered payloads reset to English instead of crashing.
 *  - Blocked storage degrades to the memory mirror.
 *  - <html lang>/<html dir> application is deterministic and idempotent.
 */

describe("language catalog", () => {
  it("contains exactly the 10 supported languages", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([
      "en", "zh-CN", "hi", "es", "fr", "ar", "bn", "pt", "id", "ur",
    ]);
  });

  it("marks Arabic and Urdu RTL and everything else LTR", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("ur")).toBe(true);
    for (const l of LANGUAGES) {
      if (l.code === "ar" || l.code === "ur") continue;
      expect(isRtl(l.code), `${l.code} should be LTR`).toBe(false);
    }
  });

  it("rejects injected or unknown language tags", () => {
    for (const bad of [
      "en\"><script>alert(1)</script>",
      "EN",
      "en-US-x-custom",
      "ar; drop table users",
      "",
      null,
      undefined,
      7,
      {},
    ]) {
      expect(isLanguage(bad)).toBe(false);
    }
  });

  it("languageDef is total over the catalog", () => {
    for (const l of LANGUAGES) {
      expect(languageDef(l.code).code).toBe(l.code);
    }
  });
});

describe("language persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips through the versioned envelope", () => {
    expect(saveLanguage("ur")).toBe("persisted");
    expect(loadLanguage()).toBe("ur");
    expect(JSON.parse(window.localStorage.getItem(LANGUAGE_KEY)!)).toEqual({ v: 1, p: "ur" });
  });

  it("accepts legacy bare-string payloads", () => {
    window.localStorage.setItem(LANGUAGE_KEY, JSON.stringify("fr"));
    expect(loadLanguage()).toBe("fr");
  });

  it("resets poisoned payloads to English instead of throwing", () => {
    window.localStorage.setItem(LANGUAGE_KEY, "ur\"><img src=x onerror=alert(1)>");
    expect(loadLanguage()).toBe(DEFAULT_LANGUAGE);
    window.localStorage.setItem(LANGUAGE_KEY, '{"v":1,"p":"klingon"}');
    expect(loadLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it("degrades to the memory mirror when storage is blocked", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        clear: () => {},
      },
      configurable: true,
    });
    try {
      expect(saveLanguage("hi")).toBe("memory_only");
      expect(loadLanguage()).toBe("hi");
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    }
  });

  it("applies lang/dir attributes deterministically", () => {
    applyLanguageAttributes("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    applyLanguageAttributes("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    applyLanguageAttributes("ur");
    expect(document.documentElement.lang).toBe("ur");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("storage key stays KYNEX-owned so the corruption sweep covers it", () => {
    expect(LANGUAGE_KEY.startsWith("kynex.")).toBe(true);
  });

  it("bootstrap mirror contract: envelope shape matches the pre-paint reader", () => {
    expect(encodeStored("zh-CN")).toBe('{"v":1,"p":"zh-CN"}');
  });
});
