import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * KYNEX brand system.
 *
 * The emblem is an original "solar neural core": a dimensional glowing core
 * wrapped in segmented orbital rays and a neural node ring. It reads at 24px,
 * works on light/dark, and degrades to flat monochrome.
 *
 * All colors reference theme CSS variables so the mark adapts to the design
 * system instead of hardcoding hex values in components.
 */

// ---------------------------------------------------------------------------
// KynexMark — the core emblem (drop-in replacement for the old geometric K)
// ---------------------------------------------------------------------------

export function KynexMark({
  className,
  animate = false,
}: {
  className?: string;
  /** Gentle idle animation for hero moments (skipped under reduced motion). */
  animate?: boolean;
}) {
  const uid = useId().replace(/[:]/g, "");
  const reduce = useReducedMotion();
  const spin = animate && !reduce;

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#0a1428] via-[#0d1f3c] to-[#101a3a] shadow-[0_0_0_1px_var(--border),0_8px_24px_-8px_var(--primary)/40] ${className ?? ""}`}
      aria-hidden="true"
    >
      <KynexSunCore className="size-[74%]" animate={animate} />
      {spin && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 42%, transparent 55%, color-mix(in oklab, var(--primary) 18%, transparent) 100%)",
          }}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KynexSunCore — pure SVG emblem (also used inside splash/auth hero)
// ---------------------------------------------------------------------------

export function KynexSunCore({
  className,
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  const uid = useId().replace(/[:]/g, "");
  const reduce = useReducedMotion();
  const spin = animate && !reduce;
  const coreGrad = `core-${uid}`;
  const rayGrad = `ray-${uid}`;

  // 8 segmented orbital rays — arc segments, not triangular rays.
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="KYNEX emblem"
    >
      <defs>
        <radialGradient id={coreGrad} cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="34%" stopColor="color-mix(in oklab, var(--primary) 70%, white)" />
          <stop offset="72%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 55%, #1b2a5e)" />
        </radialGradient>
        <linearGradient id={rayGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 85%, white)" />
          <stop offset="100%" stopColor="color-mix(in oklab, var(--chart-4, #8b5cf6) 60%, var(--primary))" />
        </linearGradient>
      </defs>

      {/* segmented orbital rays */}
      <g
        stroke={`url(#${rayGrad})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.9"
      >
        {spin ? (
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
            style={{ originX: "32px", originY: "32px" }}
          >
            {rays.map((deg) => (
              <path
                key={deg}
                d="M32 5.5 A26.5 26.5 0 0 1 50.78 13.22"
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </motion.g>
        ) : (
          rays.map((deg) => (
            <path
              key={deg}
              d="M32 5.5 A26.5 26.5 0 0 1 50.78 13.22"
              transform={`rotate(${deg} 32 32)`}
            />
          ))
        )}
      </g>

      {/* neural node ring */}
      <circle
        cx="32"
        cy="32"
        r="19.5"
        stroke="color-mix(in oklab, var(--primary) 45%, transparent)"
        strokeWidth="1.4"
        strokeDasharray="3 4.2"
      />
      {[0, 120, 240].map((deg) => (
        <circle
          key={deg}
          cx="32"
          cy="12.5"
          r="1.7"
          fill="color-mix(in oklab, var(--primary) 80%, white)"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}

      {/* dimensional core */}
      <circle cx="32" cy="32" r="11" fill={`url(#${coreGrad})`} />
      <circle
        cx="29.4"
        cy="29"
        r="3.2"
        fill="#ffffff"
        opacity={reduce ? 0.85 : 0.9}
      />
      {animate && !reduce && (
        <motion.circle
          cx="32"
          cy="32"
          r="11"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.2"
          animate={{ r: [11, 15.5], opacity: [0.5, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KynexLogo — mark + wordmark lockup
// ---------------------------------------------------------------------------

export function KynexLogo({
  size = "md",
  tagline = false,
  onClick,
}: {
  size?: "sm" | "md" | "lg";
  tagline?: boolean;
  onClick?: () => void;
}) {
  const dims = { sm: "size-7 text-base", md: "size-9 text-lg", lg: "size-14 text-3xl" }[size];
  const sub = size === "lg" ? "text-[11px]" : "text-[9px]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 ${onClick ? "cursor-pointer" : "cursor-default"}`}
      aria-label={onClick ? "KYNEX home" : "KYNEX"}
    >
      <KynexMark className={dims} animate={size === "lg"} />
      <span className="flex flex-col items-start leading-none">
        <span className={`font-display font-extrabold tracking-[0.14em] ${dims.split(" ")[1]}`}>
          KYNEX
        </span>
        {tagline && (
          <span className={`mt-1 font-semibold uppercase tracking-[0.22em] text-muted-foreground ${sub}`}>
            Academic Intelligence OS
          </span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// KynexSplash — cinematic Sun Productions launch sequence
// ---------------------------------------------------------------------------

const SPLASH_KEY = "kynex.splash.seen.v1";

export function hasSeenSplash(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First launch: light point → sun core forms → SUN PRODUCTIONS → KYNEX.
 * Return visits: quick KYNEX frame. Reduced motion: static 0.6s frame.
 * Total first-run target ≈ 2.8s; click/Escape skips.
 */
export function KynexSplash({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const seen = hasSeenSplash();
  const phaseTimings = reduce
    ? { done: 700 }
    : seen
      ? { kynex: 250, done: 1250 }
      : { core: 900, sun: 1500, sunprod: 1900, kynex: 2350, done: 2900 };

  const timeouts = Object.entries(phaseTimings).map(([k, ms]) => ({ k, ms }));

  return (
    <SplashRunner timings={timeouts} onDone={onDone}>
      {(phase) => (
        <motion.div
          className="fixed inset-0 z-[200] grid place-items-center bg-[#05070d]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeInOut" } }}
          onClick={onDone}
          role="status"
          aria-label="KYNEX is starting"
        >
          {/* ambient radial light */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(46% 40% at 50% 44%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)",
            }}
          />
          <div className="relative flex flex-col items-center gap-6 px-6 text-center">
            <SplashEmblem phase={phase} reduce={!!reduce} />
            <AnimatePresence mode="wait">
              {phase === "sunprod" && (
                <motion.div
                  key="sunprod"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="absolute top-full mt-8"
                >
                  <p className="font-display text-sm font-bold uppercase tracking-[0.5em] text-foreground/90">
                    Sun Productions
                  </p>
                  <p className="mt-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                    Creating the future of intelligent learning
                  </p>
                </motion.div>
              )}
              {(phase === "kynex" || phase === "done" || (seen && phase === "core")) && (
                <motion.div
                  key="kynex"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  className="absolute top-full mt-8"
                >
                  <p className="font-display text-3xl font-extrabold tracking-[0.3em] text-foreground">
                    KYNEX
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
                    Academic Intelligence OS
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </SplashRunner>
  );
}

function SplashRunner({
  timings,
  onDone,
  children,
}: {
  timings: { k: string; ms: number }[];
  onDone: () => void;
  children: (phase: string) => ReactNode;
}) {
  // Phase machine driven by timeouts; skipped by click/Esc.
  const [phase, setPhase] = useState(timings[0]?.k ?? "done");
  useSplashTimeline(timings, setPhase, onDone);
  return <>{children(phase)}</>;
}

function useSplashTimeline(
  timings: { k: string; ms: number }[],
  setPhase: (k: string) => void,
  onDone: () => void,
) {
  useEffect(() => {
    const ids = timings.map(({ k, ms }) =>
      window.setTimeout(() => {
        if (k === "done") onDone();
        else setPhase(k);
      }, ms),
    );
    const skip = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", skip);
    return () => {
      ids.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function SplashEmblem({ phase, reduce }: { phase: string; reduce: boolean }) {
  const draw = !reduce;
  const coreVisible = true;
  const sunFormed = phase !== "core";
  return (
    <motion.div
      className="relative size-40 sm:size-52"
      initial={draw ? { scale: 0.2, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* birth point of light */}
      {phase === "core" && (
        <motion.div
          className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.6, 1.1, 0.8] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          <span className="size-2 rounded-full bg-white shadow-[0_0_24px_8px_color-mix(in_oklab,var(--primary)_70%,transparent)]" />
        </motion.div>
      )}
      <motion.div
        className="absolute inset-0"
        initial={draw ? { opacity: 0, scale: 0.55, rotate: -14 } : false}
        animate={
          sunFormed
            ? { opacity: 1, scale: 1, rotate: 0 }
            : { opacity: 0, scale: 0.55 }
        }
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <KynexSunCore className="size-full" animate={sunFormed && !reduce} />
      </motion.div>
      {coreVisible && sunFormed && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(38% 38% at 50% 50%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 72%)",
          }}
          initial={draw ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// KynexLoading — branded loading state (truthful context line)
// ---------------------------------------------------------------------------

export function KynexLoading({ line = "Preparing your Academic Twin…" }: { line?: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      className="grid min-h-[60vh] w-full place-items-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <KynexMark className="size-14" animate />
        <p className="text-xs font-medium tracking-wide text-muted-foreground">{line}</p>
        {!reduce && (
          <div className="h-0.5 w-36 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full w-1/3 rounded-full bg-primary"
              animate={{ x: [-48, 144] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KynexEmptyState — teaches the next action, never blank
// ---------------------------------------------------------------------------

export function KynexEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-8 text-center">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-60"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent)",
        }}
      />
      <div className="relative flex flex-col items-center gap-3">
        <KynexMark className="size-12" />
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
