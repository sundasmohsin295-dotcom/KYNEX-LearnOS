import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, Calculator, Check, GraduationCap, Info, Plus, Route, Target,
  TrendingUp, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ring } from "@/components/VisualBits";
import { cn } from "@/lib/utils";

type Semester = {
  id: Id<"gpaSemesters">;
  name: string;
  status: "completed" | "in_progress";
  gpa: number | null;
  credits: number;
  courseCount: number;
};

type Overview = {
  scale: string | null;
  university: string | null;
  degree: string | null;
  currentCgpa: number | null;
  completedCredits: number;
  currentCredits: number;
  targetCgpa: number | null;
  targetGpa: number | null;
  required: {
    required: number | null;
    feasible: boolean;
    explanation: string;
    semestersNeededAtMax?: number | null;
  } | null;
  projected: number | null;
  scenarios: { bestCase: number | null; expected: number | null; risk: number | null };
  semesters: Semester[];
  max: number;
};

export default function GpaLab() {
  const navigate = useNavigate();
  const data = useQuery(api.gpa.overview) as Overview | null | undefined;
  const addSemester = useMutation(api.gpa.addSemester);
  const renameSemester = useMutation(api.gpa.renameSemester);
  const deleteSemester = useMutation(api.gpa.deleteSemester);
  const setSemesterStatus = useMutation(api.gpa.setSemesterStatus);
  const addCourse = useMutation(api.gpa.addCourse);
  const updateCourse = useMutation(api.gpa.updateCourse);
  const deleteCourse = useMutation(api.gpa.deleteCourse);
  const setScale = useMutation(api.gpa.setScale);

  const [newCourse, setNewCourse] = useState<{ semId: Id<"gpaSemesters"> | null; name: string; code: string; credits: string; grade: string }>({
    semId: null, name: "", code: "", credits: "", grade: "",
  });
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------------------- actions
  // Returns true when the operation succeeded so callers can decide whether
  // to reset dependent form state (never destroy student input on failure).
  const guard = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (data === undefined) {
    return (
      <AppShell>
        <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }
  if (data === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-card p-10 text-center">
          <p className="font-display text-xl font-bold">Sign in to open the GPA Lab</p>
          <Button className="mt-5" onClick={() => navigate("/auth")}>Sign in</Button>
        </div>
      </AppShell>
    );
  }

  const cgpa = data.currentCgpa;
  const target = data.targetCgpa;
  const gap = cgpa != null && target != null ? +(target - cgpa).toFixed(2) : null;

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX GPA Lab · Academic Intelligence" title="GPA / CGPA Lab">
        <p className="max-w-md text-sm text-muted-foreground">
          Real math on your real records. Every projection below is computed from your stored
          semesters, courses and credit hours: nothing is estimated from study time.
        </p>
      </PageHeader>

      {/* ---------- Hero: current CGPA + gap ---------- */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 sm:p-8">
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-6">
            <Ring
              pct={cgpa != null && data.max > 0 ? Math.round((cgpa / data.max) * 100) : 0}
              size={110}
              stroke={9}
              colorClass="text-primary"
              label="of max"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Cumulative CGPA</p>
              <p className="mt-1 font-display text-4xl font-extrabold tracking-tight">
                {cgpa != null ? cgpa.toFixed(2) : "--"}
                <span className="ml-1 text-base font-bold text-muted-foreground">/ {data.max}.0</span>
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {data.completedCredits} graded credits
                {data.currentCredits > 0 && ` · ${data.currentCredits} in progress`}
                {data.university && ` · ${data.university}`}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:w-[26rem]">
            <MiniStat
              label="Projected"
              value={data.projected != null ? data.projected.toFixed(2) : "--"}
              tone="text-chart-2"
              note="CGPA if the current semester lands at its current trend"
            />
            <MiniStat
              label="Target"
              value={target != null ? target.toFixed(2) : "set →"}
              tone="text-chart-4"
              note="Set in KYNEX Twin"
              onClick={() => navigate("/twin?edit=1")}
            />
            <MiniStat
              label="Gap"
              value={gap != null && gap > 0 ? `+${gap}` : gap === 0 ? "0" : "--"}
              tone="text-chart-5"
              note="Points between current CGPA and target"
            />
          </div>
        </div>
      </div>

      {/* ---------- Grade Path: the honest gap → action plan ---------- */}
      <GradePathCard navigate={navigate} />

      {/* ---------- Required GPA sentence ---------- */}
      {data.required && (
        <div className={cn(
          "mt-5 rounded-3xl border p-6",
          data.required.feasible ? "border-primary/25 bg-primary/5" : "border-chart-5/30 bg-chart-5/5",
        )}>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <Target className="size-4 text-primary" />
            <span className="text-primary">Required GPA this semester</span>
            {data.required.required != null && (
              <span className="ml-1 font-display text-lg text-foreground">{data.required.required}</span>
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.required.explanation}</p>
          {target == null && (
            <Button variant="outline" size="sm" className="mt-3 gap-2 rounded-lg" onClick={() => navigate("/twin?edit=1")}>
              <Target className="size-3.5" /> Set a target CGPA to unlock this
            </Button>
          )}
        </div>
      )}

      {/* ---------- Scenarios ---------- */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <ScenarioCard
          title="Best case"
          value={data.scenarios.bestCase}
          max={data.max}
          desc="Every in-progress course graded at the scale maximum."
          tone="text-success"
        />
        <ScenarioCard
          title="Expected"
          value={data.scenarios.expected}
          max={data.max}
          desc="In-progress courses graded at their semester's current average: a trend estimate, not a promise."
          tone="text-primary"
        />
        <ScenarioCard
          title="Risk floor"
          value={data.scenarios.risk}
          max={data.max}
          desc="In-progress courses contribute nothing: the honest lower bound."
          tone="text-chart-5"
        />
      </div>

      {/* ---------- Semester GPA chart ---------- */}
      {data.semesters.length > 0 && (
        <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <TrendingUp className="size-5 text-primary" /> Semester trajectory
          </h3>
          <div className="mt-6 flex h-40 items-end gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {data.semesters.map((s, i) => {
              const pct = s.gpa != null ? (s.gpa / data.max) * 100 : 0;
              return (
                <div key={s.id} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                  <motion.div
                    className={cn(
                      "w-full rounded-t-lg",
                      s.status === "completed" ? "bg-primary" : "bg-chart-2",
                    )}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(3, pct)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.06 }}
                    title={`${s.gpa != null ? s.gpa.toFixed(2) : "ungraded"} · ${s.credits} credits`}
                  />
                  <span className="max-w-full truncate text-center text-[10px] font-semibold text-muted-foreground" title={s.name}>
                    {s.name}
                  </span>
                  <span className="text-[10px] font-bold">{s.gpa != null ? s.gpa.toFixed(1) : "--"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- Semesters editor ---------- */}
      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <GraduationCap className="size-5 text-primary" /> Semesters & courses
          </h3>
          <Button
            className="gap-2 rounded-xl"
            disabled={busy || data.semesters.length >= 12}
            onClick={() => guard(() => addSemester({}))}
          >
            <Plus className="size-4" /> Add semester
          </Button>
        </div>

        {data.semesters.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <Calculator className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-4 font-display text-xl font-bold">Build your academic record</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Add semesters with courses, credit hours and grades. KYNEX computes GPA, CGPA,
              required GPA and scenarios from this data, and keeps updating as you learn.
            </p>
            <Button className="mt-5 gap-2 rounded-xl" onClick={() => guard(() => addSemester({}))}>
              <Plus className="size-4" /> Create first semester
            </Button>
          </div>
        )}

        {data.semesters.map((sem) => (
          <div key={sem.id} className="rounded-3xl border border-border/70 bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <input
                defaultValue={sem.name}
                className="w-44 rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-base font-bold outline-none transition-colors hover:border-border focus:border-primary"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== sem.name) void guard(() => renameSemester({ semesterId: sem.id, name: v }));
                }}
                aria-label="Semester name"
              />
              <span className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                sem.status === "completed" ? "bg-success/15 text-success" : "bg-xp/20 text-xp-foreground",
              )}>
                {sem.status === "completed" ? "completed" : "in progress"}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                GPA {sem.gpa != null ? sem.gpa.toFixed(2) : "--"} · {sem.credits} credits · {sem.courseCount} courses
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg text-xs"
                  onClick={() => guard(() => setSemesterStatus({
                    semesterId: sem.id,
                    status: sem.status === "completed" ? "in_progress" : "completed",
                  }))}
                >
                  {sem.status === "completed" ? "Reopen" : "Mark complete"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${sem.name}`}
                  onClick={() => {
                    if (confirm(`Delete "${sem.name}" and all its courses?`)) {
                      void guard(() => deleteSemester({ semesterId: sem.id }));
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* courses */}
            <div className="mt-4 space-y-1.5">
              {(data.semesters.find((s) => s.id === sem.id)?.courseCount ?? 0) > 0 && (
                <CourseRows semesterId={sem.id} />
              )}
              {sem.courseCount === 0 && (
                <p className="rounded-xl bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
                  No courses yet. Add one below.
                </p>
              )}

              {/* add course row */}
              {newCourse.semId === sem.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <Input
                    autoFocus
                    placeholder="Course name"
                    value={newCourse.name}
                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                    className="h-8 min-w-40 flex-1 rounded-lg text-sm"
                  />
                  <Input
                    placeholder="Code"
                    value={newCourse.code}
                    onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                    className="h-8 w-20 rounded-lg text-sm"
                  />
                  <Input
                    type="number"
                    min="0.5"
                    max="30"
                    step="0.5"
                    placeholder="Credits"
                    value={newCourse.credits}
                    onChange={(e) => setNewCourse({ ...newCourse, credits: e.target.value })}
                    className="h-8 w-20 rounded-lg text-sm"
                  />
                  <Input
                    type="number"
                    min="0"
                    max={data.max}
                    step="0.1"
                    placeholder={`Grade (0 to ${data.max})`}
                    value={newCourse.grade}
                    onChange={(e) => setNewCourse({ ...newCourse, grade: e.target.value })}
                    className="h-8 w-28 rounded-lg text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-8 gap-1 rounded-lg"
                    disabled={busy || !newCourse.name.trim() || !newCourse.credits}
                    onClick={async () => {
                      const okResult = await guard(() => addCourse({
                        semesterId: sem.id,
                        name: newCourse.name,
                        code: newCourse.code || undefined,
                        creditHours: Number(newCourse.credits),
                        gradePoint: newCourse.grade ? Number(newCourse.grade) : undefined,
                      }));
                      // Only reset the form when the course actually saved —
                      // a rejected grade/credits value must not wipe the
                      // student's typed row.
                      if (okResult) {
                        setNewCourse({ semId: null, name: "", code: "", credits: "", grade: "" });
                      }
                    }}
                  >
                    <Check className="size-3.5" /> Add
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" aria-label="Cancel" onClick={() => setNewCourse({ semId: null, name: "", code: "", credits: "", grade: "" })}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-8 gap-1.5 rounded-lg text-xs text-primary"
                  onClick={() => setNewCourse({ semId: sem.id, name: "", code: "", credits: "", grade: "" })}
                >
                  <Plus className="size-3.5" /> Add course
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Grading scale ---------- */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Info className="size-5 text-primary" /> Grading scale
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Grade points you enter are validated against this scale. Percentage bands are used to
          convert current course marks into projected grades.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["4.0", "5.0"] as const).map((s) => (
            <button
              key={s}
              onClick={() => guard(() => setScale({ scale: s }))}
              className={cn(
                "rounded-xl border px-5 py-2.5 text-sm font-bold transition-colors",
                data.scale === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {s} scale
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ArrowRight className="mt-0.5 size-3 shrink-0 text-primary" />
          Need a custom university scale? Set it from KYNEX Twin: bands of (percent → points).
        </p>
      </div>
    </AppShell>
  );
}

/** Live course rows with inline grade editing, loaded per semester. */
function CourseRows({ semesterId }: { semesterId: Id<"gpaSemesters"> }) {
  const overview = useQuery(api.gpa.overview) as Overview | null | undefined;
  const updateCourse = useMutation(api.gpa.updateCourse);
  const deleteCourse = useMutation(api.gpa.deleteCourse);
  // The overview already carries ownership-filtered courses via semesters,
  // but course-level editing needs the raw rows; use the dedicated query.
  const courses = useQuery(api.gpa.courses, { semesterId });
  const sem = overview?.semesters.find((s) => s.id === semesterId);

  if (courses === undefined) return null;
  return (
    <div className="space-y-1.5">
      {courses.map((c) => (
        <div key={c._id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {c.name}
            {c.code && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.code}</span>}
          </span>
          <Input
            type="number"
            min="0.5"
            max="30"
            step="0.5"
            defaultValue={c.creditHours}
            className="h-7 w-20 rounded-lg text-xs"
            aria-label={`Credit hours for ${c.name}`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== c.creditHours) {
                void updateCourse({ courseId: c._id, creditHours: v }).catch(() =>
                  toast.error("Invalid credit hours"),
                );
              }
            }}
          />
          <Input
            type="number"
            min="0"
            max={sem != null ? undefined : 5}
            step="0.1"
            defaultValue={c.gradePoint ?? ""}
            placeholder="ungraded"
            className="h-7 w-24 rounded-lg text-xs"
            aria-label={`Grade points for ${c.name}`}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const v = raw === "" ? null : Number(raw);
              if (v === null || (Number.isFinite(v) && v !== c.gradePoint)) {
                void updateCourse({ courseId: c._id, gradePoint: v ?? undefined }).catch(() =>
                  toast.error("Grade must be within your scale"),
                );
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${c.name}`}
            onClick={() =>
              void deleteCourse({ courseId: c._id }).catch(() =>
                toast.error("Couldn't delete the course"),
              )
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function MiniStat({
  label, value, tone, note, onClick,
}: {
  label: string; value: string; tone: string; note?: string; onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-muted/30 p-4",
        onClick && "cursor-pointer transition-colors hover:border-primary/40",
      )}
      title={note}
      onClick={onClick}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className={cn("mt-1 font-display text-xl font-extrabold", tone)}>{value}</p>
    </div>
  );
}

function ScenarioCard({
  title, value, max, desc, tone,
}: {
  title: string; value: number | null; max: number; desc: string; tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/70 bg-card p-5"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={cn("mt-1.5 font-display text-3xl font-extrabold", tone)}>
        {value != null ? value.toFixed(2) : "--"}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", tone.replace("text-", "bg-"))}
          initial={{ width: 0 }}
          animate={{ width: value != null ? `${(value / max) * 100}%` : 0 }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
    </motion.div>
  );
}

/** "How do I get a high grade?" — honest gap → required performance → actions.
 *  Every number comes from the student's own GPA Lab, Twin and practice data. */
function GradePathCard({ navigate }: { navigate: (to: string) => void }) {
  const data = useQuery(api.intelligence.gradePathQuery);
  if (!data) return null;
  const { path } = data;

  return (
    <div className="mt-5 rounded-3xl border border-primary/25 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <Route className="size-4" /> How do I get a high grade?
        </p>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Evidence-based · no guarantees
        </span>
      </div>

      {!path.ready ? (
        <>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {path.notReadyReason}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2 rounded-lg"
            onClick={() => navigate("/twin?edit=1")}
          >
            <Target className="size-3.5" /> Set your target in KYNEX Twin
          </Button>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
              <p className="mt-1 font-display text-xl font-extrabold">{path.currentPosition}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Target</p>
              <p className="mt-1 font-display text-xl font-extrabold text-chart-4">{path.targetPosition}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gap</p>
              <p className="mt-1 font-display text-xl font-extrabold text-chart-5">{path.gap}</p>
            </div>
          </div>

          <p className="mt-4 rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-foreground/90">
            {path.required.explanation}
          </p>

          {path.impactActions.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Highest-impact actions</p>
              <ul className="mt-2 space-y-2">
                {path.impactActions.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{a.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.evidence} · ~{a.minutes} min
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {path.riskAreas.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {path.riskAreas.map((r, i) => (
                <span
                  key={i}
                  className="rounded-full border border-chart-5/40 bg-chart-5/5 px-3 py-1 text-xs font-semibold text-chart-5"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{path.verification}</p>
        </>
      )}
    </div>
  );
}
