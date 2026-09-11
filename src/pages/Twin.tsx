import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, Brain, Check, Fingerprint,
  Pencil, Target, TrendingUp, Zap,
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
  const save = useMutation(api.profiles.setAcademicProfile);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    degree: "", department: "", university: "", semester: "", creditHours: "",
    gradingScale: "4.0" as "4.0" | "5.0",
    currentGpa: "", currentCgpa: "", targetGpa: "", targetCgpa: "",
  });

  const profile = overview?.profile;
  useEffect(() => {
    const e = params.get("edit");
    if (e === "1") { setEditing(true); setParams((p) => { p.delete("edit"); return p; }); }
  }, [params, setParams]);

  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
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
    }));
  }, [profile]);

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
              <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-lg">
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
                      <p className="font-display text-2xl font-extrabold">{profile.currentGpa}</p>
                    </div>
                  )}
                  {profile?.currentCgpa != null && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Current CGPA</p>
                      <p className="font-display text-2xl font-extrabold">{profile.currentCgpa}</p>
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
                    : "You're at or above your target — maintain and protect it."}
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
                    Keep practicing — weak areas appear here the moment accuracy drops below 60%.
                  </p>
                )}
              </div>
            </Panel>

            {/* NEXT */}
            <Panel title="NEXT" subtitle="highest-impact action" icon={ArrowRight} tone="text-success">
              <p className="text-sm leading-relaxed">
                {insights.weakest
                  ? `Repair “${insights.weakest.label}” — it is your weakest measured area at ${insights.weakest.accuracy}% accuracy.`
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

          {/* ---------- Pulse detail ---------- */}
          <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
            <h3 className="font-display text-lg font-bold">Academic Pulse</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Learning-performance indicators — not predictions or diagnoses.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Signal label="Mastery" value={insights.overallMastery} trend={insights.accuracyTrend?.delta} tone="text-primary" />
              <Signal label="Exam Readiness" value={insights.examReadiness} tone="text-chart-4" note="modelled estimate: mastery 50% · accuracy 30% · consistency 20%" />
              <Signal label="Consistency" value={insights.consistency} tone="text-chart-2" note="distinct study days out of the last 14" />
              <Signal label="Recall" value={insights.recallTrend?.to ?? null} trend={insights.recallTrend?.delta} tone="text-success" note="from your last 20 card reviews" />
            </div>
            {insights.recallTrend && insights.recallTrend.delta < -5 && insights.accuracyTrend && insights.accuracyTrend.delta > 0 && (
              <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
                Your recall is falling while understanding is improving. A short retrieval session is recommended —{" "}
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
        {value != null ? value : "—"}{value != null ? "%" : ""}
      </p>
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
