import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Flame, Play, Plus, RefreshCw, Sparkles, Target, TrendingUp, Trophy, Wrench, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MasteryRings, StreakDots } from "@/components/VisualBits";
import { MASTERY_LOOP, levelTitle } from "@/lib/game";
import { cn } from "@/lib/utils";
import type { Mission } from "@/lib/studyos";

const MISSION_ICON: Record<string, typeof Target> = {
  practice: Target,
  review: RefreshCw,
  fix_gap: Wrench,
  learn: Sparkles,
  master: Trophy,
};

function useMissionAction() {
  const navigate = useNavigate();
  return (m: Mission) => {
    if (m.kind === "review") return navigate("/flashcards");
    if (m.materialId) {
      const conceptQs = m.conceptKey ? `?concept=${encodeURIComponent(m.conceptKey)}` : "";
      return navigate(`/practice/${m.materialId}${conceptQs}`);
    }
    return navigate("/library");
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const overview = useQuery(api.profiles.myOverview);
  const materials = useQuery(api.materials.list);
  const act = useMissionAction();

  if (!overview) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-44 w-full rounded-3xl" />
          <div className="grid gap-5 md:grid-cols-3">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  const { game, stats, activeMissions, weekMinutes, mastery, recentXp, nextExam } = overview;
  const mission: Mission | undefined = activeMissions[0];
  const totalMastery =
    mastery.length > 0
      ? Math.round(mastery.reduce((n, m) => n + Math.min(1, m.attempts > 0 ? m.correct / m.attempts : 0), 0) / mastery.length * 100)
      : 0;
  const weekTotal = weekMinutes.reduce((n, d) => n + d.minutes, 0);
  const maxMin = Math.max(30, ...weekMinutes.map((d) => d.minutes));
  const streak = game.streakCount;
  const streakAlive = stats.streakSafe;
  const daysToExam = nextExam ? Math.ceil((nextExam.examDate - Date.now()) / 86400000) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`Level ${game.level} · ${levelTitle(game.level)}`}
        title={
          <>
            Welcome back{overview.profile.name ? `, ${overview.profile.name}` : ""} 👋
          </>
        }
      >
        <div className="flex items-center gap-2">
          <span
            title={streakAlive ? `${streak}-day streak` : "Learn today to keep it alive"}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-bold",
              streakAlive
                ? "border-chart-5/30 bg-chart-5/10 text-chart-5"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            <Flame className={cn("size-4", streakAlive && "fill-chart-5/25")} />
            {streak} day{streak === 1 ? "" : "s"}
          </span>
          <Button onClick={() => navigate("/add")} className="gap-2 rounded-xl shadow-lg shadow-primary/25">
            <Plus className="size-4" /> Add material
          </Button>
        </div>
      </PageHeader>

      {/* ---------- NEXT MOVE ---------- */}
      {mission ? (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-xl shadow-primary/10 sm:p-8"
        >
          <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                <Target className="size-4" /> Next Move
              </p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{mission.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mission.description}</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 w-44 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${(mission.progress / mission.targetCount) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  {mission.progress}/{mission.targetCount}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-xp/20 px-2.5 py-0.5 text-xs font-bold text-xp-foreground">
                  <Zap className="size-3" /> +{mission.xpReward} XP
                </span>
              </div>
            </div>
            <Button size="lg" className="h-14 gap-2 rounded-2xl px-8 text-base font-bold shadow-xl shadow-primary/30" onClick={() => act(mission)}>
              <Play className="size-5 fill-current" /> Start Mission
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-3xl border border-border/70 bg-card p-8 text-center">
          <p className="font-display text-xl font-bold">No active mission</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a material and STUDYOS will build your next mission from it.
          </p>
          <Button className="mt-5 gap-2" onClick={() => navigate("/add")}>
            <Plus className="size-4" /> Add your first material
          </Button>
        </div>
      )}

      {/* ---------- Stat cards ---------- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Accuracy"
          value={`${stats.accuracy}%`}
          sub={`${stats.questionsAnswered} questions answered`}
          tone="text-primary"
        />
        <StatCard
          icon={Trophy}
          label="Concepts mastered"
          value={`${stats.mastered}`}
          sub={stats.weakCount > 0 ? `${stats.weakCount} weak concept${stats.weakCount === 1 ? "" : "s"} found` : "No weak concepts"}
          tone="text-success"
        />
        <StatCard
          icon={Zap}
          label="Total XP"
          value={`${game.xp}`}
          sub={`${game.xp % 250}/250 to level ${game.level + 1}`}
          tone="text-xp-foreground"
        />
        <StatCard
          icon={Flame}
          label="This week"
          value={`${Math.round(weekTotal)}m`}
          sub={daysToExam !== null && nextExam ? `${daysToExam}d until ${nextExam.title}` : "Keep the rhythm"}
          tone="text-chart-5"
        />
      </div>

      {/* ---------- Charts + mastery ---------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        {/* weekly minutes */}
        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Study rhythm</h3>
            <span className="text-xs font-semibold text-muted-foreground">last 7 days</span>
          </div>
          <div className="mt-6 flex h-36 items-end gap-2.5">
            {weekMinutes.map((d, i) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-2">
                <motion.div
                  className={cn(
                    "w-full rounded-lg",
                    d.minutes > 0 ? "bg-gradient-to-t from-primary/70 to-primary" : "bg-muted",
                    i === weekMinutes.length - 1 && d.minutes === 0 && "ring-1 ring-dashed ring-primary/40",
                  )}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(4, (d.minutes / maxMin) * 100)}%` }}
                  transition={{ duration: 0.7, delay: i * 0.05 }}
                  title={`${d.minutes} min`}
                />
                <span className="text-[10px] font-medium text-muted-foreground">
                  {new Date(d.day + "T00:00:00").toLocaleDateString("en", { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
          {/* mastery loop strip */}
          <div className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-5">
            {MASTERY_LOOP.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    i < 3 ? "bg-primary/10 text-primary" : i < 6 ? "bg-chart-4/10 text-chart-4" : "bg-success/10 text-success",
                  )}
                >
                  {s.label}
                </span>
                {i < MASTERY_LOOP.length - 1 && <span className="text-border">→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* mastery rings */}
        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Mastery map</h3>
            <span className="text-xs font-semibold text-muted-foreground">{mastery.length} concepts</span>
          </div>
          {mastery.length === 0 ? (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Practice a quiz to light up your mastery map.
            </div>
          ) : (
            <MasteryRings rows={mastery.slice(0, 6)} className="mt-4" />
          )}
          {stats.weakCount > 0 && (
            <div className="mt-4 rounded-xl bg-chart-5/10 px-4 py-3 text-xs font-medium text-chart-5">
              🔍 Your analysis shows {stats.weakCount} hidden weak concept{stats.weakCount === 1 ? "" : "s"} —
              missions are targeting them.
            </div>
          )}
        </div>
      </div>

      {/* ---------- Recent materials + XP feed ---------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Recent materials</h3>
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/library")}>
              View all
            </Button>
          </div>
          <div className="mt-4 space-y-2.5">
            {(materials ?? []).slice(0, 4).map((m) => (
              <button
                key={m._id}
                onClick={() => navigate(`/material/${m._id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  {m.status === "ready" ? <Sparkles className="size-4" /> : m.status === "failed" ? <span className="text-xs">⚠️</span> : <span className="size-2 animate-pulse rounded-full bg-xp" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.status === "ready" ? `${m.wordCount} words · analyzed` : m.status === "failed" ? m.error ?? "Failed" : "Processing…"}
                  </p>
                </div>
              </button>
            ))}
            {(materials ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No materials yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="font-display text-lg font-bold">Recent wins</h3>
          <div className="mt-4 space-y-3">
            {recentXp.map((e) => (
              <div key={e._id} className="flex items-start gap-2.5 text-sm">
                <Zap className="mt-0.5 size-3.5 shrink-0 fill-xp text-xp" />
                <div>
                  <p className="font-medium leading-tight">{e.reason}</p>
                  <p className="text-xs text-muted-foreground">+{e.amount} XP</p>
                </div>
              </div>
            ))}
            {recentXp.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">Your wins will appear here.</p>
            )}
          </div>
        </div>
      </div>

      {/* streak dots */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">
              {streak > 0 ? `${streak}-day learning streak 🔥` : "Start a streak today"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {streakAlive
                ? "Today is locked in. Come back tomorrow to extend it."
                : streak > 0
                  ? "Welcome back. Your progress is still here — one session restarts the flame."
                  : "Consistency beats intensity. 10 minutes a day is enough."}
            </p>
          </div>
          <StreakDots streak={streak} todayDone={streakAlive} />
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-lift rounded-3xl border border-border/70 bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("size-4.5", tone)} />
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  );
}
