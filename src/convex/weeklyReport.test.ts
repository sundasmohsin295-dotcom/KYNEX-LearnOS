import { describe, expect, test } from "vitest";
import { weeklyReport, type WeeklyReportInput } from "./weeklyReport";

const NOW = 1_800_000_000_000;
const DAY = 86400000;

function base(overrides: Partial<WeeklyReportInput> = {}): WeeklyReportInput {
  return {
    now: NOW,
    attempts: [],
    mistakes: [],
    sessions: [],
    mastery: [],
    reviews: [],
    dueCards: 0,
    goalMinutesPerDay: 30,
    daysToExam: null,
    weakConcepts: [],
    ...overrides,
  };
}

describe("weeklyReport", () => {
  test("detects accuracy improvement with real numbers", () => {
    const r = weeklyReport(
      base({
        attempts: [
          { completedAt: NOW - DAY, total: 10, correct: 8 }, // 80% this week
          { completedAt: NOW - 10 * DAY, total: 10, correct: 5 }, // 50% last week
        ],
      }),
    );
    expect(r.ready).toBe(true);
    expect(r.stats.accuracyThisWeek).toBe(80);
    expect(r.stats.accuracyLastWeek).toBe(50);
    expect(r.improved.some((s) => s.evidence.includes("50% to 80%"))).toBe(true);
  });

  test("groups repeated mistakes by concept+category", () => {
    const r = weeklyReport(
      base({
        mistakes: [
          { conceptLabel: "CIA Triad", category: "conceptual", resolved: false, createdAt: NOW - 2 * DAY },
          { conceptLabel: "CIA Triad", category: "conceptual", resolved: false, createdAt: NOW - 3 * DAY },
        ],
      }),
    );
    expect(r.repeatedMistakes).toHaveLength(1);
    expect(r.repeatedMistakes[0].evidence).toContain("2 × conceptual");
    expect(r.nextAction).toContain("repeat pattern");
  });

  test("flags mastered concepts untouched for 2+ weeks as forgotten", () => {
    const r = weeklyReport(
      base({
        mastery: [
          { conceptKey: "dns", conceptLabel: "DNS", correct: 9, attempts: 10, lastPracticedAt: NOW - 20 * DAY },
          { conceptKey: "tcp", conceptLabel: "TCP", correct: 9, attempts: 10, lastPracticedAt: NOW - DAY },
        ],
      }),
    );
    expect(r.mastered).toContain("DNS");
    expect(r.mastered).toContain("TCP");
    expect(r.forgotten).toEqual(["DNS"]);
  });

  test("low-activity week → honest not-ready report, never invented data", () => {
    const r = weeklyReport(base());
    expect(r.ready).toBe(false);
    expect(r.notReadyReason).toContain("doesn't invent a report");
  });

  test("exam risk counts weak concepts with the real day count", () => {
    const r = weeklyReport(
      base({
        daysToExam: 5,
        weakConcepts: [
          { label: "Subnetting", accuracy: 40 },
          { label: "NAT", accuracy: 55 },
        ],
      }),
    );
    expect(r.examRisk).toContain("2 concepts");
    expect(r.examRisk).toContain("5 days");
  });

  test("goal progress uses the real weekly target", () => {
    const partial = weeklyReport(
      base({
        sessions: [{ createdAt: NOW - DAY, minutes: 100 }],
        goalMinutesPerDay: 20,
      }),
    );
    // 20 × 7 = 140 weekly target; 100 minutes → honest 71%, no "met" claim.
    expect(partial.goalProgress).toContain("71%");

    const met = weeklyReport(
      base({
        sessions: [{ createdAt: NOW - DAY, minutes: 150 }],
        goalMinutesPerDay: 20,
      }),
    );
    expect(met.goalProgress).toContain("met");
    expect(met.goalProgress).toContain("150 of 140");
  });

  test("mastery floor requires 3+ attempts at 85%+", () => {
    const r = weeklyReport(
      base({
        mastery: [
          { conceptKey: "a", conceptLabel: "Lucky", correct: 2, attempts: 2, lastPracticedAt: NOW },
          { conceptKey: "b", conceptLabel: "Solid", correct: 17, attempts: 20, lastPracticedAt: NOW },
          { conceptKey: "c", conceptLabel: "Weakish", correct: 8, attempts: 20, lastPracticedAt: NOW },
        ],
      }),
    );
    expect(r.mastered).toEqual(["Solid"]);
  });
});
