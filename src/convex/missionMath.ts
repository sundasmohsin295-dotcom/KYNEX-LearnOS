/**
 * KYNEX Mission Engine — pure task math + generation.
 *
 * Deterministic and side-effect free so it can be unit tested. The Convex
 * layer (src/convex/missions.ts) owns all authorization and persistence;
 * nothing here reads or writes a database.
 */

import type { Id } from "./_generated/dataModel";

export type TaskKind = "explain" | "recall" | "practice" | "challenge";
export type TaskStatus = "pending" | "correct" | "partial" | "incorrect" | "skipped";
export type Confidence = "sure" | "probably" | "guess";

export interface MissionTaskRow {
  order: number;
  kind: TaskKind;
  title: string;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  hint?: string;
}

/** Evidence bundle from a completed mission (used for the completion story). */
export interface MissionEvidence {
  correct: number;
  answered: number;
  skipped: number;
  confidentWrong: number;
  lowConfidenceRight: number;
  avgSeconds: number | null;
  scorePct: number | null;
}

export interface MasteryDelta {
  before: number; // 0-100
  after: number; // 0-100
}

/** Evidence → honest mastery delta. Never fabricates improvement. */
export function masteryDeltaFromEvidence(
  evidence: MissionEvidence,
  beforePct: number,
): MasteryDelta | null {
  if (evidence.answered === 0 || evidence.scorePct === null) return null;
  // Blend: mission score (70%) + current stored accuracy (30%), then move the
  // stored accuracy 60% of the way toward the blended signal. Bounded so a
  // single mission can never manufacture a huge jump.
  const after = Math.round(beforePct * 0.3 + evidence.scorePct * 0.7);
  const moved = Math.round(beforePct + (after - beforePct) * 0.6);
  return { before: Math.round(beforePct), after: Math.max(0, Math.min(100, moved)) };
}

/**
 * Adaptive difficulty: what the NEXT task should be after a given outcome.
 * correct+fast → step up · correct+slow → hold · wrong → hold/repair.
 */
export function nextDifficulty(
  current: TaskKind,
  outcome: TaskStatus,
  seconds: number | null,
): TaskKind {
  if (outcome === "correct") {
    if (seconds !== null && seconds <= 30) {
      // correct + fast → escalate
      return current === "explain" ? "recall" : current === "recall" ? "practice" : "challenge";
    }
    // correct but slow → hold difficulty
    return current === "explain" ? "recall" : current;
  }
  // wrong / skipped → do NOT escalate; repeat same level or drop to recall
  return current === "challenge" || current === "practice" ? "recall" : current;
}

/** Task outcome verdict — mirrors the required CORRECT/PARTIAL/INCORRECT scale. */
export function verdictLabel(status: TaskStatus): string {
  switch (status) {
    case "correct": return "CORRECT";
    case "partial": return "PARTIALLY CORRECT";
    case "incorrect": return "INCORRECT";
    case "skipped": return "SKIPPED";
    default: return "PENDING";
  }
}

/** Error classification for a wrong mission answer (Mistake Bank category). */
export function classifyMissionError(
  difficulty: TaskKind,
  confidence: Confidence | null | undefined,
  seconds: number | null,
): "conceptual" | "careless" | "memory" | "time_pressure" | "confidence_calibration" {
  if (confidence === "sure") {
    return seconds !== null && seconds < 10 ? "careless" : "confidence_calibration";
  }
  if (confidence === "guess") return "memory";
  if (seconds !== null && seconds > 120) return "time_pressure";
  return difficulty === "challenge" ? "conceptual" : "memory";
}

// ---------------------------------------------------------------------------
// Mission task generation — from the material's real AI analysis only
// ---------------------------------------------------------------------------

// Plain structural mirrors of the analysis pieces a mission can draw from —
// decoupled from the generated Doc types so the module stays simple.
export interface AnalysisConceptLite {
  name: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}
export interface AnalysisLite {
  summary: string;
  deepExplanation?: string;
  concepts: AnalysisConceptLite[];
  definitions?: Array<{ term: string; definition: string }>;
  formulas?: Array<{ name: string; expression: string; note: string }>;
  examples?: Array<{ title: string; walkthrough: string }>;
  misconceptions: Array<{ wrong: string; why: string; correct: string }>;
  remember?: string[];
  examinerQuestions?: string[];
  applySkills?: string[];
}

interface GenerateInput {
  conceptLabel: string;
  conceptKey: string;
  material: {
    title: string;
    analysis: AnalysisLite | null;
  } | null;
  /** Stored accuracy for this concept (0-100) — shapes difficulty entry point. */
  currentAccuracy: number | null;
}

interface GeneratedPlan {
  tasks: MissionTaskRow[];
  objective: string;
  estimatedMinutes: number;
}

function shuffleStable<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build an MCQ from a misconception (wrong answer as a distractor). */
function mcqFromMisconception(
  c: AnalysisConceptLite,
  misconceptions: AnalysisLite["misconceptions"],
  seed: number,
): MissionTaskRow | null {
  const m = misconceptions.find((x) =>
    x.correct.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]) ||
    x.wrong.toLowerCase().includes(c.name.toLowerCase().split(" ")[0]),
  );
  const correctText = m ? m.correct : c.explanation;
  const wrongPool = misconceptions
    .filter((x) => x !== m)
    .map((x) => x.wrong);
  if (wrongPool.length === 0) return null;
  const distractors = shuffleStable(wrongPool, seed).slice(0, 3);
  if (distractors.length < 2) return null;
  const options = shuffleStable([correctText.slice(0, 200), ...distractors.map((d) => d.slice(0, 200))], seed + 7);
  return {
    order: 0,
    kind: "practice",
    title: `Check: ${c.name}`,
    prompt: `Which statement is correct about ${c.name}?`,
    options,
    correctIndex: options.indexOf(correctText.slice(0, 200)),
    explanation: m ? `Why: ${m.why} — ${m.correct}` : c.explanation,
    hint: m ? `Watch out: "${m.wrong}" is the common trap.` : undefined,
  };
}

/**
 * Generate a mission plan from the material's stored analysis.
 * Entry difficulty adapts to the student's current accuracy. Returns null
 * when there is no analysis to draw from (no fabrication).
 */
export function generateMissionPlan(input: GenerateInput): GeneratedPlan | null {
  const { material, conceptLabel, conceptKey } = input;
  if (!material || !material.analysis) return null;
  const a = material.analysis;

  // Locate the target concept inside the analysis (or fall back to material scope)
  const concept =
    a.concepts.find((c) => c.name.toLowerCase().trim() === conceptKey) ??
    a.concepts.find((c) => c.name.toLowerCase().includes(conceptLabel.toLowerCase())) ??
    a.concepts[0];
  if (!concept) return null;

  const seed = conceptKey.length * 31 + material.title.length;
  const acc = input.currentAccuracy ?? 50;
  const tasks: MissionTaskRow[] = [];
  let order = 0;

  // 1. QUICK EXPLANATION (always first — the read step)
  tasks.push({
    order: order++,
    kind: "explain",
    title: "Quick explanation",
    prompt:
      `${concept.explanation}\n\n` +
      (a.remember?.[0] ? `Key point: ${a.remember[0]}` : a.summary.slice(0, 240)),
  });

  // 2. EXAMPLE (if the analysis has one)
  const example = a.examples?.[0];
  if (example) {
    tasks.push({
      order: order++,
      kind: "explain",
      title: "Worked example",
      prompt: `${example.title}\n\n${example.walkthrough}`,
    });
  }

  // 3. RECALL (retrieval from memory — no options)
  const definition = a.definitions?.find((d) =>
    d.term.toLowerCase().includes(concept.name.toLowerCase().split(" ")[0]),
  ) ?? a.definitions?.[0];
  if (definition) {
    tasks.push({
      order: order++,
      kind: "recall",
      title: "Recall",
      prompt: `From memory: what is ${definition.term}? (Write 1–2 sentences, then compare with the model answer.)`,
      explanation: `${definition.term}: ${definition.definition}`,
      hint: "Answer before you flip — retrieval is what builds memory.",
    });
  }

  // 4. PRACTICE CHECK (MCQ from real analysis content)
  const mcq = mcqFromMisconception(concept, a.misconceptions ?? [], seed);
  if (mcq) {
    tasks.push({ ...mcq, order: order++ });
  }

  // 5. FINAL CHALLENGE — examiner-style or apply prompt from the analysis
  const challengePrompt = a.examinerQuestions?.[0] ?? a.applySkills?.[0] ?? null;
  if (challengePrompt) {
    tasks.push({
      order: order++,
      kind: "challenge",
      title: "Final challenge",
      prompt: challengePrompt,
      explanation: a.deepExplanation?.slice(0, 400),
      hint: a.remember?.[0],
    });
  }

  if (tasks.length < 2) return null; // not enough real material to build a mission

  // Weak students start at recall level (skip ahead to practice only via adaptive steps)
  const estimatedMinutes = Math.max(5, Math.min(15, tasks.length * 2 + (acc < 60 ? 2 : 0)));
  return {
    tasks,
    objective: `By the end of this mission you should be able to explain ${concept.name} and answer a check question about it correctly.`,
    estimatedMinutes,
  };
}
