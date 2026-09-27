// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyBuddyAvatarAttribute,
  buddyHintForPath,
  buddyToneFor,
  BUDDY_AVATAR_KEY,
  BUDDY_NAME_KEY,
  DEFAULT_BUDDY_AVATAR,
  DEFAULT_BUDDY_NAME,
  isBuddyAvatar,
  loadBuddyAvatar,
  loadBuddyName,
  normalizeBuddyName,
  saveBuddyAvatar,
  saveBuddyName,
} from "./studyBuddy";
import { encodeStored } from "./storageCodec";

/**
 * STUDY BUDDY — preference-engine contract tests.
 *
 * Guarantees:
 *  - Avatar allowlist rejects unknown/injected values; default is stable.
 *  - Persistence uses the versioned envelope and round-trips exactly.
 *  - Poisoned payloads never crash a read — they reset to the default.
 *  - Custom names are trimmed/capped; empty resets to the default name.
 *  - Persona tone map always returns a valid tone (unknown → classic).
 *  - Route hints match by prefix; unknown routes get no fabricated hint.
 */

describe("studyBuddy allowlist", () => {
  it("accepts exactly the four avatars and rejects everything else", () => {
    for (const a of ["bot", "owl", "pixel", "anime"]) {
      expect(isBuddyAvatar(a)).toBe(true);
    }
    for (const bad of ["dragon", "", "BOT", null, undefined, 42, {}]) {
      expect(isBuddyAvatar(bad)).toBe(false);
    }
  });
});

describe("studyBuddy persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("avatar round-trips through the versioned envelope", () => {
    expect(saveBuddyAvatar("owl")).toBe("persisted");
    expect(localStorage.getItem(BUDDY_AVATAR_KEY)).toBe(encodeStored("owl"));
    expect(loadBuddyAvatar()).toBe("owl");
  });

  it("an unknown avatar in a valid envelope resets to the default", () => {
    localStorage.setItem(BUDDY_AVATAR_KEY, encodeStored("dragon"));
    expect(loadBuddyAvatar()).toBe(DEFAULT_BUDDY_AVATAR);
  });

  it("a poisoned payload never crashes a read", () => {
    localStorage.setItem(BUDDY_AVATAR_KEY, "{not-json-at-all");
    expect(loadBuddyAvatar()).toBe(DEFAULT_BUDDY_AVATAR);
  });

  it("names are normalized: trimmed, whitespace-collapsed, capped at 24", () => {
    expect(normalizeBuddyName("  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(normalizeBuddyName("x".repeat(99))).toHaveLength(24);
  });

  it("an empty name resets to the default buddy name", () => {
    saveBuddyName("   ");
    expect(loadBuddyName()).toBe(DEFAULT_BUDDY_NAME);
    saveBuddyName("Einstein");
    expect(loadBuddyName()).toBe("Einstein");
  });

  it("a poisoned name payload falls back to the default, not a crash", () => {
    localStorage.setItem(BUDDY_NAME_KEY, ",,,,");
    expect(loadBuddyName()).toBe(DEFAULT_BUDDY_NAME);
  });
});

describe("studyBuddy attributes", () => {
  it("applyBuddyAvatarAttribute writes data-buddy and is idempotent", () => {
    applyBuddyAvatarAttribute("pixel");
    expect(document.documentElement.getAttribute("data-buddy")).toBe("pixel");
    applyBuddyAvatarAttribute("pixel");
    expect(document.documentElement.getAttribute("data-buddy")).toBe("pixel");
  });
});

describe("studyBuddy tone", () => {
  it("maps each persona and falls back to classic for unknown values", () => {
    expect(buddyToneFor("alpha").voice).toContain("playful");
    expect(buddyToneFor("genz").voice).toContain("direct");
    expect(buddyToneFor("millennial").voice).toContain("professional");
    expect(buddyToneFor("classic")).toBe(buddyToneFor("nonsense-injected"));
    expect(buddyToneFor(undefined)).toBe(buddyToneFor("classic"));
  });
});

describe("studyBuddy route hints", () => {
  it("matches module routes by prefix", () => {
    expect(buddyHintForPath("/library")?.id).toBe("vault");
    expect(buddyHintForPath("/material/abc123")?.id).toBe("vault");
    expect(buddyHintForPath("/chat")?.id).toBe("chat");
    expect(buddyHintForPath("/flashcards")?.id).toBe("recall");
    expect(buddyHintForPath("/gpa")?.id).toBe("gpa");
    expect(buddyHintForPath("/mission/xyz")?.id).toBe("mission");
  });

  it("gives no hint on unknown routes instead of guessing", () => {
    expect(buddyHintForPath("/settings/unknown")).toBeUndefined();
    expect(buddyHintForPath("/")).toBeUndefined();
  });

  it("hints reference real modules and never leak destructive copy", () => {
    for (const h of [
      buddyHintForPath("/library"),
      buddyHintForPath("/chat"),
      buddyHintForPath("/examiner"),
    ]) {
      expect(h!.title.length).toBeGreaterThan(0);
      expect(h!.body.length).toBeGreaterThan(20);
    }
  });
});
