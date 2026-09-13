import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowUp, BookOpen, Brain, CalendarDays, Check, RefreshCw,
  Target, Wrench, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Block = {
  id: string;
  kind: "practice" | "review" | "recall" | "fix";
  title: string;
  minutes: number;
  status: "pending" | "completed" | "skipped";
  conceptKey?: string;
  materialId?: string;
};

const KIND_META: Record<Block["kind"], { label: string; icon: typeof Target; cls: string }> = {
  fix: { label: "Fix", icon: Wrench, cls: "bg-chart-5/15 text-chart-5" },
  practice: { label: "Practice", icon: Target, cls: "bg-primary/10 text-primary" },
  recall: { label: "Recall", icon: RefreshCw, cls: "bg-chart-2/15 text-chart-2" },
  review: { label: "Review", icon: BookOpen, cls: "bg-chart-4/15 text-chart-4" },
};

/** KYNEX Study Planner — today's persisted plan built from real state. */
export default function Planner() {
  const navigate = useNavigate();
  const data = useQuery(api.planner.today);
  const savePlan = useMutation(api.planner.savePlan);
  const setBlock = useMutation(api.planner.setBlockStatus);
  const reorder = useMutation(api.planner.reorderBlock);
  const [busy, setBusy] = useState(false);

  if (data === undefined) {
    return (
      <AppShell>
        <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }

  const plan = data?.plan as { _id: string; blocks: Block[] } | null | undefined;
  const blocks = (plan?.blocks ?? (data?.blocks as Block[] | undefined) ?? []) as Block[];
  const persisted = plan != null && plan !== null;
  const totalMin = blocks.filter((b) => b.status !== "skipped").reduce((n, b) => n + b.minutes, 0);
  const doneMin = blocks.filter((b) => b.status === "completed").reduce((n, b) => n + b.minutes, 0);

  const runBlock = async (b: Block) => {
    if (b.kind === "recall") return navigate("/flashcards");
    if (b.materialId) {
      const q = b.conceptKey ? `?concept=${encodeURIComponent(b.conceptKey)}` : "";
      return navigate(`/practice/${b.materialId}${q}`);
    }
    return navigate("/practice");
  };

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="KYNEX Planner · built from your real weak spots"
        title="Today's plan"
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-sm font-bold">
            <CalendarDays className="size-4 text-primary" />
            {new Date().toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
          </span>
          {blocks.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-xp/30 bg-xp/10 px-3.5 py-1.5 text-sm font-bold text-xp-foreground">
              <Zap className="size-4" /> {doneMin}/{totalMin} min
            </span>
          )}
        </div>
      </PageHeader>

      {blocks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-12 text-center">
          <Brain className="mx-auto size-12 text-primary" />
          <p className="mt-4 font-display text-2xl font-bold">Nothing to plan yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The planner builds today's blocks from your weakest concepts, due Recall cards and
            upcoming exams. Practice once, add exam dates, or generate flashcards to give it inputs.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button className="gap-2 rounded-xl" onClick={() => navigate("/practice")}>
              <Target className="size-4" /> Start practice
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => navigate("/add")}>
              Add material
            </Button>
          </div>
        </div>
      ) : (
        <>
          {!persisted && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                This plan is generated from your live data — save it to make it official for today.
              </p>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg"
                disabled={busy}
                onClick={() => act(async () => {
                  await savePlan({ examDate: data?.suggestedExamDate ?? undefined });
                }, "Plan saved for today")}
              >
                <Check className="size-3.5" /> Save today's plan
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {blocks.map((b, i) => {
              const meta = KIND_META[b.kind];
              const Icon = meta.icon;
              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 sm:px-5",
                    b.status === "completed" && "border-success/40 bg-success/5",
                    b.status === "skipped" && "opacity-55",
                    b.status === "pending" && "border-border/70",
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase", meta.cls)}>
                    <Icon className="size-3" /> {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-bold", b.status === "completed" && "line-through decoration-success/60")}>
                      {b.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{b.minutes} min focused</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {b.status === "pending" && (
                      <>
                        <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" disabled={busy} onClick={() => runBlock(b)}>
                          <Zap className="size-3.5" /> Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-lg text-xs"
                          disabled={busy || !persisted}
                          title={persisted ? "Mark completed" : "Save the plan first"}
                          onClick={() => persisted && act(() => setBlock({ planId: plan._id as Id<"studyPlans">, blockId: b.id, status: "completed" }))}
                        >
                          <Check className="size-3.5" /> Done
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 rounded-lg text-xs text-muted-foreground"
                          disabled={busy || !persisted}
                          onClick={() => persisted && act(() => setBlock({ planId: plan._id as Id<"studyPlans">, blockId: b.id, status: "skipped" }))}
                        >
                          <X className="size-3.5" /> Skip
                        </Button>
                      </>
                    )}
                    {b.status !== "pending" && persisted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg text-xs text-muted-foreground"
                        disabled={busy}
                        onClick={() => act(() => setBlock({ planId: plan._id as Id<"studyPlans">, blockId: b.id, status: "pending" }))}
                      >
                        Reschedule
                      </Button>
                    )}
                    {persisted && (
                      <div className="flex flex-col">
                        <button
                          className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={busy || i === 0}
                          aria-label="Move up"
                          onClick={() => act(() => reorder({ planId: plan._id as Id<"studyPlans">, blockId: b.id, direction: "up" }))}
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={busy || i === blocks.length - 1}
                          aria-label="Move down"
                          onClick={() => act(() => reorder({ planId: plan._id as Id<"studyPlans">, blockId: b.id, direction: "down" }))}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Blocks come from your real mastery data — weakest concepts first, then recall, then exam prep.
          </p>
        </>
      )}
    </AppShell>
  );
}
