/**
 * KYNEX Readiness Engine — rolling proficiency per subject unit, with honest
 * 70% threshold flagging and structured targeted review modules.
 *
 * Design (mirrors intel.ts conventions):
 *  - Pure, deterministic functions over plain data shapes → unit-testable.
 *  - Evidence-based: proficiency is computed ONLY from real completed
 *    practice/quiz answers (weighted recency). Passive reading never moves
 *    the score.
 *  - Honest insufficiency: units with too little evidence report
 *    `enoughData: false` instead of a fabricated score.
 *  - Zero trust at the query boundary: identity from the auth session only;
 *    every read goes through by-user indices so cross-user leakage is
 *    impossible.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Pure math — plain shapes, no Convex types
// ---------------------------------------------------------------------------

/** One scored answer with optional recency evidence. */
export interface ReadinessAnswer {
  correct: boolean;
  /** Attempt completion time (epoch ms). Older answers weigh less. */
  completedAt?: number;
  /** Difficulty bonus: hard questions count slightly more. */
  difficulty?: "easy" | "medium" | "hard";
}

export interface UnitInput {
  unitKey: string;
  unitLabel: string;
  materialId: string | null;
  subjectId: string | null;
  answers: readonly ReadinessAnswer[];
}

export type ReadinessStatus = "needs_repair" | "building" | "ready" | "unverified";

export interface UnitReadiness {
  unitKey: string;
  unitLabel: string;
  materialId: string | null;
  subjectId: string | null;
  /** 0-100 rolling proficiency, null when evidence is insufficient. */
  proficiency: number | null;
  status: ReadinessStatus;
  /** Verified evidence counts behind the score. */
  attempts: number;
  correct: number;
  /** Human evidence line — the exact basis of the score. */
  evidence: string;
}

/** Half-life in days for the recency weighting. 14d ≈ exam-prep horizon. */
const HALF_LIFE_DAYS = 14;
/** Minimum verified answers before a proficiency score may be reported. */
export const MIN_ATTEMPTS = 3;
/** Below this rolling score, a unit is flagged for targeted repair. */
export const FLAG_THRESHOLD = 70;

/** Weight of a single answer: recency decay × difficulty factor. */
function answerWeight(answer: ReadinessAnswer, now: number): number {
  const ageDays =
    answer.completedAt != null
      ? Math.max(0, (now - answer.completedAt) / 86_400_000)
      : 0;
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  const difficulty =
    answer.difficulty === "hard" ? 1.25 : answer.difficulty === "easy" ? 0.9 : 1;
  return recency * difficulty;
}

/**
 * Rolling proficiency for one unit: recency-weighted accuracy in [0,100].
 * Returns null when fewer than MIN_ATTEMPTS answers exist (insufficient
 * evidence — never guess).
 */
export function rollingProficiency(
  answers: readonly ReadinessAnswer[],
  now: number,
): number | null {
  if (answers.length < MIN_ATTEMPTS) return null;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const a of answers) {
    const w = answerWeight(a, now);
    weightedTotal += w;
    if (a.correct) weightedCorrect += w;
  }
  if (weightedTotal <= 0) return null;
  const raw = (weightedCorrect / weightedTotal) * 100;
  // Clamp to [0,100] against float drift.
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function unitStatus(proficiency: number | null, attempts: number): ReadinessStatus {
  if (proficiency === null) return "unverified";
  if (proficiency < FLAG_THRESHOLD) return "needs_repair";
  if (proficiency < 85) return "building";
  return "ready";
}

/** Compute readiness for a batch of units, worst first. */
export function computeUnitReadiness(
  units: readonly UnitInput[],
  now: number,
): UnitReadiness[] {
  const rows: UnitReadiness[] = units.map((u) => {
    const proficiency = rollingProficiency(u.answers, now);
    const attempts = u.answers.length;
    const correct = u.answers.filter((a) => a.correct).length;
    return {
      unitKey: u.unitKey,
      unitLabel: u.unitLabel,
      materialId: u.materialId,
      subjectId: u.subjectId,
      proficiency,
      status: unitStatus(proficiency, attempts),
      attempts,
      correct,
      evidence:
        proficiency === null
          ? `${attempts} answer${attempts === 1 ? "" : "s"} recorded — ${MIN_ATTEMPTS}+ needed before a score can be reported.`
          : `${correct}/${attempts} correct overall, weighted for recency (14-day half-life) → ${proficiency}% rolling proficiency.`,
    };
  });
  // Worst, evidence-backed first; unverifiable units sink to the bottom.
  return rows.sort((a, b) => {
    if (a.proficiency !== null && b.proficiency !== null) {
      return a.proficiency - b.proficiency;
    }
    if (a.proficiency !== null) return -1;
    if (b.proficiency !== null) return 1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Structured review module for a flagged unit (targeted remediation)
// ---------------------------------------------------------------------------

export interface ReviewModuleStep {
  kind: "relearn" | "recall" | "practice" | "verify";
  title: string;
  detail: string;
  /** Practice route parameter, when the step targets KYNEX practice. */
  materialId?: string | null;
}

export interface ReviewModule {
  unitKey: string;
  unitLabel: string;
  materialId: string | null;
  proficiency: number;
  /** Ordered remediation sequence — relearn before verify, always. */
  steps: ReviewModuleStep[];
}

/** Build the 4-step remediation module for a unit below the threshold. */
export function buildReviewModule(unit: UnitReadiness): ReviewModule | null {
  if (unit.proficiency === null || unit.proficiency >= FLAG_THRESHOLD) return null;
  return {
    unitKey: unit.unitKey,
    unitLabel: unit.unitLabel,
    materialId: unit.materialId,
    proficiency: unit.proficiency,
    steps: [
      {
        kind: "relearn",
        title: `Re-read the core of "${unit.unitLabel}"`,
        detail:
          "Open the source material and focus on the exact sections this unit covers — not the whole chapter.",
        materialId: unit.materialId,
      },
      {
        kind: "recall",
        title: "Closed-book recall",
        detail:
          "Write down everything you remember about the unit before looking anything up. Gaps found here are the real gaps.",
        materialId: unit.materialId,
      },
      {
        kind: "practice",
        title: `10-question focused practice on "${unit.unitLabel}"`,
        detail:
          "Answer honestly and rate confidence honestly — calibration evidence drives the next review.",
        materialId: unit.materialId,
      },
      {
        kind: "verify",
        title: "Verify the repair",
        detail:
          "The unit leaves the flagged list only when rolling proficiency crosses 70% on new attempts.",
        materialId: unit.materialId,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Zero-trust Convex query — the caller's own data only
// ---------------------------------------------------------------------------

interface AttemptDoc extends Doc<"quizAttempts"> {}

/** Assemble per-unit answers from the caller's completed attempts. Units are
 *  mastery concepts (conceptKey) — the same key space the rest of KYNEX uses. */
async function loadUnits(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<UnitInput[]> {
  const attempts = (
    await ctx.db
      .query("quizAttempts")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(120)
  ).filter((a: AttemptDoc) => a.status === "completed");

  const masteryRows = await ctx.db
    .query("masteryScores")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const answersByUnit = new Map<string, ReadinessAnswer[]>();
  for (const attempt of attempts) {
    const completedAt = attempt.completedAt ?? attempt.createdAt;
    attempt.questions.forEach((q, i) => {
      const ans = attempt.answers[i];
      if (!q || !ans) return;
      const key = q.concept.toLowerCase().trim();
      if (!key) return;
      const list = answersByUnit.get(key) ?? [];
      list.push({
        correct: ans.correct,
        completedAt,
        difficulty: q.difficulty,
      });
      answersByUnit.set(key, list);
    });
  }

  const units: UnitInput[] = [];
  const seen = new Set<string>();
  for (const m of masteryRows) {
    if (seen.has(m.conceptKey)) continue;
    seen.add(m.conceptKey);
    units.push({
      unitKey: m.conceptKey,
      unitLabel: m.conceptLabel,
      materialId: m.materialId ?? null,
      subjectId: m.subjectId ?? null,
      answers: answersByUnit.get(m.conceptKey) ?? [],
    });
  }
  // Units that have attempt evidence but no mastery row yet (attempt finished
  // before mastery aggregation ran) still deserve honest reporting.
  for (const [key, answers] of answersByUnit) {
    if (seen.has(key)) continue;
    seen.add(key);
    units.push({
      unitKey: key,
      unitLabel: key,
      materialId: null,
      subjectId: null,
      answers,
    });
  }
  return units;
}

/** Readiness radar for the signed-in student (their own units only). */
export const readinessQuery = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const units = await loadUnits(ctx, userId);
    const now = Date.now();
    const rows = computeUnitReadiness(units, now);

    const flagged = rows.filter(
      (r): r is UnitReadiness & { proficiency: number } =>
        r.status === "needs_repair",
    );
    const modules = flagged
      .slice(0, 4)
      .map(buildReviewModule)
      .filter((m): m is ReviewModule => m !== null);

    const verified = rows.filter(
      (r): r is UnitReadiness & { proficiency: number } => r.proficiency !== null,
    );
    return {
      units: rows.slice(0, 12),
      modules,
      counts: {
        ready: verified.filter((r) => r.proficiency >= 85).length,
        building: verified.filter(
          (r) => r.proficiency >= FLAG_THRESHOLD && r.proficiency < 85,
        ).length,
        needsRepair: flagged.length,
        unverified: rows.length - verified.length,
      },
      threshold: FLAG_THRESHOLD,
      minAttempts: MIN_ATTEMPTS,
      generatedAt: now,
    };
  },
});
