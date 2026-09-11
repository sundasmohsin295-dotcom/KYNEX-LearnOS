import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, BarChart3, BookOpen, Brain, Command, Flame, GraduationCap,
  Layers, Play, Plus, RefreshCw, Search, Target, User, Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

interface Action {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Target;
  run: () => void;
}

/** KYNEX Command Bar — global ⌘K router that sends intent to the right feature. */
export function CommandBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const materials = useQuery(api.materials.listReady);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setCursor(0); }
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const base: Action[] = [
      { id: "ask", label: q ? `Ask the Professor: “${q}”` : "Ask the Professor", group: "Professor", icon: GraduationCap, hint: "AI teaching + Socratic modes", run: () => navigate(`/chat${q ? `?q=${encodeURIComponent(q)}` : ""}`) },
      { id: "next", label: "Show my Next Move", group: "Command Center", icon: Target, hint: "Highest-impact action", run: () => navigate("/dashboard") },
      { id: "twin", label: "Open KYNEX Twin", group: "Command Center", icon: User, hint: "CURRENT → GAP → NEXT", run: () => navigate("/twin") },
      { id: "insights", label: "Show my weakest subject", group: "Insights", icon: BarChart3, hint: "Pulse + mistake bank", run: () => navigate("/insights") },
      { id: "practice", label: "Start practice", group: "Practice", icon: Play, hint: "Adaptive drills", run: () => navigate("/practice") },
      { id: "recall", label: "Review due cards", group: "Recall", icon: RefreshCw, hint: "Spaced repetition", run: () => navigate("/flashcards") },
      { id: "vault", label: "Open Vault", group: "Vault", icon: BookOpen, hint: "Materials & knowledge", run: () => navigate("/library") },
      { id: "upload", label: "Upload to Vault", group: "Vault", icon: Plus, hint: "PDF, link, notes…", run: () => navigate("/add") },
      { id: "goals", label: "Update academic goals", group: "Twin", icon: Layers, hint: "GPA targets & identity", run: () => navigate("/twin?edit=1") },
      { id: "achievements", label: "View achievements", group: "Insights", icon: Zap, run: () => navigate("/achievements") },
    ];
    if (q.trim().length >= 4) {
      base.unshift({
        id: "explain-q",
        label: `Teach me: “${q}”`,
        group: "Professor",
        icon: Brain,
        hint: "Deep explanation from your material",
        run: () => navigate(`/chat?q=${encodeURIComponent(q)}&mode=deep`),
      });
    }
    for (const m of (materials ?? []).slice(0, 5)) {
      base.push({
        id: `m-${m._id}`,
        label: m.title,
        group: "Your Vault",
        icon: BookOpen,
        hint: "Open material",
        run: () => navigate(`/material/${m._id}`),
      });
    }
    return base;
  }, [q, materials, navigate]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return actions.slice(0, 10);
    return actions.filter((a) => a.label.toLowerCase().includes(needle)).slice(0, 10);
  }, [actions, q]);

  const exec = (a?: Action) => {
    if (!a) return;
    setOpen(false);
    a.run();
  };

  return (
    <>
      {/* trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Search, ask, act…</span>
        <kbd className="ml-1 hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold sm:inline">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-start justify-center bg-background/60 px-4 pt-[14vh] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
                <Command className="size-4 text-primary" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setCursor(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
                    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                    if (e.key === "Enter") { e.preventDefault(); exec(filtered[cursor]); }
                  }}
                  placeholder="Explain TCP · test me on chapter 3 · show my weakest subject…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">ESC</kbd>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
                {filtered.map((a, i) => (
                  <button
                    key={a.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => exec(a)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      i === cursor ? "bg-primary/10" : "hover:bg-accent/60",
                    )}
                  >
                    <span className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      i === cursor ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}>
                      <a.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.label}</span>
                      {a.hint && <span className="block truncate text-[11px] text-muted-foreground">{a.hint}</span>}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{a.group}</span>
                    {i === cursor && <ArrowRight className="size-3.5 text-primary" />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No matching command — press Enter on “Ask the Professor” to hand it to the AI.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-[10px] font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><Flame className="size-3" /> KYNEX Command</span>
                <span>↑↓ navigate · ↵ run</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
