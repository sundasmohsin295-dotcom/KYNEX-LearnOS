import { motion } from "framer-motion";
import type { MasteryRow } from "@/lib/learning";
import { masteryPct, masteryState, conceptColor } from "@/lib/learning";
import { cn } from "@/lib/utils";

/** Compact radial progress ring. */
export function Ring({
  pct, size = 64, stroke = 7, label, sub, colorClass = "text-primary",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  colorClass?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round" className={colorClass}
          stroke="currentColor"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: off }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="transparent" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-sm font-extrabold leading-none">{pct}%</p>
        {label && <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>}
        {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** A row of mastery rings for concepts. */
export function MasteryRings({ rows, className }: { rows: MasteryRow[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-4 py-2", className)}>
      {rows.map((m, i) => {
        const state = masteryState(m);
        const colorClass =
          state === "mastered" ? "text-success" : state === "weak" ? "text-chart-5" : "text-primary";
        return (
          <motion.div
            key={m._id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="flex flex-col items-center gap-1.5"
          >
            <Ring pct={masteryPct(m)} colorClass={colorClass} />
            <p className="max-w-full truncate text-center text-[11px] font-semibold" title={m.conceptLabel}>
              {m.conceptLabel}
            </p>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                state === "mastered" && "bg-success/15 text-success",
                state === "weak" && "bg-chart-5/15 text-chart-5",
                state === "learning" && "bg-primary/10 text-primary",
              )}
            >
              {state}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Last-14-days streak dots. */
export function StreakDots({ streak, todayDone }: { streak: number; todayDone: boolean }) {
  return (
    <div className="flex items-end gap-1.5">
      {Array.from({ length: 14 }).map((_, i) => {
        const active = i >= 14 - streak;
        const isToday = i === 13;
        return (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.03 }}
            title={active ? "study day" : "no activity"}
            className={cn(
              "size-3.5 rounded-full",
              active ? "bg-destructive" : "bg-muted",
              isToday && !todayDone && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
              isToday && todayDone && "ring-2 ring-success/50 ring-offset-2 ring-offset-background",
            )}
          />
        );
      })}
    </div>
  );
}

/** Knowledge node used in concept maps / material page. */
export function KnowledgeNode({
  name, state, onClick, dim = false,
}: {
  name: string;
  state: "mastered" | "learning" | "weak" | "new";
  onClick?: () => void;
  dim?: boolean;
}) {
  const { from, to } = conceptColor(name);
  const ring =
    state === "mastered" ? "ring-2 ring-success/60" :
    state === "weak" ? "ring-2 ring-chart-5/60" :
    state === "learning" ? "ring-1 ring-primary/50" : "";
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative rounded-2xl px-4 py-2.5 text-left text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg",
        ring,
        dim && "opacity-50",
      )}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {name}
      {state === "mastered" && (
        <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-success text-[10px] text-white shadow">✓</span>
      )}
      {state === "weak" && (
        <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-chart-5 text-[10px] text-white shadow">!</span>
      )}
    </button>
  );
}

export const PIPELINE_STAGES = [
  { key: "receiving", label: "Receiving" },
  { key: "reading", label: "Reading" },
  { key: "understanding", label: "Understanding" },
  { key: "structuring", label: "Structuring" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
] as const;

/** Animated processing pipeline shown while a material is analyzed. */
export function ProcessingPipeline({ stage }: { stage: string }) {
  const idx = Math.max(0, PIPELINE_STAGES.findIndex((s) => s.key === stage));
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {PIPELINE_STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold transition-all",
              i < idx && "bg-success/15 text-success",
              i === idx && "bg-primary text-primary-foreground shadow-md",
              i > idx && "bg-muted text-muted-foreground",
              i === idx && "animate-pulse",
            )}
          >
            {i < idx ? "✓ " : ""}{s.label}
          </span>
          {i < PIPELINE_STAGES.length - 1 && <span className={cn("text-xs", i < idx ? "text-success" : "text-border")}>→</span>}
        </div>
      ))}
    </div>
  );
}
