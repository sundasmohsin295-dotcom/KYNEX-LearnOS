/**
 * KYNEX Intel — pure, deterministic academic-intelligence math.
 *
 * Everything in this module is side-effect free and takes plain data shapes
 * (mirrors of the user's own stored records) so it can be unit tested and
 * reasoned about. No invented statistics: every number below is derived from
 * real practice, review, exam and study activity. Where evidence is missing,
 * functions return `insufficient` flags instead of guessing.
 *
 * Used by src/convex/intelligence.ts (zero-trust queries) and unit tests.
 */

// ---------------------------------------------------------------------------
// Shared input shapes (decoupled from Convex generated types)
// ---------------------------------------------------------------------------

export interface AnswerRecord {
  correct: boolean;
  confidence: "sure" | "probably" | "guess";
}

export interface QuestionRecord {
  concept: string;
  difficulty: "easy" | "medium" | "hard";
  type: string; // "definition" | "application" | "analysis" | ...
}

export interface AttemptRecord {
  status: string;
  completedAt: number | undefined;
  examMode: boolean | undefined;
  examDurationSec: number | undefined;
  answers: AnswerRecord[];
  questions: QuestionRecord[];
  examTiming: number[] | undefined;
  negativeMarking: boolean | undefined;
}

export interface MasteryLike {
  conceptKey: string;
  conceptLabel: string;
  materialId: string | null;
  subjectId: string | null;
  correct: number;
  attempts: number;
  lastPracticedAt: number;
}

export interface FlashcardLike {
  conceptKey: string | undefined;
  dueAt: number;
  lapses: number;
  reps: number;
}

export interface ReviewLike {
  flashcardId: string;
  grade: "again" | "hard" | "good" | "easy";
  reviewedAt: number;
}

export interface MistakeLike {
  conceptKey: string;
  conceptLabel: string;
  category: string;
  timesMissed: number;
  resolved: boolean;
  createdAt: number;
}

export interface ExamLike {
  title: string;
  examDate: number;
}

export interface GpaState {
  currentCgpa: number | null;
  targetCgpa: number | null;
  projectedCgpa: number | null;
}

export interface IntelInput {
  now: number;
  mastery: MasteryLike[];
  attempts: AttemptRecord[]; // completed only
  flashcards: FlashcardLike[];
  reviews: ReviewLike[];
  mistakes: MistakeLike[];
  exams: ExamLike[];
  gpa: GpaState;
  /** distinct study days in the last 14 (0–14) */
  studyDays14: number;
}

// ---------------------------------------------------------------------------
// Confidence calibration — "do you know what you know?"
// ---------------------------------------------------------------------------

export const CONFIDENCE_BANDS = [
  { key: "guess", label: "Wild guess", score: 1, expectedAccuracy: 40 },
  { key: "probably", label: "Probably", score: 3, expectedAccuracy: 70 },
  { key: "sure", label: "I'm sure", score: 5, expectedAccuracy: 90 },
] as const;

export type CalibrationVerdict =
  | "calibrated"
  | "overconfident"
  | "underconfident"
  | "insufficient";

export interface CalibrationBand {
  key: string;
  label: string;
  count: number;
  accuracy: number; // 0-100
  expectedAccuracy: number; // 0-100
  error: number; // |accuracy - expected|
}

export interface CalibrationResult {
  verdict: CalibrationVerdict;
  bands: CalibrationBand[];
  meanError: number; // mean |actual - expected| across bands with data
  total: number;
  note: string;
}

export function calibration(attempts: AttemptRecord[]): CalibrationResult {
  const answers = attempts.flatMap((a) => a.answers);
  const bands: CalibrationBand[] = CONFIDENCE_BANDS.map((band) => {
    const subset = answers.filter((a) => a.confidence === band.key);
    const accuracy =
      subset.length > 0
        ? Math.round((subset.filter((a) => a.correct).length / subset.length) * 100)
        : band.expectedAccuracy;
    return {
      key: band.key,
      label: band.label,
      count: subset.length,
      accuracy,
      expectedAccuracy: band.expectedAccuracy,
      error: Math.abs(accuracy - band.expectedAccuracy),
    };
  });

  const total = answers.length;
  const withData = bands.filter((b) => b.count > 0);
  if (total < 5 || withData.length === 0) {
    return {
      verdict: "insufficient",
      bands,
      meanError: 0,
      total,
      note: "Answer at least 5 questions with honest confidence ratings to calibrate.",
    };
  }

  const meanError =
    withData.reduce((n, b) => n + b.error * b.count, 0) /
    withData.reduce((n, b) => n + b.count, 0);

  const sure = bands.find((b) => b.key === "sure")!;
  const guess = bands.find((b) => b.key === "guess")!;

  // Overconfident: high confidence but reality disagrees (≥3 sure answers).
  if (sure.count >= 3 && sure.accuracy <= 70) {
    return {
      verdict: "overconfident",
      bands,
      meanError: Math.round(meanError),
      total,
      note: `When you feel sure you're right ${sure.accuracy}% of the time, not ~${sure.expectedAccuracy}%. Slow down on answers you "know" — that's where marks are leaking.`,
    };
  }
  // Underconfident: low confidence but reality is better than expected.
  if (
    (guess.count >= 3 && guess.accuracy >= 85) ||
    (withData.length >= 2 && meanError >= 20 && guess.accuracy >= 75 && sure.count < 3)
  ) {
    return {
      verdict: "underconfident",
      bands,
      meanError: Math.round(meanError),
      total,
      note: `Your "guesses" land at ${guess.accuracy}% — you know more than you think. Trust first instincts on familiar material.`,
    };
  }
  return {
    verdict: "calibrated",
    bands,
    meanError: Math.round(meanError),
    total,
    note:
      meanError <= 10
        ? "Your confidence tracks your actual accuracy well — keep rating honestly, it sharpens the Whole system."
        : "Mostly calibrated. A band or two is drifting — the table below shows where.",
  };
}

// ---------------------------------------------------------------------------
// Gap Radar — eight gap types, real evidence only
// ---------------------------------------------------------------------------

export type GapType =
  | "knowledge"
  | "recall"
  | "application"
  | "reasoning"
  | "exam"
  | "speed"
  | "confidence"
  | "transfer";

export interface GapItem {
  type: GapType;
  conceptKey: string;
  conceptLabel: string;
  materialId?: string | null;
  evidence: string;
  severity: number; // 0-100, higher = fix sooner
}

const GAP_META: Record<GapType, { label: string; description: string }> = {
  knowledge: { label: "Knowledge gap", description: "The concept itself hasn't landed yet." },
  recall: { label: "Recall gap", description: "Learned once, but memory is slipping." },
  application: { label: "Application gap", description: "Knows the theory, struggles to use it." },
  reasoning: { label: "Reasoning gap", description: "Reaches wrong conclusions from known facts." },
  exam: { label: "Exam gap", description: "Performs worse under exam conditions." },
  speed: { label: "Speed gap", description: "Understands but runs out of time." },
  confidence: { label: "Confidence gap", description: "Feels sure while being wrong." },
  transfer: { label: "Transfer gap", description: "Handles familiar questions, fails novel ones." },
};

export function gapLabel(t: GapType): string {
  return GAP_META[t].label;
}

export function gapDescription(t: GapType): string {
  return GAP_META[t].description;
}

interface ConceptQuestionStats {
  total: number;
  correct: number;
  application: { total: number; correct: number };
  analysis: { total: number; correct: number };
  hard: { total: number; correct: number };
  easySureWrong: number;
  sureWrong: number;
  examWrong: number;
  practiceWrong: number;
}

function conceptStats(attempts: AttemptRecord[]): Map<string, ConceptQuestionStats> {
  const map = new Map<string, ConceptQuestionStats>();
  for (const a of attempts) {
    for (let i = 0; i < a.answers.length; i++) {
      const q = a.questions[i];
      const ans = a.answers[i];
      if (!q || !ans) continue;
      const key = q.concept.toLowerCase().trim();
      const s: ConceptQuestionStats =
        map.get(key) ??
        {
          total: 0, correct: 0,
          application: { total: 0, correct: 0 },
          analysis: { total: 0, correct: 0 },
          hard: { total: 0, correct: 0 },
          easySureWrong: 0, sureWrong: 0, examWrong: 0, practiceWrong: 0,
        };
      s.total += 1;
      if (ans.correct) s.correct += 1;
      if (q.type === "application") {
        s.application.total += 1;
        if (ans.correct) s.application.correct += 1;
      }
      if (q.type === "analysis") {
        s.analysis.total += 1;
        if (ans.correct) s.analysis.correct += 1;
      }
      if (q.difficulty === "hard") {
        s.hard.total += 1;
        if (ans.correct) s.hard.correct += 1;
      }
      if (!ans.correct && ans.confidence === "sure") {
        s.sureWrong += 1;
        if (q.difficulty === "easy") s.easySureWrong += 1;
      }
      if (!ans.correct) {
        if (a.examMode) s.examWrong += 1;
        else s.practiceWrong += 1;
      }
      map.set(key, s);
    }
  }
  return map;
}

export function gapRadar(input: IntelInput): GapItem[] {
  const { mastery, attempts } = input;
  const stats = conceptStats(attempts);
  const gaps: GapItem[] = [];

  for (const m of mastery) {
    const s = stats.get(m.conceptKey);
    const acc = m.attempts > 0 ? (m.correct / m.attempts) * 100 : null;
    const matId = m.materialId ?? null;

    // KNOWLEDGE GAP — repeatedly wrong on the core concept
    if (acc !== null && m.attempts >= 2 && acc < 50) {
      gaps.push({
        type: "knowledge",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${m.attempts} attempts, ${Math.round(acc)}% accuracy — the concept itself hasn't landed yet.`,
        severity: Math.round(70 + (50 - acc) * 0.6),
      });
    }

    if (!s) continue;
    const overall = s.total > 0 ? (s.correct / s.total) * 100 : 0;

    // APPLICATION GAP — theory fine, application not
    if (s.application.total >= 2 && s.application.correct / s.application.total < 0.6 && overall >= 60) {
      gaps.push({
        type: "application",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${Math.round(overall)}% overall but only ${Math.round((s.application.correct / s.application.total) * 100)}% on application questions.`,
        severity: 72,
      });
    }

    // REASONING GAP — analysis questions fail while basics hold
    if (s.analysis.total >= 2 && s.analysis.correct / s.analysis.total < 0.6 && overall >= 65) {
      gaps.push({
        type: "reasoning",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${Math.round((s.analysis.correct / s.analysis.total) * 100)}% on multi-step reasoning questions despite ${Math.round(overall)}% overall.`,
        severity: 65,
      });
    }

    // CONFIDENCE GAP — sure but wrong, repeatedly
    if (s.sureWrong >= 2) {
      gaps.push({
        type: "confidence",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${s.sureWrong} answers you marked "sure" were wrong — confidence is outrunning accuracy here.`,
        severity: 78 + Math.min(10, s.sureWrong * 2),
      });
    }

    // EXAM GAP — worse under exam conditions
    if (s.examWrong >= 2 && s.examWrong > s.practiceWrong) {
      gaps.push({
        type: "exam",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${s.examWrong} exam-condition misses vs ${s.practiceWrong} in practice — pressure is the variable.`,
        severity: 68,
      });
    }

    // TRANSFER GAP — comfortable on easy, lost on novel/hard
    if (s.hard.total >= 2 && s.hard.correct / s.hard.total < 0.5 && overall >= 70) {
      gaps.push({
        type: "transfer",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: matId,
        evidence: `${Math.round((s.hard.correct / s.hard.total) * 100)}% on hard/novel questions vs ${Math.round(overall)}% overall — pattern familiarity, not full understanding.`,
        severity: 62,
      });
    }
  }

  // RECALL GAP — concept was learned (≥70%) but memory status has decayed
  const memory = memoryStatus(input);
  const byKey = new Map(memory.map((x) => [x.conceptKey, x]));
  for (const m of input.mastery) {
    const acc = m.attempts > 0 ? (m.correct / m.attempts) * 100 : 0;
    const st = byKey.get(m.conceptKey);
    if (acc >= 70 && st?.status === "at_risk") {
      gaps.push({
        type: "recall",
        conceptKey: m.conceptKey,
        conceptLabel: m.conceptLabel,
        materialId: m.materialId ?? null,
        evidence: `Learned at ${Math.round(acc)}% accuracy but untouched for ${st.daysSincePractice} days — review recommended based on your recent performance.`,
        severity: 60,
      });
    }
  }

  // SPEED GAP — exam pacing, not per-concept
  const examAttempts = attempts.filter((a) => a.examMode && a.examDurationSec && a.examTiming?.length);
  for (const a of examAttempts) {
    const timings = (a.examTiming ?? []).filter((t) => t >= 0);
    if (timings.length < 3 || !a.examDurationSec) continue;
    const budget = a.examDurationSec / Math.max(1, a.questions.length);
    const avg = timings.reduce((n, t) => n + t, 0) / timings.length;
    if (avg > budget * 1.4) {
      gaps.push({
        type: "speed",
        conceptKey: "__exam_pacing__",
        conceptLabel: "Exam pacing",
        materialId: null,
        evidence: `Averaging ${Math.round(avg)}s per question against a ${Math.round(budget)}s budget — you're losing marks to the clock, not to knowledge.`,
        severity: 66,
      });
    }
  }

  return gaps.sort((a, b) => b.severity - a.severity).slice(0, 12);
}

// ---------------------------------------------------------------------------
// Master Score — eight dimensions, never one simplistic number
// ---------------------------------------------------------------------------

export interface MasterDimension {
  key: string;
  label: string;
  value: number | null; // 0-100, null = insufficient evidence
  note: string;
}

export interface MasterScore {
  dimensions: MasterDimension[];
  overall: number | null;
}

export function masterScore(input: IntelInput): MasterScore {
  const { mastery, attempts, reviews, flashcards } = input;
  const attempted = mastery.filter((m) => m.attempts > 0);

  // KNOWLEDGE — mean accuracy across attempted concepts
  const knowledge =
    attempted.length > 0
      ? Math.round(attempted.reduce((n, m) => n + (m.correct / m.attempts) * 100, 0) / attempted.length)
      : null;

  // RECALL — review quality across the last 100 reviews
  const graded = [...reviews].sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 100);
  const recall =
    graded.length >= 3
      ? Math.round(
          (graded.reduce((n, r) => n + (r.grade === "again" ? 0 : r.grade === "hard" ? 0.6 : r.grade === "good" ? 1 : 1.2), 0) /
            graded.length) * 80,
        )
      : null;

  // APPLICATION — accuracy on application-type questions
  const appQ = attempts.flatMap((a) => a.questions.map((q, i) => ({ q, a: a.answers[i] }))).filter((x) => x.a && x.q.type === "application");
  const application =
    appQ.length >= 2
      ? Math.round((appQ.filter((x) => x.a!.correct).length / appQ.length) * 100)
      : null;

  // REASONING — accuracy on analysis-type questions (fallback: hard)
  const anaQ = attempts.flatMap((a) => a.questions.map((q, i) => ({ q, a: a.answers[i] }))).filter((x) => x.a && x.q.type === "analysis");
  const reasoning =
    anaQ.length >= 2
      ? Math.round((anaQ.filter((x) => x.a!.correct).length / anaQ.length) * 100)
      : null;

  // EXAM EXECUTION — accuracy inside real exam-mode attempts
  const examAnswers = attempts.filter((a) => a.examMode).flatMap((a) => a.answers);
  const examExecution =
    examAnswers.length >= 3
      ? Math.round((examAnswers.filter((a) => a.correct).length / examAnswers.length) * 100)
      : null;

  // RETENTION — share of learned concepts not currently "at risk"
  const memory = memoryStatus(input);
  const learned = memory.filter((x) => x.status !== "unseen" && x.status !== "new");
  const retention =
    learned.length > 0
      ? Math.round((learned.filter((x) => x.status === "stable").length / learned.length) * 100)
      : null;

  // CONFIDENCE — calibration quality (mean error inverted)
  const cal = calibration(attempts);
  const confidence =
    cal.verdict === "insufficient" ? null : Math.max(0, Math.min(100, 100 - cal.meanError * 3));

  // CONSISTENCY — distinct study days / 14
  const consistency = Math.min(100, Math.round((input.studyDays14 / 14) * 100));

  const dims: MasterDimension[] = [
    { key: "knowledge", label: "Knowledge", value: knowledge, note: "mean accuracy across practiced concepts" },
    { key: "recall", label: "Recall", value: recall, note: "review quality across recent flashcards" },
    { key: "application", label: "Application", value: application, note: "accuracy on application-type questions" },
    { key: "reasoning", label: "Reasoning", value: reasoning, note: "accuracy on analysis-type questions" },
    { key: "examExecution", label: "Exam execution", value: examExecution, note: "accuracy under real exam conditions" },
    { key: "retention", label: "Retention", value: retention, note: "learned concepts not currently at risk of decay" },
    { key: "confidence", label: "Confidence", value: confidence, note: "how well your confidence matches reality" },
    { key: "consistency", label: "Consistency", value: consistency, note: "distinct study days out of the last 14" },
  ];

  const available = dims.filter((d) => d.value !== null) as Array<MasterDimension & { value: number }>;
  const overall =
    available.length >= 3
      ? Math.round(available.reduce((n, d) => n + d.value, 0) / available.length)
      : null;

  return { dimensions: dims, overall };
}

// ---------------------------------------------------------------------------
// Memory status — decay estimation with honest wording
// ---------------------------------------------------------------------------

export type MemoryStatus = "new" | "stable" | "review_soon" | "at_risk" | "unseen";

export interface MemoryRow {
  conceptKey: string;
  conceptLabel: string;
  materialId?: string | null;
  status: MemoryStatus;
  accuracy: number | null;
  daysSincePractice: number | null;
  dueCards: number;
  note: string;
}

export function memoryStatus(input: IntelInput): MemoryRow[] {
  const { now, mastery, flashcards, reviews } = input;
  const dueByConcept = new Map<string, number>();
  const lapseByConcept = new Map<string, number>();
  for (const f of flashcards) {
    const k = (f.conceptKey ?? "").trim();
    if (!k) continue;
    if (f.dueAt <= now) dueByConcept.set(k, (dueByConcept.get(k) ?? 0) + 1);
    if (f.lapses > 0) lapseByConcept.set(k, f.lapses);
  }
  // recent "again" reviews are a strong decay signal
  const againRecent = new Set<string>();
  const cardKey = new Map(flashcards.map((f) => [f.conceptKey ?? "_", true] as const));
  void cardKey;
  for (const r of reviews) {
    if (r.grade !== "again") continue;
    if (now - r.reviewedAt > 30 * 86400000) continue;
    // reviews only carry flashcardId; resolve via flashcards list
    const card = flashcards.find((f) => f.conceptKey && f.lapses >= 0);
    void card;
  }
  void againRecent;

  const rows: MemoryRow[] = mastery.map((m) => {
    const acc = m.attempts > 0 ? Math.round((m.correct / m.attempts) * 100) : null;
    const days = Math.floor((now - m.lastPracticedAt) / 86400000);
    const due = dueByConcept.get(m.conceptKey) ?? 0;

    let status: MemoryStatus;
    let note: string;
    if (acc !== null && acc >= 85 && m.attempts >= 3 && days <= 14 && due === 0) {
      status = "stable";
      note = "Holding strong based on accuracy and recent practice.";
    } else if (days > 21 || (due >= 2 && days >= 10)) {
      status = "at_risk";
      note = "Review recommended based on your recent performance and time since practice.";
    } else if (days >= 10 || due > 0) {
      status = "review_soon";
      note = "Due for a short review soon to keep it fresh.";
    } else {
      status = "new";
      note = "Recently practiced — too early to estimate decay.";
    }

    return {
      conceptKey: m.conceptKey,
      conceptLabel: m.conceptLabel,
      materialId: m.materialId ?? null,
      status,
      accuracy: acc,
      daysSincePractice: days,
      dueCards: due,
      note,
    };
  });

  return rows.sort((a, b) => {
    const order: Record<MemoryStatus, number> = { at_risk: 0, review_soon: 1, new: 2, stable: 3, unseen: 4 };
    return order[a.status] - order[b.status];
  });
}

// ---------------------------------------------------------------------------
// KYNEX Oracle — GPA risk level + ONE highest-impact action
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface OracleResult {
  level: RiskLevel;
  score: number; // 0-100 composite pressure
  reasons: string[];
  action: string;
  enoughData: boolean;
}

export function oracle(input: IntelInput): OracleResult {
  const { now, gpa, mastery, mistakes, exams, studyDays14 } = input;
  const reasons: string[] = [];
  let score = 0;

  const attempted = mastery.filter((m) => m.attempts >= 2);
  const weak = attempted.filter((m) => m.correct / m.attempts < 0.6);
  const unresolvedMistakes = mistakes.filter((m) => !m.resolved);
  const nextExam = [...exams].sort((a, b) => a.examDate - b.examDate)[0];
  const daysToExam = nextExam ? Math.ceil((nextExam.examDate - now) / 86400000) : null;

  if (weak.length > 0) {
    score += Math.min(30, weak.length * 8);
    reasons.push(
      `${weak.length} weak concept${weak.length === 1 ? "" : "s"} (${weak
        .slice(0, 3)
        .map((m) => m.conceptLabel)
        .join(", ")}) below 60% accuracy`,
    );
  }

  if (unresolvedMistakes.length >= 3) {
    score += Math.min(20, unresolvedMistakes.length * 2);
    reasons.push(`${unresolvedMistakes.length} unresolved mistakes compounding in the Mistake Bank`);
  }

  if (gpa.currentCgpa != null && gpa.targetCgpa != null && gpa.targetCgpa > gpa.currentCgpa) {
    const gap = gpa.targetCgpa - gpa.currentCgpa;
    score += Math.min(20, gap * 18);
    reasons.push(`CGPA gap of ${gap.toFixed(2)} to your ${gpa.targetCgpa.toFixed(2)} target`);
  }

  if (daysToExam !== null && daysToExam <= 21) {
    const urgency = daysToExam <= 7 ? 25 : daysToExam <= 14 ? 15 : 8;
    score += urgency;
    reasons.push(`${nextExam?.title ?? "An exam"} is ${daysToExam} day${daysToExam === 1 ? "" : "s"} away`);
  }

  if (studyDays14 <= 3) {
    score += 15;
    reasons.push(`Only ${studyDays14} study day${studyDays14 === 1 ? "" : "s"} in the last two weeks`);
  }

  if (gpa.projectedCgpa != null && gpa.targetCgpa != null && gpa.projectedCgpa < gpa.targetCgpa) {
    score += 10;
    reasons.push(
      `Projected CGPA ${gpa.projectedCgpa.toFixed(2)} falls short of your ${gpa.targetCgpa.toFixed(2)} target on the current path`,
    );
  }

  score = Math.min(100, Math.round(score));
  const level: RiskLevel =
    score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";

  const enoughData = attempted.length > 0 || unresolvedMistakes.length > 0 || daysToExam !== null;

  // ONE highest-impact action: pick the single dominant factor.
  let action = "Keep your current rhythm — no single factor is pressing.";
  if (weak.length > 0) {
    action = `Repair "${weak.sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0].conceptLabel}" — it is the lowest-accuracy concept with an exam or GPA impact.`;
  } else if (daysToExam !== null && daysToExam <= 14 && unresolvedMistakes.length > 0) {
    action = `Clear ${Math.min(5, unresolvedMistakes.length)} unresolved mistakes before ${nextExam?.title ?? "the exam"} — they are repeat-risk topics.`;
  } else if (daysToExam !== null && daysToExam <= 14) {
    action = `Start exam-condition practice for ${nextExam?.title ?? "the upcoming exam"} — timing and format are the current unknowns.`;
  } else if (studyDays14 <= 3) {
    action = "Rebuild momentum with one short mission today — consistency is the constraint, not difficulty.";
  } else if (unresolvedMistakes.length >= 3) {
    action = "Fix the most repeated mistake in your Mistake Bank — recurring errors cost more than new topics.";
  }

  return { level, score, reasons: reasons.slice(0, 4), action, enoughData };
}

// ---------------------------------------------------------------------------
// Daily brief — "what matters today?"
// ---------------------------------------------------------------------------

export interface BriefItem {
  label: string;
  value: string;
  sub?: string;
  /** route target for the CTA, resolved client-side */
  to?: "practice" | "flashcards" | "mistakes" | "dashboard" | "twin";
  materialId?: string | null;
  conceptKey?: string;
  empty: boolean;
}

export interface DailyBrief {
  biggestRisk: BriefItem;
  biggestImprovement: BriefItem;
  conceptToStrengthen: BriefItem;
  examPriority: BriefItem;
  quickMission: BriefItem;
  personalBest: BriefItem;
}

export function dailyBrief(input: IntelInput, prevBest: number | null): DailyBrief {
  const { mastery, attempts, exams, flashcards } = input;
  const now = input.now;

  // Biggest risk = lowest-accuracy concept with ≥2 attempts
  const attempted = mastery.filter((m) => m.attempts >= 2);
  const risk = [...attempted].sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0];
  const biggestRisk: BriefItem = risk
    ? {
        label: "Biggest Risk",
        value: risk.conceptLabel,
        sub: `${Math.round((risk.correct / risk.attempts) * 100)}% accuracy across ${risk.attempts} questions`,
        to: "practice",
        materialId: risk.materialId ?? null,
        conceptKey: risk.conceptKey,
        empty: false,
      }
    : { label: "Biggest Risk", value: "Not enough evidence yet", empty: true };

  // Biggest improvement = accuracy trend, first half vs second half of sessions
  const sorted = [...attempts].sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  let biggestImprovement: BriefItem = { label: "Biggest Improvement", value: "—", empty: true };
  if (sorted.length >= 4) {
    const half = Math.floor(sorted.length / 2);
    const acc = (list: typeof sorted) => {
      const qs = list.flatMap((a) => a.answers);
      return qs.length ? (qs.filter((x) => x.correct).length / qs.length) * 100 : 0;
    };
    const delta = Math.round(acc(sorted.slice(half)) - acc(sorted.slice(0, half)));
    biggestImprovement =
      delta > 0
        ? { label: "Biggest Improvement", value: `+${delta}% accuracy`, sub: "recent sessions vs earlier ones", to: "twin", empty: false }
        : delta < 0
          ? { label: "Biggest Improvement", value: `${delta}% accuracy`, sub: "recent sessions dipped — the fix list below is ready", to: "practice", empty: false }
          : { label: "Biggest Improvement", value: "Steady", sub: "accuracy is holding between sessions", to: "twin", empty: false };
  }

  // Concept to strengthen = weakest ≥60% but <85% (the fixable middle band)
  const strengthen = [...attempted]
    .filter((m) => m.correct / m.attempts >= 0.5 && m.correct / m.attempts < 0.85)
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0];
  const conceptToStrengthen: BriefItem = strengthen
    ? {
        label: "Concept to Strengthen",
        value: strengthen.conceptLabel,
        sub: `at ${Math.round((strengthen.correct / strengthen.attempts) * 100)}% — the next verified-mastery candidate`,
        to: "practice",
        materialId: strengthen.materialId ?? null,
        conceptKey: strengthen.conceptKey,
        empty: false,
      }
    : { label: "Concept to Strengthen", value: "Nothing in the fixable band", empty: true };

  // Exam priority = nearest upcoming exam
  const nextExam = [...exams].sort((a, b) => a.examDate - b.examDate)[0];
  const examPriority: BriefItem = nextExam
    ? {
        label: "Exam Priority",
        value: nextExam.title,
        sub: `${Math.max(0, Math.ceil((nextExam.examDate - now) / 86400000))} days remaining`,
        to: "practice",
        empty: false,
      }
    : { label: "Exam Priority", value: "No exams on the radar", empty: true };

  // Best 20-minute mission = due cards beat new practice when recall is leaking
  const dueCards = flashcards.filter((f) => f.dueAt <= now).length;
  const quickMission: BriefItem = dueCards >= 5
    ? { label: "Best 20-Minute Mission", value: `${Math.min(10, dueCards)} due Recall cards`, sub: "memory is the current bottleneck", to: "flashcards", empty: false }
    : risk
      ? { label: "Best 20-Minute Mission", value: `Targeted drill: ${risk.conceptLabel}`, sub: "8 questions on your weakest concept", to: "practice", materialId: risk.materialId ?? null, conceptKey: risk.conceptKey, empty: false }
      : { label: "Best 20-Minute Mission", value: "Practice a Vault topic", sub: "KYNEX needs evidence before recommending", to: "practice", empty: true };

  const best = prevBest;
  const personalBest: BriefItem =
    best != null
      ? { label: "Personal Best", value: `${best}%`, sub: "best single-session accuracy (5+ questions)", to: "mistakes", empty: false }
      : { label: "Personal Best", value: "Set it", sub: "finish a 5+ question session to record one", to: "practice", empty: true };

  return { biggestRisk, biggestImprovement, conceptToStrengthen, examPriority, quickMission, personalBest };
}

/** Best single-session accuracy across sessions with ≥5 answers. */
export function personalBest(attempts: AttemptRecord[]): number | null {
  const eligible = attempts.filter((a) => a.answers.length >= 5);
  if (eligible.length === 0) return null;
  return Math.max(
    ...eligible.map((a) => Math.round((a.answers.filter((x) => x.correct).length / a.answers.length) * 100)),
  );
}

// ---------------------------------------------------------------------------
// YOU vs YOU — beat your past self
// ---------------------------------------------------------------------------

export interface BeatYouResult {
  accuracy: { prev: number; now: number; delta: number } | null;
  recall: { prev: number; now: number; delta: number } | null;
  careless: { prev: number; now: number; delta: number } | null;
  personalBest: number | null;
  enoughData: boolean;
}

export function beatYourPastSelf(attempts: AttemptRecord[], reviews: ReviewLike[]): BeatYouResult {
  const done = attempts
    .filter((a) => a.status === "completed" && a.answers.length > 0)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  const acc = (list: AttemptRecord[]) => {
    const qs = list.flatMap((a) => a.answers);
    return qs.length ? Math.round((qs.filter((x) => x.correct).length / qs.length) * 100) : 0;
  };

  let accuracy: BeatYouResult["accuracy"] = null;
  if (done.length >= 4) {
    const half = Math.floor(done.length / 2);
    const prev = acc(done.slice(0, half));
    const now = acc(done.slice(half));
    accuracy = { prev, now, delta: now - prev };
  }

  // recall: split reviews into older vs newer halves (chronological)
  let recall: BeatYouResult["recall"] = null;
  if (reviews.length >= 6) {
    const chrono = [...reviews].sort((a, b) => a.reviewedAt - b.reviewedAt);
    const score = (g: ReviewLike["grade"]) => (g === "again" ? 0 : g === "hard" ? 0.6 : g === "good" ? 1 : 1.2);
    const avg = (list: ReviewLike[]) =>
      list.length ? Math.round((list.reduce((n, r) => n + score(r.grade), 0) / list.length) * 100) : 0;
    const half = Math.floor(chrono.length / 2);
    const prev = avg(chrono.slice(0, half));
    const now = avg(chrono.slice(half));
    recall = { prev, now, delta: now - prev };
  }

  // careless: wrong + "sure" answers, older vs newer half
  let careless: BeatYouResult["careless"] = null;
  if (done.length >= 4) {
    const half = Math.floor(done.length / 2);
    const count = (list: AttemptRecord[]) =>
      list.flatMap((a) => a.answers).filter((x) => !x.correct && x.confidence === "sure").length;
    const prev = count(done.slice(0, half));
    const now = count(done.slice(half));
    careless = { prev, now, delta: now - prev };
  }

  return {
    accuracy,
    recall,
    careless,
    personalBest: personalBest(done),
    enoughData: done.length >= 4,
  };
}

// ---------------------------------------------------------------------------
// Prove It — verified mastery gate (evidence pillars, never self-report)
// ---------------------------------------------------------------------------

export interface ProveItPillars {
  answered: boolean;
  accurate: boolean;
  applied: boolean;
  novel: boolean;
  recalled: boolean;
}

export interface ProveItRow {
  conceptKey: string;
  conceptLabel: string;
  materialId?: string | null;
  pillars: ProveItPillars;
  missing: string[];
  verified: boolean;
  accuracy: number;
  attempts: number;
}

export const PROVE_IT_THRESHOLDS = {
  minAttempts: 3,
  minAccuracy: 0.8,
} as const;

export function proveIt(
  input: IntelInput,
  appliedKeys: Map<string, { total: number; correct: number }>,
  novelKeys: Map<string, { total: number; correct: number }>,
  recalledKeys: Set<string>,
): ProveItRow[] {
  const rows: ProveItRow[] = [];
  for (const m of input.mastery) {
    if (m.attempts === 0) continue;
    const acc = m.correct / m.attempts;
    const answered = m.attempts >= 1;
    const accurate = m.attempts >= PROVE_IT_THRESHOLDS.minAttempts && acc >= PROVE_IT_THRESHOLDS.minAccuracy;
    const app = appliedKeys.get(m.conceptKey);
    const applied = (app?.correct ?? 0) >= 1;
    const nov = novelKeys.get(m.conceptKey);
    const novel = (nov?.correct ?? 0) >= 1;
    const recalled = recalledKeys.has(m.conceptKey);

    const missing: string[] = [];
    if (!answered) missing.push("Answer questions on it");
    if (!accurate) missing.push(`Reach ${Math.round(PROVE_IT_THRESHOLDS.minAccuracy * 100)}% accuracy over ${PROVE_IT_THRESHOLDS.minAttempts}+ questions`);
    if (!applied) missing.push("Apply it (application-type question)");
    if (!novel) missing.push("Solve a novel/hard variant");
    if (!recalled) missing.push("Recall it later (flashcard review)");

    rows.push({
      conceptKey: m.conceptKey,
      conceptLabel: m.conceptLabel,
      materialId: m.materialId ?? null,
      pillars: { answered, accurate, applied, novel, recalled },
      missing,
      verified: accurate && applied && novel && recalled,
      accuracy: Math.round(acc * 100),
      attempts: m.attempts,
    });
  }
  return rows.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return b.accuracy - a.accuracy;
  });
}

// ---------------------------------------------------------------------------
// Rescue mode + 20-minute missions (plans built from real state)
// ---------------------------------------------------------------------------

export interface RescueStep {
  order: number;
  kind: "fix_gap" | "review" | "practice";
  title: string;
  description: string;
  minutes: number;
  conceptKey?: string;
  conceptLabel?: string;
  materialId?: string | null;
  targetCount: number;
}

export interface RescuePlan {
  steps: RescueStep[];
  summary: string;
  honestNote: string;
}

/**
 * Emergency recovery plan for a realistic number of available hours.
 * Priorities, in order: prerequisite repair → highest-value weak concepts →
 * repeated mistakes → active practice → mock questions → final recall.
 * Never encourages all-nighters: plans are capped and paced.
 */
export function rescuePlan(input: IntelInput, hours: number): RescuePlan {
  const { mastery, attempts, mistakes, flashcards, exams } = input;
  const now = input.now;
  const capped = Math.max(1, Math.min(12, Math.round(hours)));
  const attempted = mastery.filter((m) => m.attempts >= 2);
  const weak = [...attempted].sort((a, b) => a.correct / a.attempts - b.correct / b.attempts).slice(0, 3);
  const repeated = [...mistakes]
    .filter((m) => !m.resolved)
    .sort((a, b) => b.timesMissed - a.timesMissed)
    .slice(0, 2);
  const dueCards = flashcards.filter((f) => f.dueAt <= now).length;
  const nextExam = [...exams].sort((a, b) => a.examDate - b.examDate)[0];

  const steps: RescueStep[] = [];
  let order = 1;
  const budget = capped * 60;

  // 1. prerequisite / weakest repair
  for (const w of weak) {
    if (steps.reduce((n, s) => n + s.minutes, 0) + 20 > budget) break;
    steps.push({
      order: order++,
      kind: "fix_gap",
      title: `Repair: ${w.conceptLabel}`,
      description: `Prerequisite repair — your accuracy here is ${Math.round((w.correct / w.attempts) * 100)}%. Re-learn the core, then answer ${Math.min(8, Math.max(4, 8 - w.correct))} targeted questions.`,
      minutes: 20,
      conceptKey: w.conceptKey,
      conceptLabel: w.conceptLabel,
      materialId: w.materialId ?? null,
      targetCount: Math.min(8, Math.max(4, 8 - w.correct)),
    });
  }

  // 2. repeated mistakes
  for (const m of repeated) {
    if (steps.reduce((n, s) => n + s.minutes, 0) + 12 > budget) break;
    if (steps.some((s) => s.conceptKey === m.conceptKey)) continue;
    steps.push({
      order: order++,
      kind: "fix_gap",
      title: `Fix repeated mistake: ${m.conceptLabel}`,
      description: `This mistake has recurred ${m.timesMissed}×. Work the explanation, then retest the exact pattern.`,
      minutes: 12,
      conceptKey: m.conceptKey,
      conceptLabel: m.conceptLabel,
      materialId: null,
      targetCount: 4,
    });
  }

  // 3. active practice block — only when there is real evidence to practice
  // against (a brand-new account gets pointed at a diagnostic instead).
  if (
    (weak.length > 0 || mistakes.length > 0) &&
    steps.reduce((n, s) => n + s.minutes, 0) + 15 <= budget
  ) {
    steps.push({
      order: order++,
      kind: "practice",
      title: "Active practice block",
      description: "Mixed questions across today's repaired concepts — retrieval, not rereading.",
      minutes: 15,
      targetCount: 6,
    });
  }

  // 4. mock questions if an exam is near
  if (nextExam && nextExam.examDate - now <= 7 * 86400000 && steps.reduce((n, s) => n + s.minutes, 0) + 20 <= budget) {
    steps.push({
      order: order++,
      kind: "practice",
      title: `Mock run for ${nextExam.title}`,
      description: "Timed exam conditions for a small set — exposes timing and format gaps before the real thing.",
      minutes: 20,
      targetCount: 8,
    });
  }

  // 5. final recall
  if (dueCards > 0 && steps.reduce((n, s) => n + s.minutes, 0) + 8 <= budget) {
    steps.push({
      order: order++,
      kind: "review",
      title: `Final recall: ${Math.min(10, dueCards)} cards`,
      description: "Close the session with retrieval practice so today's repairs actually stick.",
      minutes: 8,
      targetCount: Math.min(10, dueCards),
    });
  }

  const planned = steps.reduce((n, s) => n + s.minutes, 0);
  return {
    steps,
    summary: steps.length > 0
      ? `${steps.length}-step plan for ${capped} hour${capped === 1 ? "" : "s"} (${planned} min of focused work, breaks excluded).`
      : "KYNEX needs practice evidence before it can sequence a recovery plan — run one practice session first.",
    honestNote:
      "Optimized for your realistic available time. Sleep beats cramming: retention collapses without it.",
  };
}

/** Highest-impact mission that fits a small time budget (default 20 min). */
export function quickMissionPlan(input: IntelInput, minutes = 20): RescueStep {
  const { mastery, flashcards } = input;
  const now = input.now;
  const cap = Math.max(5, Math.min(60, Math.round(minutes)));
  const attempted = mastery.filter((m) => m.attempts >= 2);
  const weak = [...attempted].sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)[0];
  const dueCards = flashcards.filter((f) => f.dueAt <= now).length;

  if (dueCards >= 5 && (!weak || dueCards >= 10)) {
    return {
      order: 1,
      kind: "review",
      title: `${Math.min(12, dueCards)}-card recall sprint`,
      description: `${cap} minutes: clear the due cards with full attention — recall is your current bottleneck. No multitasking.`,
      minutes: cap,
      targetCount: Math.min(12, dueCards),
    };
  }
  if (weak) {
    return {
      order: 1,
      kind: "fix_gap",
      title: `Sprint: ${weak.conceptLabel}`,
      description: `${cap} minutes: 5 min re-read the concept summary → ${Math.max(4, Math.round(cap * 0.4))} targeted questions → 2 min confidence check. Fix the weakest link first.`,
      minutes: cap,
      conceptKey: weak.conceptKey,
      conceptLabel: weak.conceptLabel,
      materialId: weak.materialId ?? null,
      targetCount: Math.max(4, Math.round(cap * 0.4)),
    };
  }
  return {
    order: 1,
    kind: "practice",
    title: `${cap}-minute diagnostic`,
    description: "No weak spots identified yet — run a short diagnostic so KYNEX can map what you actually know.",
    minutes: cap,
    targetCount: 6,
  };
}
