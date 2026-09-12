import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Brain, History, Play, Target, Timer, TrendingUp, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { MasteryRings } from "@/components/VisualBits";
import { cn } from "@/lib/utils";
import { masteryState } from "@/lib/studyos";

/**
 * Practice hub. With :materialId → session launcher for that material.
 * Without → hub listing weak concepts and recent attempts.
 */
export default function Practice({ materialId: routeMaterialId }: { materialId?: string }) {
  const params = useParams<{ materialId?: string }>();
  const navigate = useNavigate();
  const materialId = routeMaterialId ?? params.materialId ?? null;
  return materialId ? (
    <PracticeSession materialId={materialId} navigate={navigate} />
  ) : (
    <PracticeHub navigate={navigate} />
  );
}

/* ------------------------------------------------------------------ hub */

function PracticeHub({ navigate }: { navigate: (to: string) => void }) {
  const overview = useQuery(api.profiles.myOverview);
  const attempts = useQuery(api.learning.listQuizAttempts, {});
  const startQuiz = useMutation(api.learning.startQuiz);
  const genQuiz = useAction(api.aiEngine.generateQuiz);

  const weak = (overview?.mastery ?? [])
    .filter((m) => masteryState(m) === "weak")
    .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts)
    .slice(0, 4);

  const focusPractice = async (conceptKey: string, materialId?: string) => {
    try {
      if (!materialId) {
        toast.error("Practice this concept from its material page.");
        return;
      }
      const attemptId = await startQuiz({
        materialId: materialId as never,
        conceptKey,
        count: 8,
        difficulty: "adaptive",
        mode: "practice",
      });
      await genQuiz({ attemptId });
      navigate(`/quiz/${attemptId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start practice");
    }
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Mastery loop" title="Practice">
        <p className="max-w-md text-sm text-muted-foreground">
          Adaptive questions that target exactly where your accuracy drops. Every answer updates your mastery map.
        </p>
      </PageHeader>

      {/* weak concepts — the curiosity gap */}
      {overview && weak.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-chart-5/25 bg-gradient-to-br from-chart-5/10 via-card to-card p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-chart-5">
                <Wrench className="size-4" /> Fix these first
              </p>
              <h2 className="mt-1.5 font-display text-xl font-bold">
                {weak.length} weak concept{weak.length === 1 ? "" : "s"} detected
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Targeted drills beat re-reading. Pick one and beat your score.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {weak.map((m) => (
              <button
                key={m._id}
                onClick={() => void focusPractice(m.conceptKey, m.materialId ?? undefined)}
                className="card-lift rounded-2xl border border-border/70 bg-card p-4 text-left"
              >
                <p className="font-display font-bold">{m.conceptLabel}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-chart-5"
                      style={{ width: `${Math.round((m.correct / m.attempts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-chart-5">
                    {Math.round((m.correct / m.attempts) * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {m.attempts} attempts · tap to drill 8 questions
                </p>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* all concepts */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <TrendingUp className="size-5 text-primary" /> Your mastery map
          </h3>
        </div>
        {overview && overview.mastery.length > 0 ? (
          <MasteryRings rows={overview.mastery.slice(0, 9)} className="mt-4" />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Complete a quiz and your concept-by-concept accuracy appears here.
          </p>
        )}
      </div>

      {/* recent attempts */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <History className="size-5 text-primary" /> Recent sessions
        </h3>
        <div className="mt-4 space-y-2.5">
          {(attempts ?? []).slice(0, 6).map((a) => {
            const answered = a.answers.length;
            const correct = a.answers.filter((x) => x.correct).length;
            const pct = answered > 0 ? Math.round((correct / answered) * 100) : null;
            return (
              <button
                key={a._id}
                onClick={() => navigate(`/quiz/${a._id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 text-[10px] font-bold uppercase",
                    a.status === "completed" ? "bg-primary/10 text-primary"
                      : a.status === "active" ? "bg-xp/20 text-xp-foreground"
                      : a.status === "failed" ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {a.status}
                </span>
                <span className="flex-1 truncate text-sm font-semibold">{a.conceptFocus ?? "Mixed practice"}</span>
                <span className="text-xs font-bold text-muted-foreground">
                  {pct !== null ? `${correct}/${answered} · ${pct}%` : a.status === "generating" ? "writing…" : "in progress"}
                </span>
              </button>
            );
          })}
          {(attempts ?? []).length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No sessions yet — start from a material below.</p>
          )}
        </div>
      </div>

      {/* pick a material */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
        <h3 className="font-display text-lg font-bold">Start from a material</h3>
        <PracticeMaterialPicker />
      </div>
    </AppShell>
  );
}

function PracticeMaterialPicker() {
  const navigate = useNavigate();
  const materials = useQuery(api.materials.listReady);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(materials ?? []).map((m) => (
        <button
          key={m._id}
          onClick={() => navigate(`/practice/${m._id}`)}
          className="card-lift rounded-2xl border border-border/70 bg-muted/40 p-4 text-left"
        >
          <p className="line-clamp-1 font-display font-bold">{m.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{m.analysis?.concepts.length ?? 0} concepts · tap to configure a session</p>
        </button>
      ))}
      {(materials ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Add a material first — practice is generated from your library.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------- session launcher */

function PracticeSession({
  materialId,
  navigate,
}: {
  materialId: string;
  navigate: (to: string) => void;
}) {
  const material = useQuery(api.materials.get, { id: materialId as never });
  const overview = useQuery(api.profiles.myOverview);
  const startQuiz = useMutation(api.learning.startQuiz);
  const genQuiz = useAction(api.aiEngine.generateQuiz);
  const [searchParams] = useSearchParams();
  const [conceptKey, setConceptKey] = useState<string | null>(
    () => searchParams.get("concept"),
  );
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "adaptive">("adaptive");
  const [examMode, setExamMode] = useState(false);
  const [examMinutes, setExamMinutes] = useState(20);
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [busy, setBusy] = useState(false);

  const conceptRows = (material?.analysis?.concepts ?? []).map((c) => {
    const row = overview?.mastery.find(
      (m) => m.materialId === materialId && m.conceptKey === c.name.toLowerCase().trim(),
    );
    return { ...c, row };
  });

  const launch = async () => {
    setBusy(true);
    try {
      const attemptId = await startQuiz({
        materialId: materialId as never,
        conceptKey: conceptKey ?? undefined,
        count,
        difficulty,
        mode: "practice",
        examMode,
        examMinutes: examMode ? examMinutes : undefined,
        negativeMarking: examMode ? negativeMarking : undefined,
      });
      await genQuiz({ attemptId });
      navigate(`/quiz/${attemptId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the quiz");
    } finally {
      setBusy(false);
    }
  };

  if (material === undefined) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }
  if (material === null || !material.analysis) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-card p-10 text-center">
          <p className="font-display text-xl font-bold">This material isn't ready yet</p>
          <Button className="mt-5" onClick={() => navigate("/library")}>Back to library</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Configure session" title={`Practice: ${material.analysis.title ?? material.title}`}>
        <p className="max-w-md text-sm text-muted-foreground">
          Choose a focus or go mixed. Adaptive difficulty ramps up as you get answers right.
        </p>
      </PageHeader>

      <div className="rounded-3xl border border-border/70 bg-card p-6 sm:p-8">
        {/* concept focus */}
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Focus</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={conceptKey === null} onClick={() => setConceptKey(null)}>
            <Brain className="size-3.5" /> Mixed — all concepts
          </Chip>
          {conceptRows.map((c) => {
            const key = c.name.toLowerCase().trim();
            const state = c.row ? masteryState(c.row) : "new";
            return (
              <Chip key={c.name} active={conceptKey === key} onClick={() => setConceptKey(key)}>
                {c.name}
                {state === "weak" && <span className="ml-1 text-chart-5">· weak</span>}
              </Chip>
            );
          })}
        </div>

        {/* count */}
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">Questions</p>
        <div className="mt-3 flex gap-2">
          {[5, 8, 10, 12].map((n) => (
            <Chip key={n} active={count === n} onClick={() => setCount(n)}>{n} questions</Chip>
          ))}
        </div>

        {/* difficulty */}
        <p className="mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">Difficulty</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["adaptive", "Adaptive (recommended)"],
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard / exam"],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} active={difficulty === k} onClick={() => setDifficulty(k)}>{label}</Chip>
          ))}
        </div>

        {/* ---- Exam Simulator ---- */}
        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <button
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setExamMode((v) => !v)}
            aria-pressed={examMode}
          >
            <span>
              <span className="flex items-center gap-2 text-sm font-bold">
                <Timer className="size-4 text-primary" /> Exam Simulator
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Server-timed clock, question flags, negative marking and a full Exam Autopsy.
              </span>
            </span>
            <span
              className={cn(
                "grid h-6 w-11 shrink-0 place-items-center rounded-full px-1 transition-colors",
                examMode ? "bg-primary" : "bg-muted",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "size-4 rounded-full bg-white shadow transition-transform",
                  examMode && "translate-x-5",
                )}
              />
            </span>
          </button>
          {examMode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Time limit</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[10, 20, 30, 45, 60].map((m) => (
                      <Chip key={m} active={examMinutes === m} onClick={() => setExamMinutes(m)}>{m} min</Chip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Negative marking (−1 per wrong answer)</span>
                  <button
                    role="switch"
                    aria-checked={negativeMarking}
                    aria-label="Toggle negative marking"
                    onClick={() => setNegativeMarking((v) => !v)}
                    className={cn(
                      "grid h-6 w-11 shrink-0 place-items-center rounded-full px-1 transition-colors",
                      negativeMarking ? "bg-chart-5" : "bg-muted",
                    )}
                  >
                    <span className={cn("size-4 rounded-full bg-white shadow transition-transform", negativeMarking && "translate-x-5")} />
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  The countdown is enforced server-side — closing the tab doesn't stop the clock.
                  Score = correct − penalties. XP rewards stay tied to what you got right.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        <Button
          size="lg"
          className="mt-8 w-full gap-2 rounded-xl text-base font-bold shadow-lg shadow-primary/25"
          disabled={busy}
          onClick={launch}
        >
          <Play className="size-4.5 fill-current" /> {busy ? "Writing questions…" : examMode ? "Start exam" : "Start session"}
        </Button>
      </div>

      {/* per-concept accuracy hint */}
      {conceptRows.some((c) => c.row && c.row.attempts > 0) && (
        <div className="mt-5 rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Target className="size-5 text-primary" /> Where you stand
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {conceptRows.filter((c) => c.row && c.row.attempts > 0).map((c) => (
              <div key={c.name} className="rounded-2xl bg-muted/50 p-4">
                <p className="text-sm font-bold">{c.name}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        (c.row!.correct / c.row!.attempts) >= 0.85 ? "bg-success"
                          : (c.row!.correct / c.row!.attempts) < 0.6 ? "bg-chart-5" : "bg-primary",
                      )}
                      style={{ width: `${Math.round((c.row!.correct / c.row!.attempts) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold">{Math.round((c.row!.correct / c.row!.attempts) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border/70 bg-muted/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
