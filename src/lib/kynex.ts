/** KYNEX product vocabulary — the single source of truth for user-facing
 *  system names. Backend function names are unchanged. */

export const KYNEX = {
  name: "KYNEX",
  tagline: "Your Academic Intelligence OS",
  coreLoop: ["KNOW", "UNDERSTAND", "ACT", "MASTER", "ADVANCE"],
} as const;

/** Sidebar / command-bar destinations. */
export const KYNEX_NAV = [
  { to: "/dashboard", label: "Command Center", icon: "layout" },
  { to: "/twin", label: "Twin", icon: "twin" },
  { to: "/library", label: "Subjects", icon: "book" },
  { to: "/library", label: "Vault", icon: "vault" },
  { to: "/practice", label: "Practice", icon: "target" },
  { to: "/flashcards", label: "Recall", icon: "refresh" },
  { to: "/insights", label: "Insights", icon: "insights" },
] as const;

/** Pulse signal metadata for the Twin / Insights views. */
export const PULSE_SIGNALS = [
  { key: "mastery", label: "Mastery" },
  { key: "accuracy", label: "Accuracy" },
  { key: "recall", label: "Recall" },
  { key: "readiness", label: "Exam Readiness" },
  { key: "consistency", label: "Consistency" },
] as const;

export type PulseKey = (typeof PULSE_SIGNALS)[number]["key"];
