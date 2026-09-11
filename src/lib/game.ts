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

/** Achievement metadata — shared by the backend (unlock logic) and the
 *  trophy-case UI. Client-safe: no server imports allowed here. */
export const ACHIEVEMENT_META: Record<
  string,
  { title: string; description: string; icon: string }
> = {
  first_material: { title: "First Spark", description: "Analyzed your first learning material", icon: "spark" },
  first_quiz: { title: "Dive In", description: "Completed your first practice quiz", icon: "target" },
  quiz_perfect: { title: "Flawless", description: "Scored 100% on a quiz with 5+ questions", icon: "trophy" },
  first_mastered: { title: "Concept Master", description: "Mastered your first concept", icon: "brain" },
  mastered_five: { title: "Five Pillars", description: "Mastered 5 concepts", icon: "columns" },
  streak_3: { title: "Warming Up", description: "3-day learning streak", icon: "flame" },
  streak_7: { title: "On Fire", description: "7-day learning streak", icon: "fire" },
  streak_30: { title: "Unstoppable", description: "30-day learning streak", icon: "comet" },
  level_5: { title: "Level 5", description: "Reached level 5", icon: "star" },
  level_10: { title: "Double Digits", description: "Reached level 10", icon: "crown" },
  cards_50: { title: "Card Shark", description: "Reviewed 50 flashcards", icon: "cards" },
  questions_100: { title: "Century", description: "Answered 100 practice questions", icon: "hundred" },
};
