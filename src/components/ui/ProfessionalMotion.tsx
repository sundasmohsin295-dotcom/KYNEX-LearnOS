import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PROFESSIONAL MOTION — the four KYNEX animation formulas as one wrapper.
 *
 * All formulas animate compositor-only properties (transform / opacity) on an
 * isolated element, so nothing reflows: zero layout shift by construction.
 * Durations sit inside the 150–300ms window (press: 100ms, entries: 250ms,
 * sheets: 300ms). Under prefers-reduced-motion the CSS layer collapses every
 * formula to a 120ms opacity fade — this component needs no JS branching.
 *
 * Formulas (see index.css "PROFESSIONAL ANIMATION FORMULAS"):
 *  - entry  · header/page titles slide down from -10px over 250ms
 *  - card   · metric cards fade up from +15px, staggered 50ms per index
 *  - modal  · bottom sheets spring from 100% over 300ms
 *  - button · press scale 0.96 (100ms down / 200ms ease-out return)
 */
export function ProfessionalMotion({
  children,
  type = "entry",
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  type?: "entry" | "card" | "modal" | "button";
  /** Extra delay in ms on top of the card stagger index. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const base: CSSProperties =
    type === "card"
      ? { ["--stagger-i" as string]: delay }
      : delay > 0
        ? { animationDelay: `${delay}ms` }
        : {};

  const animationClass =
    type === "entry"
      ? "animate-header-entry"
      : type === "card"
        ? "animate-card-stagger"
        : type === "modal"
          ? "animate-sheet-spring"
          : "press-micro";

  return (
    <div style={{ ...base, ...style }} className={cn("will-change-transform", animationClass, className)}>
      {children}
    </div>
  );
}
