import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, MessagesSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

/**
 * APP WINDOW MOCKUP — a hardware-styled OS window showcasing KYNEX's live
 * modules. The tabs are REAL navigation: each one switches the showcased
 * module instantly (spring, <300ms, isolated opacity/transform only) and its
 * CTA deep-links into the actual product surface. Theme tokens only — the
 * same component is pristine on paper-white and luminous on obsidian.
 */

type TabKey = "graph" | "socratic" | "leitner";

const TABS: {
  key: TabKey;
  label: string;
  icon: typeof GitBranch;
  badge: string;
  badgeCls: string;
  title: string;
  body: string;
  cta: string;
  to: string;
}[] = [
  {
    key: "graph",
    label: "Neural Graph",
    icon: GitBranch,
    badge: "● Active Cluster: Cybersecurity & Zero-Trust",
    badgeCls: "bg-primary/10 text-primary",
    title: "Autonomous Knowledge Mapping",
    body: "Real-time concept clustering connects your study materials into a zero-loss prerequisite tree — weak roots detected automatically.",
    cta: "Open KYNEX Map",
    to: "/graph",
  },
  {
    key: "socratic",
    label: "Socratic AI",
    icon: MessagesSquare,
    badge: "● Maieutic Engine Ready",
    badgeCls: "bg-success/10 text-success",
    title: "“What underlying invariant protects the SIEM gateway from credential replay?”",
    body: "The AI Professor drives active recall by testing your mental models instead of supplying passive answers.",
    cta: "Open the Professor",
    to: "/chat",
  },
  {
    key: "leitner",
    label: "Leitner-X",
    icon: RefreshCw,
    badge: "● Spaced Repetition Queue · 14 due",
    badgeCls: "bg-warning/15 text-warning-foreground",
    title: "Confidence-Calibrated Recall",
    body: "Review intervals adapt to your response confidence and accuracy — the schedule is computed server-side, per card.",
    cta: "Open Recall",
    to: "/flashcards",
  },
];

export function AppWindowMockup() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("graph");
  const active = TABS.find((t) => t.key === activeTab) ?? TABS[0]!;

  return (
    <div className="kynex-glass spectrum-border w-full rounded-3xl">
      {/* Window header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="size-3 cursor-pointer rounded-full bg-chart-5/80 transition-transform duration-150 hover:scale-110" title="Close" />
          <span className="size-3 cursor-pointer rounded-full bg-warning/80 transition-transform duration-150 hover:scale-110" title="Minimize" />
          <span className="size-3 cursor-pointer rounded-full bg-success/80 transition-transform duration-150 hover:scale-110" title="Expand" />
        </div>

        {/* Interactive tab switcher — instant state, spring sub-300ms */}
        <div className="flex rounded-xl bg-muted/70 p-1" role="tablist" aria-label="KYNEX modules">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "press-micro relative rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 sm:px-3",
                activeTab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="hidden font-data text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
          KYNEX v2.6.4
        </div>
      </div>

      {/* Dynamic content area — layout-locked so tab switches never shift */}
      <div className="relative flex min-h-[280px] flex-col items-center justify-center p-6 text-center sm:p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ ...spring.snappy, duration: 0.22 }}
            className="space-y-3.5"
            role="tabpanel"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 font-data text-[11px] font-semibold">
              <span className={cn("rounded-full px-2.5 py-0.5", active.badgeCls)}>{active.badge}</span>
            </div>
            <h3 className="mx-auto max-w-md font-display text-xl font-bold leading-snug tracking-tight sm:text-2xl">
              {active.title}
            </h3>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              {active.body}
            </p>
            <button
              onClick={() => navigate(active.to)}
              className="press-micro mt-1 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-[box-shadow,filter] hover:shadow-md hover:shadow-primary/25 hover:brightness-110"
            >
              <active.icon className="size-4" />
              {active.cta}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
