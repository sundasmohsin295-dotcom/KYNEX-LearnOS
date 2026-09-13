import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Brain, Check, CheckCircle2, ChevronDown, Eye, Lightbulb,
  Timer, Trophy, X, XCircle, MinusCircle, Sparkles, Target,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TaskDoc = {
  _id: string;
  order: number;
  kind: "explain" | "recall" | "practice" | "challenge";
  title: string;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  hint?: string;
  status: "pending" | "correct" | "partial" | "incorrect" | "skipped";
  confidence?: "sure" | "probably" | "guess";
};

type MissionDoc = {
  _id: string;
  title: string;
  description: string;
  kind: string;
  targetCount: number;
  progress: number;
  xpReward: number;
  conceptLabel?: string;
  status: "active" | "completed";
};

type CompleteResult = {
  ok: boolean;
  evidence: {
    correct: number; answered: number; skipped: number;
    confidentWrong: number; avgSeconds: number | null; scorePct: number | null;
  };
  mastery: { before: number; after: number } | null;
  mistakesCreated: number;
  conceptLabel: string | null;
  missionTitle: string;
};

const CONFIDENCE_META = [
  { key: "sure" as const, label: "I'm sure" },
  { key: "probably" as const, label: "Probably" },
  { key: "guess" as const, label: "Wild guess" },
];

const KIND_META: Record<TaskDoc["kind"], { label: string; cls: string }> = {
  explain: { label: "Learn", cls: "bg-primary/10 text-primary" },
  recall: { label: "Recall", cls: "bg-chart-2/15 text-chart-2" },
  practice: { label: "Check", cls: "bg-chart-4/15 text-chart-4" },
  challenge: { label: "Challenge", cls: "bg-xp/20 text-xp-foreground" },
};

/** Focused mission screen: one task at a time, every action real. */
export default function MissionScreen() {
  const navigate = useNavigate();
  const active = useQuery(api.missions.getActiveMission);
  const answerTask = useMutation(api.missions.answerTask);
  const completeMission = useMutation(api.missions.completeMission);
  const abandonMission = useMutation(api.missions.abandonMission);

  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<"sure" | "probably" | "guess" | null>(null);
  const [written, setWritten] = useState("");
  const [selfGrade, setSelfGrade] = useState<"correct" | "partial" | "incorrect" | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [feedback, setFeedback] = useState<{ verdict: string; correct: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const taskStart = useRef<number>(0);
  if (taskStart.current === 0) {
    // First render: start the clock for the first task without calling
    // impure functions during render.
    taskStart.current = Date.now();
  }

  const mission = active?.mission as MissionDoc | undefined;
  const tasks = (active?.tasks ?? []) as TaskDoc[];
  const loading = active === undefined;

  // No active mission → offer to generate one from real data.
  const startFromCurrent = useMutation(api.missions.startFromCurrent);

  const resetStep = () => {
    setSelected(null);
    setConfidence(null);
    setWritten("");
    setSelfGrade(null);
    setShowHint(false);
    setShowModel(false);
    setFeedback(null);
    taskStart.current = Date.now();
  };

  const task = tasks[cursor];

  const submit = async () => {
    if (!task || busy || feedback) return;
    if (task.kind === "practice" && selected === null) return;
    if (task.kind !== "practice" && !selfGrade) return;
    setBusy(true);
    try {
      const res = await answerTask({
        taskId: task._id as Id<"missionTasks">,
        selectedIndex: task.kind === "practice" ? selected! : undefined,
        selfGrade: task.kind !== "practice" ? selfGrade! : undefined,
        confidence: confidence ?? undefined,
        seconds: Math.round((Date.now() - taskStart.current) / 1000),
      });
      if (!res.ok) {
        toast.error(res.verdict === "MISSION_CLOSED" ? "This mission is already closed." : "Task not found.");
        return;
      }
      if (res.replay) {
        setFeedback({ verdict: res.verdict, correct: res.verdict === "CORRECT" });
        return;
      }
      setFeedback({ verdict: res.verdict, correct: res.verdict === "CORRECT" });
      if (res.adaptiveNext === "escalate") {
        toast.info("Fast and correct — difficulty rises on the next task.");
      } else if (res.adaptiveNext === "repair") {
        toast.info("No problem — we'll rebuild this from the basics.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that answer");
    } finally {
      setBusy(false);
    }
  };

  const nextTask = () => {
    const isLast = cursor + 1 >= tasks.length;
    if (isLast) {
      void finish();
    } else {
      setCursor((c) => c + 1);
      resetStep();
    }
  };

  const finish = async () => {
    if (!mission || busy) return;
    setBusy(true);
    try {
      const res = (await completeMission({
        missionId: mission._id as Id<"missions">,
      })) as unknown as CompleteResult;
      if (!res.ok) {
        toast.error("Mission not found.");
        return;
      }
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete the mission");
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ states
  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto h-96 max-w-2xl animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }

  if (result) {
    const ev = result.evidence;
    const acc = ev.answered > 0 ? Math.round((ev.correct / ev.answered) * 100) : 0;
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-3xl border border-success/30 bg-gradient-to-br from-success/10 via-card to-card p-8 text-center"
          >
            <div aria-hidden className="absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-success/15 blur-3xl" />
            <div className="relative">
              <Trophy className="mx-auto size-12 text-success" />
              <h2 className="mt-4 font-display text-2xl font-extrabold">MISSION COMPLETE</h2>
              <p className="mt-1 text-sm text-muted-foreground">{result.missionTitle}</p>

              <div className="mx-auto mt-6 max-w-sm space-y-3 text-left">
                {result.mastery && result.mastery.before !== result.mastery.after && (
                  <div className="flex items-center justify-between rounded-2xl bg-card/80 px-4 py-3">
                    <span className="text-sm font-semibold">
                      {result.conceptLabel ?? "Concept"} mastery
                    </span>
                    <span className="flex items-center gap-2 font-display font-extrabold">
                      {result.mastery.before}%
                      <ArrowRight className="size-4 text-muted-foreground" />
                      <span className={result.mastery.after > result.mastery.before ? "text-success" : "text-chart-5"}>
                        {result.mastery.after}%
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-2xl bg-card/80 px-4 py-3">
                  <span className="text-sm font-semibold">Mission accuracy</span>
                  <span className="font-display font-extrabold">{acc}%</span>
                </div>
                {ev.confidentWrong > 0 && (
                  <div className="flex items-center justify-between rounded-2xl bg-card/80 px-4 py-3">
                    <span className="text-sm font-semibold">Confidence calibration</span>
                    <span className="text-xs font-bold text-chart-5">{ev.confidentWrong} overconfident miss{ev.confidentWrong === 1 ? "" : "es"}</span>
                  </div>
                )}
                {result.mistakesCreated > 0 && (
                  <div className="flex items-center justify-between rounded-2xl bg-card/80 px-4 py-3">
                    <span className="text-sm font-semibold">Mistakes banked</span>
                    <span className="font-display font-extrabold text-chart-5">+{result.mistakesCreated}</span>
                  </div>
                )}
                <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                  Your Academic Twin and NEXT MOVE update automatically from this real performance.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button className="gap-2 rounded-xl" onClick={() => { setResult(null); setCursor(0); resetStep(); navigate("/dashboard"); }}>
                  <Sparkles className="size-4" /> See my new NEXT MOVE
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => navigate("/twin")}>
                  <Brain className="size-4" /> View Twin update
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </AppShell>
    );
  }

  if (!mission || tasks.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-border p-12 text-center">
          <Target className="mx-auto size-12 text-primary" />
          <p className="mt-4 font-display text-2xl font-bold">No active mission</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Generate your highest-impact mission from your Vault materials and practice history.
          </p>
          <Button
            className="mt-6 gap-2 rounded-xl"
            onClick={async () => {
              try {
                const res = await startFromCurrent({});
                toast.success("Mission ready");
                navigate(`/mission/${String(res.missionId)}`);
                window.location.reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't create a mission");
              }
            }}
          >
            <Target className="size-4" /> Generate my NEXT MOVE mission
          </Button>
        </div>
      </AppShell>
    );
  }

  const done = tasks.filter((t) => t.status !== "pending" && t.kind !== "explain").length;
  const graded = tasks.filter((t) => t.kind !== "explain");
  const pct = Math.round((done / Math.max(1, graded.length)) * 100);

  return (
    <AppShell>
      <PageHeader eyebrow={`Mission · ${KIND_META[task.kind].label}`} title={mission.title}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm font-bold">
            <Timer className="size-4 text-primary" /> {mission.xpReward > 0 ? `~${Math.max(5, tasks.length * 2)} min` : "—"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={async () => {
              const ok = await abandonMission({ missionId: mission._id as Id<"missions"> });
              if (ok.ok) {
                toast("Mission skipped — NEXT MOVE will recompute.");
                navigate("/dashboard");
              }
            }}
          >
            Skip mission
          </Button>
        </div>
      </PageHeader>

      {/* progress strip */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-chart-4"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <span className="text-xs font-bold text-muted-foreground">{done}/{graded.length}</span>
      </div>

      {/* task palette */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tasks.map((t, i) => (
          <span
            key={t._id}
            className={cn(
              "grid size-7 place-items-center rounded-lg text-[10px] font-extrabold",
              t.status === "correct" && "bg-success/15 text-success",
              (t.status === "incorrect" || t.status === "partial") && "bg-chart-5/15 text-chart-5",
              t.status === "skipped" && "bg-muted text-muted-foreground",
              t.status === "pending" && i === cursor && "bg-primary text-primary-foreground",
              t.status === "pending" && i !== cursor && "bg-primary/10 text-primary",
            )}
            title={t.title}
          >
            {t.status === "correct" ? "✓" : t.status === "pending" ? i + 1 : "!"}
          </span>
        ))}
      </div>

      {/* objective */}
      <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-bold text-foreground">Objective: </span>
        {mission.description}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={task._id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="mt-4 rounded-3xl border border-border/70 bg-card p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase", KIND_META[task.kind].cls)}>
              {task.kind === "explain" ? "Learn" : task.kind === "recall" ? "Recall" : task.kind === "practice" ? "Your turn" : "Final challenge"}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">{task.title}</span>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-base font-medium leading-relaxed">{task.prompt}</p>

          {/* MCQ options */}
          {task.kind === "practice" && task.options && (
            <div className="mt-5 space-y-2.5">
              {task.options.map((opt, i) => {
                const revealed = feedback !== null;
                const isCorrect = task.correctIndex === i;
                const isSelected = selected === i;
                return (
                  <button
                    key={i}
                    disabled={busy || revealed}
                    onClick={() => setSelected(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                      revealed && isCorrect && "border-success/60 bg-success/10",
                      revealed && isSelected && !isCorrect && "border-destructive/60 bg-destructive/10",
                      !revealed && isSelected && "border-primary bg-primary/10 shadow-sm",
                      !revealed && !isSelected && "border-border/70 hover:border-primary/40 hover:bg-accent/50",
                      revealed && !isCorrect && !isSelected && "border-border/50 opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold",
                        revealed && isCorrect ? "bg-success text-white" :
                        revealed && isSelected && !isCorrect ? "bg-destructive text-white" :
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {revealed && isCorrect ? <Check className="size-3.5" /> :
                       revealed && isSelected && !isCorrect ? <X className="size-3.5" /> :
                       String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* recall / challenge written answer */}
          {task.kind !== "practice" && task.kind !== "explain" && !feedback && (
            <div className="mt-5">
              <Textarea
                value={written}
                onChange={(e) => setWritten(e.target.value)}
                placeholder="Write your answer from memory…"
                rows={3}
                className="rounded-xl"
              />
              <p className="mt-3 text-xs font-bold text-muted-foreground">Compare with the model answer, then grade yourself honestly:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { key: "correct" as const, label: "I had it", icon: CheckCircle2 },
                  { key: "partial" as const, label: "Partially", icon: MinusCircle },
                  { key: "incorrect" as const, label: "Missed it", icon: XCircle },
                ]).map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setSelfGrade(g.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                      selfGrade === g.key
                        ? g.key === "correct" ? "bg-success text-white"
                          : g.key === "partial" ? "bg-warning text-warning-foreground"
                          : "bg-destructive text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <g.icon className="size-3.5" /> {g.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowModel((s) => !s)}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Eye className="size-3.5" /> {showModel ? "Hide" : "Show"} model answer
                  <ChevronDown className={cn("size-3 transition-transform", showModel && "rotate-180")} />
                </button>
              </div>
              <AnimatePresence>
                {showModel && task.explanation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm leading-relaxed">
                      {task.explanation}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* confidence selector (graded tasks) */}
          {task.kind !== "explain" && !feedback && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-muted-foreground">How confident are you?</p>
              <div className="mt-2 flex gap-2">
                {CONFIDENCE_META.map((c) => (
                  <button
                    key={c.key}
                    disabled={busy}
                    onClick={() => setConfidence(c.key)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                      confidence === c.key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* hint */}
          {task.hint && !feedback && (
            <button
              onClick={() => setShowHint((s) => !s)}
              className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary transition-colors hover:text-primary/80"
            >
              <Lightbulb className="size-3.5" /> {showHint ? "Hide hint" : "Hint"}
              <ChevronDown className={cn("size-3.5 transition-transform", showHint && "rotate-180")} />
            </button>
          )}
          <AnimatePresence>
            {showHint && task.hint && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden rounded-xl bg-xp/10 px-4 py-2.5 text-xs font-medium text-xp-foreground"
              >
                {task.hint}
              </motion.p>
            )}
          </AnimatePresence>

          {/* actions */}
          {!feedback && (
            <Button
              className="mt-6 w-full gap-2 rounded-xl py-6 text-base font-bold"
              disabled={
                busy ||
                (task.kind === "explain" ? false :
                 task.kind === "practice" ? selected === null :
                 selfGrade === null)
              }
              onClick={task.kind === "explain" ? nextTask : submit}
            >
              {task.kind === "explain" ? (
                <>{busy ? "…" : "Got it — continue"} <ArrowRight className="size-4.5" /></>
              ) : (
                <>{busy ? "Checking…" : "Check answer"} <ArrowRight className="size-4.5" /></>
              )}
            </Button>
          )}

          {/* feedback */}
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "mt-6 rounded-2xl border p-5",
                feedback.correct ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10",
              )}
            >
              <p className={cn("flex items-center gap-2 font-display font-bold", feedback.correct ? "text-success" : "text-destructive")}>
                {feedback.correct ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                {feedback.verdict}
              </p>
              {feedback && !feedback.correct && task.explanation && (
                <p className="mt-2 text-sm leading-relaxed">{task.explanation}</p>
              )}
              {task.kind === "practice" && !feedback.correct && task.options && task.correctIndex !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Correct answer: <span className="font-bold text-success">{task.options[task.correctIndex]}</span>
                </p>
              )}
              <Button className="mt-4 w-full gap-2 rounded-xl" onClick={nextTask} disabled={busy}>
                {cursor + 1 >= tasks.length ? (busy ? "Scoring…" : "Finish mission") : "Next task"}
                <ArrowRight className="size-4" />
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* finish early */}
      {done > 0 && !feedback && cursor < tasks.length && (
        <Button
          variant="ghost"
          className="mt-4 w-full text-muted-foreground"
          disabled={busy}
          onClick={finish}
        >
          Finish mission with current progress ({done}/{graded.length})
        </Button>
      )}
    </AppShell>
  );
}
