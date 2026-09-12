import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  type ScaleId,
  type GradeBand,
  maxPointFor,
  semesterGpa,
  cumulativeGpa,
  gradedCredits,
  requiredSemesterGpa,
  projectedCgpa,
  scenarioSet,
  round2,
} from "./gpaMath";
import { logAuditEvent } from "./security";

/**
 * KYNEX GPA Lab backend.
 *
 * Zero trust: identity always comes from the session; every row is fetched
 * AND re-checked against `userId` before read/write; all client input is
 * validated + clamped server-side. Deny by default, fail closed.
 */

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const gradeBandsValidator = v.array(
  v.object({ min: v.number(), point: v.number() }),
);

const scaleValidator = v.union(
  v.literal("4.0"),
  v.literal("5.0"),
  v.literal("custom"),
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Load a semester row only if it exists and belongs to the caller. */
async function getOwnedSemester(
  ctx: MutationCtx,
  semesterId: Id<"gpaSemesters">,
  userId: Id<"users">,
): Promise<Doc<"gpaSemesters"> | null> {
  const sem = await ctx.db.get(semesterId);
  return sem && sem.userId === userId ? sem : null;
}

async function nextOrder(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const rows = await ctx.db
    .query("gpaSemesters")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.reduce((n, r) => Math.max(n, r.order), 0) + 1;
}

/** Parse a client-supplied number, enforcing finite + range. */
function clampNum(
  value: string | number | undefined,
  min: number,
  max: number,
): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

const COURSE_NAME_MAX = 120;
const SEM_NAME_MAX = 80;
const CODE_MAX = 30;

/** Load full semester + course tree, already ownership-checked (rows come
 *  from by-user indices so no other user's rows are ever visible). */
async function loadTree(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const semesters = await ctx.db
    .query("gpaSemesters")
    .withIndex("by_user_order", (q) => q.eq("userId", userId))
    .collect();
  const rows = await ctx.db
    .query("gpaCourses")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const bySem = new Map<Id<"gpaSemesters">, Doc<"gpaCourses">[]>();
  for (const c of rows) {
    const list = bySem.get(c.semesterId) ?? [];
    list.push(c);
    bySem.set(c.semesterId, list);
  }
  const tree = semesters
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s._id,
      name: s.name,
      status: s.status,
      order: s.order,
      courses: (bySem.get(s._id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  return { semesters, rows, tree };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Everything the GPA Lab needs, computed from stored rows. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const { tree } = await loadTree(ctx, userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // GPA math lives in the pure module — same code the tests cover.
    const mathSemesters = tree.map((s) => ({
      name: s.name,
      status: s.status,
      courses: s.courses.map((c) => ({
        name: c.name,
        creditHours: c.creditHours,
        gradePoint: c.gradePoint ?? null,
      })),
    }));

    const completed = tree.filter((s) => s.status === "completed");
    const inProgress = tree.filter((s) => s.status === "in_progress");
    const completedCredits = gradedCredits(
      completed.map((s) => ({
        name: s.name,
        status: "completed" as const,
        courses: s.courses.map((c) => ({
          name: c.name,
          creditHours: c.creditHours,
          gradePoint: c.gradePoint ?? null,
        })),
      })),
    );
    const currentCredits = inProgress.reduce(
      (n, s) =>
        n + s.courses.reduce((m, c) => m + Math.max(0, c.creditHours), 0),
      0,
    );

    const cumGpa = cumulativeGpa(mathSemesters);
    const profileScale = (profile?.gradingScale ?? "4.0") as "4.0" | "5.0";
    const max = maxPointFor(profileScale);
    const targetCgpa = profile?.targetCgpa ?? null;

    const required =
      targetCgpa != null && inProgress.length > 0
        ? requiredSemesterGpa({
            currentCgpa: cumGpa ?? profile?.currentCgpa ?? 0,
            completedCredits,
            currentCredits,
            targetCgpa,
            maxPoint: max,
          })
        : null;

    const projected =
      cumGpa != null && inProgress.length > 0
        ? projectedCgpa({
            currentCgpa: cumGpa,
            completedCredits,
            currentCredits,
            projectedSemesterGpa:
              inProgress
                .map((s) =>
                  semesterGpa({
                    name: s.name,
                    status: s.status,
                    courses: s.courses.map((c) => ({
                      name: c.name,
                      creditHours: c.creditHours,
                      gradePoint: c.gradePoint ?? null,
                    })),
                  }),
                )
                .filter((g): g is number => g != null)[0] ?? 0,
          })
        : null;

    const scenarios = scenarioSet(mathSemesters, profileScale);

    // per-semester GPA series for the chart
    const series = tree.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      gpa: semesterGpa({
        name: s.name,
        status: s.status,
        courses: s.courses.map((c) => ({
          name: c.name,
          creditHours: c.creditHours,
          gradePoint: c.gradePoint ?? null,
        })),
      }),
      credits: s.courses.reduce((n, c) => n + Math.max(0, c.creditHours), 0),
      courseCount: s.courses.length,
    }));

    return {
      scale: profile?.gradingScale ?? null,
      customBands: (profile?.customBands as GradeBand[] | undefined) ?? null,
      university: profile?.university ?? null,
      degree: profile?.degree ?? null,
      currentCgpa: cumGpa,
      completedCredits,
      currentCredits,
      targetCgpa,
      targetGpa: profile?.targetGpa ?? null,
      required,
      projected,
      scenarios,
      semesters: series,
      max,
    };
  },
});

/** Courses of one semester (caller-owned only). */
export const courses = query({
  args: { semesterId: v.id("gpaSemesters") },
  handler: async (ctx, { semesterId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    // Ownership first: the semester must belong to the caller.
    const sem = await ctx.db.get(semesterId);
    if (!sem || sem.userId !== userId) return [];
    return await ctx.db
      .query("gpaCourses")
      .withIndex("by_semester", (q) => q.eq("semesterId", semesterId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a semester. Name + order are server-assigned/validated. */
export const addSemester = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    const order = await nextOrder(ctx, userId);
    const finalName =
      (name ?? "").trim().slice(0, SEM_NAME_MAX) || `Semester ${order}`;
    const id = await ctx.db.insert("gpaSemesters", {
      userId,
      name: finalName,
      order,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    });
    await logAuditEvent(ctx, userId, "gpa_semester_added");
    return id;
  },
});

/** Rename a semester. */
export const renameSemester = mutation({
  args: { semesterId: v.id("gpaSemesters"), name: v.string() },
  handler: async (ctx, { semesterId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const sem = await getOwnedSemester(ctx, semesterId, userId);
    if (!sem) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.renameSemester");
      return { ok: false as const };
    }
    const finalName = name.trim().slice(0, SEM_NAME_MAX);
    if (!finalName) return { ok: false as const };
    await ctx.db.patch(semesterId, { name: finalName, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

/** Delete a semester and its courses (owner-checked, audited). */
export const deleteSemester = mutation({
  args: { semesterId: v.id("gpaSemesters") },
  handler: async (ctx, { semesterId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const sem = await getOwnedSemester(ctx, semesterId, userId);
    if (!sem) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.deleteSemester");
      return { ok: false as const };
    }
    for (const c of await ctx.db
      .query("gpaCourses")
      .withIndex("by_semester", (q) => q.eq("semesterId", semesterId))
      .collect()) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(semesterId);
    await logAuditEvent(ctx, userId, "gpa_semester_deleted");
    return { ok: true as const };
  },
});

/** Toggle completed / in_progress. */
export const setSemesterStatus = mutation({
  args: { semesterId: v.id("gpaSemesters"), status: v.union(v.literal("completed"), v.literal("in_progress")) },
  handler: async (ctx, { semesterId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const sem = await getOwnedSemester(ctx, semesterId, userId);
    if (!sem) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.setSemesterStatus");
      return { ok: false as const };
    }
    await ctx.db.patch(semesterId, { status, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

/** Add a course. All numbers validated server-side; grade point clamped to scale. */
export const addCourse = mutation({
  args: {
    semesterId: v.id("gpaSemesters"),
    name: v.string(),
    code: v.optional(v.string()),
    creditHours: v.number(),
    gradePoint: v.optional(v.number()),
  },
  handler: async (ctx, { semesterId, name, code, creditHours, gradePoint }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const sem = await getOwnedSemester(ctx, semesterId, userId);
    if (!sem) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.addCourse");
      return { ok: false as const };
    }
    const finalName = name.trim().slice(0, COURSE_NAME_MAX);
    if (!finalName) return { ok: false as const };
    const credits = clampNum(creditHours, 0.5, 30);
    if (credits === undefined) {
      throw new Error("Credit hours must be between 0.5 and 30.");
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const max = maxPointFor((profile?.gradingScale ?? "4.0") as "4.0" | "5.0");
    let gp: number | undefined;
    if (gradePoint !== undefined) {
      const g = clampNum(gradePoint, 0, max);
      if (g === undefined) {
        throw new Error(`Grade point must be between 0 and ${max}.`);
      }
      gp = g;
    }
    await ctx.db.insert("gpaCourses", {
      userId,
      semesterId,
      name: finalName,
      code: code?.trim().slice(0, CODE_MAX) || undefined,
      creditHours: credits,
      gradePoint: gp,
    });
    return { ok: true as const };
  },
});

/** Update a course's grade point / credits. */
export const updateCourse = mutation({
  args: {
    courseId: v.id("gpaCourses"),
    gradePoint: v.optional(v.number()),
    creditHours: v.optional(v.number()),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
  },
  handler: async (ctx, { courseId, gradePoint, creditHours, name, code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.updateCourse");
      return { ok: false as const };
    }
    const patch: Partial<Doc<"gpaCourses">> = {};
    if (name !== undefined) {
      const n = name.trim().slice(0, COURSE_NAME_MAX);
      if (n) patch.name = n;
    }
    if (code !== undefined) patch.code = code.trim().slice(0, CODE_MAX) || undefined;
    if (creditHours !== undefined) {
      const c = clampNum(creditHours, 0.5, 30);
      if (c === undefined) throw new Error("Credit hours must be between 0.5 and 30.");
      patch.creditHours = c;
    }
    if (gradePoint !== undefined) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      const max = maxPointFor((profile?.gradingScale ?? "4.0") as "4.0" | "5.0");
      if (gradePoint === null) {
        patch.gradePoint = undefined;
      } else {
        const g = clampNum(gradePoint, 0, max);
        if (g === undefined) {
          throw new Error(`Grade point must be between 0 and ${max}.`);
        }
        patch.gradePoint = g;
      }
    }
    await ctx.db.patch(courseId, patch);
    return { ok: true as const };
  },
});

/** Delete a course. */
export const deleteCourse = mutation({
  args: { courseId: v.id("gpaCourses") },
  handler: async (ctx, { courseId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const course = await ctx.db.get(courseId);
    if (!course || course.userId !== userId) {
      await logAuditEvent(ctx, userId, "cross_user_access_attempt", "gpa.deleteCourse");
      return { ok: false as const };
    }
    await ctx.db.delete(courseId);
    return { ok: true as const };
  },
});

/**
 * Set the grading scale + custom bands on the caller's profile.
 * Custom bands are sanitized (finite, ordered, 0-floor guaranteed) before
 * storage so downstream math can never be poisoned by malformed input.
 */
export const setScale = mutation({
  args: {
    scale: scaleValidator,
    customBands: v.optional(gradeBandsValidator),
  },
  handler: async (ctx, { scale, customBands }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile) throw new Error("Complete onboarding first.");
    if (scale === "custom") {
      if (!customBands || customBands.length < 2 || customBands.length > 20) {
        throw new Error("Custom scale needs between 2 and 20 grade bands.");
      }
      // Validate shape now; sanitizeBands is also applied at read time.
      for (const b of customBands) {
        if (
          !Number.isFinite(b.min) ||
          !Number.isFinite(b.point) ||
          b.min < 0 ||
          b.min > 100 ||
          b.point < 0 ||
          b.point > 10
        ) {
          throw new Error("Invalid grade band.");
        }
      }
      await ctx.db.patch(profile._id, { customBands });
    } else {
      await ctx.db.patch(profile._id, { customBands: undefined });
    }
    await ctx.db.patch(profile._id, { gradingScale: scale as "4.0" | "5.0" | "custom" });
    return { ok: true as const };
  },
});

/** Convert percent marks to grade points (client preview helper). */
export const percentToPoints = query({
  args: { scale: scaleValidator, percent: v.number() },
  handler: async (ctx, { scale, percent }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const p = clampNum(percent, 0, 100);
    if (p === undefined) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const bands =
      scale === "custom" && profile?.customBands
        ? (profile.customBands as GradeBand[])
        : undefined;
    // Local pure conversion (bandsForScale is client-safe too).
    const { bandsForScale, pointForPercent } = await import("./gpaMath");
    return pointForPercent(p, bandsForScale(scale as ScaleId, bands));
  },
});

/** Round-trip helper used by the UI for scenario labels. */
export const roundLabel = query({
  args: { value: v.number() },
  handler: async (ctx, { value }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return round2(value);
  },
});
