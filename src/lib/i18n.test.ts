import { describe, expect, it } from "vitest";

import { LANGUAGES } from "./languages";
import { DICTS, translate, type Dict, type DictKey } from "./i18n";

/** Brand nouns are product names, not prose — identical in every language. */
const BRAND_LOCKED: Partial<Record<DictKey, string>> = {
  "nav.twin": "Twin",
  "nav.vault": "Vault",
  "nav.map": "KYNEX Map",
  "nav.gpa": "GPA Lab",
};

describe("i18n dictionaries", () => {
  it("covers exactly the allowlisted languages from languages.ts", () => {
    expect(Object.keys(DICTS).sort()).toEqual(
      [...LANGUAGES.map((l) => l.code)].sort(),
    );
  });

  it("every language has full key parity with the English source of truth", () => {
    const enKeys = Object.keys(DICTS.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(DICTS[lang.code]).sort(), lang.code).toEqual(enKeys);
    }
  });

  it("every entry is a non-empty string", () => {
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(DICTS[lang.code])) {
        expect(typeof value, `${lang.code}:${key}`).toBe("string");
        expect((value as string).length, `${lang.code}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("brand nouns stay untranslated in every language", () => {
    for (const lang of LANGUAGES) {
      for (const [key, brand] of Object.entries(BRAND_LOCKED)) {
        expect(DICTS[lang.code][key as DictKey], `${lang.code}:${key}`).toBe(brand);
      }
      expect(DICTS[lang.code]["vault.eyebrow"].startsWith("KYNEX Brain"), lang.code).toBe(true);
      expect(DICTS[lang.code]["recall.eyebrow"].startsWith("KYNEX Recall"), lang.code).toBe(true);
    }
  });
});

describe("translate", () => {
  it("resolves English strings", () => {
    expect(translate("en", "nav.commandCenter")).toBe("Command Center");
    expect(translate("en", "chat.noMaterial")).toBe("No material context");
  });

  it("interpolates {token} vars, including reordered tokens in translations", () => {
    expect(translate("en", "shell.xpToLevel", { n: 240, m: 3 })).toBe("240 XP to level 3");
    // zh-CN reorders the sentence: the tokens still land in the right slots.
    expect(translate("zh-CN", "shell.xpToLevel", { n: 240, m: 3 })).toBe("距 3 级还差 240 XP");
    // Numeric vars are stringified, not concatenated.
    expect(translate("en", "shell.dayStreak", { n: 12 })).toBe("12-day learning streak");
  });

  it("unknown tokens survive verbatim instead of becoming 'undefined'", () => {
    expect(translate("en", "shell.dayStreak", { x: 1 })).toBe("{n}-day learning streak");
  });

  it("falls back to English when a dictionary entry is missing at runtime", () => {
    const zh = DICTS["zh-CN"];
    const partial: Partial<Dict> = { ...zh };
    // zh-CN differs from English here, so the fallback is observable.
    delete partial["nav.commandCenter"];
    (DICTS as Record<string, Dict>)["zh-CN"] = partial as Dict;
    try {
      expect(translate("zh-CN", "nav.commandCenter")).toBe("Command Center");
    } finally {
      (DICTS as Record<string, Dict>)["zh-CN"] = zh;
    }
    expect(translate("zh-CN", "nav.commandCenter")).toBe("指挥中心");
  });
});
