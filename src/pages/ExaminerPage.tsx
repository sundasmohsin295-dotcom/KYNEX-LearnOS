import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { motion } from "framer-motion";
import {
  ClipboardCheck, ClipboardList, FileText, Lock, Send, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EvalRow = {
  _id: string;
  conceptLabel: string;
  question: string;
  marksAwarded: number;
  marksTotal: number;
  scheme: "provided" | "provisional";
  createdAt: number;
};

const STATUS_STYLES: Record<string, string> = {
  met: "bg-success/15 text-success",
  partial: "bg-xp/15 text-xp-foreground",
  missed: "bg-destructive/10 text-destructive",
};

export default function ExaminerPage() {
  const history = useQuery(api.examinerReads.listMine);
  const materials = useQuery(api.materials.listReady);
  const evaluate = useAction(api.examiner.evaluate);
  const deleteEval = useMutation(api.account.deleteExaminerEvaluation);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [concept, setConcept] = useState("");
  const [materialId, setMaterialId] = useState<string>("");
  const [scheme, setScheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    marksAwarded: number;
    marksTotal: number;
    breakdown: { criterion: string; status: string; detail: string }[];
    missingPoints: string[];
    errors: string[];
    modelAnswer: string;
    howToImprove: string;
    nextMove: string;
  } | null>(null);

  const pct =
    result
      ? Math.round((result.marksAwarded / result.marksTotal) * 100)
      : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="AI Examiner · provisional rubric"
        title="Examiner"
      >
        <p className="max-w-md text-sm text-muted-foreground">
          Rigorous evaluation of your written answers: marks, missing points,
          errors, a model answer and how to improve. Marks are{" "}
          <strong>provisional rubric marks</strong>, never official university grades.
        </p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ---------------- form ---------------- */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <FileText className="size-3.5" /> Exam question
                </span>
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Explain how the CIA triad guides the design of a secure system. (8 marks)"
                  className="min-h-[72px]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Topic (optional)
                </span>
                <Input
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="CIA Triad"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Material context (optional)
                </span>
                <select
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">None: general evaluation</option>
                  {materials?.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Your answer
                </span>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your full exam-style answer here…"
                  className="min-h-[160px]"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <ClipboardList className="size-3.5" /> Official marking scheme (optional, takes priority)
                </span>
                <Textarea
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value)}
                  placeholder="Paste the scheme if you have one. Without it, KYNEX uses a clearly-labeled provisional rubric."
                  className="min-h-[64px]"
                />
              </label>
            </div>

            <Button
              className="mt-5 w-full gap-2 rounded-xl shadow-lg shadow-primary/25"
              disabled={
                busy ||
                question.trim().length < 8 ||
                answer.trim().length < 10
              }
              onClick={async () => {
                setBusy(true);
                setResult(null);
                try {
                  const res = await evaluate({
                    question,
                    studentAnswer: answer,
                    conceptLabel: concept || undefined,
                    materialId: (materialId || undefined) as never,
                    markingScheme: scheme || undefined,
                  });
                  setResult(res);
                  toast.success("Evaluation ready");
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Evaluation failed",
                    { duration: 8000 },
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <>
                  <Wand2 className="size-4 animate-pulse" /> Evaluating…
                </>
              ) : (
                <>
                  <Send className="size-4" /> Evaluate my answer
                </>
              )}
            </Button>
          </div>

          {/* ---------------- result ---------------- */}
          {busy && (
            <div className="space-y-3 rounded-3xl border border-border/70 bg-card p-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          )}
          {result && !busy && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="rounded-3xl border border-primary/25 bg-card p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Marks awarded · {scheme ? "official scheme" : "provisional rubric"}
                    </p>
                    <p className="font-display text-4xl font-extrabold">
                      {result.marksAwarded}
                      <span className="text-xl text-muted-foreground">/{result.marksTotal}</span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-bold",
                      pct !== null && pct >= 80
                        ? "bg-success/15 text-success"
                        : pct !== null && pct >= 50
                          ? "bg-xp/15 text-xp-foreground"
                          : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {result.breakdown.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2"
                    >
                      <span
                        className={cn(
                          "mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                          STATUS_STYLES[b.status],
                        )}
                      >
                        {b.status}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{b.criterion}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{b.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-card p-6">
                <h3 className="flex items-center gap-2 font-display text-base font-bold">
                  <Sparkles className="size-4 text-primary" /> Model answer
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {result.modelAnswer}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {result.missingPoints.length > 0 && (
                  <div className="rounded-3xl border border-border/70 bg-card p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Missing points</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {result.missingPoints.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-destructive" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="rounded-3xl border border-border/70 bg-card p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Errors</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {result.errors.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-xp" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-primary/25 bg-primary/5 p-6">
                <h3 className="font-display text-base font-bold">How to improve</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{result.howToImprove}</p>
                <p className="mt-3 rounded-xl bg-card px-3 py-2 text-sm font-semibold">
                  <Sparkles className="mr-1.5 inline size-4 text-primary" />
                  Next move: {result.nextMove}
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* ---------------- history ---------------- */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-border/70 bg-card p-6">
            <h3 className="flex items-center gap-2 font-display text-base font-bold">
              <ClipboardCheck className="size-5 text-primary" /> Recent evaluations
            </h3>
            {history === undefined ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No evaluations yet. Submit an exam-style answer and the Examiner
                will build your evidence history here.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {history.map((h) => (
                  <li
                    key={h._id}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{h.conceptLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">{h.question}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                        {h.marksAwarded}/{h.marksTotal}
                      </span>
                      <button
                        aria-label="Delete evaluation"
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={async () => {
                          try {
                            await deleteEval({ id: h._id as never });
                          } catch {
                            toast.error("Couldn't delete the evaluation");
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" />
              Only you can see your evaluations. No official grade authority.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
