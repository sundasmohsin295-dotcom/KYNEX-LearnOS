import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { BookOpen, Link2, Plus, Search, Sparkles, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_META = {
  ready: { label: "Ready", cls: "bg-success/15 text-success" },
  processing: { label: "Processing", cls: "bg-xp/20 text-xp-foreground" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
} as const;

export default function Library() {
  const materials = useQuery(api.materials.list);
  const remove = useMutation(api.materials.remove);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const list = (materials ?? []).filter((m) =>
      m.title.toLowerCase().includes(q.toLowerCase()),
    );
    const map = new Map<string, typeof list>();
    for (const m of list) {
      // subject names are resolved below via a lightweight label
      const key = m.subjectId ?? "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [materials, q]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its chats, quizzes and flashcards?`)) return;
    try {
      await remove({ id: id as never });
      toast.success("Material deleted");
    } catch {
      toast.error("Couldn't delete material");
    }
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Your knowledge base" title="Library">
        <Button onClick={() => navigate("/add")} className="gap-2 rounded-xl shadow-lg shadow-primary/25">
          <Plus className="size-4" /> Add material
        </Button>
      </PageHeader>

      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search materials…"
          className="h-11 rounded-xl pl-10"
        />
      </div>

      {!materials ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted/60" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-14 text-center">
          <BookOpen className="mx-auto size-10 text-muted-foreground/50" />
          <p className="mt-4 font-display text-xl font-bold">Your library is empty</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add a PDF, a YouTube link, an article or paste your notes — STUDYOS turns it into a
            full learning kit in under a minute.
          </p>
          <Button size="lg" className="mt-6 gap-2 rounded-xl" onClick={() => navigate("/add")}>
            <Plus className="size-4" /> Add your first material
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([subject, items]) => (
            <div key={subject}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {subject === "general" ? "General" : subject.slice(0, 8) === "subject-" ? "Subject" : subject}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m, i) => {
                  const meta = STATUS_META[m.status];
                  return (
                    <motion.div
                      key={m._id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="card-lift group relative rounded-3xl border border-border/70 bg-card p-5"
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => navigate(`/material/${m._id}`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-chart-4/15 text-primary">
                            {m.kind === "youtube" ? (
                              <Youtube className="size-5" />
                            ) : m.kind === "url" ? (
                              <Link2 className="size-5" />
                            ) : (
                              <BookOpen className="size-5" />
                            )}
                          </div>
                          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", meta.cls)}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 font-display font-bold leading-snug">{m.title}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {m.status === "ready"
                            ? `${m.analysis?.concepts.length ?? 0} concepts · ${m.wordCount} words`
                            : m.status === "failed"
                              ? m.error ?? "Processing failed"
                              : "Analyzing…"}
                        </p>
                      </button>
                      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(m.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
                        </span>
                        <div className="flex items-center gap-1">
                          {m.status === "ready" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs text-primary"
                              onClick={() => navigate(`/practice/${m._id}`)}
                            >
                              <Sparkles className="size-3" /> Practice
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(m._id, m.title)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
