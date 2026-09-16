/**
 * KYNEX Grade Path — pure, deterministic math for the question
 * "How do I get a high grade?"
 *
 * Everything here is side-effect free, unit-testable, and honest:
 *  - No grade guarantees. If the target is mathematically out of reach, the
 *    output says so and offers the honest alternative path.
 *  - No invented exam statistics. Impact actions are derived ONLY from the
 *    student's real stored state (weak concepts, mistake patterns, exam date).
 *  - Works on both GPA points and raw percentage marks, using whichever the
 *    student's data provides.
 */

import { round2 } from "./gpaMath";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface GradePathInput {
  /** Current cumulative GPA (null if nothing graded yet). */
  currentCgpa: number | null;
  /** Target cumulative GPA the student set in their profile. */
  targetCgpa: number | null;
  /** Credits already graded. */
  completedCredits: number;
  /** Credits in the current (planned/in-progress) semester. */
  currentCredits: number;
  /** Scale ceiling — pass maxPointFor(scale). */
  maxPoint: number;
  /** Current overall mark percentage, when the student tracks marks (0-100). */
  currentPercent: number | null;
  /** Target overall mark percentage (0-100). */
  targetPercent: number | null;
  /** Percentage weight of assessments already completed (0-100). */
  completedWeight: number;
  /** Days until the nearest exam (null = no exam scheduled). */
  daysToExam: number | null;
  /** Student's real weak concepts (accuracy < 60%, attempts >= 2). */
  weakConcepts: { label: string; accuracy: number }[];
  /** Top repeated mistake categories from the Mistake Bank. */
  topMistakeCategories: { category: string; count: number }[];
}

export interface ImpactAction {
  action: string;
  /** Why this action — always traceable to a real number in the input. */
  evidence: string;
  minutes: number;
}

export interface GradePathResult {
  /** False when there isn't enough data yet to say anything honest. */
  ready: boolean;
  /** Human reason when not ready (e.g. no targets set). */
  notReadyReason?: string;

  currentPosition: string;
  targetPosition: string;
  gap: string;

  /** Required average performance from here — GPA points and/or percent. */
  required: {
    gpa: number | null;
    percent: number | null;
    feasible: boolean;
    explanation: string;
  };

  /** Highest-impact actions, ordered. Derived from real evidence only. */
  impactActions: ImpactAction[];

  /** Risk areas (exam proximity × weak concepts). */
  riskAreas: string[];

  /** What evidence will prove improvement (the verification condition). */
  verification: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Required average percent on the REMAINING assessment weight to land at the
 * target overall percent: required = (target×100 − current×doneW) / (100−doneW).
 * Returns null when there is no remaining weight or the target is already met.
 */
export function requiredRemainingPercent(
  currentPercent: number,
  targetPercent: number,
  completedWeight: number,
): { required: number | null; feasible: boolean; explanation: string } {
  if (completedWeight >= 100) {
    return {
      required: null,
      feasible: currentPercent >= targetPercent,
      explanation:
        "All assessment weight is already completed — the final mark is fixed now.",
    };
  }
  if (targetPercent <= currentPercent) {
    return {
      required: null,
      feasible: true,
      explanation: `You're already at ${round2(currentPercent)}% — at or above your ${round2(targetPercent)}% target. Protect it and aim higher.`,
    };
  }
  const remaining = 100 - completedWeight;
  const required = round2(
    (targetPercent * 100 - currentPercent * completedWeight) / remaining,
  );
  if (required <= 100) {
    return {
      required,
      feasible: true,
      explanation: `Scoring about ${required}% on the remaining ${round2(remaining)}% of assessment weight reaches your ${round2(targetPercent)}% target (you're at ${round2(currentPercent)}% now).`,
    };
  }
  return {
    required,
    feasible: false,
    explanation: `Reaching ${round2(targetPercent)}% would require ${required}% on the remaining ${round2(remaining)}% of weight — above 100%. The honest path is the highest target still reachable; recalculate with a nearer-term goal.`,
  };
}

export function gradePath(input: GradePathInput): GradePathResult {
  const hasTargets =
    input.targetCgpa != null || input.targetPercent != null;
  const hasPosition =
    input.currentCgpa != null || input.currentPercent != null;
  if (!hasTargets || !hasPosition) {
    return {
      ready: false,
      notReadyReason:
        "Set a target GPA or target marks (Twin → goals, or GPA Lab) and record your current standing — then KYNEX can compute your real gap and the required performance.",
      currentPosition: hasPosition ? "recorded" : "unknown",
      targetPosition: hasTargets ? "set" : "not set",
      gap: "—",
      required: {
        gpa: null,
        percent: null,
        feasible: false,
        explanation: "Not computable without a target and a current position.",
      },
      impactActions: [],
      riskAreas: [],
      verification: "—",
    };
  }

  // ---- Required performance (both engines when data allows) ----
  let requiredGpa: number | null = null;
  let gpaFeasible = true;
  let gpaExplanation = "";
  if (input.targetCgpa != null && input.currentCgpa != null) {
    // Inline the credit-weighted identity (same math as requiredSemesterGpa)
    // so this module stays standalone-testable for the marks-only case too.
    const total = input.completedCredits + input.currentCredits;
    if (input.currentCredits > 0 && input.targetCgpa > input.currentCgpa) {
      const req = round2(
        (input.targetCgpa * total - input.currentCgpa * input.completedCredits) /
          input.currentCredits,
      );
      requiredGpa = req;
      if (req <= input.maxPoint) {
        gpaExplanation = `You need approximately ${req} GPA this semester (${input.currentCredits} credits) to reach a ${round2(input.targetCgpa)} CGPA.`;
      } else {
        gpaFeasible = false;
        gpaExplanation = `A ${round2(input.targetCgpa)} CGPA would require ${req} this semester — above the ${input.maxPoint} scale maximum. Consider a nearer-term target; KYNEX won't pretend it's reachable in one step.`;
      }
    } else if (input.targetCgpa <= input.currentCgpa) {
      gpaExplanation = `You're at or above your ${round2(input.targetCgpa)} CGPA target — protect it.`;
    }
  }

  let requiredPercent: number | null = null;
  let pctFeasible = true;
  let pctExplanation = "";
  if (input.targetPercent != null && input.currentPercent != null) {
    const r = requiredRemainingPercent(
      input.currentPercent,
      input.targetPercent,
      input.completedWeight,
    );
    requiredPercent = r.required;
    pctFeasible = r.feasible;
    pctExplanation = r.explanation;
  }

  const feasible =
    (requiredGpa === null || gpaFeasible) &&
    (requiredPercent === null || pctFeasible);

  const explanationParts = [gpaExplanation, pctExplanation].filter(Boolean);
  const explanation =
    explanationParts.length > 0
      ? explanationParts.join(" ")
      : "Add courses/assessments with weights or credits to compute the required performance.";

  // ---- Impact actions from real evidence, ordered ----
  const actions: ImpactAction[] = [];
  if (input.weakConcepts.length > 0) {
    const worst = input.weakConcepts[0];
    actions.push({
      action: `Fix your weakest concept first: "${worst.label}"`,
      evidence: `Current accuracy ${worst.accuracy}% — below the 60% mastery floor.`,
      minutes: 18,
    });
    if (input.weakConcepts.length > 1) {
      actions.push({
        action: `Work through the remaining ${input.weakConcepts.length - 1} weak concept${input.weakConcepts.length === 2 ? "" : "s"} one mission at a time`,
        evidence: `${input.weakConcepts.length} concepts are under 60% accuracy in your practice history.`,
        minutes: 15,
      });
    }
  }
  if (input.topMistakeCategories.length > 0) {
    const top = input.topMistakeCategories[0];
    actions.push({
      action: `Drill your dominant error type: ${top.category.replace(/_/g, " ")}`,
      evidence: `${top.count} mistake${top.count === 1 ? "" : "s"} of this type recorded in your Mistake Bank.`,
      minutes: 12,
    });
  }
  if (input.daysToExam != null && input.daysToExam <= 14) {
    actions.push({
      action:
        input.daysToExam <= 3
          ? "Run an exam-mode mock under timed conditions"
          : "Prioritize exam-mode practice on high-risk topics",
      evidence: `Nearest exam is ${input.daysToExam} day${input.daysToExam === 1 ? "" : "s"} away.`,
      minutes: 25,
    });
  }
  if (actions.length === 0) {
    actions.push({
      action: "No urgent bottleneck detected — extend mastery on your newest material",
      evidence: "No concepts below the 60% floor and no repeated error pattern.",
      minutes: 20,
    });
  }

  // ---- Risk areas: exam proximity × weakness ----
  const riskAreas: string[] = [];
  if (input.daysToExam != null) {
    for (const w of input.weakConcepts.slice(0, 3)) {
      riskAreas.push(
        `${w.label} — ${w.accuracy}% accuracy with the exam in ${input.daysToExam} day${input.daysToExam === 1 ? "" : "s"}`,
      );
    }
  }

  // ---- Verification condition (honest, evidence-based) ----
  const verifyParts: string[] = [];
  if (input.weakConcepts.length > 0) {
    verifyParts.push(
      `every listed weak concept reaches ≥85% accuracy across ≥3 fresh questions`,
    );
  }
  if (requiredGpa !== null && gpaFeasible) {
    verifyParts.push(`your GPA Lab projection crosses ${round2(input.targetCgpa!)}`);
  }
  if (requiredPercent !== null && pctFeasible && requiredPercent !== null) {
    verifyParts.push(`a scored assessment lands at or above ${requiredPercent}%`);
  }
  const verification =
    verifyParts.length > 0
      ? `You'll see proof of improvement when ${verifyParts.join(" and ")}. KYNEX tracks this automatically — no self-reporting.`
      : "Add practice evidence and KYNEX will define the exact verification condition for you.";

  const gapParts: string[] = [];
  if (input.targetCgpa != null && input.currentCgpa != null) {
    const d = round2(input.targetCgpa - input.currentCgpa);
    gapParts.push(
      d <= 0
        ? `${Math.abs(d)} above target CGPA`
        : `${d} CGPA points to close`,
    );
  }
  if (input.targetPercent != null && input.currentPercent != null) {
    const d = round2(input.targetPercent - input.currentPercent);
    gapParts.push(
      d <= 0 ? `${Math.abs(d)}% above target marks` : `${d}% to close`,
    );
  }

  return {
    ready: true,
    currentPosition:
      input.currentCgpa != null && input.currentPercent != null
        ? `CGPA ${round2(input.currentCgpa)} · ${round2(input.currentPercent)}%`
        : input.currentCgpa != null
          ? `CGPA ${round2(input.currentCgpa)}`
          : `${round2(input.currentPercent!)}%`,
    targetPosition:
      input.targetCgpa != null && input.targetPercent != null
        ? `CGPA ${round2(input.targetCgpa)} · ${round2(input.targetPercent)}%`
        : input.targetCgpa != null
          ? `CGPA ${round2(input.targetCgpa)}`
          : `${round2(input.targetPercent!)}%`,
    gap: gapParts.length > 0 ? gapParts.join(" · ") : "—",
    required: {
      gpa: requiredGpa,
      percent: requiredPercent,
      feasible,
      explanation,
    },
    impactActions: actions,
    riskAreas,
    verification,
  };
}
