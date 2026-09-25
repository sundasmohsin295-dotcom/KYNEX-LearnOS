import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, ArrowRight, Brain, Check, CheckCircle2, Clock, Flag,
  Home, RotateCcw, Stethoscope, Timer, TrendingDown, TrendingUp, X, XCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Ring } from "@/components/VisualBits";
import { cn } from "@/lib/utils";
import { conceptColor } from "@/lib/learning";
import { spring } from "@/lib/motion";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

type Confidence = "sure" | "probably" | "guess";

const CONFIDENCE_META: { key: Confidence; label: string }[] = [
  { key: "sure", label: "I'm sure" },
  { key: "probably", label: "Probably" },
  { key: "guess", label: "Wild guess" },
];

const LETTERS = ["A", "B", "C", "D"];

/**
 * Full quiz lifecycle UI: generating → active (question flow) → completed (results).
 * The attempt is created by the caller; this component owns generation + flow.
 * A local cursor keeps the visible question stable while Convex's live query
 * updates `answers` underneath us.
 *
 * Exam mode adds: server-synced countdown, per-question time tracking,
 * flag-for-review, a navigable question palette, and the Exam Autopsy.
 */
export function QuizRunner({ attemptId }: { attemptId: string }) {
  const navigate = useNavigate();
  const attempt = useQuery(api.learning.getQuizAttempt, { id: attemptId as never });
  const genQuiz = useAction(api.aiEngine.generateQuiz);
  const answerQuestion = useMutation(api.learning.answerQuestion);
  const completeQuiz = useMutation(api.learning.completeQuiz);
  const startExam = useMutation(api.learning.startExam);
  const toggleFlag = useMutation(api.learning.toggleExamFlag);
  const recordTiming = useMutation(api.learning.recordTiming);

  const kicked = useRef(false);
  const finishedRef = useRef(false);
  // Local question cursor. -1 = follow server truth (initial load, refresh);
  // any other value is an explicit pin set when the student advances.
  const [rawCursor, setRawCursor] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; idx: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Neural fatigue monitor: dismissal is remembered per session so the nudge
  // stays calm — it never shows more than once per quiz.
  const [fatigueDismissed, setFatigueDismissed] = useState(false);
  const [result, setResult] = useState<{
    xp: number; leveledUp: boolean; newLevel: number; accuracy: number;
    rawScore?: number; negatives?: number; negativeMarking?: boolean;
  } | null>(null);

  // per-question timer (exam mode): seconds on the current question.
  // Initialized to 0 and set in an effect when a question is displayed —
  // never call Date.now() during render.
  const questionStartRef = useRef<number>(0);

  // ---- Exam clock (server-synced) ----
  const isExam = attempt?.examMode === true;
  const examActive = isExam && attempt?.status === "active";
  const endsAt = attempt?.examEndsAt;
  const [remaining, setRemaining] = useState<number | null>(null);

  // Kick AI generation exactly once while the attempt is generating.
  useEffect(() => {
    if (attempt && attempt.status === "generating" && !kicked.current) {
      kicked.current = true;
      genQuiz({ attemptId: attemptId as never }).catch(() => {
        /* failure is persisted on the attempt and shown below */
      });
    }
  }, [attempt, genQuiz, attemptId]);

  // Start the server clock exactly once when the exam becomes active.
  const examStarted = useRef(false);
  useEffect(() => {
    if (examActive && !attempt?.examStartedAt && !examStarted.current) {
      examStarted.current = true;
      startExam({ attemptId: attemptId as never }).catch((e) =>
        toast.error(e instanceof Error ? e.message : "Exam clock failed to start"),
      );
    }
  }, [examActive, attempt?.examStartedAt, startExam, attemptId]);

  const active = attempt?.status === "active";

  // The visible cursor is derived from server truth while unpinned (-1),
  // which transparently handles page refresh mid-quiz and live-query drift
  // without a state-syncing effect.
  const serverLen = attempt?.answers.length ?? 0;
  const effCursor =
    rawCursor < 0
      ? Math.min(serverLen, Math.max(0, (attempt?.questions.length ?? 1) - 1))
      : rawCursor;

  const finish = useCallback(async () => {
    if (!attempt || finishing || finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    try {
      const res = await completeQuiz({ attemptId: attempt._id });
      setResult(res);
      if (res.xp > 0) toast.success(`+${res.xp} XP earned`);
      if (res.leveledUp) {
        setTimeout(() => toast.success(`Level up! You reached level ${res.newLevel}`), 600);
      }
    } catch (e) {
      finishedRef.current = false;
      toast.error(e instanceof Error ? e.message : "Couldn't save your results");
    } finally {
      setFinishing(false);
    }
  }, [attempt, finishing, completeQuiz]);

  // Local countdown driven by the SERVER deadline (not the client clock).
  // When the exam deactivates the countdown simply stops updating — the
  // active/completed view guards make a stale value unreachable.
  useEffect(() => {
    if (!examActive || !endsAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void finish();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [examActive, endsAt, finish]);

  // Reset the per-question timer whenever a fresh question is displayed
  // (mount/refresh fallback; advance paths reset it explicitly too).
  useEffect(() => {
    if (active && feedback === null) {
      questionStartRef.current = Date.now();
    }
  }, [active, feedback, effCursor]);

  // All questions answered but never completed (e.g. tab closed)? Auto-score.
  useEffect(() => {
    if (
      attempt && active && feedback === null && !finishing &&
      attempt.questions.length > 0 &&
      attempt.answers.length >= attempt.questions.length
    ) {
      void finish();
    }
  }, [attempt, active, feedback, finishing, finish]);

  const idx = feedback ? feedback.idx : Math.min(effCursor, (attempt?.questions.length ?? 1) - 1);
  const total = attempt?.questions.length ?? 0;
  const question = attempt?.questions[idx];
  const done = attempt?.status === "completed";
  const flags = attempt?.examFlags ?? [];
  const answered = attempt?.answers ?? [];

  // Neural fatigue monitoring (Topper's Edge): if the last few answers show a
  // real, measured drop — two mistakes in the last three and lower accuracy
  // than everything before them — recommend a short break. Purely local
  // arithmetic on this attempt's answers; no invented cognitive thresholds.
  const fatigueNudge = useMemo(() => {
    if (fatigueDismissed || answered.length < 6) return false;
    const last3 = answered.slice(-3);
    if (last3.filter((a) => !a.correct).length < 2) return false;
    const earlier = answered.slice(0, -3);
    const earlierRate = earlier.filter((a) => a.correct).length / earlier.length;
    const lastRate = last3.filter((a) => a.correct).length / 3;
    return lastRate < earlierRate;
  }, [answered, fatigueDismissed]);

  const submit = async () => {
    if (selected === null || !confidence || submitting || !attempt || !question) return;
    setSubmitting(true);
    try {
      // exam mode: log seconds spent on this question first (best effort)
      if (isExam) {
        const start = questionStartRef.current || Date.now();
        const secs = Math.max(0, Math.round((Date.now() - start) / 1000));
        void recordTiming({ attemptId: attempt._id, seconds: secs }).catch(() => {});
      }
      const res = await answerQuestion({
        attemptId: attempt._id,
        index: idx,
        selectedIndex: selected,
        confidence,
      });
      setFeedback({ correct: res.correct, idx });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record that answer");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (!feedback) return;
    const nextIdx = feedback.idx + 1;
    setFeedback(null);
    setSelected(null);
    setConfidence(null);
    questionStartRef.current = Date.now();
    if (nextIdx >= total) {
      void finish();
    } else {
      setRawCursor(nextIdx);
    }
  };

  const jumpTo = (i: number) => {
    if (!attempt || !active || feedback) return;
    // Palette navigation: only the next unanswered question is reachable
    // (answers are append-only and the server enforces order).
    if (i !== attempt.answers.length) return;
    setRawCursor(i);
    setSelected(null);
    setConfidence(null);
    questionStartRef.current = Date.now();
  };

  // ---------------------------------------------------------------- loading
  if (attempt === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-2 animate-pulse rounded-full bg-muted" />
        <div className="h-64 animate-pulse rounded-3xl bg-muted/60" />
      </div>
    );
  }

  if (attempt === null) {
    return (
      <CenteredPanel>
        <p className="font-display text-xl font-bold">Quiz not found</p>
        <Button className="mt-5" onClick={() => navigate("/practice")}>Back to practice</Button>
      </CenteredPanel>
    );
  }

  // -------------------------------------------------------------- generating
  if (attempt.status === "generating") {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-primary/25 bg-card p-10 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary"
        >
          <Brain className="size-8" />
        </motion.div>
        <h2 className="mt-6 font-display text-2xl font-bold">
          {isExam ? "Preparing your exam…" : "Writing your questions…"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          KYNEX is crafting questions that test understanding, not trivia.
        </p>
        <div className="mx-auto mt-6 max-w-xs space-y-2">
          {["Reading the material", "Picking what to test", "Writing questions"].map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0.3 }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.5 }}
              className="rounded-lg bg-muted/70 px-3 py-2 text-xs font-semibold"
            >
              {s}
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  if (attempt.status === "failed") {
    return (
      <CenteredPanel>
        <AlertTriangle className="mx-auto size-12 text-destructive" />
        <p className="mt-5 font-display text-2xl font-bold">Question generation failed</p>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{attempt.error}</p>
        <p className="mt-1 text-xs text-muted-foreground">No questions were faked. Nothing to grade yet.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate("/practice")}>Back to practice</Button>
        </div>
      </CenteredPanel>
    );
  }

  // ------------------------------------------------------------- completed
  if (done) {
    const answeredList = attempt.answers;
    const correctCount = answeredList.filter((a) => a.correct).length;
    const accuracy = answeredList.length > 0 ? Math.round((correctCount / answeredList.length) * 100) : 0;
    const shown = result ?? {
      xp: null as number | null, leveledUp: false, newLevel: 0, accuracy,
      rawScore: undefined as number | undefined, negatives: undefined as number | undefined,
      negativeMarking: attempt.negativeMarking === true,
    };

    // ---- Exam Autopsy computations (from the real attempt) ----
    const timings = attempt.examTiming ?? [];
    const answeredTimings = timings.filter((t) => t >= 0);
    const avgSec = answeredTimings.length > 0
      ? Math.round(answeredTimings.reduce((a, b) => a + b, 0) / answeredTimings.length)
      : null;
    const slowWrong = answeredList
      .map((a, i) => ({ a, i, t: timings[i] ?? -1 }))
      .filter((x) => x.a && !x.a.correct && x.t >= 0 && avgSec != null && x.t > avgSec * 1.5)
      .map((x) => x.i);
    const careless = answeredList
      .map((a, i) => ({ a, i }))
      .filter((x) => x.a && !x.a.correct && x.a.confidence === "sure" && attempt.questions[x.i]?.difficulty === "easy")
      .map((x) => x.i);
    const guessedWrong = answeredList
      .map((a, i) => ({ a, i }))
      .filter((x) => x.a && !x.a.correct && x.a.confidence === "guess")
      .map((x) => x.i);
    const weakConcepts = [...new Set(
      answeredList
        .map((a, i) => (a && !a.correct ? attempt.questions[i]?.concept : undefined))
        .filter((c): c is string => !!c),
    )];
    const flaggedUnanswered = attempt.questions
      .map((_, i) => i)
      .filter((i) => flags[i] && !answeredList[i]);
    const skipped = attempt.questions.length - answeredList.length;

    return (
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden kynex-glass spectrum-border rounded-3xl p-8 text-center"
        >
          <div aria-hidden className="absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-success/10 blur-3xl" />
          <div className="relative">
            <Ring
              pct={accuracy}
              size={110}
              stroke={9}
              colorClass={accuracy >= 80 ? "text-success" : accuracy >= 50 ? "text-primary" : "text-chart-5"}
              label="accuracy"
            />
            <h2 className="mt-4 font-display text-2xl font-extrabold">
              {accuracy === 100 ? "Flawless run." : accuracy >= 80 ? "Strong work." : accuracy >= 50 ? "Good progress." : "Found your gaps."}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {correctCount} of {answeredList.length} correct
              {shown.xp !== null && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-xp/20 px-2 py-0.5 text-xs font-bold text-xp-foreground">
                  <Zap className="size-3" /> +{shown.xp} XP
                </span>
              )}
              {shown.leveledUp && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                  Level {shown.newLevel} reached!
                </span>
              )}
            </p>
            {isExam && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
                  Raw score: {shown.rawScore ?? correctCount}
                  {shown.negativeMarking && shown.negatives ? ` (${correctCount} − ${shown.negatives} penalty)` : ""}
                </span>
                {attempt.examDurationSec && (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
                    <Timer className="size-3.5" />
                    {Math.round(attempt.examDurationSec / 60)} min · {avgSec != null ? `${avgSec}s/question avg` : "no timing"}
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ---------- EXAM AUTOPSY ---------- */}
        {isExam && (
          <div className="mt-5 rounded-3xl border border-primary/25 bg-card p-6">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <Stethoscope className="size-5 text-primary" /> Exam Autopsy
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What went wrong and why, computed from your answers, timing and confidence signals.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AutopsyCard
                icon={TrendingDown}
                tone="text-chart-5"
                title="Weak concepts"
                body={weakConcepts.length > 0
                  ? `${weakConcepts.slice(0, 4).join(", ")}: these cost you the most marks.`
                  : "No concept cost you marks this time."}
              />
              <AutopsyCard
                icon={Zap}
                tone="text-warning"
                title="Careless mistakes"
                body={careless.length > 0
                  ? `${careless.length} question${careless.length === 1 ? "" : "s"} you were sure about on easy material. Slow down on the obvious ones.`
                  : "None detected. Your confident answers held."}
              />
              <AutopsyCard
                icon={Clock}
                tone="text-chart-2"
                title="Time management"
                body={slowWrong.length > 0
                  ? `${slowWrong.length} wrong answer${slowWrong.length === 1 ? "" : "s"} took over 1.5× your average time. You ground on them too long.`
                  : avgSec != null
                    ? `Pacing was healthy (~${avgSec}s per question).`
                    : "No timing data recorded."}
              />
              <AutopsyCard
                icon={Flag}
                tone="text-primary"
                title="Gaps vs. guesses"
                body={guessedWrong.length > 0
                  ? `${guessedWrong.length} were honest guesses: that's a knowledge gap to fill, not a mistake to fix.`
                  : skipped > 0 || flaggedUnanswered.length > 0
                    ? `${skipped} skipped, ${flaggedUnanswered.length} flagged and never answered.`
                    : "Every answer was deliberate. Good exam discipline."}
              />
            </div>
            <div className="mt-4 rounded-xl bg-primary/5 px-4 py-3">
              <p className="flex items-start gap-2 text-sm font-medium text-primary">
                <TrendingUp className="mt-0.5 size-4 shrink-0" />
                {weakConcepts.length > 0
                  ? `Next move: run targeted practice on ${weakConcepts[0]}. The mission engine will pick this up automatically.`
                  : "All clear. Keep the streak going with Recall review."}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {attempt.questions.map((q, i) => {
            const a = answeredList[i];
            const { from, to } = conceptColor(q.concept);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="kynex-glass spectrum-border rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug">{i + 1}. {q.question}</p>
                  {a ? (
                    a.correct ? (
                      <CheckCircle2 className="size-5 shrink-0 text-success" />
                    ) : (
                      <XCircle className="size-5 shrink-0 text-destructive" />
                    )
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">SKIPPED</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className="rounded-full px-2.5 py-1 font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                  >
                    {q.concept}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">{q.difficulty}</span>
                  {flags[i] && (
                    <span className="flex items-center gap-1 rounded-full bg-xp/15 px-2.5 py-1 font-semibold text-xp-foreground">
                      <Flag className="size-3" /> flagged
                    </span>
                  )}
                  {isExam && timings[i] >= 0 && (
                    <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">{timings[i]}s</span>
                  )}
                </div>
                {a && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Your answer: <span className={a.correct ? "font-bold text-success" : "font-bold text-destructive"}>{LETTERS[a.selectedIndex]}. {q.options[a.selectedIndex]}</span>
                    {!a.correct && (
                      <>
                        {" · "}Correct: <span className="font-bold text-success">{LETTERS[q.correctIndex]}. {q.options[q.correctIndex]}</span>
                      </>
                    )}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{q.explanation}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button className="gap-2 rounded-xl" onClick={() => navigate(`/practice/${attempt.materialId}`)}>
            <RotateCcw className="size-4" /> Practice again
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => navigate("/dashboard")}>
            <Home className="size-4" /> Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- active
  const pct = Math.round((idx / Math.max(1, total)) * 100);
  const showFeedback = feedback !== null && feedback.idx === idx;
  const timeCritical = remaining !== null && remaining <= 60;

  // Adaptive Intelligence HUD (focus mode): while answering, the chrome
  // recedes. The sidebar, header and level card fade to low emphasis and
  // become non-interactive, then restore instantly when a task completes.
  // Preference persists across sessions; reduced-motion users get an instant
  // state switch instead of animated transparency.
  const [focusMode, setFocusMode] = useLocalStorageState<boolean>("kynex.focusMode", true);
  useEffect(() => {
    document.documentElement.classList.toggle("kynex-focus", focusMode === true && active);
    return () => {
      document.documentElement.classList.toggle("kynex-focus", false);
    };
  }, [focusMode, active]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* focus toggle (only while a session is running) */}
      {active && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setFocusMode(!(focusMode === true))}
            role="switch"
            aria-checked={focusMode === true}
            className="font-data rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            {focusMode === true ? "Focus on" : "Focus off"}
          </button>
        </div>
      )}
      {/* neural fatigue monitor: calm, honest break nudge */}
      <AnimatePresence>
        {active && fatigueNudge && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.snappy}
            className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3"
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">Accuracy is slipping.</span>{" "}
              A five-minute break resets attention better than pushing through.
            </p>
            <button
              onClick={() => setFatigueDismissed(true)}
              className="font-data rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Keep going
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* exam header */}
      {isExam && (
        <div className={cn(
          "flex items-center justify-between rounded-2xl border px-4 py-3",
          timeCritical ? "border-destructive/40 bg-destructive/10" : "border-primary/25 bg-primary/5",
        )}>
          <span className="flex items-center gap-2 text-sm font-bold">
            <Timer className={cn("size-4", timeCritical ? "text-destructive" : "text-primary")} />
            {timeCritical ? "Final minute. Submit what you have" : "Exam in progress"}
          </span>
          <span
            className={cn(
              "font-data text-xl font-semibold tabular-nums",
              timeCritical ? "animate-pulse text-destructive" : "text-primary",
            )}
            role="timer"
          >
            {remaining != null
              ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
              : "--:--"}
          </span>
        </div>
      )}

      {/* progress */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <span className="text-xs font-bold text-muted-foreground">
          {idx}/{total}
        </span>
      </div>

      {/* question palette (exam mode) */}
      {isExam && attempt.questions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {attempt.questions.map((_, i) => {
            const isAnswered = i < answered.length;
            const isFlagged = flags[i];
            const isCurrent = i === idx;
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                disabled={isAnswered || feedback !== null}
                title={isFlagged ? "Flagged for review" : isAnswered ? "Answered" : i === attempt.answers.length ? "Jump here" : "Locked (answer in order)"}
                aria-label={`Question ${i + 1}${isFlagged ? ", flagged" : isAnswered ? ", answered" : ""}`}
                className={cn(
                  "relative grid size-7 place-items-center rounded-lg text-[10px] font-extrabold transition-colors",
                  isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  isAnswered
                    ? "bg-muted text-muted-foreground"
                    : isFlagged
                      ? "bg-xp/25 text-xp-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                {i + 1}
                {isFlagged && (
                  <Flag className="absolute -right-1 -top-1 size-2.5 fill-xp text-xp" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="mt-4 kynex-glass spectrum-border rounded-3xl p-6 sm:p-8"
        >
          {question && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${conceptColor(question.concept).from}, ${conceptColor(question.concept).to})` }}
                >
                  {question.concept}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                  {question.difficulty}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                  {question.type}
                </span>
                {isExam && (
                  <button
                    onClick={() =>
                      toggleFlag({ attemptId: attempt._id, index: idx }).catch((e) =>
                        toast.error(e instanceof Error ? e.message : "Couldn't update flag"),
                      )
                    }
                    className={cn(
                      "ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                      flags[idx]
                        ? "bg-xp/25 text-xp-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={flags[idx] ?? false}
                  >
                    <Flag className={cn("size-3", flags[idx] && "fill-xp")} />
                    {flags[idx] ? "Flagged" : "Flag for review"}
                  </button>
                )}
              </div>

              <h2 className="mt-4 font-display text-lg font-bold leading-snug sm:text-xl">{question.question}</h2>

              <div className="mt-5 space-y-2.5">
                {question.options.map((opt, i) => {
                  const isSelected = selected === i;
                  const isCorrect = question.correctIndex === i;
                  const revealed = showFeedback;
                  return (
                    <button
                      key={i}
                      disabled={submitting || showFeedback}
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
                         revealed && isSelected && !isCorrect ? <X className="size-3.5" /> : LETTERS[i]}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* confidence selector */}
              {!showFeedback && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-muted-foreground">How confident are you?</p>
                  <div className="mt-2 flex gap-2">
                    {CONFIDENCE_META.map((c) => (
                      <button
                        key={c.key}
                        disabled={submitting}
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

              {/* submit */}
              {!showFeedback && (
                <Button
                  className="mt-6 w-full gap-2 rounded-xl py-6 text-base font-bold"
                  disabled={selected === null || confidence === null || submitting}
                  onClick={submit}
                >
                  {submitting ? "Checking…" : "Lock in answer"}
                  <ArrowRight className="size-4.5" />
                </Button>
              )}

              {/* feedback */}
              {showFeedback && question && feedback && (
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
                    {feedback.correct ? "Correct!" : "Not quite: here's the gap"}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{question.explanation}</p>
                  {!feedback.correct && question.whyWrong.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {question.whyWrong.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive/60" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button className="mt-4 w-full gap-2 rounded-xl" onClick={next} disabled={finishing}>
                    {idx + 1 >= total ? (finishing ? "Scoring…" : "See results") : "Next question"}
                    <ArrowRight className="size-4" />
                  </Button>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AutopsyCard({
  icon: Icon, tone, title, body,
}: {
  icon: typeof Clock; tone: string; title: string; body: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
      <p className={cn("flex items-center gap-2 text-sm font-bold", tone)}>
        <Icon className="size-4" /> {title}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl kynex-glass spectrum-border rounded-3xl p-10 text-center">
      {children}
    </div>
  );
}
