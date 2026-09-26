import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, BarChart3, BookOpen, Brain, Calculator, Command, Flame, Gauge,
  GraduationCap, Languages, Layers, MessagesSquare, Network, PenLine, Play, Plus, RefreshCw, Search, ShieldCheck,
  Shapes, Stethoscope, Target, User, Wrench, Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useUiPrefs } from "@/components/UiPrefsProvider";
import {
  PERSONAS,
  PERSONA_META,
  UI_STYLES,
  UI_STYLE_META,
  type Persona,
  type UiStyle,
} from "@/lib/uiPrefs";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

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
  const { style, persona, lang, setStyle, setPersona, setLang } = useUiPrefs();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const materials = useQuery(api.materials.listReady);
  // §3 anti-freeze: a strict 300ms debounce between keystrokes and the server
  // query — rapid typing never queues duplicate background work.
  const debouncedQ = useDebouncedValue(q, 300);
  // Smart Search (§33): contextual cross-entity results — materials, concepts
  // (with mastery), conversations, messages, mistakes, flashcards, missions,
  // examiner evaluations. Server-ranked; skipped until 2+ characters.
  const smart = useQuery(
    api.smartSearchQuery.search,
    debouncedQ.trim().length >= 2 ? { q: debouncedQ.trim() } : "skip",
  );

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

  // Reset composer + cursor when the bar opens. Adjusting state during
  // render from a previous-value check is the React-recommended alternative
  // to a setState-in-effect (no cascading render).
  const prevOpen = useRef(false);
  if (open && !prevOpen.current) {
    setQ("");
    setCursor(0);
  }
  prevOpen.current = open;

  const actions = useMemo<Action[]>(() => {
    const base: Action[] = [
      { id: "ask", label: q ? `Ask the Professor: “${q}”` : "Ask the Professor", group: "Professor", icon: GraduationCap, hint: "AI teaching + Socratic modes", run: () => navigate(`/chat${q ? `?q=${encodeURIComponent(q)}` : ""}`) },
      { id: "next", label: "Show my Next Move", group: "Command Center", icon: Target, hint: "Highest-impact action", run: () => navigate("/dashboard") },
      { id: "mission", label: "Start a mission now", group: "Mission Engine", icon: Play, hint: "One click → real mission screen", run: () => navigate("/mission") },
      { id: "plan", label: "Open today's study plan", group: "Planner", icon: Layers, hint: "Persisted blocks from real weak spots", run: () => navigate("/planner") },
      { id: "security", label: "Review security & sessions", group: "Account", icon: ShieldCheck, hint: "Live sessions, revocation, controls", run: () => navigate("/security") },
      { id: "plan", label: "Check my plan & usage", group: "Account", icon: Gauge, hint: "AI limits, Free vs Pro", run: () => navigate("/plan") },
      { id: "twin", label: "Open KYNEX Twin", group: "Command Center", icon: User, hint: "CURRENT → GAP → NEXT", run: () => navigate("/twin") },
      { id: "insights", label: "Show my weakest subject", group: "Insights", icon: BarChart3, hint: "Pulse + mistake bank", run: () => navigate("/insights") },
      { id: "practice", label: "Start practice", group: "Practice", icon: Play, hint: "Adaptive drills", run: () => navigate("/practice") },
      { id: "recall", label: "Review due cards", group: "Recall", icon: RefreshCw, hint: "Spaced repetition", run: () => navigate("/flashcards") },
      { id: "vault", label: "Open Vault", group: "Vault", icon: BookOpen, hint: "Materials & knowledge", run: () => navigate("/library") },
      { id: "upload", label: "Upload to Vault", group: "Vault", icon: Plus, hint: "PDF, link, notes…", run: () => navigate("/add") },
      { id: "goals", label: "Update academic goals", group: "Twin", icon: Layers, hint: "GPA targets & identity", run: () => navigate("/twin?edit=1") },
      { id: "achievements", label: "View achievements", group: "Insights", icon: Zap, run: () => navigate("/achievements") },
      { id: "gpa", label: "Open GPA Lab", group: "GPA Lab", icon: Calculator, hint: "CGPA, required GPA & scenarios", run: () => navigate("/gpa") },
      { id: "mistakes", label: "Open Mistake Bank", group: "Practice", icon: Wrench, hint: "Every miss, classified & fixable", run: () => navigate("/mistakes") },
      { id: "graph", label: "Open KYNEX Map", group: "Knowledge", icon: Network, hint: "Concept graph & weak roots", run: () => navigate("/graph") },
      { id: "visualize", label: "Visualize a topic", group: "Knowledge", icon: Shapes, hint: "AI mind maps, flows & timelines", run: () => navigate("/visualize") },
      { id: "writer", label: "Open the Writer", group: "Knowledge", icon: PenLine, hint: "Evidence-first drafting with citations", run: () => navigate("/writer") },
      { id: "exam", label: "Start a timed exam", group: "Practice", icon: Stethoscope, hint: "Server-timed simulator + autopsy", run: () => navigate("/practice") },
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
    // Design controls — real-time style/persona switching from the palette.
    for (const s of UI_STYLES) {
      if (s === style) continue;
      base.push({
        id: `style-${s}`,
        label: `Style: ${UI_STYLE_META[s].label}`,
        group: "Design",
        icon: Shapes,
        hint: UI_STYLE_META[s].blurb,
        run: () => setStyle(s as UiStyle),
      });
    }
    for (const p of PERSONAS) {
      if (p === persona) continue;
      base.push({
        id: `persona-${p}`,
        label: `Persona: ${PERSONA_META[p].label}`,
        group: "Design",
        icon: User,
        hint: PERSONA_META[p].blurb,
        run: () => setPersona(p as Persona),
      });
    }
    // Language switching — instant, RTL-aware, persisted.
    for (const l of LANGUAGES) {
      if (l.code === lang) continue;
      base.push({
        id: `lang-${l.code}`,
        label: `Language: ${l.name} (${l.native})`,
        group: "Language",
        icon: Languages,
        hint: l.rtl ? "Right-to-left layout" : undefined,
        run: () => setLang(l.code as LanguageCode),
      });
    }
    return base;
  }, [q, materials, navigate, style, persona, lang, setStyle, setPersona, setLang]);

  const smartActions = useMemo<Action[]>(() => {
    const kindIcon: Record<string, typeof Target> = {
      material: BookOpen,
      concept: Network,
      conversation: MessagesSquare,
      message: GraduationCap,
      mistake: Wrench,
      flashcard: RefreshCw,
      mission: Play,
      examiner: Stethoscope,
    };
    const out: Action[] = [];
    for (const g of smart?.groups ?? []) {
      for (const r of g.rows) {
        out.push({
          id: `s-${r.kind}-${r.ref}`,
          label: r.title.length > 90 ? `${r.title.slice(0, 90)}…` : r.title,
          hint: r.context,
          group: g.label,
          icon: kindIcon[r.kind] ?? Search,
          run: () => navigate(r.ref),
        });
      }
    }
    return out;
  }, [smart, navigate]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return actions.slice(0, 10);
    // Workspace results are server-ranked by relevance — show them first,
    // then command matches. Deep-link results cap at 6 so commands stay visible.
    const smartTop = smartActions.slice(0, 6);
    const cmdMatches = actions
      .filter((a) => a.label.toLowerCase().includes(needle))
      .slice(0, Math.max(4, 10 - smartTop.length));
    return [...smartTop, ...cmdMatches];
  }, [actions, smartActions, q]);

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
            className="animate-overlay-fade fixed inset-0 z-[80] flex items-start justify-center bg-background/70 px-4 pt-[14vh]"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={spring.spatial}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden kynex-glass spectrum-border rounded-2xl shadow-2xl"
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
                    {q.trim().length >= 2 && smart?.empty
                      ? smart.empty
                      : "No matching command. Press Enter on “Ask the Professor” to hand it to the AI."}
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
