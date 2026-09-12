import { describe, expect, test } from "vitest";
import {
  BANDS_4,
  bandsForScale,
  cumulativeGpa,
  maxPointFor,
  pointForPercent,
  projectedCgpa,
  requiredSemesterGpa,
  round2,
  scenarioSet,
  semesterGpa,
  weightedGpa,
} from "./gpaMath";

const sem = (
  name: string,
  status: "completed" | "in_progress",
  courses: Array<[string, number, number | null]>,
) => ({
  name,
  status,
  courses: courses.map(([n, ch, gp]) => ({ name: n, creditHours: ch, gradePoint: gp })),
});

describe("weightedGpa", () => {
  test("credit-weights grade points correctly", () => {
    const gpa = weightedGpa([
      { name: "A", creditHours: 4, gradePoint: 4.0 },
      { name: "B", creditHours: 2, gradePoint: 2.0 },
    ]);
    // (4*4 + 2*2) / 6 = 20/6 = 3.33
    expect(gpa).toBe(3.33);
  });

  test("ungraded courses are excluded", () => {
    const gpa = weightedGpa([
      { name: "A", creditHours: 3, gradePoint: 3.0 },
      { name: "B", creditHours: 3, gradePoint: null },
    ]);
    expect(gpa).toBe(3.0);
  });

  test("returns null when nothing is graded", () => {
    expect(weightedGpa([{ name: "A", creditHours: 3, gradePoint: null }])).toBeNull();
    expect(weightedGpa([])).toBeNull();
  });
});

describe("semesterGpa / cumulativeGpa", () => {
  test("semester GPA uses only that semester's courses", () => {
    const s = sem("S1", "completed", [
      ["A", 3, 4.0],
      ["B", 3, 3.0],
    ]);
    expect(semesterGpa(s)).toBe(3.5);
  });

  test("cumulative GPA merges all semesters' graded courses", () => {
    const cgpa = cumulativeGpa([
      sem("S1", "completed", [["A", 4, 4.0]]),
      sem("S2", "completed", [["B", 4, 3.0]]),
    ]);
    expect(cgpa).toBe(3.5);
  });

  test("in-progress ungraded courses don't pollute completed CGPA", () => {
    const cgpa = cumulativeGpa([
      sem("S1", "completed", [["A", 4, 4.0]]),
      sem("S2", "in_progress", [["B", 4, null]]),
    ]);
    expect(cgpa).toBe(4.0);
  });
});

describe("projectedCgpa", () => {
  test("blends completed and projected semester work", () => {
    expect(
      projectedCgpa({
        currentCgpa: 3.21,
        completedCredits: 60,
        projectedSemesterGpa: 3.42,
        currentCredits: 15,
      }),
    ).toBe(3.25);
  });

  test("handles first-semester students", () => {
    expect(
      projectedCgpa({
        currentCgpa: 0,
        completedCredits: 0,
        projectedSemesterGpa: 3.8,
        currentCredits: 12,
      }),
    ).toBe(3.8);
  });
});

describe("requiredSemesterGpa", () => {
  test("matches the hand-computed credit-weighted identity", () => {
    const r = requiredSemesterGpa({
      currentCgpa: 3.21,
      completedCredits: 60,
      currentCredits: 15,
      targetCgpa: 3.5,
      maxPoint: 4,
    });
    // (3.5*75 − 3.21*60)/15 = (262.5 − 192.6)/15 = 69.9/15 = 4.66 → infeasible on 4.0
    expect(r.required).toBe(4.66);
    expect(r.feasible).toBe(false);
    expect(r.explanation).toContain("4.66");
  });

  test("feasible case produces a clear sentence", () => {
    const r = requiredSemesterGpa({
      currentCgpa: 3.21,
      completedCredits: 60,
      currentCredits: 30,
      targetCgpa: 3.5,
      maxPoint: 4,
    });
    // (3.5*90 − 3.21*60)/30 = (315 − 192.6)/30 = 4.08 → still > 4 — good edge check
    expect(r.required).toBe(4.08);
    expect(r.feasible).toBe(false);

    const r2 = requiredSemesterGpa({
      currentCgpa: 3.0,
      completedCredits: 30,
      currentCredits: 30,
      targetCgpa: 3.5,
      maxPoint: 4,
    });
    // (3.5*60 − 3.0*30)/30 = (210-90)/30 = 4.0 → feasible exactly at max
    expect(r2.required).toBe(4.0);
    expect(r2.feasible).toBe(true);
    expect(r2.explanation).toContain("3.5");
  });

  test("target below current reports no requirement", () => {
    const r = requiredSemesterGpa({
      currentCgpa: 3.8,
      completedCredits: 40,
      currentCredits: 15,
      targetCgpa: 3.5,
      maxPoint: 4,
    });
    expect(r.required).toBeNull();
    expect(r.feasible).toBe(true);
  });

  test("no current credits explains what's missing", () => {
    const r = requiredSemesterGpa({
      currentCgpa: 3.0,
      completedCredits: 30,
      currentCredits: 0,
      targetCgpa: 3.5,
      maxPoint: 4,
    });
    expect(r.required).toBeNull();
    expect(r.feasible).toBe(false);
  });
});

describe("scenarioSet", () => {
  test("best/expected/risk bound the outcome", () => {
    const semesters = [
      sem("S1", "completed", [["A", 3, 3.0]]),
      sem("S2", "in_progress", [
        ["B", 3, 3.5],
        ["C", 3, null],
      ]),
    ];
    const s = scenarioSet(semesters, "4.0");
    expect(s.bestCase! > s.expected!).toBe(true);
    expect(s.expected! > s.risk!).toBe(true);
    // best: (3*3 + 3.5*3 + 4*3)/9 = (9+10.5+12)/9 = 31.5/9 = 3.5
    expect(s.bestCase).toBe(3.5);
    // expected: C graded at the semester's graded average (3.5)
    // → (9 + 10.5 + 10.5)/9 = 30/9 = 3.33
    expect(s.expected).toBe(3.33);
    // risk: C at 0 → (9 + 10.5)/9 = 19.5/9 = 2.17
    expect(s.risk).toBe(2.17);
  });
});

describe("bands", () => {
  test("93% → 4.0 on the standard band", () => {
    expect(pointForPercent(93, BANDS_4)).toBe(4.0);
    expect(pointForPercent(92.9, BANDS_4)).toBe(3.7);
  });

  test("5.0 scale reaches 5.0 at 90%", () => {
    expect(pointForPercent(91, bandsForScale("5.0"))).toBe(5.0);
    expect(pointForPercent(86, bandsForScale("5.0"))).toBe(4.5);
  });

  test("max point follows the scale", () => {
    expect(maxPointFor("4.0")).toBe(4);
    expect(maxPointFor("5.0")).toBe(5);
  });

  test("round2 keeps two decimals", () => {
    expect(round2(3.219999)).toBe(3.22);
  });
});
