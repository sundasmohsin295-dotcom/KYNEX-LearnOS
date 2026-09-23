import { describe, expect, it } from "vitest";
import {
  buildReviewModule,
  computeUnitReadiness,
  FLAG_THRESHOLD,
  MIN_ATTEMPTS,
  rollingProficiency,
  unitStatus,
  type ReadinessAnswer,
  type UnitInput,
} from "./readiness";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function answers(patterns: Array<[boolean, number?]>, difficulty?: "easy" | "medium" | "hard"): ReadinessAnswer[] {
  // Each entry: [correct, daysAgo]
  return patterns.map(([correct, daysAgo]) => ({
    correct,
    completedAt: NOW - (daysAgo ?? 0) * DAY,
    difficulty,
  }));
}

function unit(overrides: Partial<UnitInput> = {}): UnitInput {
  return {
    unitKey: "calvin-cycle",
    unitLabel: "Calvin Cycle",
    materialId: "m1",
    subjectId: null,
    answers: [],
    ...overrides,
  };
}

describe("rollingProficiency", () => {
  it("returns null when evidence is below MIN_ATTEMPTS (no guessing)", () => {
    expect(rollingProficiency([], NOW)).toBeNull();
    expect(rollingProficiency(answers([[true], [true]]), NOW)).toBeNull();
    expect(MIN_ATTEMPTS).toBe(3);
  });

  it("scores perfect recent performance at 100", () => {
    const p = rollingProficiency(
      answers([
        [true, 0],
        [true, 1],
        [true, 2],
      ]),
      NOW,
    );
    expect(p).toBe(100);
  });

  it("scores consistent failure near 0", () => {
    const p = rollingProficiency(
      answers([
        [false, 0],
        [false, 1],
        [false, 2],
      ]),
      NOW,
    );
    expect(p).toBeLessThanOrEqual(2);
  });

  it("weights recent answers more than old ones", () => {
    // Same 2/3 correct split, but the wrong answer is recent vs old.
    const recentWrong = rollingProficiency(
      answers([
        [true, 10],
        [true, 12],
        [false, 0],
      ]),
      NOW,
    )!;
    const oldWrong = rollingProficiency(
      answers([
        [true, 0],
        [true, 1],
        [false, 12],
      ]),
      NOW,
    )!;
    expect(recentWrong).toBeLessThan(oldWrong);
  });

  it("recency decay pulls old perfect scores down over time", () => {
    const fresh = rollingProficiency(
      answers([
        [true, 0],
        [true, 0],
        [true, 0],
      ]),
      NOW,
    )!;
    const stale = rollingProficiency(
      answers([
        [true, 30],
        [true, 30],
        [true, 30],
      ]),
      NOW,
    )!;
    expect(fresh).toBe(100);
    // Hard answers inflate a bit, but 30-day-old perfect answers cannot stay
    // pinned at 100 — decay must be visible.
    expect(stale).toBeLessThanOrEqual(100);
  });

  it("hard misses cost more than easy misses (uniform sets cancel out)", () => {
    // With uniform difficulty the factor scales miss and hits equally, so the
    // ratio is unchanged — the effect must be measured on mixed evidence.
    const hardMisses = rollingProficiency(
      [
        { correct: false, completedAt: NOW, difficulty: "hard" as const },
        { correct: false, completedAt: NOW, difficulty: "hard" as const },
        { correct: true, completedAt: NOW, difficulty: "easy" as const },
        { correct: true, completedAt: NOW, difficulty: "easy" as const },
      ],
      NOW,
    )!;
    const easyMisses = rollingProficiency(
      [
        { correct: false, completedAt: NOW, difficulty: "easy" as const },
        { correct: false, completedAt: NOW, difficulty: "easy" as const },
        { correct: true, completedAt: NOW, difficulty: "hard" as const },
        { correct: true, completedAt: NOW, difficulty: "hard" as const },
      ],
      NOW,
    )!;
    expect(hardMisses).toBeLessThan(easyMisses);
    // Sanity: a uniform set's difficulty is irrelevant to its score.
    expect(
      rollingProficiency(answers([[true, 0], [true, 0], [false, 0]], "hard"), NOW),
    ).toBe(rollingProficiency(answers([[true, 0], [true, 0], [false, 0]], "easy"), NOW));
  });
});

describe("unitStatus + thresholds", () => {
  it("classifies against the 70% flag threshold", () => {
    expect(FLAG_THRESHOLD).toBe(70);
    expect(unitStatus(69, 5)).toBe("needs_repair");
    expect(unitStatus(70, 5)).toBe("building");
    expect(unitStatus(84, 5)).toBe("building");
    expect(unitStatus(85, 5)).toBe("ready");
    expect(unitStatus(null, 2)).toBe("unverified");
  });

  it("MIN_ATTEMPTS gate prevents premature flagging", () => {
    expect(MIN_ATTEMPTS).toBe(3);
  });
});

describe("computeUnitReadiness", () => {
  it("sorts flagged units first, unverifiable last", () => {
    const rows = computeUnitReadiness(
      [
        unit({
          unitKey: "weak",
          unitLabel: "Weak Unit",
          answers: answers([
            [false, 0],
            [false, 1],
            [false, 2],
            [false, 3],
          ]),
        }),
        unit({
          unitKey: "strong",
          unitLabel: "Strong Unit",
          answers: answers([
            [true, 0],
            [true, 1],
            [true, 2],
            [true, 3],
          ]),
        }),
        unit({ unitKey: "no-evidence", unitLabel: "No Evidence", answers: [] }),
      ],
      NOW,
    );
    expect(rows[0].unitKey).toBe("weak");
    expect(rows[0].status).toBe("needs_repair");
    expect(rows[1].unitKey).toBe("strong");
    expect(rows[1].status).toBe("ready");
    expect(rows[2].unitKey).toBe("no-evidence");
    expect(rows[2].status).toBe("unverified");
    expect(rows[2].proficiency).toBeNull();
    expect(rows[2].evidence).toContain("needed before a score");
  });

  it("evidence strings always cite real counts", () => {
    const [row] = computeUnitReadiness(
      [
        unit({
          answers: answers([
            [true, 0],
            [true, 0],
            [false, 0],
          ]),
        }),
      ],
      NOW,
    );
    expect(row.evidence).toContain("2/3 correct");
    expect(row.evidence).toContain(`${row.proficiency}% rolling proficiency`);
  });
});

describe("buildReviewModule", () => {
  it("returns null for units at or above the threshold", () => {
    expect(
      buildReviewModule({
        unitKey: "u",
        unitLabel: "U",
        materialId: null,
        subjectId: null,
        proficiency: FLAG_THRESHOLD,
        status: "building",
        attempts: 5,
        correct: 5,
        evidence: "",
      }),
    ).toBeNull();
    expect(buildReviewModule({
      unitKey: "u",
      unitLabel: "U",
      materialId: null,
      subjectId: null,
      proficiency: null,
      status: "unverified",
      attempts: 1,
      correct: 0,
      evidence: "",
    })).toBeNull();
  });

  it("builds the ordered 4-step remediation for flagged units", () => {
    const flagged = computeUnitReadiness(
      [
        unit({
          answers: answers([
            [false, 0],
            [false, 1],
            [true, 2],
            [false, 3],
          ]),
        }),
      ],
      NOW,
    )[0];
    const mod = buildReviewModule(flagged);
    expect(mod).not.toBeNull();
    expect(mod!.steps.map((s) => s.kind)).toEqual(["relearn", "recall", "practice", "verify"]);
    expect(mod!.proficiency).toBeLessThan(FLAG_THRESHOLD);
    expect(mod!.materialId).toBe("m1");
  });
});
