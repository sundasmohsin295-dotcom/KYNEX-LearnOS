import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * KYNEX dynamic color spectrum engine.
 *
 * Each academic module broadcasts its spectrum position (hue, chroma) onto
 * documentElement CSS variables. Because the entire design system — primary,
 * ring, chart-1, aurora field, glow borders, glass tints — resolves through
 * those variables, the whole OS recolors fluidly per module: a continuous
 * (hue, chroma) plane of states rather than a fixed palette. Transitions are
 * buttery because every consumer interpolates the same two numbers.
 */

export type Spectrum =
  | { h: number; c: number; label?: string }
  | null;

/** Per-module spectrum positions across the chromatic plane. */
export const MODULE_SPECTRA: Record<string, Exclude<Spectrum, null>> = {
  // Deep Quantum Indigo — Socratic Professor / grounded dialogue
  "/chat": { h: 290, c: 0.19, label: "Quantum Indigo" },
  // Bioluminescent Emerald — Leitner-X spaced repetition
  "/flashcards": { h: 165, c: 0.15, label: "Bioluminescent Emerald" },
  // Solar Gold — Exam Radar / assessment
  "/examiner": { h: 85, c: 0.13, label: "Solar Gold" },
  // Neon Cyber-Amethyst — KYNEX Twin / academic identity
  "/twin": { h: 315, c: 0.17, label: "Cyber-Amethyst" },
  // Ultramarine — mastery practice
  "/practice": { h: 255, c: 0.2 },
  // Magenta — mistake bank (melting down errors)
  "/mistakes": { h: 340, c: 0.16 },
  // Teal — knowledge graph
  "/graph": { h: 195, c: 0.14 },
  // Amber — planner
  "/planner": { h: 70, c: 0.13 },
  // Azure — vault / library
  "/library": { h: 230, c: 0.16 },
  // Crimson — GPA lab (thresholds, risk)
  "/gpa": { h: 25, c: 0.14 },
  // Violet — insights
  "/insights": { h: 300, c: 0.16 },
  // Mint — material intake
  "/add": { h: 150, c: 0.14 },
  // Deep amber — Citation Writer (evidence, craft)
  "/writer": { h: 60, c: 0.13 },
  // Rose — Visualize (diagrams, spatial structure)
  "/visualize": { h: 15, c: 0.13 },
};

const BASE: Exclude<Spectrum, null> = { h: 255, c: 0.2 };

/** External store so multiple consumers share one document write. */
let current: Exclude<Spectrum, null> = BASE;
let listeners = new Set<() => void>();

function setSpectrum(next: Exclude<Spectrum, null>) {
  if (next.h === current.h && next.c === current.c) return;
  current = next;
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(next.h));
  root.style.setProperty("--accent-c", String(next.c));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return current;
}

/** Only one mounted hook should own the document write per route. */
let ownerCount = 0;

/**
 * Broadcast this route's spectrum position. `null` restores the KYNEX base
 * (electric ultramarine). Safe to mount/unmount across navigations — the last
 * unmount always resets to base.
 */
export function useAccentSpectrum(routeKey: string | null) {
  const spectrum = routeKey ? MODULE_SPECTRA[routeKey] ?? BASE : BASE;

  const set = useCallback((s: Exclude<Spectrum, null>) => setSpectrum(s), []);
  const value = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ownerCount += 1;
    set(spectrum);
    return () => {
      ownerCount -= 1;
      if (ownerCount <= 0) {
        ownerCount = 0;
        set(BASE);
      }
    };
  }, [spectrum.h, spectrum.c, set]);
  // spectrum.label intentionally omitted from deps — display-only

  return value;
}

/**
 * Ambient aurora field: fixed, pointer-transparent, riding the active
 * spectrum. Mount once per shell. Pure decoration — hidden from a11y tree.
 */
export function AuroraField({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("aurora-field", className)} />
  );
}

/**
 * Gleam: cursor-tracked light sweep for primary action zones. Adds pointer
 * listeners that write --gleam-x/--gleam-y; the ::before gradient does the
 * rest. Degrades to nothing on touch and under hover-none media.
 */
export function gleamProps() {
  return {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gleam-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--gleam-y", `${e.clientY - r.top}px`);
    },
  };
}

/**
 * Collapse a pathname to its module spectrum key. Detail routes inherit their
 * parent module (e.g. /material/:id → Vault azure, /chat/:id → Indigo).
 */
export function routeSpectrumKey(pathname: string): string | null {
  const seg = "/" + (pathname.split("/")[1] ?? "");
  if (seg === "/" || seg === "") return null;
  if (seg === "/material") return "/library";
  if (seg === "/quiz") return "/practice";
  if (seg === "/writer" || seg === "/visualize" || seg === "/vault") return seg;
  return seg;
}

/**
 * Composite containment recipe: glass surface + 1px spectrum stroke +
 * cursor gleam. The KYNEX panel primitive for feature surfaces.
 */
export const glassSurface = "kynex-glass spectrum-border";

export function GlowPanel({
  className,
  children,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(glassSurface, "rounded-3xl", interactive && "gleam lift-spectrum", className)}
      {...(interactive ? gleamProps() : {})}
      {...rest}
    >
      {children}
    </div>
  );
}
