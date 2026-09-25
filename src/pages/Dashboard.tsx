import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, Brain, ChevronDown, Play, Plus,
  Radar, RefreshCw, Rocket, Siren, Sparkles, Target, Timer, Trophy, Wrench, Zap, Info,
  ShieldCheck, TrendingUp, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { spring, TiltCard } from "@/lib/motion";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MasteryRings, StreakDots } from "@/components/VisualBits";
import { LockedSkeleton } from "@/components/LoadLock";
import { MASTERY_LOOP, levelTitle, identityRank } from "@/lib/game";
import { cn } from "@/lib/utils";
import type { Mission } from "@/lib/learning";
import type { FunctionComponent } from "react";

/**
 * Readiness Radar — rolling unit proficiency from the readiness engine.
 *
 * Every number is real: proficiency is computed server-side from verified
 * quiz answers only (recency-weighted). Units below 70% are flagged with a
 * structured review module; units without enough evidence say so honestly
 * instead of showing a made-up score.
 */
function ReadinessRadar({ navigate }: { navigate: (to: string) => void }) {
  const readiness = useQuery(api.readiness.readinessQuery);

  if (readiness === undefined) {
    return (
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <Skeleton className="h-5 w-44" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (readiness === null) return null;

  const { counts, units, modules } = readiness;
  const hasAnyEvidence = counts.ready + counts.building + counts.needsRepair > 0;

  const STATUS_STYLE: Record<
    string,
    { label: string; cls: string }
  > = {
    needs_repair: { label: "Repair", cls: "bg-chart-5/15 text-chart-5" },
    building: { label: "Building", cls: "bg-xp/20 text-xp-foreground" },
    ready: { label: "Ready", cls: "bg-success/15 text-success" },
    unverified: { label: "No evidence", cls: "bg-muted text-muted-foreground" },
  };

  const statusIcon: Record<string, FunctionComponent<{ className?: string }>> = {
    needs_repair: Wrench,
    building: RefreshCw,
    ready: ShieldCheck,
    unverified: Info,
  };

  return (
    <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Radar className="size-5 text-primary" /> Readiness Radar
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {`Repair below ${readiness.threshold}%`}
        </span>
      </div>
      {counts.needsRepair > 0 && (
        <p className="mt-2 rounded-xl bg-chart-5/10 px-3.5 py-2.5 text-xs leading-relaxed text-chart-5">
          {counts.needsRepair} unit{counts.needsRepair === 1 ? "" : "s"} below the {readiness.threshold}% line. Each has a structured review module: relearn, recall, practice, verify.
        </p>
      )}
      {!hasAnyEvidence ? (
        <p className="mt-4 rounded-xl bg-muted/50 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          {counts.unverified > 0
            ? "Units exist but none have enough practice evidence yet. Answer at least 3 questions on a unit and its rolling score will appear here."
            : "Practice a unit to start its readiness score. Only verified quiz evidence moves it, never passive reading."}
        </p>
      ) : (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {units.map((u) => {
            const style = STATUS_STYLE[u.status] ?? STATUS_STYLE.unverified;
            const Icon = statusIcon[u.status] ?? Info;
            const clickable = u.status !== "unverified" && u.materialId;
            return (
              <button
                key={u.unitKey}
                onClick={() => {
                  if (!clickable) return;
                  navigate(`/practice/${u.materialId}?concept=${encodeURIComponent(u.unitKey)}`);
                }}
                disabled={!clickable}
                className={cn(
                  "rounded-2xl border border-border/60 bg-muted/30 p-4 text-left transition-colors",
                  clickable && "hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{u.unitLabel}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold", style.cls)}>
                    {style.label}
                  </span>
                </div>
                <p className="mt-1.5 font-data text-xl font-extrabold tabular-nums tracking-tight">
                  {u.proficiency !== null ? `${u.proficiency}%` : "--"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={u.evidence}>
                  {u.evidence}
                </p>
              </button>
            );
          })}
        </div>
      )}
      {modules.length > 0 && (
        <div className="mt-4 space-y-2">
          {modules.map((m) => (
            <div key={m.unitKey} className="rounded-2xl border border-chart-5/25 bg-chart-5/5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold">Review module · {m.unitLabel}</p>
                <span className="shrink-0 text-[10px] font-extrabold text-chart-5">{m.proficiency}%</span>
              </div>
              <ol className="mt-1.5 space-y-1">
                {m.steps.map((s, i) => (
                  <li key={s.kind} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-chart-5/15 text-[9px] font-extrabold text-chart-5">
                      {i + 1}
                    </span>
                    <span className="min-w-0"><span className="font-semibold text-foreground">{s.title}</span> · {s.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Live signals from the nudge engine — every line carries a REAL number from
 *  the student's own data. Recomputed server-side on load; dismissal persists. */
function NudgeStrip() {
  const navigate = useNavigate();
  const nudges = useQuery(api.nudges.listMine);
  const refresh = useMutation(api.nudges.refresh);
  const dismiss = useMutation(api.nudges.dismiss);
  const [hidden, setHidden] = useState<string[]>([]);

  // Recompute signals from real stored data (idempotent, server-side).
  useEffect(() => {
    void refresh({});
  }, [refresh]);

  if (!nudges) return null;
  const visible = nudges.filter((n) => !hidden.includes(n._id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {visible.map((n) => (
        <motion.div
          key={n._id}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3"
        >
          <Radar className="mt-0.5 size-4 shrink-0 text-primary" />
          <button
            className="min-w-0 flex-1 text-left text-sm leading-snug"
            onClick={() => navigate(n.targetRoute)}
          >
            {n.body}
            <span className="ml-2 whitespace-nowrap text-xs font-bold text-primary">Go →</span>
          </button>
          <button
            aria-label="Dismiss signal"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={async () => {
              setHidden((h) => [...h, n._id]); // optimistic
              try {
                await dismiss({ id: n._id }); // persisted: never nags twice
              } catch {
                toast.error("Couldn't dismiss the signal. It will return on next load.");
              }
            }}
          >
            <X className="size-4" />
          </button>
        </motion.div>
      ))}
    </div>
  );
}

function useMissionAction() {
  const navigate = useNavigate();
  return (m: Mission) => {
    if (m.kind === "review") return navigate("/flashcards");
    if (m.materialId) {
      const conceptQs = m.conceptKey ? `?concept=${encodeURIComponent(m.conceptKey)}` : "";
      return navigate(`/practice/${m.materialId}${conceptQs}`);
    }
    // Rescue-plan / general missions without a specific material open the
    // practice picker so the student stays in a learning flow.
    if (m.kind === "practice" || m.kind === "fix_gap" || m.kind === "master") {
      return navigate("/practice");
    }
    return navigate("/library");
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const overview = useQuery(api.profiles.myOverview);
  const insights = useQuery(api.profiles.myInsights);
  const materials = useQuery(api.materials.list);
  const intel = useQuery(api.intelligence.dailyBriefQuery);
  const startQuick = useMutation(api.intelligence.startQuickMission);
  const startRescue = useMutation(api.intelligence.startRescuePlan);
  const startMission = useMutation(api.missions.startFromCurrent);
  const act = useMissionAction();
  const [showWhy, setShowWhy] = useState(false);
  const [rescueOpen, setRescueOpen] = useState(false);
  const [rescueHours, setRescueHours] = useState(4);
  const [rescueWhy, setRescueWhy] = useState("");
  const [rescueBusy, setRescueBusy] = useState(false);
  const [startingMission, setStartingMission] = useState(false);
  // Ticks once per minute so the exam countdown stays honest without calling
  // the impure Date.now() during render. Declared with all other Hooks so the
  // Hook sequence is identical on loading AND loaded renders.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!overview) {
    return (
      <AppShell>
        <div className="space-y-6">
          {/* Layout-locked loaders (§3): each skeleton pins the bounding box
              its hydrated block will occupy — zero CLS on data arrival. */}
          <LockedSkeleton className="rounded-2xl" height="40px" />
          <LockedSkeleton className="rounded-3xl" height="176px" />
          <div className="grid gap-5 md:grid-cols-3">
            <LockedSkeleton className="rounded-3xl" height="128px" />
            <LockedSkeleton className="rounded-3xl" height="128px" />
            <LockedSkeleton className="rounded-3xl" height="128px" />
          </div>
        </div>
      </AppShell>
    );
  }

  const { game, stats, activeMissions, weekMinutes, mastery, recentXp, nextExam, profile } = overview;
  const mission: Mission | undefined = activeMissions[0];
  const weekTotal = weekMinutes.reduce((n, d) => n + d.minutes, 0);
  const maxMin = Math.max(30, ...weekMinutes.map((d) => d.minutes));
  const streak = game.streakCount;
  const streakAlive = stats.streakSafe;
  const daysToExam = nextExam ? Math.ceil((nextExam.examDate - Date.now()) / 86400000) : null;

  // Identity rank: a deterministic mapping from the student's OWN measured
  // numbers — no fabricated cohort comparisons KYNEX has no data to claim.
  const rank = identityRank({ accuracy: stats.accuracy, mastered: stats.mastered, streak });

  // Exam-proximity triage: honest compression cue from real coverage data.
  // KYNEX never invents pass probabilities; urgency comes from the actual
  // countdown and guidance from actually-measured weak/strong concepts.
  const triageLine =
    nextExam && daysToExam !== null
      ? daysToExam <= 7
        ? stats.weakCount > 0
          ? `${stats.weakCount} concept${stats.weakCount === 1 ? " still measures" : "s still measure"} weak. Triage those first; leave mastered topics on maintenance.`
          : stats.accuracy >= 80
            ? "No weak concepts left. One timed pass beats new material now."
            : "Coverage is complete but accuracy says polish: rerun your weakest sets."
        : daysToExam <= 30
          ? stats.weakCount > 0
            ? `${stats.weakCount} weak concept${stats.weakCount === 1 ? "" : "s"} left to close while there's still time.`
            : "Solid coverage. Deepen mastery while the window allows."
          : "Coverage window is open: build understanding now, triage later."
      : null;

  // NEXT MOVE evidence, computed from real data only
  const weakMastery = mission?.conceptKey
    ? mastery.find((m) => m.conceptKey === mission.conceptKey)
    : undefined;
  const weakAcc = weakMastery && weakMastery.attempts > 0
    ? Math.round((weakMastery.correct / weakMastery.attempts) * 100)
    : null;
  const missionIcon = MISSION_ICON[mission?.kind ?? "practice"] ?? Target;
  const MissionIcon = missionIcon;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`KYNEX Twin · Level ${game.level} ${levelTitle(game.level)} · ${rank.label}`}
        title={
          profile.name ? (
            <>Your academic state, {profile.name.split(" ")[0]}.</>
          ) : (
            <>Your academic state.</>
          )
        }
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => navigate("/twin")}>
            <Brain className="size-4" /> Twin
          </Button>
          <Button onClick={() => navigate("/add")} className="gap-2 rounded-xl shadow-lg shadow-primary/25">
            <Plus className="size-4" /> Add to Vault
          </Button>
        </div>
      </PageHeader>

      <NudgeStrip />

      {/* ---------- NEXT MOVE ---------- */}
      {mission ? (
        <TiltCard
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.expressive}
          className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 sm:p-8"
        >
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                <Target className="size-4" /> Your Next Move
              </p>
              <h2 className="mt-2 flex items-start gap-2 font-display text-2xl font-extrabold tracking-tight">
                <MissionIcon className="mt-1 size-5 shrink-0 text-primary" />
                {mission.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mission.description}</p>

              {/* evidence */}
              <button
                onClick={() => setShowWhy((s) => !s)}
                className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary transition-colors hover:text-primary/80"
              >
                <Info className="size-3.5" /> Why this?
                <ChevronDown className={cn("size-3.5 transition-transform", showWhy && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {showWhy && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2.5 space-y-1.5 overflow-hidden"
                  >
                    {weakAcc !== null && (
                      <Evidence>{`Your recent accuracy on this concept is ${weakAcc}% across ${weakMastery?.attempts ?? 0} questions.`}</Evidence>
                    )}
                    {mission.kind === "review" && <Evidence>Spaced repetition is due: recall decays fastest here right now.</Evidence>}
                    {mission.kind === "practice" && !weakMastery && <Evidence>This is your newest material. Testing yourself now finds gaps early.</Evidence>}
                    <Evidence>{`Mission progress so far: ${mission.progress}/${mission.targetCount}. Worth +${mission.xpReward} XP on completion.`}</Evidence>
                  </motion.ul>
                )}
              </AnimatePresence>

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
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="h-14 gap-2 rounded-2xl px-8 text-base font-bold shadow-xl shadow-primary/30"
                disabled={startingMission}
                onClick={async () => {
                  setStartingMission(true);
                  try {
                    // ONE CLICK → real persisted mission with tasks → mission screen.
                    const res = await startMission({});
                    navigate(`/mission/${String(res.missionId)}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Couldn't start the mission");
                    // Fall back to the classic mission flow if generation can't run.
                    act(mission);
                  } finally {
                    setStartingMission(false);
                  }
                }}
              >
                <Play className="size-5 fill-current" /> {startingMission ? "Preparing mission…" : "Start Mission"}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowWhy((s) => !s)}>
                Show reasoning
              </Button>
            </div>
          </div>
        </TiltCard>
      ) : (
        <div className="rounded-3xl border border-border/70 bg-card p-8 text-center">
          <p className="font-display text-xl font-bold">No active mission</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a material to the Vault and KYNEX will compute your first Next Move from it.
          </p>
          <Button className="mt-5 gap-2" onClick={() => navigate("/add")}>
            <Plus className="size-4" /> Add your first material
          </Button>
        </div>
      )}

      {/* ---------- Daily Brief + Oracle ---------- */}
      {intel && (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Sparkles className="size-5 text-primary" /> Your Academic Brief
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">What matters today</span>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <BriefTile item={intel.brief.biggestRisk} navigate={navigate} tone="text-chart-5" icon={Siren} />
              <BriefTile item={intel.brief.biggestImprovement} navigate={navigate} tone="text-success" icon={TrendingUp} />
              <BriefTile item={intel.brief.conceptToStrengthen} navigate={navigate} tone="text-primary" icon={Brain} />
              <BriefTile item={intel.brief.examPriority} navigate={navigate} tone="text-chart-4" icon={Trophy} />
              <BriefTile item={intel.brief.quickMission} navigate={navigate} tone="text-xp-foreground" icon={Timer} />
              <BriefTile item={intel.brief.personalBest} navigate={navigate} tone="text-success" icon={ShieldCheck} />
            </div>
            {/* 20-minute mission CTA: creates a REAL mission from real state */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">{intel.quickMission.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{intel.quickMission.description}</p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg"
                onClick={async () => {
                  try {
                    await startQuick({ minutes: 20 });
                    toast.success("Quick mission ready: it's your Next Move now");
                    navigate("/dashboard");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Couldn't start the mission");
                  }
                }}
              >
                <Rocket className="size-3.5" /> Start 20-min mission
              </Button>
            </div>
          </div>

          {/* KYNEX Oracle */}
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Info className="size-5 text-primary" /> KYNEX Oracle
              </h3>
              <RiskBadge level={intel.oracle.level} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Based on your available data, never a certainty.
            </p>
            <div className="mt-3 space-y-2">
              {intel.oracle.reasons.length === 0 ? (
                <p className="rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground">
                  KYNEX needs practice evidence before it can assess academic risk.
                </p>
              ) : (
                intel.oracle.reasons.map((r, i) => (
                  <p key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" /> {r}
                  </p>
                ))
              )}
            </div>
            {intel.oracle.enoughData && (
              <div className="mt-4 rounded-xl bg-primary/5 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-primary">One action</p>
                <p className="mt-1 text-xs font-medium leading-relaxed">{intel.oracle.action}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- ONE THING TO FIX NEXT ---------- */}
      {intel?.oracle.enoughData && intel.oracle.level !== "LOW" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-chart-5/30 bg-chart-5/5 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-chart-5">One thing to fix next</p>
            <p className="mt-1 truncate font-display text-sm font-bold">{intel.oracle.action}</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 rounded-lg"
            disabled={startingMission}
            onClick={async () => {
              setStartingMission(true);
              try {
                const res = await startMission({});
                navigate(`/mission/${String(res.missionId)}`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't start the mission");
              } finally {
                setStartingMission(false);
              }
            }}
          >
            <Wrench className="size-3.5" /> Fix it
          </Button>
        </div>
      )}

      {/* ---------- Readiness Radar (rolling unit proficiency) ---------- */}
      <ReadinessRadar navigate={navigate} />

      {/* ---------- Rescue mode bar ---------- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-destructive/25 bg-destructive/5 px-6 py-4">
        <div>
          <p className="flex items-center gap-2 font-display text-sm font-bold text-destructive">
            <Siren className="size-4" /> Behind on material?
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tell KYNEX how much time you actually have: get a realistic recovery plan, never an all-nighter.
          </p>
        </div>
        <Button variant="outline" className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setRescueOpen(true)}>
          <Siren className="size-4" /> I'm behind: plan my recovery
        </Button>
      </div>

      {/* ---------- Academic Pulse ---------- */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles className="size-5 text-primary" /> Academic Pulse
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/gpa")}>
              GPA Lab <ArrowRight className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/twin")}>
              Full pulse <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PulseTile
            label="Overall Mastery"
            value={`${insights?.overallMastery ?? stats.accuracy}%`}
            trend={insights?.accuracyTrend?.delta}
            tone="text-primary"
          />
          <PulseTile
            label="Exam Readiness"
            value={`${insights?.examReadiness ?? 0}%`}
            tone="text-chart-4"
            note="modelled estimate from mastery, accuracy & consistency"
          />
          <PulseTile
            label="Weakest Area"
            value={insights?.weakest?.label ?? "--"}
            sub={insights?.weakest ? `${insights.weakest.accuracy}% accuracy` : "practice to reveal"}
            tone="text-chart-5"
            small
          />
          <PulseTile
            label="Strongest Area"
            value={insights?.strongest?.label ?? "--"}
            sub={insights?.strongest ? `${insights.strongest.accuracy}% accuracy` : "practice to reveal"}
            tone="text-success"
            small
          />
        </div>
        {insights?.recallTrend && insights.recallTrend.delta < -5 && insights.accuracyTrend && insights.accuracyTrend.delta > 0 && (
          <p className="mt-3 rounded-xl bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary">
            Your recall is falling while understanding is improving: a short Recall session is recommended.
          </p>
        )}
      </div>

      {/* ---------- GPA Command Center strip ---------- */}
      <GpaStrip navigate={navigate} />

      {/* ---------- Rhythm + mastery ---------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Study rhythm</h3>
            <span className="text-xs font-semibold text-muted-foreground">last 7 days · {Math.round(weekTotal)}m</span>
          </div>
          <div className="mt-6 flex h-36 items-end gap-2.5">
            {weekMinutes.map((d, i) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-2">
                <motion.div
                  className={cn(
                    "w-full rounded-lg",
                    d.minutes > 0 ? "bg-primary" : "bg-muted",
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

        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Mastery map</h3>
            <span className="text-xs font-semibold text-muted-foreground">{mastery.length} concepts</span>
          </div>
          {mastery.length === 0 ? (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Run a Practice session to light up your mastery map.
            </div>
          ) : (
            <MasteryRings rows={mastery.slice(0, 6)} className="mt-4" />
          )}
          {stats.weakCount > 0 && (
            <div className="mt-4 rounded-xl bg-chart-5/10 px-4 py-3 text-xs font-medium text-chart-5">
              KYNEX detected {stats.weakCount} weak concept{stats.weakCount === 1 ? "" : "s"}. Missions are targeting them.
            </div>
          )}
        </div>
      </div>

      {/* ---------- Vault + wins ---------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-border/70 bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Vault · recent sources</h3>
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
                  {m.status === "ready" ? <Brain className="size-4" /> : m.status === "failed" ? <Wrench className="size-4 text-destructive" /> : <span className="size-2 animate-pulse rounded-full bg-xp" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.status === "ready" ? `${m.wordCount} words · ${m.analysis?.concepts.length ?? 0} concepts` : m.status === "failed" ? m.error ?? "Failed" : "Processing…"}
                  </p>
                </div>
              </button>
            ))}
            {(materials ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Vault is empty. Add your first source.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="font-display text-lg font-bold">Recent progress</h3>
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
              <p className="py-4 text-sm text-muted-foreground">Progress events will appear here.</p>
            )}
          </div>
        </div>
      </div>

      {/* consistency */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">
              {streak > 0 ? `${streak}-day consistency` : "Build a consistency streak"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {streakAlive
                ? "Today is locked in. Come back tomorrow to extend it."
                : streak > 0
                  ? "Welcome back. Your progress is still here, and one session restarts the flame."
                  : "Consistency beats intensity. 10 minutes a day is enough."}
            </p>
          </div>
          <div className="flex items-center gap-5">
            {daysToExam !== null && nextExam && (
              <div className="text-right">
                <p className="font-data text-xs font-semibold text-muted-foreground">Radar · {daysToExam} days</p>
                <p className="font-display font-bold">{nextExam.title}</p>
                {triageLine && (
                  <p className="mt-0.5 max-w-56 text-[11px] leading-snug text-muted-foreground">{triageLine}</p>
                )}
              </div>
            )}
            <StreakDots streak={streak} todayDone={streakAlive} />
          </div>
        </div>
      </div>

      <RescueModal
        open={rescueOpen}
        onClose={() => setRescueOpen(false)}
        hours={rescueHours}
        setHours={setRescueHours}
        why={rescueWhy}
        setWhy={setRescueWhy}
        busy={rescueBusy}
        onSubmit={async () => {
          setRescueBusy(true);
          try {
            const res = await startRescue({ hours: rescueHours, situation: rescueWhy });
            toast.success(res.summary, { description: res.honestNote });
            setRescueOpen(false);
            setRescueWhy("");
            navigate("/dashboard");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't build the plan");
          } finally {
            setRescueBusy(false);
          }
        }}
      />
    </AppShell>
  );
}

function Evidence({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
      {children}
    </li>
  );
}

/** Compact GPA Command Center — real numbers from the student's own GPA Lab. */
function GpaStrip({ navigate }: { navigate: (to: string) => void }) {
  const gpa = useQuery(api.gpa.overview);
  if (!gpa || (gpa.currentCgpa == null && !gpa.targetCgpa)) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-card px-6 py-4">
        <div>
          <p className="font-display text-sm font-bold">GPA Command Center</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add your graded semesters in the GPA Lab to unlock CGPA projections, required GPA and scenarios.
          </p>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate("/gpa")}>
          Set up GPA Lab <ArrowRight className="size-3.5" />
        </Button>
      </div>
    );
  }
  const gap =
    gpa.currentCgpa != null && gpa.targetCgpa != null
      ? +(gpa.targetCgpa - gpa.currentCgpa).toFixed(2)
      : null;
  return (
    <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">GPA Command Center</h3>
        <Button variant="ghost" size="sm" className="text-primary" onClick={() => navigate("/gpa")}>
          Simulate <ArrowRight className="size-3.5" />
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PulseTile label="Current CGPA" value={gpa.currentCgpa != null ? String(gpa.currentCgpa) : "--"} tone="text-primary" />
        <PulseTile label="Target" value={gpa.targetCgpa != null ? String(gpa.targetCgpa) : "--"} tone="text-foreground" />
        <PulseTile label="Projected" value={gpa.projected != null ? String(gpa.projected) : "--"} tone="text-chart-4" note="current in-progress courses at entered expected grades" />
        <PulseTile
          label="Gap to target"
          value={gap != null ? (gap > 0 ? `+${gap}` : "0") : "--"}
          sub={gap != null && gap > 0 ? "required GPA computed in the Lab" : "on or above target"}
          tone={gap != null && gap > 0 ? "text-chart-5" : "text-success"}
        />
      </div>
    </div>
  );
}

/** One line of the Daily Brief — navigates to the relevant subsystem. */
function BriefTile({
  item, navigate, tone, icon: Icon,
}: {
  item: {
    label: string; value: string; sub?: string; to?: string;
    materialId?: string | null; conceptKey?: string; empty: boolean;
  };
  navigate: (to: string) => void;
  tone: string;
  icon: typeof Target;
}) {
  const go = () => {
    if (item.empty || !item.to) return;
    if (item.to === "practice" && item.materialId) {
      const q = item.conceptKey ? `?concept=${encodeURIComponent(item.conceptKey)}` : "";
      navigate(`/practice/${item.materialId}${q}`);
    } else if (item.to === "flashcards") navigate("/flashcards");
    else if (item.to === "mistakes") navigate("/mistakes");
    else if (item.to === "twin") navigate("/twin");
    else navigate("/practice");
  };
  return (
    <button
      onClick={go}
      disabled={item.empty}
      className={cn(
        "rounded-2xl border border-border/60 bg-muted/30 p-4 text-left transition-colors",
        !item.empty && "hover:border-primary/40 hover:bg-accent/50",
      )}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("size-3.5", tone)} /> {item.label}
      </p>
      <p className={cn("mt-1.5 truncate font-display text-sm font-extrabold", item.empty ? "text-muted-foreground" : tone)} title={item.value}>
        {item.value}
      </p>
      {item.sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.sub}</p>}
    </button>
  );
}

const RISK_STYLES: Record<string, string> = {
  LOW: "bg-success/15 text-success",
  MEDIUM: "bg-xp/20 text-xp-foreground",
  HIGH: "bg-chart-5/15 text-chart-5",
  CRITICAL: "bg-destructive/15 text-destructive",
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={cn("rounded-full px-3 py-1 text-xs font-extrabold tracking-wide", RISK_STYLES[level] ?? "bg-muted text-muted-foreground")}>
      {level} RISK
    </span>
  );
}

/** Rescue Mode modal — creates a REAL multi-mission recovery plan. */
function RescueModal({
  open, onClose, hours, setHours, why, setWhy, busy, onSubmit,
}: {
  open: boolean; onClose: () => void;
  hours: number; setHours: (h: number) => void;
  why: string; setWhy: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const situations = [
    "Exam tomorrow",
    "Missed several classes",
    "Too many chapters",
    "Don't understand the basics",
    "Failed previous test",
    "Don't know where to start",
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.expressive}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-bold text-destructive">
              <Siren className="size-5" /> Rescue Mode
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A realistic plan from your actual weak spots: prerequisite repair first, always.
            </p>
          </div>
          <Button size="icon" variant="ghost" className="size-8" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">How much time do you have?</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[1, 2, 4, 6, 8].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={cn(
                "rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors",
                hours === h
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {h}h
            </button>
          ))}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What happened? (optional)</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {situations.map((s) => (
            <button
              key={s}
              onClick={() => setWhy(why === s ? "" : s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                why === s
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="mt-4 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Plans are paced with breaks in mind. Sleep beats cramming: retention collapses without it.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="gap-2" disabled={busy} onClick={onSubmit}>
            <Siren className="size-4" /> {busy ? "Building plan…" : "Build my recovery plan"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PulseTile({
  label, value, sub, note, tone, small = false, trend,
}: {
  label: string;
  value: string;
  sub?: string;
  note?: string;
  tone: string;
  small?: boolean;
  trend?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/60 bg-muted/30 p-4"
      title={note}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {typeof trend === "number" && trend !== 0 && (
          <span className={cn("flex items-center text-[10px] font-bold", trend > 0 ? "text-success" : "text-destructive")}>
            {trend > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className={cn(
        "mt-1.5 font-data font-extrabold tabular-nums tracking-tight",
        small ? "truncate text-sm" : "text-2xl",
        tone,
      )}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

const MISSION_ICON: Record<string, typeof Target> = {
  practice: Target,
  review: RefreshCw,
  fix_gap: Wrench,
  learn: Sparkles,
  master: Trophy,
};
