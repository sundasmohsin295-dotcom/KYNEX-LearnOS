import { describe, expect, test } from "vitest";
import {
  gradePath,
  requiredRemainingPercent,
  type GradePathInput,
} from "./gradePath";

function base(overrides: Partial<GradePathInput> = {}): GradePathInput {
  return {
    currentCgpa: 3.0,
    targetCgpa: 3.5,
    completedCredits: 60,
    currentCredits: 15,
    maxPoint: 4,
    currentPercent: 70,
    targetPercent: 85,
    completedWeight: 30,
    daysToExam: 10,
    weakConcepts: [{ label: "Authorization", accuracy: 45 }],
    topMistakeCategories: [{ category: "conceptual", count: 4 }],
    ...overrides,
  };
}

describe("requiredRemainingPercent", () => {
  test("manual check: 70% over 30% weight, target 85% → 91.43% required", () => {
    const r = requiredRemainingPercent(70, 85, 30);
    // required = (85*100 − 70*30)/(100−30) = 6400/70 ≈ 91.43
    expect(r.required).toBeCloseTo(91.43, 1);
    expect(r.feasible).toBe(true);
  });

  test("infeasible when required percent exceeds 100", () => {
    const r = requiredRemainingPercent(50, 95, 80);
    // (95*100 − 50*80)/20 = 275 — impossible.
    expect(r.feasible).toBe(false);
    expect(r.required).toBeGreaterThan(100);
  });

  test("already above target is feasible with no requirement", () => {
    const r = requiredRemainingPercent(88, 85, 30);
    expect(r.required).toBeNull();
    expect(r.feasible).toBe(true);
  });

  test("all weight completed → mark is fixed", () => {
    const r = requiredRemainingPercent(70, 85, 100);
    expect(r.required).toBeNull();
    expect(r.feasible).toBe(false);
  });
});

describe("gradePath", () => {
  test("computes the real gap and required GPA (manual math)", () => {
    const r = gradePath(base());
    // required = (3.5*75 − 3.0*60)/15 = (262.5 − 180)/15 = 5.5 → above 4 → infeasible
    expect(r.required.gpa).toBeCloseTo(5.5, 1);
    expect(r.required.feasible).toBe(false);
    expect(r.gap).toContain("0.5");
    expect(r.verification).toContain("≥85%");
  });

  test("feasible path produces ordered evidence-based actions", () => {
    const r = gradePath(
      base({ completedCredits: 60, currentCredits: 30, targetCgpa: 3.2 }),
    );
    // required = (3.2*90 − 3.0*60)/30 = (288−180)/30 = 3.6 → feasible
    expect(r.required.gpa).toBeCloseTo(3.6, 1);
    expect(r.required.feasible).toBe(true);
    expect(r.impactActions[0].action).toContain("Authorization");
    expect(r.impactActions[0].evidence).toContain("45%");
  });

  test("no targets → honest not-ready state, no invented numbers", () => {
    const r = gradePath(
      base({ targetCgpa: null, targetPercent: null, currentPercent: null }),
    );
    expect(r.ready).toBe(false);
    expect(r.notReadyReason).toBeTruthy();
    expect(r.required.explanation).toContain("Not computable");
    expect(r.impactActions).toHaveLength(0);
  });

  test("exam proximity escalates a timed-mock action", () => {
    const r = gradePath(base({ daysToExam: 2, weakConcepts: [] }));
    expect(r.impactActions.some((a) => a.action.includes("mock"))).toBe(true);
  });

  test("zero current credits → no GPA requirement fabricated", () => {
    const r = gradePath(base({ currentCredits: 0 }));
    expect(r.required.gpa).toBeNull();
  });

  test("empty evidence → fallback action, never fake urgency", () => {
    const r = gradePath(
      base({ weakConcepts: [], topMistakeCategories: [], daysToExam: null }),
    );
    expect(r.impactActions).toHaveLength(1);
    expect(r.impactActions[0].action).toContain("No urgent bottleneck");
  });
});
