import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Brain, CheckCircle2, Crosshair, Filter, Layers, RotateCcw, Search,
  Target, Wrench, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mistake = {
  _id: string;
  question: string;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string;
  conceptKey: string;
  conceptLabel: string;
  category:
    | "conceptual" | "calculation" | "careless" | "memory"
    | "misreading" | "time_pressure" | "reasoning" | "application";
  difficulty: "easy" | "medium" | "hard";
  timesMissed: number;
  resolved: boolean;
  materialId?: string;
  createdAt: number;
};

const CATEGORY_META: Record<Mistake["category"], { label: string; icon: typeof Brain; cls: string }> = {
  conceptual: { label: "Concept gap", icon: Brain, cls: "bg-chart-5/15 text-chart-5" },
  calculation: { label: "Calculation", icon: Wrench, cls: "bg-warning/15 text-warning-foreground" },
  careless: { label: "Careless", icon: Zap, cls: "bg-xp/20 text-xp-foreground" },
  memory: { label: "Recall slip", icon: RotateCcw, cls: "bg-chart-2/15 text-chart-2" },
  misreading: { label: "Misread", icon: Search, cls: "bg-chart-4/15 text-chart-4" },
  time_pressure: { label: "Time pressure", icon: Crosshair, cls: "bg-destructive/15 text-destructive" },
  reasoning: { label: "Reasoning", icon: Crosshair, cls: "bg-chart-4/15 text-chart-4" },
  application: { label: "Application", icon: Target, cls: "bg-primary/10 text-primary" },
};

/**
 * KYNEX Mistake Bank — every wrong answer from real practice, classified and
 * resolvable. "Fix My Mistakes" launches targeted practice per concept.
 */
export default function MistakeBank() {
  const navigate = useNavigate();
  const data = useQuery(api.learning.listMistakes) as
    | { unresolved: Mistake[]; resolved: Mistake[] }
    | null
    | undefined;
  const resolve = useMutation(api.learning.resolveMistake);
  const [filter, setFilter] = useState<Mistake["category"] | "all">("all");
  const [q, setQ] = useState("");

  if (data === undefined) {
    return (
      <AppShell>
        <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }
  if (data === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-card p-10 text-center">
          <p className="font-display text-xl font-bold">Sign in to open the Mistake Bank</p>
          <Button className="mt-5" onClick={() => navigate("/auth")}>Sign in</Button>
        </div>
      </AppShell>
    );
  }

  const { unresolved, resolved } = data;
  const filtered = unresolved.filter(
    (m) =>
      (filter === "all" || m.category === filter) &&
      (q === "" || m.question.toLowerCase().includes(q.toLowerCase()) || m.conceptLabel.toLowerCase().includes(q.toLowerCase())),
  );
  const categories = [...new Set(unresolved.map((m) => m.category))];

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Mistake Bank · Learn from every miss" title="Mistake Bank">
        <p className="max-w-md text-sm text-muted-foreground">
          Every wrong answer lands here, classified by error type. Mistakes resolve when you
          answer the same concept correctly in a later session.
        </p>
      </PageHeader>

      {/* summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-chart-5/30 bg-chart-5/5 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-chart-5">Open mistakes</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-chart-5">{unresolved.length}</p>
        </div>
        <div className="rounded-3xl border border-success/30 bg-success/5 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-success">Fixed</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-success">{resolved.length}</p>
        </div>
        <div className="rounded-3xl border border-border/70 bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fix rate</p>
          <p className="mt-1 font-display text-3xl font-extrabold">
            {unresolved.length + resolved.length > 0
              ? Math.round((resolved.length / (unresolved.length + resolved.length)) * 100)
              : 0}%
          </p>
        </div>
      </div>

      {/* filters */}
      {unresolved.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Filter className="size-3.5" /> Type
          </span>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            All ({unresolved.length})
          </button>
          {categories.map((c) => {
            const meta = CATEGORY_META[c];
            const count = unresolved.filter((m) => m.category === c).length;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                  filter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {meta.label} ({count})
              </button>
            );
          })}
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mistakes…"
            className="ml-auto h-9 w-48 rounded-lg text-xs"
          />
        </div>
      )}

      {/* list */}
      {filtered.length === 0 && unresolved.length > 0 ? (
        <p className="mt-6 rounded-2xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          No mistakes match this filter.
        </p>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border p-14 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <p className="mt-4 font-display text-2xl font-bold">Your bank is clean</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Mistakes appear here the moment you miss a practice question — and resolving them is
            how mastery actually compounds.
          </p>
          <Button className="mt-5 gap-2 rounded-xl" onClick={() => navigate("/practice")}>
            <Target className="size-4" /> Start practice
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((m, i) => {
            const meta = CATEGORY_META[m.category];
            const Icon = meta.icon;
            return (
              <motion.div
                key={m._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="rounded-2xl border border-border/70 bg-card p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", meta.cls)}>
                    <Icon className="size-3" /> {meta.label}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                    {m.difficulty}
                  </span>
                  {m.timesMissed > 1 && (
                    <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-[10px] font-bold text-destructive">
                      missed {m.timesMissed}×
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{m.conceptLabel}</span>
                </div>

                <p className="mt-3 text-sm font-semibold leading-snug">{m.question}</p>
                <div className="mt-2.5 grid gap-1.5 text-xs">
                  <p className="text-muted-foreground">
                    <span className="font-bold text-destructive">✗</span> {m.yourAnswer}
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-bold text-success">✓</span> {m.correctAnswer}
                  </p>
                </div>
                <p className="mt-2.5 rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  {m.explanation}
                </p>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {m.materialId && (
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg text-xs"
                      onClick={() => navigate(`/practice/${m.materialId}?concept=${encodeURIComponent(m.conceptKey)}`)}
                    >
                      <Wrench className="size-3.5" /> Fix with 8 targeted questions
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 rounded-lg text-xs"
                    onClick={async () => {
                      try {
                        await resolve({ id: m._id as never });
                        toast.success("Marked as fixed");
                      } catch {
                        toast.error("Couldn't update the mistake");
                      }
                    }}
                  >
                    <CheckCircle2 className="size-3.5" /> Mark fixed
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* resolved archive */}
      {resolved.length > 0 && (
        <div className="mt-8 rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Layers className="size-5 text-success" /> Fixed ({resolved.length})
          </h3>
          <div className="mt-4 space-y-2">
            {resolved.slice(0, 10).map((m) => (
              <div key={m._id} className="flex items-center gap-3 rounded-xl bg-success/5 px-3.5 py-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.question}</span>
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{m.conceptLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
