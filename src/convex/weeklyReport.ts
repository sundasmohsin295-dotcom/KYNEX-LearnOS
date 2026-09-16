/**
 * KYNEX Weekly Academic Intelligence Report — pure, deterministic.
 *
 * Compares the last 7 days against the previous 7 days using ONLY real
 * stored activity, and produces the evidence-based sections:
 * improved / still weak / repeated mistakes / mastered / forgotten /
 * exam-risk change / goal progress / what should happen next.
 *
 * No motivational fluff, no shame for quiet weeks: a low-activity week is
 * reported honestly and met with a small, concrete next action.
 */

import { round2 } from "./gpaMath";

// ---------------------------------------------------------------------------
// Input shapes (mirrors of the caller's own stored rows)
// ---------------------------------------------------------------------------

export interface WeekAttempt {
  completedAt: number;
  total: number;
  correct: number;
}

export interface WeekMistake {
  conceptLabel: string;
  category: string;
  resolved: boolean;
  createdAt: number;
}

export interface WeekSession {
  createdAt: number;
  minutes: number;
}

export interface WeekMasteryRow {
  conceptKey: string;
  conceptLabel: string;
  correct: number;
  attempts: number;
  lastPracticedAt: number;
}

export interface WeekReview {
  reviewedAt: number;
  grade: "again" | "hard" | "good" | "easy";
}

export interface WeeklyReportInput {
  now: number;
  attempts: WeekAttempt[];
  mistakes: WeekMistake[];
  sessions: WeekSession[];
  mastery: WeekMasteryRow[];
  reviews: WeekReview[];
  /** Cards that were due during this week. */
  dueCards: number;
  goalMinutesPerDay: number;
  daysToExam: number | null;
  /** Weak concepts (accuracy < 60%, attempts >= 2) at report time. */
  weakConcepts: { label: string; accuracy: number }[];
}

export interface WeeklyReportSection {
  /** Evidence line — every claim traces to a real number. */
  evidence: string;
}

export interface WeeklyReport {
  ready: boolean;
  notReadyReason?: string;

  improved: WeeklyReportSection[];
  stillWeak: WeeklyReportSection[];
  repeatedMistakes: WeeklyReportSection[];
  mastered: string[];
  forgotten: string[];
  examRisk: string | null;
  goalProgress: string;
  nextAction: string;
  /** Raw weekly numbers for honest display. */
  stats: {
    minutesThisWeek: number;
    minutesLastWeek: number;
    questionsThisWeek: number;
    accuracyThisWeek: number | null;
    accuracyLastWeek: number | null;
    reviewsThisWeek: number;
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const DAY = 86400000;

export function weeklyReport(input: WeeklyReportInput): WeeklyReport {
  const weekStart = input.now - 7 * DAY;
  const prevStart = input.now - 14 * DAY;

  const inThisWeek = <T,>(rows: T[], at: (r: T) => number) =>
    rows.filter((r) => at(r) >= weekStart);
  const inLastWeek = <T,>(rows: T[], at: (r: T) => number) =>
    rows.filter((r) => at(r) >= prevStart && at(r) < weekStart);

  const thisSessions = inThisWeek(input.sessions, (s) => s.createdAt);
  const lastSessions = inLastWeek(input.sessions, (s) => s.createdAt);
  const minutesThisWeek = thisSessions.reduce((n, s) => n + s.minutes, 0);
  const minutesLastWeek = lastSessions.reduce((n, s) => n + s.minutes, 0);

  const thisAttempts = inThisWeek(input.attempts, (a) => a.completedAt);
  const lastAttempts = inLastWeek(input.attempts, (a) => a.completedAt);
  const qThis = thisAttempts.reduce((n, a) => n + a.total, 0);
  const cThis = thisAttempts.reduce((n, a) => n + a.correct, 0);
  const qLast = lastAttempts.reduce((n, a) => n + a.total, 0);
  const cLast = lastAttempts.reduce((n, a) => n + a.correct, 0);
  const accThis = qThis > 0 ? Math.round((cThis / qThis) * 100) : null;
  const accLast = qLast > 0 ? Math.round((cLast / qLast) * 100) : null;

  const reviewsThisWeek = input.reviews.filter(
    (r) => r.reviewedAt >= weekStart,
  ).length;
  const againThisWeek = input.reviews.filter(
    (r) => r.reviewedAt >= weekStart && r.grade === "again",
  ).length;

  const mastered = input.mastery
    .filter(
      (m) =>
        m.attempts >= 3 && m.correct / m.attempts >= 0.85,
    )
    .map((m) => m.conceptLabel);

  // Forgotten: mastered earlier but stale (not practiced for 14+ days) while
  // retention evidence (recent "again" grades) suggests decay.
  const forgotten = input.mastery
    .filter(
      (m) =>
        m.attempts >= 3 &&
        m.correct / m.attempts >= 0.85 &&
        input.now - m.lastPracticedAt >= 14 * DAY,
    )
    .map((m) => m.conceptLabel);

  // ---- Sections ----
  const improved: WeeklyReportSection[] = [];
  if (accThis !== null && accLast !== null && accThis > accLast) {
    improved.push({
      evidence: `Practice accuracy rose from ${accLast}% to ${accThis}% across ${qThis} questions.`,
    });
  }
  if (minutesThisWeek > minutesLastWeek) {
    improved.push({
      evidence: `Study time grew from ${minutesLastWeek} to ${minutesThisWeek} minutes.`,
    });
  }
  const resolvedThisWeek = inThisWeek(
    input.mistakes,
    (m) => m.createdAt,
  ).filter((m) => m.resolved).length;
  if (resolvedThisWeek > 0) {
    improved.push({
      evidence: `${resolvedThisWeek} mistake${resolvedThisWeek === 1 ? "" : "s"} resolved by later correct answers.`,
    });
  }

  const stillWeak = input.weakConcepts
    .slice(0, 4)
    .map((w) => ({
      evidence: `${w.label} — ${w.accuracy}% accuracy, still under the 60% mastery floor.`,
    }));

  // Repeated mistakes: same (concept, category) seen 2+ times this week.
  const byKey = new Map<string, number>();
  for (const m of inThisWeek(input.mistakes, (x) => x.createdAt)) {
    const k = `${m.conceptLabel}|${m.category}`;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  const repeatedMistakes: WeeklyReportSection[] = [];
  for (const [k, count] of byKey) {
    if (count >= 2) {
      const [label, category] = k.split("|");
      repeatedMistakes.push({
        evidence: `${label}: ${count} × ${category.replace(/_/g, " ")} errors this week — run the re-test drill.`,
      });
    }
  }

  // ---- Exam risk change ----
  let examRisk: string | null = null;
  if (input.daysToExam != null) {
    const riskCount = input.weakConcepts.length;
    examRisk =
      riskCount > 0
        ? `${riskCount} concept${riskCount === 1 ? "" : "s"} below the mastery floor with the exam in ${input.daysToExam} day${input.daysToExam === 1 ? "" : "s"} — highest-priority preparation targets.`
        : `Exam in ${input.daysToExam} day${input.daysToExam === 1 ? "" : "s"} — no concepts below the mastery floor. Focus on timed mocks.`;
  }

  // ---- Goal progress (honest, no guilt) ----
  const goalMinutes = input.goalMinutesPerDay * 7;
  const goalProgress =
    input.goalMinutesPerDay <= 0
      ? "No daily goal set — set one in Twin to track weekly consistency."
      : minutesThisWeek >= goalMinutes
        ? `Weekly goal met: ${minutesThisWeek} of ${goalMinutes} minutes. Consistency compounding.`
        : `${minutesThisWeek} of ${goalMinutes} weekly goal minutes (${Math.round((minutesThisWeek / goalMinutes) * 100)}%).`;

  // ---- Next action: highest-impact, from evidence ----
  let nextAction: string;
  if (repeatedMistakes.length > 0) {
    nextAction = `Break the repeat pattern: ${repeatedMistakes[0].evidence}`;
  } else if (input.weakConcepts.length > 0) {
    nextAction = `Run a fix mission on "${input.weakConcepts[0].label}" (${input.weakConcepts[0].accuracy}% accuracy).`;
  } else if (forgotten.length > 0) {
    nextAction = `Refresh "${forgotten[0]}" — mastered earlier, untouched for 2+ weeks.`;
  } else if (input.dueCards > 0) {
    nextAction = `${input.dueCards} flashcards are due — a short recall session protects what you've built.`;
  } else if (input.daysToExam != null) {
    nextAction = "Run a timed mock to convert solid mastery into exam readiness.";
  } else {
    nextAction = "No urgent bottleneck. Extend mastery on your newest material.";
  }

  // ---- Honest low-activity handling ----
  const ready = qThis > 0 || minutesThisWeek > 0 || reviewsThisWeek > 0;
  if (!ready) {
    return {
      ready: false,
      notReadyReason:
        "No practice, review or study time recorded in the last 7 days. KYNEX doesn't invent a report — run one mission and this fills with real evidence.",
      improved: [],
      stillWeak,
      repeatedMistakes,
      mastered,
      forgotten,
      examRisk,
      goalProgress,
      nextAction,
      stats: {
        minutesThisWeek: 0,
        minutesLastWeek,
        questionsThisWeek: 0,
        accuracyThisWeek: null,
        accuracyLastWeek: accLast,
        reviewsThisWeek: 0,
      },
    };
  }

  return {
    ready: true,
    improved,
    stillWeak,
    repeatedMistakes,
    mastered,
    forgotten,
    examRisk,
    goalProgress,
    nextAction,
    stats: {
      minutesThisWeek,
      minutesLastWeek,
      questionsThisWeek: qThis,
      accuracyThisWeek: accThis,
      accuracyLastWeek: accLast,
      reviewsThisWeek,
    },
  };
}

// Re-exported so the zero-trust query layer can round consistently.
export { round2 };
