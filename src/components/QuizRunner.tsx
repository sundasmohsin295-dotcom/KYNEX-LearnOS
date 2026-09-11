import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, ArrowRight, Brain, Check, CheckCircle2, Home, RotateCcw, X, XCircle, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Ring } from "@/components/VisualBits";
import { cn } from "@/lib/utils";
import { conceptColor } from "@/lib/studyos";

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
 */
export function QuizRunner({ attemptId }: { attemptId: string }) {
  const navigate = useNavigate();
  const attempt = useQuery(api.learning.getQuizAttempt, { id: attemptId as never });
  const genQuiz = useAction(api.aiEngine.generateQuiz);
  const answerQuestion = useMutation(api.learning.answerQuestion);
  const completeQuiz = useMutation(api.learning.completeQuiz);

  const kicked = useRef(false);
  const finishedRef = useRef(false);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; idx: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ xp: number; leveledUp: boolean; newLevel: number; accuracy: number } | null>(null);

  // Kick AI generation exactly once while the attempt is generating.
  useEffect(() => {
    if (attempt && attempt.status === "generating" && !kicked.current) {
      kicked.current = true;
      genQuiz({ attemptId: attemptId as never }).catch(() => {
        /* failure is persisted on the attempt and shown below */
      });
    }
  }, [attempt, genQuiz, attemptId]);

  const active = attempt?.status === "active";

  // Re-sync cursor with server truth whenever no feedback panel is showing
  // (handles page refresh mid-quiz and any live-query drift in both directions).
  useEffect(() => {
    if (!attempt || !active || feedback !== null) return;
    const serverLen = attempt.answers.length;
    if (cursor !== serverLen && serverLen <= attempt.questions.length) {
      setCursor(serverLen);
    }
  }, [attempt, active, feedback, cursor]);

  const finish = async () => {
    if (!attempt || finishing || finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    try {
      const res = await completeQuiz({ attemptId: attempt._id });
      setResult(res);
      if (res.xp > 0) toast.success(`+${res.xp} XP earned`);
      if (res.leveledUp) {
        setTimeout(() => toast.success(`🎉 Level up! You reached level ${res.newLevel}`), 600);
      }
    } catch (e) {
      finishedRef.current = false;
      toast.error(e instanceof Error ? e.message : "Couldn't save your results");
    } finally {
      setFinishing(false);
    }
  };

  // All questions answered but never completed (e.g. tab closed)? Auto-score.
  useEffect(() => {
    if (
      attempt && active && feedback === null && !finishing &&
      attempt.questions.length > 0 &&
      attempt.answers.length >= attempt.questions.length
    ) {
      void finish();
    }
  }, [attempt, active, feedback, finishing]);

  const idx = feedback ? feedback.idx : Math.min(cursor, (attempt?.questions.length ?? 1) - 1);
  const total = attempt?.questions.length ?? 0;
  const question = attempt?.questions[idx];
  const done = attempt?.status === "completed";

  const submit = async () => {
    if (selected === null || !confidence || submitting || !attempt || !question) return;
    setSubmitting(true);
    try {
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
    if (nextIdx >= total) {
      void finish();
    } else {
      setCursor(nextIdx);
    }
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
          className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-xl"
        >
          <Brain className="size-8" />
        </motion.div>
        <h2 className="mt-6 font-display text-2xl font-bold">Writing your questions…</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          STUDYOS is crafting questions that test understanding — not trivia.
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
        <p className="mt-1 text-xs text-muted-foreground">No questions were faked — nothing to grade yet.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate("/practice")}>Back to practice</Button>
        </div>
      </CenteredPanel>
    );
  }

  // ------------------------------------------------------------- completed
  if (done) {
    const answered = attempt.answers;
    const correctCount = answered.filter((a) => a.correct).length;
    const accuracy = answered.length > 0 ? Math.round((correctCount / answered.length) * 100) : 0;
    const shown = result ?? { xp: null as number | null, leveledUp: false, newLevel: 0, accuracy };
    return (
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-8 text-center"
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
              {accuracy === 100 ? "Flawless run! 🏆" : accuracy >= 80 ? "Strong work! 🔥" : accuracy >= 50 ? "Good progress 👏" : "Found your gaps 🔍"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {correctCount} of {answered.length} correct
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
          </div>
        </motion.div>

        <div className="mt-5 space-y-3">
          {attempt.questions.map((q, i) => {
            const a = answered[i];
            const { from, to } = conceptColor(q.concept);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-border/70 bg-card p-5"
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
  return (
    <div className="mx-auto max-w-2xl">
      {/* progress */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-chart-4"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <span className="text-xs font-bold text-muted-foreground">
          {idx}/{total}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="mt-5 rounded-3xl border border-border/70 bg-card p-6 sm:p-8"
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
                    {feedback.correct ? "Correct!" : "Not quite — here's the gap"}
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

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border/70 bg-card p-10 text-center">
      {children}
    </div>
  );
}
