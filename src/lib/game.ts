/** Shared game constants + copy helpers. */

export const XP_PER_LEVEL = 250;

export const STREAK_MESSAGES = {
  welcomeBack: "Welcome back. Your progress is still here.",
} as const;

export const MASTERY_LOOP = [
  { key: "learn", label: "Learn" },
  { key: "understand", label: "Understand" },
  { key: "practice", label: "Practice" },
  { key: "test", label: "Test" },
  { key: "diagnose", label: "Diagnose" },
  { key: "fix", label: "Fix Gap" },
  { key: "retest", label: "Retest" },
  { key: "master", label: "Master" },
] as const;

export const LEVEL_TITLES = [
  "Novice", "Explorer", "Apprentice", "Scholar", "Strategist",
  "Analyst", "Specialist", "Adept", "Sage", "Luminary",
] as const;

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
}

export const MISSION_KIND_META: Record<
  string,
  { label: string; icon: string }
> = {
  practice: { label: "Practice", icon: "target" },
  review: { label: "Review", icon: "refresh" },
  learn: { label: "Learn", icon: "book" },
  fix_gap: { label: "Fix Gap", icon: "wrench" },
  master: { label: "Master", icon: "crown" },
};
