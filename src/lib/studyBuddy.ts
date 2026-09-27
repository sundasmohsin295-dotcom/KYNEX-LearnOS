/**
 * KYNEX Study Buddy — the customizable cartoon assistant companion.
 *
 * Preference engine only: what the buddy looks like and what it's called.
 * It is a LOCAL, deterministic widget (no AI calls, no network) — its hints
 * are curated per module and its tone comes from the active generational
 * persona in uiPrefs.ts, so it degrades to nothing harmful when storage is
 * blocked and never leaks user data anywhere.
 *
 * Same contract as every KYNEX pref:
 *  - strict allowlist (isAvatar) — unknown values reset, never render
 *  - versioned storageCodec envelope (kynex.* prefix → corruption sweep)
 *  - memory-mirror fallback when localStorage is blocked
 *  - custom names are length-capped and trimmed; empty resets to default
 */

import {
  decodeStored,
  encodeStored,
  readWithFallback,
  writeWithFallback,
} from "./storageCodec";

export const BUDDY_AVATARS = ["bot", "owl", "pixel", "anime"] as const;
export type BuddyAvatar = (typeof BUDDY_AVATARS)[number];
export const DEFAULT_BUDDY_AVATAR: BuddyAvatar = "bot";
export const DEFAULT_BUDDY_NAME = "Sparky";
export const BUDDY_NAME_MAX = 24;

export function isBuddyAvatar(v: unknown): v is BuddyAvatar {
  return typeof v === "string" && (BUDDY_AVATARS as readonly string[]).includes(v);
}

export const BUDDY_AVATAR_META: Record<
  BuddyAvatar,
  { label: string; blurb: string }
> = {
  bot: { label: "Cyber-Bot", blurb: "Round robot, glowing eyes" },
  owl: { label: "Wise Owl", blurb: "A patient night-scholar" },
  pixel: { label: "Pixel Scholar", blurb: "8-bit graduate, retro charm" },
  anime: { label: "Anime Mentor", blurb: "Big-energy senpai with a clipboard" },
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const BUDDY_AVATAR_KEY = "kynex.buddyAvatar.v1";
export const BUDDY_NAME_KEY = "kynex.buddyName.v1";

export function loadBuddyAvatar(): BuddyAvatar {
  const v = decodeStored<BuddyAvatar>(readWithFallback(BUDDY_AVATAR_KEY), {
    fallback: DEFAULT_BUDDY_AVATAR,
  });
  // Allowlist re-check: a structurally-valid envelope carrying an unknown
  // avatar (hand-edited storage) resets instead of breaking the widget.
  return isBuddyAvatar(v) ? v : DEFAULT_BUDDY_AVATAR;
}

export function saveBuddyAvatar(a: BuddyAvatar): "persisted" | "memory_only" {
  return writeWithFallback(BUDDY_AVATAR_KEY, encodeStored(a));
}

export function applyBuddyAvatarAttribute(a: BuddyAvatar): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-buddy", a);
}

/** Names are presentation data: trimmed, capped, and empty → default. */
export function normalizeBuddyName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.slice(0, BUDDY_NAME_MAX);
}

export function loadBuddyName(): string {
  const v = decodeStored<string>(readWithFallback(BUDDY_NAME_KEY), {
    fallback: DEFAULT_BUDDY_NAME,
  });
  if (typeof v !== "string") return DEFAULT_BUDDY_NAME;
  const clean = normalizeBuddyName(v);
  return clean.length > 0 ? clean : DEFAULT_BUDDY_NAME;
}

export function saveBuddyName(name: string): "persisted" | "memory_only" {
  const clean = normalizeBuddyName(name);
  const value = clean.length > 0 ? clean : DEFAULT_BUDDY_NAME;
  // writeWithFallback mirrors into memory when localStorage is blocked, so a
  // blocked-storage session stays coherent within the tab.
  return writeWithFallback(BUDDY_NAME_KEY, encodeStored(value));
}

// ---------------------------------------------------------------------------
// Persona tone — rides on the generational persona from uiPrefs
// ---------------------------------------------------------------------------

export type BuddyTone = { voice: string; praise: string; nudge: string };

export const BUDDY_TONE: Record<string, BuddyTone> = {
  classic: {
    voice: "Clear and steady",
    praise: "Well done.",
    nudge: "Ready when you are.",
  },
  alpha: {
    voice: "Hyped and playful",
    praise: "Let's gooo! ⚡",
    nudge: "One more quest? 🚀",
  },
  genz: {
    voice: "Short and direct",
    praise: "Clean. No notes.",
    nudge: "Next move?",
  },
  millennial: {
    voice: "Warm and professional",
    praise: "Strong progress.",
    nudge: "Shall we continue?",
  },
};

export function buddyToneFor(persona: string | undefined): BuddyTone {
  return (persona && BUDDY_TONE[persona]) || BUDDY_TONE.classic;
}

// ---------------------------------------------------------------------------
// Contextual guidance — curated, verified copy about KYNEX's own modules.
// The buddy explains the product; it never invents study facts (the
// zero-hallucination rule is enforced for the AI Professor, and this widget
// sidesteps the problem entirely by being deterministic).
// ---------------------------------------------------------------------------

export interface BuddyHint {
  id: string;
  /** path-prefix patterns; matched with startsWith against location.pathname */
  match: string[];
  title: string;
  body: string;
}

export const BUDDY_HINTS: BuddyHint[] = [
  {
    id: "vault",
    match: ["/library", "/add", "/material"],
    title: "The Vault",
    body: "Add a PDF, a link or pasted notes — KYNEX turns each one into a Subject Brain with concepts, practice and Recall.",
  },
  {
    id: "chat",
    match: ["/chat"],
    title: "Your Professor",
    body: "Ask questions about any Vault material. Answers are grounded in your own documents and cite where they came from.",
  },
  {
    id: "recall",
    match: ["/flashcards"],
    title: "Leitner-X Recall",
    body: "Cards return exactly when you're about to forget them. Grade honestly — 'Again' isn't failure, it's scheduling.",
  },
  {
    id: "practice",
    match: ["/practice", "/quiz"],
    title: "Mastery loop",
    body: "Practice targets your weakest concepts first. Adaptive difficulty ramps up as your accuracy climbs.",
  },
  {
    id: "examiner",
    match: ["/examiner"],
    title: "Exam Radar",
    body: "Submit written answers for marks, missing points and a model answer. Rubric marks are provisional — never official grades.",
  },
  {
    id: "gpa",
    match: ["/gpa"],
    title: "GPA Lab",
    body: "Track semesters and courses on your university's scale, then scenario-plan the CGPA you're aiming for.",
  },
  {
    id: "map",
    match: ["/graph", "/visualize"],
    title: "KYNEX Map",
    body: "Your concepts as a knowledge graph — mastery colors show exactly where the gaps are.",
  },
  {
    id: "mission",
    match: ["/mission", "/dashboard"],
    title: "Missions",
    body: "One click builds your NEXT MOVE mission from your weakest concept. Tasks chain into real XP.",
  },
  {
    id: "mistakes",
    match: ["/mistakes"],
    title: "Mistake Bank",
    body: "Every wrong answer lands here with the fix. Clear a mistake by answering its repair question.",
  },
];

/** First matching hint for a path, or undefined when nowhere specific. */
export function buddyHintForPath(pathname: string): BuddyHint | undefined {
  return BUDDY_HINTS.find((h) => h.match.some((m) => pathname.startsWith(m)));
}
