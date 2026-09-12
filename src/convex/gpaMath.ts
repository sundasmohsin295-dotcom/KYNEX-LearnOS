/**
 * KYNEX GPA Lab — pure math for the Academic Intelligence OS.
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested and used from both the Convex backend and the React client.
 * No invented data: every function takes the student's stored records.
 */

export type ScaleId = "4.0" | "5.0" | "custom";

/** A grade band: percentage ≥ min maps to `point` grade points. */
export interface GradeBand {
  min: number; // percentage threshold (0-100)
  point: number; // grade points (0..max, e.g. 4.0)
}

/** Standard 4.0 letter scale (common US-style banding). */
export const BANDS_4: GradeBand[] = [
  { min: 93, point: 4.0 },
  { min: 90, point: 3.7 },
  { min: 87, point: 3.3 },
  { min: 83, point: 3.0 },
  { min: 80, point: 2.7 },
  { min: 77, point: 2.3 },
  { min: 73, point: 2.0 },
  { min: 70, point: 1.7 },
  { min: 67, point: 1.3 },
  { min: 60, point: 1.0 },
  { min: 0, point: 0 },
];

/** 5.0 scale — parallel structure, 5.0 ceiling for outstanding work. */
export const BANDS_5: GradeBand[] = [
  { min: 90, point: 5.0 },
  { min: 85, point: 4.5 },
  { min: 80, point: 4.0 },
  { min: 75, point: 3.5 },
  { min: 70, point: 3.0 },
  { min: 65, point: 2.5 },
  { min: 60, point: 2.0 },
  { min: 55, point: 1.5 },
  { min: 50, point: 1.0 },
  { min: 0, point: 0 },
];

/** Validate + sanitize a custom band table supplied by the user. */
export function sanitizeBands(bands: GradeBand[]): GradeBand[] {
  const cleaned = bands
    .filter(
      (b) =>
        Number.isFinite(b.min) &&
        Number.isFinite(b.point) &&
        b.min >= 0 &&
        b.min <= 100 &&
        b.point >= 0 &&
        b.point <= 10,
    )
    .map((b) => ({
      min: Math.round(b.min * 100) / 100,
      point: Math.round(b.point * 100) / 100,
    }));
  // must include a 0 floor so every percentage maps
  if (!cleaned.some((b) => b.min === 0)) cleaned.push({ min: 0, point: 0 });
  return cleaned.sort((a, b) => b.min - a.min);
}

export function bandsForScale(
  scale: ScaleId,
  customBands?: GradeBand[],
): GradeBand[] {
  if (scale === "custom" && customBands && customBands.length > 0) {
    return sanitizeBands(customBands);
  }
  return scale === "5.0" ? BANDS_5 : BANDS_4;
}

/** Max grade point for a scale — used for feasibility checks. */
export function maxPointFor(scale: ScaleId): number {
  return scale === "5.0" ? 5 : 4;
}

/** Convert a percentage mark to grade points under a band table. */
export function pointForPercent(percent: number, bands: GradeBand[]): number {
  if (!Number.isFinite(percent)) return 0;
  const band = bands.find((b) => percent >= b.min);
  return band ? band.point : 0;
}

/** Round to 2dp for display/storage. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Core aggregates
// ---------------------------------------------------------------------------

export interface GpaCourse {
  name: string;
  creditHours: number;
  /** null = in progress / ungraded — excluded from GPA math */
  gradePoint?: number | null;
}

export interface GpaSemester {
  name: string;
  status: "completed" | "in_progress";
  courses: GpaCourse[];
}

/** Credit-weighted GPA over graded courses. null when nothing is graded. */
export function weightedGpa(courses: GpaCourse[]): number | null {
  let points = 0;
  let credits = 0;
  for (const c of courses) {
    const ch = Number(c.creditHours);
    const gp = c.gradePoint;
    if (!Number.isFinite(ch) || ch <= 0) continue;
    if (gp == null || !Number.isFinite(gp)) continue;
    points += gp * ch;
    credits += ch;
  }
  if (credits <= 0) return null;
  return round2(points / credits);
}

/** GPA of one semester's graded courses. */
export function semesterGpa(sem: GpaSemester): number | null {
  return weightedGpa(sem.courses);
}

/** Cumulative GPA across all semesters' graded courses. */
export function cumulativeGpa(semesters: GpaSemester[]): number | null {
  return weightedGpa(semesters.flatMap((s) => s.courses));
}

/** Total graded credits across the given semesters. */
export function gradedCredits(semesters: GpaSemester[]): number {
  return semesters
    .flatMap((s) => s.courses)
    .filter((c) => c.gradePoint != null && Number.isFinite(c.gradePoint))
    .reduce((n, c) => n + Math.max(0, Number(c.creditHours) || 0), 0);
}

// ---------------------------------------------------------------------------
// Projections & scenarios
// ---------------------------------------------------------------------------

export interface ProjectionInput {
  /** CGPA earned so far (from stored semesters, or self-reported). */
  currentCgpa: number;
  /** Graded credits completed so far. */
  completedCredits: number;
  /** GPA the current (in-progress) semester is heading toward. */
  projectedSemesterGpa: number;
  /** Credit hours in the current in-progress semester. */
  currentCredits: number;
}

/** CGPA after the current semester is graded at `projectedSemesterGpa`. */
export function projectedCgpa(input: ProjectionInput): number | null {
  const total = input.completedCredits + input.currentCredits;
  if (total <= 0) return null;
  const done =
    input.completedCredits > 0 ? input.currentCgpa * input.completedCredits : 0;
  const now = input.projectedSemesterGpa * input.currentCredits;
  return round2((done + now) / total);
}

export interface RequiredGpaInput {
  currentCgpa: number;
  completedCredits: number;
  currentCredits: number;
  targetCgpa: number;
  /** Scale ceiling for feasibility — pass maxPointFor(scale). */
  maxPoint?: number;
}

export interface RequiredGpaResult {
  required: number | null;
  feasible: boolean;
  /** Human-readable math sentence; computed from real numbers only. */
  explanation: string;
  /** Semesters at max GPA needed if it can't be done this semester (null = feasible now). */
  semestersNeededAtMax?: number | null;
}

/**
 * Required semester GPA to reach a target CGPA after the current semester.
 * Uses the standard credit-weighted identity:
 *   required = (target × (completed + current) − currentCgpa × completed) / currentCredits
 */
export function requiredSemesterGpa(
  input: RequiredGpaInput,
): RequiredGpaResult {
  const { currentCgpa, completedCredits, currentCredits, targetCgpa } = input;
  const max = input.maxPoint ?? 4;
  const total = completedCredits + currentCredits;

  if (currentCredits <= 0 || total <= 0) {
    return {
      required: null,
      feasible: false,
      explanation:
        "Add courses with credit hours to the current semester to compute a required GPA.",
    };
  }
  if (targetCgpa <= currentCgpa) {
    return {
      required: null,
      feasible: true,
      explanation: `You're already at or above your ${round2(targetCgpa)} target — protect it and aim higher.`,
    };
  }

  const required = round2(
    (targetCgpa * total - currentCgpa * completedCredits) / currentCredits,
  );

  if (required <= max) {
    return {
      required,
      feasible: true,
      explanation: `To reach a ${round2(targetCgpa)} CGPA over your ${Math.round(total)} planned credits, you need approximately ${required} GPA this semester (current CGPA ${round2(currentCgpa)} over ${Math.round(completedCredits)} credits).`,
    };
  }

  // Not achievable in one semester at max — estimate semesters at max GPA.
  let semestersNeeded: number | null = null;
  if (currentCredits > 0) {
    const remainingGap =
      targetCgpa * (total + currentCredits) -
      currentCgpa * completedCredits -
      max * currentCredits;
    const denom =
      max * currentCredits - targetCgpa * currentCredits + currentCgpa * currentCredits;
    if (remainingGap > 0 && denom > 0) {
      const k = remainingGap / denom;
      semestersNeeded = Number.isFinite(k) && k > 0 ? Math.ceil(k) : null;
    }
  }

  return {
    required,
    feasible: false,
    semestersNeededAtMax: semestersNeeded,
    explanation: `A ${round2(targetCgpa)} CGPA would require ${required} GPA this semester — above the ${max} scale maximum. Holding a perfect ${max} every semester${semestersNeeded ? ` for about ${semestersNeeded} more semester${semestersNeeded === 1 ? "" : "s"}` : ""} is the honest path; consider a nearer-term target.`,
  };
}

export interface ScenarioSet {
  /** All remaining courses at the scale maximum. */
  bestCase: number | null;
  /** Current per-course trend continues (graded courses keep their points,
   *  ungraded courses use the semester's graded average so far). */
  expected: number | null;
  /** Ungraded courses contribute zero — the pessimistic bound. */
  risk: number | null;
}

/**
 * Best / expected / risk CGPA scenarios for the current state.
 * `expected` uses the in-progress semester's graded average for ungraded
 * courses — a trend continuation, clearly labelled as such in the UI.
 */
export function scenarioSet(
  semesters: GpaSemester[],
  scale: ScaleId,
): ScenarioSet {
  const max = maxPointFor(scale);
  const completed = semesters.filter((s) => s.status === "completed");
  const inProgress = semesters.filter((s) => s.status === "in_progress");

  // BEST: everything unfinished at max
  const bestSemesters: GpaSemester[] = [
    ...completed,
    ...inProgress.map((s) => ({
      ...s,
      courses: s.courses.map((c) => ({ ...c, gradePoint: c.gradePoint ?? max })),
    })),
  ];
  const bestCase = cumulativeGpa(bestSemesters);

  // EXPECTED: ungraded courses at the in-progress semester's graded average
  const expectedSemesters: GpaSemester[] = [
    ...completed,
    ...inProgress.map((s) => {
      const gradedAvg = semesterGpa(s);
      return {
        ...s,
        courses: s.courses.map((c) => ({
          ...c,
          gradePoint: c.gradePoint ?? gradedAvg ?? 0,
        })),
      };
    }),
  ];
  const expected = cumulativeGpa(expectedSemesters);

  // RISK: ungraded courses at zero contribution (pessimistic bound)
  const riskSemesters: GpaSemester[] = [
    ...completed,
    ...inProgress.map((s) => ({
      ...s,
      courses: s.courses.map((c) => ({ ...c, gradePoint: c.gradePoint ?? 0 })),
    })),
  ];
  const risk = cumulativeGpa(riskSemesters);

  return { bestCase, expected, risk };
}

/** Estimated semester GPA from current course marks (percent → points). */
export function estimatedSemesterGpa(
  courses: Array<{ name?: string; creditHours: number; percent?: number | null }>,
  bands: GradeBand[],
): number | null {
  const converted = courses.map((c) => ({
    name: c.name ?? "course",
    creditHours: c.creditHours,
    gradePoint: c.percent != null ? pointForPercent(c.percent, bands) : null,
  }));
  return weightedGpa(converted);
}
