import { describe, it, expect } from "vitest";
import {
  calibration, gapRadar, masterScore, memoryStatus, oracle, dailyBrief,
  beatYourPastSelf, proveIt, rescuePlan, quickMissionPlan, personalBest,
  type IntelInput, type AttemptRecord, type MasteryLike,
} from "./intel";

const DAY = 86400000;
const NOW = 1_800_000_000_000;

function answer(correct: boolean, confidence: "sure" | "probably" | "guess" = "sure") {
  return { correct, confidence };
}

function question(concept: string, difficulty: "easy" | "medium" | "hard" = "easy", type = "definition") {
  return { concept, difficulty, type };
}

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    status: "completed",
    completedAt: NOW - DAY,
    examMode: false,
    examDurationSec: undefined,
    negativeMarking: undefined,
    examTiming: undefined,
    answers: [],
    questions: [],
    ...overrides,
  };
}

function mastery(overrides: Partial<MasteryLike> = {}): MasteryLike {
  return {
    conceptKey: "concept-a",
    conceptLabel: "Concept A",
    materialId: "m1",
    subjectId: null,
    correct: 3,
    attempts: 4,
    lastPracticedAt: NOW - DAY,
    ...overrides,
  };
}

function baseInput(overrides: Partial<IntelInput> = {}): IntelInput {
  return {
    now: NOW,
    mastery: [],
    attempts: [],
    flashcards: [],
    reviews: [],
    mistakes: [],
    exams: [],
    gpa: { currentCgpa: null, targetCgpa: null, projectedCgpa: null },
    studyDays14: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Confidence calibration
// ---------------------------------------------------------------------------

describe("calibration", () => {
  it("returns insufficient verdict under 5 answers", () => {
    const r = calibration([
      attempt({ answers: [answer(true, "sure"), answer(true, "sure")] }),
    ]);
    expect(r.verdict).toBe("insufficient");
    expect(r.total).toBe(2);
  });

  it("detects overconfidence: sure answers landing well below expected", () => {
    const answers = [
      answer(false, "sure"), answer(false, "sure"), answer(false, "sure"),
      answer(true, "sure"), answer(false, "guess"), answer(true, "guess"),
    ];
    const r = calibration([attempt({ answers })]);
    expect(r.verdict).toBe("overconfident");
    expect(r.bands.find((b) => b.key === "sure")!.accuracy).toBe(25);
  });

  it("detects underconfidence: guesses landing unusually high", () => {
    const answers = [
      answer(true, "guess"), answer(true, "guess"), answer(true, "guess"),
      answer(true, "guess"), answer(false, "sure"), answer(true, "sure"),
    ];
    const r = calibration([attempt({ answers })]);
    expect(r.verdict).toBe("underconfident");
  });

  it("returns calibrated when confidence tracks accuracy", () => {
    const answers = [
      answer(true, "sure"), answer(true, "sure"), answer(true, "sure"), answer(false, "sure"),
      answer(false, "guess"), answer(false, "guess"), answer(true, "guess"), answer(false, "guess"),
    ];
    const r = calibration([attempt({ answers })]);
    expect(r.verdict).toBe("calibrated");
  });
});

// ---------------------------------------------------------------------------
// Gap Radar
// ---------------------------------------------------------------------------

describe("gapRadar", () => {
  it("flags a knowledge gap for very low accuracy with attempts", () => {
    const gaps = gapRadar(baseInput({
      mastery: [mastery({ conceptKey: "tcp", conceptLabel: "TCP", correct: 1, attempts: 4 })],
      attempts: [
        attempt({
          questions: [question("TCP"), question("TCP"), question("TCP"), question("TCP")],
          answers: [answer(false), answer(true), answer(false), answer(false)],
        }),
      ],
    }));
    const g = gaps.find((x) => x.type === "knowledge" && x.conceptKey === "tcp");
    expect(g).toBeDefined();
    expect(g!.severity).toBeGreaterThan(50);
  });

  it("detects application gap when theory holds but application fails", () => {
    const questions = [
      question("Recursion", "easy", "definition"),
      question("Recursion", "easy", "definition"),
      question("Recursion", "easy", "definition"),
      question("Recursion", "easy", "application"),
      question("Recursion", "easy", "application"),
    ];
    const answers = [answer(true), answer(true), answer(true), answer(false), answer(false)];
    const gaps = gapRadar(baseInput({
      mastery: [mastery({ conceptKey: "recursion", conceptLabel: "Recursion", correct: 3, attempts: 5 })],
      attempts: [attempt({ questions, answers })],
    }));
    expect(gaps.find((x) => x.type === "application" && x.conceptKey === "recursion")).toBeDefined();
  });

  it("does not flag gaps without real attempt evidence", () => {
    const gaps = gapRadar(baseInput({
      mastery: [mastery({ correct: 0, attempts: 0 })],
    }));
    expect(gaps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Master Score
// ---------------------------------------------------------------------------

describe("masterScore", () => {
  it("returns null values with insufficient evidence and null overall", () => {
    const ms = masterScore(baseInput({}));
    expect(ms.dimensions.find((d) => d.key === "knowledge")!.value).toBeNull();
    expect(ms.overall).toBeNull();
  });

  it("computes knowledge, consistency, and overall when evidence exists", () => {
    const ms = masterScore(baseInput({
      mastery: [mastery({ correct: 3, attempts: 4 })],
      reviews: Array.from({ length: 5 }, (_, i) => ({
        flashcardId: `c${i}`, grade: "good" as const, reviewedAt: NOW - i * 1000,
      })),
      studyDays14: 7,
    }));
    const knowledge = ms.dimensions.find((d) => d.key === "knowledge")!.value;
    expect(knowledge).toBe(75);
    expect(ms.dimensions.find((d) => d.key === "consistency")!.value).toBe(50);
    expect(ms.overall).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Memory status
// ---------------------------------------------------------------------------

describe("memoryStatus", () => {
  it("marks fresh strong practice as stable", () => {
    const rows = memoryStatus(baseInput({
      mastery: [mastery({ correct: 9, attempts: 10, lastPracticedAt: NOW - 2 * DAY })],
    }));
    expect(rows[0].status).toBe("stable");
  });

  it("marks stale practice as at_risk regardless of past accuracy", () => {
    const rows = memoryStatus(baseInput({
      mastery: [mastery({ correct: 9, attempts: 10, lastPracticedAt: NOW - 30 * DAY })],
    }));
    expect(rows[0].status).toBe("at_risk");
    expect(rows[0].daysSincePractice).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

describe("oracle", () => {
  it("stays LOW with no data", () => {
    const o = oracle(baseInput({}));
    expect(o.level).toBe("LOW");
    expect(o.enoughData).toBe(false);
  });

  it("escalates to HIGH with weak concepts, close exam and GPA gap", () => {
    const o = oracle(baseInput({
      mastery: [
        mastery({ conceptKey: "a", conceptLabel: "A", correct: 1, attempts: 4 }),
        mastery({ conceptKey: "b", conceptLabel: "B", correct: 2, attempts: 5 }),
      ],
      mistakes: [{ conceptKey: "a", conceptLabel: "A", category: "conceptual", timesMissed: 3, resolved: false, createdAt: NOW }],
      exams: [{ title: "Midterm", examDate: NOW + 5 * DAY }],
      gpa: { currentCgpa: 2.8, targetCgpa: 3.5, projectedCgpa: 3.0 },
      studyDays14: 2,
    }));
    expect(["HIGH", "CRITICAL"]).toContain(o.level);
    expect(o.reasons.length).toBeGreaterThanOrEqual(3);
    expect(o.action).toContain("Repair");
  });
});

// ---------------------------------------------------------------------------
// Daily brief
// ---------------------------------------------------------------------------

describe("dailyBrief", () => {
  it("returns empty items without data", () => {
    const b = dailyBrief(baseInput({}), null);
    expect(b.biggestRisk.empty).toBe(true);
    expect(b.examPriority.empty).toBe(true);
  });

  it("names the weakest concept as biggest risk", () => {
    const b = dailyBrief(baseInput({
      mastery: [
        mastery({ conceptKey: "x", conceptLabel: "Weak One", correct: 1, attempts: 5 }),
        mastery({ conceptKey: "y", conceptLabel: "Okay One", correct: 8, attempts: 10 }),
      ],
      attempts: [attempt({ answers: Array(5).fill(answer(true)) })],
    }), null);
    expect(b.biggestRisk.value).toBe("Weak One");
    expect(b.biggestRisk.empty).toBe(false);
  });

  it("computes personal best from 5+ answer sessions", () => {
    const attempts = [
      attempt({ answers: [answer(true), answer(true), answer(true), answer(true), answer(false)] }),
      attempt({ answers: Array(6).fill(answer(true)) }),
    ];
    expect(personalBest(attempts)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// YOU vs YOU
// ---------------------------------------------------------------------------

describe("beatYourPastSelf", () => {
  it("reports insufficient data under 4 sessions", () => {
    const r = beatYourPastSelf([attempt({ answers: [answer(true)] })], []);
    expect(r.enoughData).toBe(false);
    expect(r.accuracy).toBeNull();
  });

  it("computes accuracy delta across halves and careless trend", () => {
    const early: AttemptRecord[] = Array.from({ length: 2 }, (_, i) =>
      attempt({
        completedAt: NOW - 10 * DAY + i,
        answers: [answer(true), answer(false), answer(true), answer(false)],
      }));
    const late: AttemptRecord[] = Array.from({ length: 2 }, (_, i) =>
      attempt({
        completedAt: NOW - DAY + i,
        answers: [answer(true), answer(true), answer(true), answer(false)],
      }));
    const r = beatYourPastSelf([...early, ...late], []);
    expect(r.enoughData).toBe(true);
    expect(r.accuracy!.delta).toBeGreaterThan(0);
    expect(r.careless!.delta).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Prove It
// ---------------------------------------------------------------------------

describe("proveIt", () => {
  it("requires all pillars for verified mastery", () => {
    const rows = proveIt(
      baseInput({ mastery: [mastery({ conceptKey: "tcp", conceptLabel: "TCP", correct: 8, attempts: 10 })] }),
      new Map([["tcp", { total: 3, correct: 2 }]]),      // applied ✓
      new Map([["tcp", { total: 3, correct: 2 }]]),      // novel ✓
      new Set(["tcp"]),                                   // recalled ✓
    );
    expect(rows[0].verified).toBe(true);
    expect(rows[0].missing).toHaveLength(0);
  });

  it("lists missing pillars for an unproven concept", () => {
    const rows = proveIt(
      baseInput({ mastery: [mastery({ conceptKey: "os", conceptLabel: "OS", correct: 1, attempts: 2 })] }),
      new Map(), new Map(), new Set(),
    );
    expect(rows[0].verified).toBe(false);
    expect(rows[0].missing.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].missing.some((m) => m.includes("Apply it"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rescue plan + quick mission
// ---------------------------------------------------------------------------

describe("rescuePlan", () => {
  it("produces ordered steps within the time budget and respects pacing", () => {
    const plan = rescuePlan(baseInput({
      mastery: [
        mastery({ conceptKey: "a", conceptLabel: "Alpha", correct: 1, attempts: 5 }),
        mastery({ conceptKey: "b", conceptLabel: "Beta", correct: 2, attempts: 5 }),
      ],
      flashcards: Array.from({ length: 6 }, (_, i) => ({
        conceptKey: "a", dueAt: NOW - i * 1000, lapses: 0, reps: 0,
      })),
      exams: [{ title: "Final", examDate: NOW + 3 * DAY }],
    }), 4);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps[0].kind).toBe("fix_gap"); // prerequisite repair first
    const total = plan.steps.reduce((n, s) => n + s.minutes, 0);
    expect(total).toBeLessThanOrEqual(4 * 60);
    expect(plan.honestNote).toMatch(/sleep|realistic/i);
  });

  it("returns no steps without evidence", () => {
    const plan = rescuePlan(baseInput({}), 3);
    expect(plan.steps).toHaveLength(0);
  });
});

describe("quickMissionPlan", () => {
  it("picks recall sprint when many cards are due", () => {
    const plan = quickMissionPlan(baseInput({
      flashcards: Array.from({ length: 12 }, () => ({
        conceptKey: "x", dueAt: NOW - 1000, lapses: 0, reps: 0,
      })),
    }), 20);
    expect(plan.kind).toBe("review");
  });

  it("targets the weakest concept otherwise", () => {
    const plan = quickMissionPlan(baseInput({
      mastery: [mastery({ conceptKey: "w", conceptLabel: "Weakest", correct: 1, attempts: 4 })],
    }), 20);
    expect(plan.kind).toBe("fix_gap");
    expect(plan.conceptLabel).toBe("Weakest");
  });
});
