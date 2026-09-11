import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowDownRight, ArrowUpRight, Award, BarChart3, Brain, Crosshair,
  Lock, Target, Trophy, Wrench,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACHIEVEMENT_META } from "@/convex/achievementMeta";

const MISTAKE_ICON: Record<string, typeof Target> = {
  "Concept Gap": Brain,
  Application: Wrench,
  Reasoning: Crosshair,
};

export default function Insights() {
  const navigate = useNavigate();
  const insights = useQuery(api.profiles.myInsights);
  const overview = useQuery(api.profiles.myOverview);
  const achievements = useQuery(api.learning.listAchievements);

  const loading = insights === undefined || overview === undefined;

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Pulse · Mistakes · Radar" title="Insights">
        <p className="max-w-md text-sm text-muted-foreground">
          Everything here is computed from your real practice, review and study activity. No invented statistics.
        </p>
      </PageHeader>

      {loading || insights === null ? (
        <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
      ) : (
        <>
          {/* ---------- Pulse trends ---------- */}
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <BarChart3 className="size-5 text-primary" /> Academic Pulse
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signals move as you practice and review. Indicators of performance — not diagnoses.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Trend label="Mastery" from={insights.accuracyTrend?.from ?? null} to={insights.accuracyTrend?.to ?? insights.overallMastery} note="accuracy, earlier vs recent sessions" />
              <Trend label="Recall" from={insights.recallTrend?.from ?? null} to={insights.recallTrend?.to ?? null} note="review quality, earlier vs recent" />
              <SignalBox label="Exam Readiness" value={insights.examReadiness} tone="text-chart-4" note="modelled estimate: mastery 50% · accuracy 30% · consistency 20%" />
              <SignalBox label="Consistency" value={insights.consistency} tone="text-chart-2" note="distinct study days out of 14" />
              <SignalBox label="Accuracy" value={insights.overallAccuracy} tone="text-primary" note={`${insights.answeredCount} questions answered`} />
            </div>
            {insights.recallTrend && insights.recallTrend.delta < -5 && insights.accuracyTrend && insights.accuracyTrend.delta > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 px-4 py-3">
                <p className="text-sm font-medium text-primary">
                  Recall is falling while understanding improves — a short retrieval session is recommended.
                </p>
                <Button size="sm" className="rounded-lg" onClick={() => navigate("/flashcards")}>Open Recall</Button>
              </div>
            )}
            {insights.sessionsAnalyzed === 0 && (
              <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Trends appear once you complete at least two Practice sessions.
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* ---------- Mistake Intelligence ---------- */}
            <div className="rounded-3xl border border-border/70 bg-card p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Wrench className="size-5 text-chart-5" /> Mistake Intelligence
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every wrong answer, grouped by error type from real quiz data.
              </p>
              {insights.mistakes.length === 0 ? (
                <p className="mt-6 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  No mistakes recorded yet — that will change (and that's useful).
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {insights.mistakes.map((m) => {
                    const Icon = MISTAKE_ICON[m.label] ?? Wrench;
                    return (
                      <motion.div key={m.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                        <div className="flex items-center justify-between">
                          <p className="flex items-center gap-2 text-sm font-bold">
                            <Icon className="size-4 text-chart-5" /> {m.label}
                          </p>
                          <span className="rounded-full bg-chart-5/15 px-2.5 py-0.5 text-xs font-bold text-chart-5">
                            {m.count} occurrence{m.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        {m.topConcepts.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {m.topConcepts.map((c) => (
                              <span key={c} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Each mistake feeds your mastery scores and the Next Move engine: mistake → explanation → practice → retest → mastery.
                  </p>
                </div>
              )}
            </div>

            {/* ---------- Exam Radar ---------- */}
            <div className="rounded-3xl border border-xp/40 bg-gradient-to-br from-xp/10 to-card p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Target className="size-5 text-xp-foreground" /> Exam Radar
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preparation priority from your mastery, recency and question counts — evidence-based, never a prediction of what will appear.
              </p>
              {insights.radar.length === 0 ? (
                <p className="mt-6 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  Radar lights up after your first Practice session.
                </p>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {insights.radar.slice(0, 8).map((r) => {
                    const tier =
                      r.priority >= 55 ? { label: "HIGH", cls: "bg-chart-5/15 text-chart-5" }
                      : r.priority >= 35 ? { label: "MEDIUM", cls: "bg-xp/20 text-xp-foreground" }
                      : { label: "REVISION", cls: "bg-primary/10 text-primary" };
                    return (
                      <button
                        key={r.conceptKey + r.materialId}
                        onClick={() => r.materialId && navigate(`/practice/${r.materialId}?concept=${encodeURIComponent(r.conceptKey)}`)}
                        className="flex w-full items-center gap-3 rounded-xl bg-card/80 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/60"
                      >
                        <span className={cn("rounded-md px-2 py-0.5 text-[9px] font-extrabold tracking-wide", tier.cls)}>
                          {tier.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{r.conceptLabel}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {r.accuracy}% accuracy · {r.attempts} questions
                          </span>
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">{r.priority}</span>
                      </button>
                    );
                  })}
                  <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Evidence suggests high-priority topics deserve more preparation time. KYNEX never claims a topic will appear on your exam.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ---------- Trophy case ---------- */}
          <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Trophy className="size-5 text-xp-foreground" /> Achievements
              </h3>
              <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/achievements")}>
                Full trophy case
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {Object.entries(ACHIEVEMENT_META).slice(0, 6).map(([key, meta]) => {
                const earned = (achievements?.earned ?? []).some((a) => a.key === key);
                return (
                  <div key={key} className={cn("rounded-2xl border p-3.5 text-center", earned ? "border-xp/40 bg-xp/10" : "border-border/60 bg-muted/30 opacity-70")}>
                    <span className={cn("mx-auto grid size-9 place-items-center rounded-xl", earned ? "bg-xp/25 text-xp-foreground" : "bg-muted text-muted-foreground")}>
                      {earned ? <Award className="size-4.5" /> : <Lock className="size-4" />}
                    </span>
                    <p className="mt-2 truncate text-xs font-bold" title={meta.title}>{meta.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Trend({
  label, from, to, note,
}: {
  label: string; from: number | null; to: number | null; note: string;
}) {
  const delta = from != null && to != null ? to - from : null;
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4" title={note}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-xl font-extrabold">
        {from != null && to != null ? (
          <>
            {from} <span className="text-muted-foreground">→</span> {to}
          </>
        ) : (
          "—"
        )}
      </p>
      {delta != null && delta !== 0 && (
        <span className={cn("mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold", delta > 0 ? "text-success" : "text-destructive")}>
          {delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {Math.abs(delta)} pts
        </span>
      )}
    </div>
  );
}

function SignalBox({ label, value, tone, note }: { label: string; value: number; tone: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4" title={note}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 font-display text-2xl font-extrabold", tone)}>{value}%</p>
    </div>
  );
}
