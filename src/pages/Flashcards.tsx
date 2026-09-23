import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Flame, Layers, RotateCcw, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { spring } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Grade = "again" | "hard" | "good" | "easy";

const GRADES: { key: Grade; label: string; cls: string }[] = [
  { key: "again", label: "Again", cls: "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/40" },
  { key: "hard", label: "Hard", cls: "bg-chart-5/10 text-chart-5 hover:bg-chart-5/20 border-chart-5/40" },
  { key: "good", label: "Good", cls: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/40" },
  { key: "easy", label: "Easy", cls: "bg-success/10 text-success hover:bg-success/20 border-success/40" },
];

export default function Flashcards() {
  const due = useQuery(api.learning.dueFlashcards);
  const counts = useQuery(api.learning.flashcardCount);
  const review = useMutation(api.learning.reviewFlashcard);
  const [flipped, setFlipped] = useState(false);
  const [index, setIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [reviewedThisSession, setReviewedThisSession] = useState(0);

  const liveCards = useMemo(() => due ?? [], [due]);

  // Snapshot the queue when it first arrives so live-query updates (a graded
  // card's dueAt moving out of the "due" window) never shift the deck under us.
  const [cards, setCards] = useState<typeof liveCards>([]);
  const snapshotted = useRef(false);
  useEffect(() => {
    if (!snapshotted.current && liveCards.length > 0) {
      setCards(liveCards);
      snapshotted.current = true;
    }
  }, [liveCards]);

  const card = cards[index];

  const grade = async (g: Grade) => {
    if (!card) return;
    try {
      await review({ cardId: card._id, grade: g });
      setReviewedThisSession((n) => n + 1);
      if (g !== "again") setDoneCount((n) => n + 1);
      setFlipped(false);
      setIndex((i) => i + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that review");
    }
  };

  const loading = due === undefined;
  const finished = !loading && cards.length > 0 && index >= cards.length;
  const empty = !loading && cards.length === 0 && reviewedThisSession === 0;

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Recall · spaced repetition" title="Recall">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-sm font-bold">
            <Layers className="size-4 text-primary" />
            {counts ? counts.total : "--"} cards
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-xp/30 bg-xp/10 px-3.5 py-1.5 text-sm font-bold text-xp-foreground">
            <Flame className="size-4" />
            {counts ? counts.due : "--"} due
          </span>
        </div>
      </PageHeader>

      {loading && <div className="mx-auto h-96 max-w-2xl animate-pulse rounded-3xl bg-muted/60" />}

      {finished && reviewedThisSession > 0 && (
        <div className="mx-auto max-w-2xl rounded-3xl border border-success/30 bg-success/5 p-10 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="mx-auto grid size-16 place-items-center rounded-2xl bg-success/15 text-success"
          >
            <Zap className="size-8 fill-current" />
          </motion.div>
          <p className="mt-5 font-display text-2xl font-extrabold">Session complete</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {doneCount} card{doneCount === 1 ? "" : "s"} moved forward in the schedule ·{" "}
            {reviewedThisSession - doneCount} flagged for another pass
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            KYNEX rewards genuine recall, never clicking through.
          </p>
          <Button asChild variant="outline" className="mt-6 gap-2 rounded-xl">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      )}

      {empty && (
        <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-border p-14 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <p className="mt-4 font-display text-2xl font-bold">Nothing due right now</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            KYNEX Recall schedules cards at the moment you're about to forget them. Generate
            cards from any Vault source.
          </p>
          <Button asChild className="mt-6 gap-2 rounded-xl">
            <Link to="/library"><Sparkles className="size-4" /> Pick a material</Link>
          </Button>
        </div>
      )}

      {card && (
        <div className="mx-auto max-w-2xl">
          {/* session progress */}
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${(index / cards.length) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-muted-foreground">{index + 1}/{cards.length}</span>
          </div>

          {/* card */}
          <div className="mt-5 [perspective:1200px]">
            <AnimatePresence mode="wait">
              <motion.button
                key={card._id + (flipped ? "-back" : "-front")}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, rotateY: flipped ? 180 : 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ ...spring.expressive, opacity: { duration: 0.18 } }}
                onClick={() => setFlipped((f) => !f)}
                className={cn(
                  "grid min-h-80 w-full place-items-center rounded-3xl border p-8 text-center shadow-xl",
                  flipped
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/70 bg-card card-lift",
                )}
                style={{ transformStyle: "preserve-3d" }}
              >
                <div style={{ transform: flipped ? "rotateY(180deg)" : undefined }}>
                  {card.conceptLabel && (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {card.conceptLabel}
                    </span>
                  )}
                  {!flipped ? (
                    <p className="mt-4 font-display text-xl font-bold leading-snug sm:text-2xl">{card.front}</p>
                  ) : (
                    <p className="mt-4 text-base leading-relaxed sm:text-lg">{card.back}</p>
                  )}
                  <p className="mt-6 text-[11px] font-semibold text-muted-foreground">
                    {flipped ? "How well did you recall it?" : "Tap to reveal"}
                  </p>
                </div>
              </motion.button>
            </AnimatePresence>
          </div>

          {/* grading */}
          {flipped && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              transition={spring.smooth}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
            >
              {GRADES.map((g) => (
                <button
                  key={g.key}
                  onClick={() => grade(g.key)}
                  className={cn("rounded-xl border py-3 text-sm font-bold transition-colors", g.cls)}
                >
                  {g.label}
                  {g.key === "again" && <span className="block text-[10px] font-semibold opacity-70">10 min</span>}
                  {g.key === "hard" && <span className="block text-[10px] font-semibold opacity-70">1 day</span>}
                  {g.key === "good" && <span className="block text-[10px] font-semibold opacity-70">~{(2.5 * 2).toFixed(0)} days</span>}
                  {g.key === "easy" && <span className="block text-[10px] font-semibold opacity-70">~{(2.5 * 3.5).toFixed(0)} days</span>}
                </button>
              ))}
            </motion.div>
          )}

          {!flipped && (
            <Button variant="outline" className="mt-4 w-full gap-2 rounded-xl" onClick={() => setFlipped(true)}>
              <RotateCcw className="size-4" /> Show answer
            </Button>
          )}
        </div>
      )}
    </AppShell>
  );
}
