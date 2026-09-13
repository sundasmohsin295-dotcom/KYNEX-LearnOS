import { describe, it, expect } from "vitest";
import {
  masteryDeltaFromEvidence, nextDifficulty, verdictLabel, classifyMissionError,
  generateMissionPlan,
  type MissionEvidence,
  type AnalysisLite,
} from "./missionMath";

const baseEvidence = (over: Partial<MissionEvidence> = {}): MissionEvidence => ({
  correct: 3,
  answered: 4,
  skipped: 0,
  confidentWrong: 0,
  lowConfidenceRight: 0,
  avgSeconds: 25,
  scorePct: 75,
  ...over,
});

const analysis: AnalysisLite = {
  summary: "Binary search trees keep keys ordered for fast lookup.",
  concepts: [
    { name: "Tree Traversal", explanation: "Visiting every node in a defined order.", difficulty: "medium" },
    { name: "Inorder Traversal", explanation: "Left, node, right — yields sorted output for a BST.", difficulty: "hard" },
  ],
  definitions: [{ term: "Traversal", definition: "A systematic visit of every node in a tree." }],
  examples: [{ title: "Inorder walk of a small BST", walkthrough: "1 → 2 → 3 produced sorted output." }],
  misconceptions: [
    { wrong: "Preorder gives sorted output", why: "Confuses visit order", correct: "Inorder gives sorted output for a BST" },
    { wrong: "Traversal mutates the tree", why: "Confuses read with write", correct: "Traversal reads without changing structure" },
    { wrong: "Level order is depth-first", why: "Mixes families", correct: "Level order is breadth-first" },
  ],
  remember: ["Inorder = sorted for BST"],
  examinerQuestions: ["Explain why inorder yields sorted output on a BST."],
};

describe("masteryDeltaFromEvidence", () => {
  it("moves mastery toward the blended score without fabricating jumps", () => {
    const d = masteryDeltaFromEvidence(baseEvidence({ scorePct: 100 }), 54);
    expect(d).not.toBeNull();
    expect(d!.before).toBe(54);
    // blended = 54*0.3 + 100*0.7 = 85.2 → 85; moved 60% of the gap: 54 + 0.6*31 = 72.6 → 73
    expect(d!.after).toBe(73);
    expect(d!.after).toBeGreaterThan(d!.before);
  });

  it("lowers mastery after a poor mission (honest, not always positive)", () => {
    const d = masteryDeltaFromEvidence(baseEvidence({ scorePct: 25, correct: 1, answered: 4 }), 70);
    expect(d!.after).toBeLessThan(d!.before);
  });

  it("returns null when nothing was answered", () => {
    expect(masteryDeltaFromEvidence(baseEvidence({ answered: 0, scorePct: null }), 50)).toBeNull();
  });
});

describe("nextDifficulty (adaptive)", () => {
  it("escalates after a correct fast answer", () => {
    expect(nextDifficulty("recall", "correct", 12)).toBe("practice");
    expect(nextDifficulty("practice", "correct", 20)).toBe("challenge");
  });

  it("holds difficulty after a correct but slow answer", () => {
    expect(nextDifficulty("practice", "correct", 90)).toBe("practice");
  });

  it("repairs (drops to recall) after a wrong answer", () => {
    expect(nextDifficulty("challenge", "incorrect", 40)).toBe("recall");
    expect(nextDifficulty("practice", "incorrect", 40)).toBe("recall");
  });
});

describe("verdict + error classification", () => {
  it("maps statuses to honest verdict labels", () => {
    expect(verdictLabel("correct")).toBe("CORRECT");
    expect(verdictLabel("partial")).toBe("PARTIALLY CORRECT");
    expect(verdictLabel("incorrect")).toBe("INCORRECT");
    expect(verdictLabel("skipped")).toBe("SKIPPED");
  });

  it("classifies confident-but-slow errors as calibration issues", () => {
    expect(classifyMissionError("practice", "sure", 60)).toBe("confidence_calibration");
  });

  it("classifies rushed confident errors as careless", () => {
    expect(classifyMissionError("practice", "sure", 5)).toBe("careless");
  });

  it("classifies guesses as memory errors", () => {
    expect(classifyMissionError("recall", "guess", 20)).toBe("memory");
  });
});

describe("generateMissionPlan", () => {
  it("builds a structured plan from real analysis content", () => {
    const plan = generateMissionPlan({
      conceptKey: "tree traversal",
      conceptLabel: "Tree Traversal",
      material: { title: "BST Chapter", analysis },
      currentAccuracy: 54,
    });
    expect(plan).not.toBeNull();
    expect(plan!.tasks.length).toBeGreaterThanOrEqual(4);
    expect(plan!.tasks[0].kind).toBe("explain"); // quick explanation first
    expect(plan!.tasks.some((t) => t.kind === "recall")).toBe(true);
    expect(plan!.tasks.some((t) => t.kind === "practice")).toBe(true);
    expect(plan!.tasks[plan!.tasks.length - 1].kind).toBe("challenge");
    // MCQ derived from real misconception content: the correct option is the
    // matched misconception's corrected statement (its trap mentions the concept).
    const mcq = plan!.tasks.find((t) => t.kind === "practice")!;
    expect(mcq.options!.length).toBeGreaterThanOrEqual(3);
    expect(mcq.options![mcq.correctIndex!]).toMatch(/Traversal reads/);
    expect(mcq.explanation).toMatch(/Why:/);
  });

  it("returns null with no analysis (never fabricates)", () => {
    const plan = generateMissionPlan({
      conceptKey: "x", conceptLabel: "X",
      material: { title: "Empty", analysis: null },
      currentAccuracy: null,
    });
    expect(plan).toBeNull();
  });
});
