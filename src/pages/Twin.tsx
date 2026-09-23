import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, Brain, Check, CheckCircle2, Circle,
  Fingerprint, Pencil, Scale, ShieldCheck, Target, TrendingUp, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ring } from "@/components/VisualBits";
import { cn } from "@/lib/utils";

export default function Twin() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const overview = useQuery(api.profiles.myOverview);
  const insights = useQuery(api.profiles.myInsights);
  const intel = useQuery(api.intelligence.snapshot);
  const save = useMutation(api.profiles.setAcademicProfile);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    degree: "", department: "", university: "", semester: "", creditHours: "",
    gradingScale: "4.0" as "4.0" | "5.0",
    currentGpa: "", currentCgpa: "", targetGpa: "", targetCgpa: "",
  });

  const profile = overview?.profile;

  // "edit=1" deep-link opens the editor once, then removes the param.
  const editParam = params.get("edit") === "1";
  const [appliedEditParam, setAppliedEditParam] = useState(false);
  if (editParam && !appliedEditParam) {
    setEditing(true);
    setAppliedEditParam(true);
    setParams((p) => { p.delete("edit"); return p; });
  }

  // Form seed: derive from the profile with an applied-flag so loading the
  // profile never runs a cascading state effect, and later saves (which
  // return a new profile object) don't clobber the user's in-progress edits.
  const [formSeeded, setFormSeeded] = useState(false);
  if (profile && !formSeeded) {
    setForm({
      degree: profile.degree ?? "",
      department: profile.department ?? "",
      university: profile.university ?? "",
      semester: profile.semester ? String(profile.semester) : "",
      creditHours: profile.creditHours ? String(profile.creditHours) : "",
      gradingScale: (profile.gradingScale as "4.0" | "5.0") ?? "4.0",
      currentGpa: profile.currentGpa != null ? String(profile.currentGpa) : "",
      currentCgpa: profile.currentCgpa != null ? String(profile.currentCgpa) : "",
      targetGpa: profile.targetGpa != null ? String(profile.targetGpa) : "",
      targetCgpa: profile.targetCgpa != null ? String(profile.targetCgpa) : "",
    });
    setFormSeeded(true);
  }

  const saveProfile = async () => {
    try {
      await save({
        degree: form.degree.trim() || undefined,
        department: form.department.trim() || undefined,
        university: form.university.trim() || undefined,
        semester: form.semester ? Number(form.semester) : undefined,
        creditHours: form.creditHours ? Number(form.creditHours) : undefined,
        gradingScale: form.gradingScale,
        currentGpa: form.currentGpa ? Number(form.currentGpa) : undefined,
        currentCgpa: form.currentCgpa ? Number(form.currentCgpa) : undefined,
        targetGpa: form.targetGpa ? Number(form.targetGpa) : undefined,
        targetCgpa: form.targetCgpa ? Number(form.targetCgpa) : undefined,
      });
      setEditing(false);
      toast.success("KYNEX Twin updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your profile");
    }
  };

  const loading = !overview || !insights;
  const game = overview?.game;
  const masteryRows = overview?.mastery ?? [];
  const dueCards = overview?.stats.dueCards ?? 0;

  // GAP model — computed from real data
  const gpaGap = profile?.currentGpa != null && profile?.targetGpa != null
    ? +(profile.targetGpa - profile.currentGpa).toFixed(2)
    : null;
  const weakList = [...masteryRows]
    .filter((m) => m.attempts >= 2 && m.correct / m.attempts < 0.6)
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)
    .slice(0, 3);

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Twin" title="Your academic state">
        {!loading && (
          <Button variant={editing ? "default" : "outline"} className="gap-2 rounded-xl" onClick={() => setEditing((e) => !e)}>
            {editing ? <><Check className="size-4" /> Done</> : <><Pencil className="size-4" /> Edit identity & goals</>}
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
      ) : (
        <>
          {/* ---------- identity card ---------- */}
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Fingerprint className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold">
                  {profile?.degree || "Your degree"}
                  {profile?.semester ? ` · Semester ${profile.semester}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {[profile?.department, profile?.university].filter(Boolean).join(" · ") || "Add your department and university so the Twin can reason about your program."}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5">
                  <TrendingUp className="size-3.5 text-primary" /> {game?.streakCount ?? 0}-day consistency
                </span>
                <span className="flex items-center gap-1 rounded-full bg-xp/15 px-3 py-1.5 text-xp-foreground">
                  <Zap className="size-3.5 fill-xp" /> Level {game?.level ?? 1}
                </span>
              </div>
            </div>

            {/* editor */}
            {editing && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-5 grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Degree" value={form.degree} onChange={(v) => setForm({ ...form, degree: v })} placeholder="BSc Computer Science" />
                  <Field label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Computing" />
                  <Field label="University" value={form.university} onChange={(v) => setForm({ ...form, university: v })} placeholder="Your university" />
                  <Field label="Semester" value={form.semester} onChange={(v) => setForm({ ...form, semester: v })} placeholder="4" type="number" />
                  <Field label="Credit hours this semester" value={form.creditHours} onChange={(v) => setForm({ ...form, creditHours: v })} placeholder="16" type="number" />
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grading scale</label>
                    <div className="mt-1.5 flex gap-2">
                      {(["4.0", "5.0"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setForm({ ...form, gradingScale: s })}
                          className={cn(
                            "flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors",
                            form.gradingScale === s ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="Current GPA" value={form.currentGpa} onChange={(v) => setForm({ ...form, currentGpa: v })} placeholder="3.2" type="number" />
                  <Field label="Current CGPA" value={form.currentCgpa} onChange={(v) => setForm({ ...form, currentCgpa: v })} placeholder="3.1" type="number" />
                  <Field label="Target GPA" value={form.targetGpa} onChange={(v) => setForm({ ...form, targetGpa: v })} placeholder="3.7" type="number" />
                  <Field label="Target CGPA" value={form.targetCgpa} onChange={(v) => setForm({ ...form, targetCgpa: v })} placeholder="3.6" type="number" />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button className="gap-2" onClick={saveProfile}><Check className="size-4" /> Save</Button>
                </div>
              </motion.div>
            )}
          </div>

          {/* ---------- CURRENT → GAP → NEXT ---------- */}
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {/* CURRENT */}
            <Panel title="CURRENT" subtitle="what is happening now" icon={Brain} tone="text-primary">
              <div className="flex items-center gap-4">
                <Ring pct={insights.overallMastery} size={72} colorClass="text-primary" label="mastery" />
                <div className="min-w-0 space-y-1.5 text-sm">
                  <p className="font-semibold">
                    {insights.answeredCount > 0
                      ? `${insights.answeredCount} questions answered`
                      : "No practice data yet"}
                  </p>
                  <p className="text-muted-foreground">
                    {insights.consistency > 0 ? `${insights.consistency}% consistency (14 days)` : "No study sessions logged yet"}
                  </p>
                  <p className="text-muted-foreground">
                    {dueCards > 0 ? `${dueCards} Recall cards due` : "Recall schedule is clear"}
                  </p>
                </div>
              </div>
              {(profile?.currentGpa != null || profile?.currentCgpa != null) && (
                <div className="mt-4 flex gap-4 border-t border-border/60 pt-4">
                  {profile?.currentGpa != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Current GPA</p>
                      <p className="font-data text-2xl font-semibold">{profile.currentGpa}</p>
                    </div>
                  )}
                  {profile?.currentCgpa != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Current CGPA</p>
                      <p className="font-data text-2xl font-semibold">{profile.currentCgpa}</p>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {/* GAP */}
            <Panel title="GAP" subtitle="what stands between you and the target" icon={Target} tone="text-chart-5">
              {gpaGap !== null && gpaGap > 0 ? (
                <p className="text-sm leading-relaxed">
                  <span className="font-bold text-chart-5">{gpaGap}</span> GPA points between your current{" "}
                  <span className="font-bold">{profile?.currentGpa}</span> and target{" "}
                  <span className="font-bold">{profile?.targetGpa}</span>.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {profile?.targetGpa == null
                    ? "Set a target GPA so the Twin can measure the gap."
                    : "You're at or above your target. Maintain and protect it."}
                </p>
              )}
              <div className="mt-4 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {weakList.length > 0 ? "Blocking concepts" : "No blocking concepts detected"}
                </p>
                {weakList.map((m) => (
                  <div key={m._id} className="rounded-xl bg-chart-5/10 px-3 py-2">
                    <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span className="truncate">{m.conceptLabel}</span>
                      <span className="text-chart-5">{Math.round((m.correct / m.attempts) * 100)}%</span>
                    </p>
                  </div>
                ))}
                {weakList.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Keep practicing: weak areas appear here the moment accuracy drops below 60%.
                  </p>
                )}
              </div>
            </Panel>

            {/* NEXT */}
            <Panel title="NEXT" subtitle="highest-impact action" icon={ArrowRight} tone="text-success">
              <p className="text-sm leading-relaxed">
                {insights.weakest
                  ? `Repair “${insights.weakest.label}”: it is your weakest measured area at ${insights.weakest.accuracy}% accuracy.`
                  : insights.answeredCount === 0
                    ? "Run your first Practice session so KYNEX can locate your gaps."
                    : "Consolidate: run Recall to protect what you already know."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button className="gap-2" onClick={() => navigate("/dashboard")}>
                  <Target className="size-4" /> Go to Next Move
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigate("/practice")}>
                  <Brain className="size-4" /> Open Practice
                </Button>
              </div>
            </Panel>
          </div>

          {/* ---------- MASTER SCORE ---------- */}
          {intel && (
            <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <ShieldCheck className="size-5 text-primary" /> Master Score
                </h3>
                <div className="flex items-center gap-2">
                  {intel.master.overall != null && (
                    <Ring pct={intel.master.overall} size={52} stroke={6} colorClass="text-primary" label="overall" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Eight dimensions · never one number
                  </span>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every dimension is computed from real practice, review and exam evidence.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {intel.master.dimensions.map((d) => (
                  <div key={d.key} className="rounded-2xl border border-border/60 bg-muted/30 p-4" title={d.note}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</p>
                    <p className={cn("mt-1.5 font-display text-2xl font-extrabold", d.value == null ? "text-muted-foreground" : "text-foreground")}>
                      {d.value != null ? `${d.value}%` : "--"}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{d.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- GAP RADAR + CONFIDENCE CALIBRATION ---------- */}
          {intel && (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-border/70 bg-card p-6">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Target className="size-5 text-chart-5" /> Gap Radar
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Eight gap types: what kind of “don't know” this actually is.
                </p>
                {intel.gaps.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                    No gaps detected yet. Practice sessions feed the radar, and gaps are useful signal, not failure.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2.5">
                    {intel.gaps.slice(0, 6).map((g, i) => (
                      <motion.button
                        key={`${g.type}-${g.conceptKey}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => {
                          if (g.conceptKey === "__exam_pacing__") return navigate("/practice");
                          if (g.materialId) navigate(`/practice/${g.materialId}?concept=${encodeURIComponent(g.conceptKey)}`);
                        }}
                        className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <span className="mt-0.5 shrink-0 rounded-full bg-chart-5/15 px-2.5 py-1 text-[10px] font-extrabold uppercase text-chart-5">
                          {g.type}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{g.conceptLabel}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{g.evidence}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-border/70 bg-card p-6">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Scale className="size-5 text-primary" /> Confidence Calibration
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Does your confidence match your actual accuracy?
                </p>
                {intel.calibration.verdict === "insufficient" ? (
                  <p className="mt-5 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                    {intel.calibration.note}
                  </p>
                ) : (
                  <>
                    <div className="mt-4 flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-extrabold",
                        intel.calibration.verdict === "overconfident" && "bg-destructive/15 text-destructive",
                        intel.calibration.verdict === "underconfident" && "bg-chart-4/15 text-chart-4",
                        intel.calibration.verdict === "calibrated" && "bg-success/15 text-success",
                      )}>
                        {intel.calibration.verdict.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        mean drift {intel.calibration.meanError} pts · {intel.calibration.total} answers
                      </span>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {intel.calibration.bands.filter((b) => b.count > 0).map((b) => (
                        <div key={b.key} className="rounded-xl bg-muted/40 px-3.5 py-2.5">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>{b.label}</span>
                            <span className={b.error <= 10 ? "text-success" : b.error <= 25 ? "text-warning-foreground" : "text-destructive"}>
                              {b.accuracy}% actual · ~{b.expectedAccuracy}% expected
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", b.accuracy >= b.expectedAccuracy ? "bg-success" : "bg-chart-5")} style={{ width: `${b.accuracy}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">{b.count} answers</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 rounded-xl bg-primary/5 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-primary">
                      {intel.calibration.note}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ---------- PROVE IT + MEMORY + YOU vs YOU ---------- */}
          {intel && (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {/* PROVE IT: verified mastery */}
              <div className="rounded-3xl border border-border/70 bg-card p-6">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <ShieldCheck className="size-5 text-success" /> Prove It
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Knowledge is not mastery. Verified = accurate + applied + novel + recalled.
                </p>
                {intel.proveIt.length === 0 ? (
                  <p className="mt-5 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                    No practice evidence yet. Mastery claims start with real answers.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {intel.proveIt.slice(0, 8).map((p) => (
                      <div key={p.conceptKey} className={cn("rounded-2xl border px-4 py-3", p.verified ? "border-success/40 bg-success/5" : "border-border/60 bg-muted/20")}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold">{p.conceptLabel}</p>
                          {p.verified ? (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-success">
                              <CheckCircle2 className="size-3" /> verified
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">{p.accuracy}%</span>
                          )}
                        </div>
                        {!p.verified && p.missing.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {p.missing.map((m) => (
                              <li key={m} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                <Circle className="mt-0.5 size-2.5 shrink-0 text-border" /> {m}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {/* MEMORY ENGINE */}
                <div className="rounded-3xl border border-border/70 bg-card p-6">
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold">Memory Engine</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Review recommendations based on your recent performance, not medical certainty.
                  </p>
                  {intel.memory.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                      Memory tracking starts after your first practice session.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-1.5">
                      {intel.memory.slice(0, 6).map((m) => (
                        <div key={m.conceptKey} className="flex items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
                          <span className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            m.status === "stable" && "bg-success",
                            m.status === "review_soon" && "bg-warning",
                            m.status === "at_risk" && "bg-destructive",
                            m.status === "new" && "bg-primary",
                          )} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.conceptLabel}</span>
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {m.status.replace("_", " ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* YOU vs YOU */}
                <div className="rounded-3xl border border-xp/40 bg-xp/5 p-6">
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold">You vs You</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Your only competition is your past self.
                  </p>
                  {!intel.you.enoughData ? (
                    <p className="mt-5 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                      Finish 4+ practice sessions to unlock your personal trends.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <Delta label="Accuracy" delta={intel.you.accuracy?.delta ?? null} now={intel.you.accuracy?.now ?? null} />
                      <Delta label="Recall" delta={intel.you.recall?.delta ?? null} now={intel.you.recall?.now ?? null} />
                      <Delta label="Careless" delta={intel.you.careless?.delta ?? null} now={intel.you.careless?.now ?? null} invert />
                      {intel.you.personalBest != null && (
                        <div className="col-span-3 rounded-xl bg-card/70 px-3.5 py-2.5 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Personal best session</p>
                          <p className="font-data text-xl font-semibold text-success">{intel.you.personalBest}%</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------- Pulse detail ---------- */}
          <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
            <h3 className="font-display text-lg font-bold">Academic Pulse</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Learning-performance indicators, not predictions or diagnoses.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Signal label="Mastery" value={insights.overallMastery} trend={insights.accuracyTrend?.delta} tone="text-primary" />
              <Signal label="Exam Readiness" value={insights.examReadiness} tone="text-chart-4" note="modelled estimate: mastery 50% · accuracy 30% · consistency 20%" />
              <Signal label="Consistency" value={insights.consistency} tone="text-chart-2" note="distinct study days out of the last 14" />
              <Signal label="Recall" value={insights.recallTrend?.to ?? null} trend={insights.recallTrend?.delta} tone="text-success" note="from your last 20 card reviews" />
            </div>
            {insights.recallTrend && insights.recallTrend.delta < -5 && insights.accuracyTrend && insights.accuracyTrend.delta > 0 && (
              <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
                Your recall is falling while understanding is improving. A short retrieval session is recommended.{" "}
                <button className="font-bold underline underline-offset-2" onClick={() => navigate("/flashcards")}>open Recall</button>.
              </p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

function Panel({
  title, subtitle, icon: Icon, tone, children,
}: {
  title: string; subtitle: string; icon: typeof Brain; tone: string; children: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-border/70 bg-card p-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]">
        <Icon className={cn("size-4", tone)} /> <span className={tone}>{title}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

function Signal({
  label, value, trend, tone, note,
}: {
  label: string; value: number | null; trend?: number; tone: string; note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4" title={note}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {typeof trend === "number" && trend !== 0 && (
          <span className={cn("flex items-center text-[10px] font-bold", trend > 0 ? "text-success" : "text-destructive")}>
            {trend > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className={cn("mt-1.5 font-display text-2xl font-extrabold", tone)}>
        {value != null ? value : "--"}{value != null ? "%" : ""}
      </p>
    </div>
  );
}

function Delta({
  label, delta, now, invert = false,
}: {
  label: string; delta: number | null; now: number | null; invert?: boolean;
}) {
  const good = delta == null ? false : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="rounded-2xl bg-card/70 p-3.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 font-display text-xl font-extrabold",
        delta == null ? "text-muted-foreground" : good ? "text-success" : "text-chart-5",
      )}>
        {delta == null ? "--" : `${delta > 0 ? "+" : ""}${delta}`}
      </p>
      <p className="text-[10px] text-muted-foreground">now {now != null ? now : "--"}</p>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 rounded-xl"
      />
    </div>
  );
}
