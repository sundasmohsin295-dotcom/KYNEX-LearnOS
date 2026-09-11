import { useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { Link, useNavigate, useParams } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, ArrowRight, BookOpen, Brain, ChevronDown, FileQuestion, GraduationCap,
  Lightbulb, Link2, Map as MapIcon, MessageSquareText, Microscope, Network, Play,
  RefreshCw, Sparkles, Sprout, Target, Wand2, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProcessingPipeline, KnowledgeNode } from "@/components/VisualBits";
import { MasteryRings } from "@/components/VisualBits";
import { cn } from "@/lib/utils";
import { MODES, masteryState, conceptColor } from "@/lib/studyos";

const MODE_ICON: Record<string, typeof Zap> = {
  zap: Zap, sprout: Sprout, microscope: Microscope, graduation: GraduationCap,
  lightbulb: Lightbulb, help: FileQuestion, map: MapIcon, target: Target,
  refresh: RefreshCw, present: MessageSquareText,
};

type VizKind = "mind" | "flow" | "cause" | "compare";

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const material = useQuery(api.materials.get, id ? { id: id as never } : "skip");
  const mastery = useQuery(api.profiles.myOverview);
  const genCards = useMutation(api.learning.generateFlashcards);
  const startQuiz = useMutation(api.learning.startQuiz);
  const genQuiz = useAction(api.aiEngine.generateQuiz);
  const [openSection, setOpenSection] = useState<string | null>("concepts");
  const [viz, setViz] = useState<VizKind>("mind");

  const analysis = material?.analysis;

  const conceptRows = useMemo(() => {
    if (!analysis || !mastery) return [];
    const byKey = new Map(mastery.mastery.map((m) => [m.conceptKey, m]));
    return analysis.concepts.map((c) => ({
      name: c.name,
      explanation: c.explanation,
      difficulty: c.difficulty,
      row: byKey.get(c.name.toLowerCase().trim()),
    }));
  }, [analysis, mastery]);

  if (material === undefined) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-muted/60" />
      </AppShell>
    );
  }

  if (material === null) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-border/70 bg-card p-14 text-center">
          <p className="font-display text-xl font-bold">Material not found</p>
          <Button className="mt-4" onClick={() => navigate("/library")}>Back to library</Button>
        </div>
      </AppShell>
    );
  }

  // ---------- Processing state ----------
  if (material.status === "processing") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl rounded-3xl border border-primary/25 bg-card p-10 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
            className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-xl"
          >
            <Brain className="size-8" />
          </motion.div>
          <h1 className="mt-6 font-display text-2xl font-bold">{material.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            STUDYOS is reading, structuring and building your learning kit…
          </p>
          <div className="mt-8">
            <ProcessingPipeline stage={material.processingStage ?? "receiving"} />
          </div>
          <p className="mt-6 text-xs text-muted-foreground">This usually takes 20–60 seconds.</p>
        </div>
      </AppShell>
    );
  }

  // ---------- Failed state ----------
  if (material.status === "failed") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl rounded-3xl border border-destructive/30 bg-card p-10 text-center">
          <AlertTriangle className="mx-auto size-12 text-destructive" />
          <h1 className="mt-5 font-display text-2xl font-bold">Analysis failed</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{material.error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The material was NOT analyzed — nothing here is guessed.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate("/add")}>Try a different source</Button>
            <Button onClick={() => navigate("/library")}>Back to library</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!analysis) return null;

  const a = analysis;

  return (
    <AppShell>
      {/* ---------- Header ---------- */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Link to="/library" className="hover:text-foreground">Library</Link> /
          <span className="text-foreground">{a.title ?? material.title}</span>
        </div>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-extrabold tracking-tight">{a.title ?? material.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.prerequisites.map((p) => (
                <span key={p} className="rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  prerequisite: {p}
                </span>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-row flex-wrap gap-2 lg:flex-col">
            <Button className="gap-2 rounded-xl shadow-lg shadow-primary/25" onClick={() => navigate(`/chat?material=${material._id}`)}>
              <MessageSquareText className="size-4" /> Ask the Professor
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={async () => {
                try {
                  const attemptId = await startQuiz({
                    materialId: material._id,
                    count: 8,
                    difficulty: "adaptive",
                    mode: "practice",
                  });
                  await genQuiz({ attemptId });
                  navigate(`/quiz/${attemptId}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn't start practice");
                }
              }}
            >
              <Target className="size-4" /> Practice quiz
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={async () => {
                try {
                  const n = await genCards({ materialId: material._id });
                  toast.success(n > 0 ? `${n} flashcards ready` : "Flashcards already generated");
                  navigate("/flashcards");
                } catch {
                  toast.error("Couldn't generate flashcards");
                }
              }}
            >
              <RefreshCw className="size-4" /> Make flashcards
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ---------- Learning modes ---------- */}
      <section className="mt-9">
        <h2 className="font-display text-lg font-bold">
          KYNEX Professor · modes
          <span className="ml-2 rounded-full bg-muted px-2.5 py-0.5 align-middle text-[10px] font-bold text-muted-foreground">AI teaching system</span>
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODES.map((m, i) => {
            const Icon = MODE_ICON[m.icon] ?? Zap;
            return (
              <motion.button
                key={m.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(`/chat?material=${material._id}&mode=${m.key}`)}
                className="card-lift group rounded-2xl border border-border/70 bg-card p-4 text-left"
              >
                <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-chart-4/15 text-primary transition-transform group-hover:scale-110">
                  <Icon className="size-4.5" />
                </div>
                <p className="mt-2.5 text-sm font-bold leading-tight">{m.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.desc}</p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ---------- Visual engine ---------- */}
      <section className="mt-9 rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Network className="size-5 text-primary" /> KYNEX Map
          </h2>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {(
              [
                ["mind", "Mind map"],
                ["flow", "Flow"],
                ["cause", "Cause → Effect"],
                ["compare", "Apply / Remember"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setViz(k)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  viz === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          {viz === "mind" && <MindMap concepts={a.concepts.map((c) => c.name)} title={a.title} />}
          {viz === "flow" && <FlowDiagram steps={a.keyPoints} />}
          {viz === "cause" && <CauseEffect pairs={a.causeEffect ?? []} />}
          {viz === "compare" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel title="Remember" tone="text-xp-foreground" items={a.remember ?? []} icon={Zap} />
              <Panel title="Be able to apply" tone="text-success" items={a.applySkills ?? []} icon={Target} />
            </div>
          )}
        </div>
      </section>

      {/* ---------- Concepts ---------- */}
      <section className="mt-9">
        <h2 className="font-display text-lg font-bold">Core concepts</h2>
        <div className="mt-3 space-y-2.5">
          {conceptRows.map((c, i) => {
            const state = c.row ? masteryState(c.row) : "new";
            const { from, to } = conceptColor(c.name);
            return (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <button
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  onClick={() => setOpenSection(openSection === `c-${i}` ? null : `c-${i}`)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                    {i + 1}
                  </span>
                  <span className="flex-1 font-semibold">{c.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      state === "mastered" && "bg-success/15 text-success",
                      state === "weak" && "bg-chart-5/15 text-chart-5",
                      state === "learning" && "bg-primary/10 text-primary",
                      state === "new" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.difficulty} · {state}
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", openSection === `c-${i}` && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === `c-${i}` && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/60 px-5 py-4">
                        <p className="text-sm leading-relaxed text-muted-foreground">{c.explanation}</p>
                        {c.row && c.row.attempts > 0 && (
                          <p className="mt-3 text-xs font-semibold text-primary">
                            Your accuracy here: {Math.round((c.row.correct / c.row.attempts) * 100)}%
                          </p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 gap-1.5 rounded-lg text-xs"
                          onClick={() => navigate(`/chat?material=${material._id}&mode=teach&concept=${encodeURIComponent(c.name)}`)}
                        >
                          <GraduationCap className="size-3.5" /> Learn this 1-on-1
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ---------- Detail sections ---------- */}
      <div className="mt-9 grid gap-5 lg:grid-cols-2">
        <SectionCard title="Key definitions" icon={BookOpen} items={(a.definitions ?? []).map((d) => `${d.term} — ${d.definition}`)} />
        <SectionCard title="Formulas" icon={Zap} items={(a.formulas ?? []).map((f) => `${f.name}: ${f.expression} — ${f.note}`)} mono />
        <SectionCard title="Worked examples" icon={Lightbulb} items={(a.examples ?? []).map((e) => `${e.title}: ${e.walkthrough}`)} />
        <SectionCard title="Real-world applications" icon={Network} items={a.applications ?? []} />
        <SectionCard
          title="Common misconceptions"
          icon={AlertTriangle}
          items={(a.misconceptions ?? []).map((m) => `✗ ${m.wrong} — ${m.why} → ✓ ${m.correct}`)}
        />
        <SectionCard title="Common mistakes" icon={X} items={a.commonMistakes} />
      </div>

      {/* cause-effect list */}
      {(a.causeEffect ?? []).length > 0 && (
        <div className="mt-5 rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="font-display text-lg font-bold">Cause → Effect</h3>
          <div className="mt-4 space-y-2.5">
            {a.causeEffect!.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-lg bg-primary/10 px-3 py-1.5 font-semibold text-primary">{p.cause}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <span className="rounded-lg bg-success/10 px-3 py-1.5 font-semibold text-success">{p.effect}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* examiner questions */}
      {(a.examinerQuestions ?? []).length > 0 && (
        <div className="mt-5 rounded-3xl border border-xp/40 bg-gradient-to-br from-xp/10 to-card p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <GraduationCap className="size-5 text-xp-foreground" /> What an examiner could ask
          </h3>
          <ol className="mt-4 space-y-2.5">
            {a.examinerQuestions!.map((q, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-xp/30 text-xs font-extrabold text-xp-foreground">{i + 1}</span>
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ol>
          <Button
            className="mt-5 gap-2 rounded-xl"
            onClick={async () => {
              try {
                const attemptId = await startQuiz({
                  materialId: material._id,
                  count: 8,
                  difficulty: "hard",
                  mode: "diagnostic",
                });
                await genQuiz({ attemptId });
                navigate(`/quiz/${attemptId}`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't start exam drill");
              }
            }}
          >
            <Wand2 className="size-4" /> Drill these in Exam Mode
          </Button>
        </div>
      )}

      {/* concept mastery overview */}
      {mastery && mastery.mastery.length > 0 && (
        <div className="mt-5 rounded-3xl border border-border/70 bg-card p-6">
          <h3 className="font-display text-lg font-bold">Your mastery on this material</h3>
          <MasteryRings
            rows={mastery.mastery.filter((m) => m.materialId === material._id).slice(0, 6)}
            className="mt-2"
          />
        </div>
      )}
    </AppShell>
  );
}

/* ---------------- Visual engine pieces ---------------- */

function MindMap({ concepts, title }: { concepts: string[]; title?: string }) {
  return (
    <div className="relative overflow-x-auto pb-2">
      <div className="flex min-w-fit items-center gap-6 px-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="grid size-32 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-primary to-chart-4 p-4 text-center text-sm font-bold text-white shadow-xl"
        >
          {title ?? "Topic"}
        </motion.div>
        <div className="relative">
          {/* spokes */}
          <svg className="absolute inset-0 h-full w-full" aria-hidden>
            {concepts.slice(0, 6).map((_, i) => (
              <motion.line
                key={i}
                x1="0" y1="50%" x2="18" y2={`${12 + i * 15}%`}
                stroke="currentColor" className="text-border" strokeWidth="2"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2 + i * 0.08 }}
              />
            ))}
          </svg>
          <div className="flex flex-col gap-2.5 pl-6">
            {concepts.slice(0, 6).map((c, i) => (
              <motion.div
                key={c}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.08 }}
              >
                <KnowledgeNode name={c} state="new" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowDiagram({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center gap-2"
        >
          <span className="max-w-56 rounded-xl border border-border/70 bg-muted/60 px-3.5 py-2 text-xs font-semibold leading-snug">
            {s}
          </span>
          {i < steps.length - 1 && <ArrowRight className="size-4 shrink-0 text-primary" />}
        </motion.div>
      ))}
    </div>
  );
}

function CauseEffect({ pairs }: { pairs: { cause: string; effect: string }[] }) {
  if (pairs.length === 0) {
    return <p className="text-sm text-muted-foreground">No cause-effect pairs were identified in this material.</p>;
  }
  return (
    <div className="space-y-3">
      {pairs.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex flex-wrap items-center gap-2.5"
        >
          <span className="rounded-xl bg-chart-5/10 px-3.5 py-2 text-xs font-semibold text-chart-5">{p.cause}</span>
          <span className="text-lg text-muted-foreground">→</span>
          <span className="rounded-xl bg-success/10 px-3.5 py-2 text-xs font-semibold text-success">{p.effect}</span>
        </motion.div>
      ))}
    </div>
  );
}

function Panel({ title, items, tone, icon: Icon }: { title: string; items: string[]; tone: string; icon: typeof Zap }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/40 p-5">
      <p className={`flex items-center gap-2 text-sm font-bold ${tone}`}>
        <Icon className="size-4" /> {title}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
            {it}
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nothing flagged.</li>}
      </ul>
    </div>
  );
}

function SectionCard({
  title, icon: Icon, items, mono = false,
}: {
  title: string;
  icon: typeof Zap;
  items: string[];
  mono?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/70 bg-card p-6"
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-bold">
        <Icon className="size-5 text-primary" /> {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className={cn("flex items-start gap-2.5 text-sm leading-relaxed", mono && "font-mono text-[13px]")}>
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span className="text-muted-foreground">{it}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
