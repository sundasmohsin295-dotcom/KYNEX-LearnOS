import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowDownRight, ArrowUpRight, Award, BarChart3, Brain, Crosshair, FileBarChart,
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
  const weekly = useQuery(api.intelligence.weeklyReportQuery);

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
          {/* ---------- Weekly Academic Intelligence Report ---------- */}
          <WeeklyReportCard weekly={weekly} />

          {/* ---------- Pulse trends ---------- */}
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <BarChart3 className="size-5 text-primary" /> Academic Pulse
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signals move as you practice and review. Indicators of performance, not diagnoses.
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
                  Recall is falling while understanding improves: a short retrieval session is recommended.
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
                  No mistakes recorded yet. That will change (and that's useful).
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
            <div className="rounded-3xl border border-xp/40 bg-xp/5 p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Target className="size-5 text-xp-foreground" /> Exam Radar
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preparation priority from your mastery, recency and question counts: evidence-based, never a prediction of what will appear.
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
          "--"
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
      <p className={cn("font-data mt-1.5 text-2xl font-semibold", tone)}>{value}%</p>
    </div>
  );
}

/** Weekly Academic Intelligence Report — every line traces to a real number.
 *  A quiet week is reported honestly and met with a small next action. */
function WeeklyReportCard({
  weekly,
}: {
  weekly:
    | {
        report: {
          ready: boolean;
          notReadyReason?: string;
          improved: { evidence: string }[];
          stillWeak: { evidence: string }[];
          repeatedMistakes: { evidence: string }[];
          mastered: string[];
          forgotten: string[];
          examRisk: string | null;
          goalProgress: string;
          nextAction: string;
          stats: {
            minutesThisWeek: number;
            minutesLastWeek: number;
            questionsThisWeek: number;
            accuracyThisWeek: number | null;
            accuracyLastWeek: number | null;
            reviewsThisWeek: number;
          };
        };
      }
    | undefined
    | null;
}) {
  if (!weekly) return null;
  const r = weekly.report;

  return (
    <div className="mb-6 rounded-3xl border border-primary/25 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <FileBarChart className="size-5 text-primary" /> Weekly Intelligence Report
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Last 7 days vs previous 7
        </span>
      </div>

      {!r.ready ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {r.notReadyReason}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Study minutes" value={`${r.stats.minutesThisWeek}`} sub={`last week: ${r.stats.minutesLastWeek}`} />
            <Stat
              label="Practice accuracy"
              value={r.stats.accuracyThisWeek != null ? `${r.stats.accuracyThisWeek}%` : "--"}
              sub={
                r.stats.accuracyLastWeek != null
                  ? `last week: ${r.stats.accuracyLastWeek}%`
                  : "first recorded week"
              }
            />
            <Stat label="Questions answered" value={`${r.stats.questionsThisWeek}`} sub={`this week`} />
            <Stat label="Recall reviews" value={`${r.stats.reviewsThisWeek}`} sub={`this week`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-success">What improved</p>
              <ul className="mt-2 space-y-1.5">
                {r.improved.length > 0 ? (
                  r.improved.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {s.evidence}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No measurable improvement this week. The next action below is the fastest lever.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-chart-5">Still weak</p>
              <ul className="mt-2 space-y-1.5">
                {r.stillWeak.length > 0 ? (
                  r.stillWeak.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <Target className="mt-0.5 size-3.5 shrink-0 text-chart-5" />
                      {s.evidence}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">Nothing below the mastery floor. Keep the streak of solid work.</li>
                )}
              </ul>
            </div>
          </div>

          {r.repeatedMistakes.length > 0 && (
            <div className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-destructive">Repeated mistakes: break the pattern</p>
              <ul className="mt-1.5 space-y-1">
                {r.repeatedMistakes.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {s.evidence}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Mastered (verified)" value={`${r.mastered.length}`} sub="3+ attempts at 85%+" />
            <Stat label="Needs refresh" value={`${r.forgotten.length}`} sub="mastered, untouched 2+ weeks" />
            <Stat label="Recall reviews" value={`${r.stats.reviewsThisWeek}`} sub="spaced repetition" />
          </div>

          {r.examRisk && (
            <p className="mt-4 rounded-2xl border border-xp/40 bg-xp/5 px-4 py-3 text-sm text-foreground/90">
              <strong className="font-bold">Exam risk:</strong> {r.examRisk}
            </p>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">Goal progress:</strong> {r.goalProgress}
          </p>

          <p className="mt-3 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground">
            Next action: {r.nextAction}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
