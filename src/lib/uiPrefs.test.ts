// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyPersonaAttribute,
  applyUiStyleAttribute,
  DEFAULT_PERSONA,
  DEFAULT_UI_STYLE,
  isPersona,
  isUiStyle,
  loadPersona,
  loadUiStyle,
  PERSONA_KEY,
  savePersona,
  saveUiStyle,
  UI_STYLE_KEY,
} from "./uiPrefs";
import { encodeStored } from "./storageCodec";

/**
 * UI STYLE MATRIX + GENERATIONAL PERSONA — preference engine contract tests.
 *
 * Guarantees:
 *  - Allowlists reject unknown/injected values; defaults are stable.
 *  - Persistence uses the versioned envelope and round-trips exactly.
 *  - Legacy bare-string payloads (pre-envelope) still load.
 *  - Poisoned payloads never crash a read — they reset to the default.
 *  - Blocked storage degrades to the memory mirror (session stays coherent).
 *  - Attribute application is idempotent and always reflectable.
 */

describe("uiPrefs allowlists", () => {
  it("accepts every catalog style and persona", () => {
    for (const s of ["glass", "minimal", "neumorph", "clay", "bento"] as const) {
      expect(isUiStyle(s)).toBe(true);
    }
    for (const p of ["classic", "millennial", "genz", "alpha"] as const) {
      expect(isPersona(p)).toBe(true);
    }
  });

  it("rejects injected or unknown values", () => {
    for (const bad of [
      "glass\"><script>alert(1)</script>",
      "GLASS",
      "glass; drop table users",
      "glass\nneumorph",
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isUiStyle(bad)).toBe(false);
      expect(isPersona(bad)).toBe(false);
    }
  });

  it("defaults are glass + classic", () => {
    expect(DEFAULT_UI_STYLE).toBe("glass");
    expect(DEFAULT_PERSONA).toBe("classic");
  });
});

describe("uiPrefs persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips through the versioned envelope", () => {
    expect(saveUiStyle("clay")).toBe("persisted");
    expect(loadUiStyle()).toBe("clay");
    expect(JSON.parse(window.localStorage.getItem(UI_STYLE_KEY)!)).toEqual({ v: 1, p: "clay" });

    expect(savePersona("genz")).toBe("persisted");
    expect(loadPersona()).toBe("genz");
  });

  it("accepts legacy bare-string payloads (no envelope)", () => {
    window.localStorage.setItem(UI_STYLE_KEY, JSON.stringify("minimal"));
    expect(loadUiStyle()).toBe("minimal");
    window.localStorage.setItem(PERSONA_KEY, JSON.stringify("alpha"));
    expect(loadPersona()).toBe("alpha");
  });

  it("resets poisoned payloads to the default instead of throwing", () => {
    window.localStorage.setItem(UI_STYLE_KEY, "not json at all {{{");
    expect(loadUiStyle()).toBe(DEFAULT_UI_STYLE);
    window.localStorage.setItem(PERSONA_KEY, '{"v":1,"p":"injected-persona"}');
    expect(loadPersona()).toBe(DEFAULT_PERSONA);
  });

  it("degrades to the memory mirror when storage is blocked", () => {
    const original = window.localStorage;
    // jsdom 30 allows replacing the storage implementation wholesale.
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
      expect(saveUiStyle("bento")).toBe("memory_only");
      expect(loadUiStyle()).toBe("bento"); // served from the memory mirror
    } finally {
      Object.defineProperty(window, "localStorage", { value: original, configurable: true });
    }
  });

  it("applies attributes idempotently to <html>", () => {
    applyUiStyleAttribute("neumorph");
    applyUiStyleAttribute("neumorph");
    expect(document.documentElement.getAttribute("data-ui-style")).toBe("neumorph");
    applyPersonaAttribute("millennial");
    expect(document.documentElement.getAttribute("data-gen")).toBe("millennial");
  });

  it("storage keys stay KYNEX-owned so the corruption sweep covers them", () => {
    expect(UI_STYLE_KEY.startsWith("kynex.")).toBe(true);
    expect(PERSONA_KEY.startsWith("kynex.")).toBe(true);
  });

  it("envelope encode shape matches the bootstrap mirror contract", () => {
    expect(encodeStored("glass")).toBe('{"v":1,"p":"glass"}');
  });
});
