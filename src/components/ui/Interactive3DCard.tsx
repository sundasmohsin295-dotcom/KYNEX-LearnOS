import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * INTERACTIVE 3D CARD — pointer-tracked perspective tilt + specular glare.
 *
 * Implementation notes (why this stays buttery where the naive version lags):
 *  - mousemove writes CSS custom properties (--tilt-x/--tilt-y/--glare-x/
 *    --glare-y) directly on the element via the ref and NEVER calls setState.
 *    React re-renders are the main cause of janky tilt components; a style
 *    property write is handled by the compositor between frames.
 *  - The transform lives in the stylesheet, so React's render tree is
 *    completely static: the component renders once, the pointer just moves
 *    numbers.
 *  - `transition` is defined only on the base class — 300ms deceleration on
 *    enter/leave, and the :hover state overrides to a 50ms tracking window
 *    while the pointer is inside (the exact feel from the spec).
 *  - Touch devices and prefers-reduced-motion get a static, flat card: the
 *    @media guards in index.css disable the tracking entirely, so a finger
 *    drag never fights the page scroll.
 *
 * Tokens only: surfaces, borders and glare tint come from the theme system,
 * so the card is identical-in-spirit in paper-white light and obsidian dark.
 */
export function Interactive3DCard({
  children,
  className,
  depth = 20,
  glareStrength = 0.18,
}: {
  children: ReactNode;
  className?: string;
  /** Max degrees of tilt on each axis. */
  depth?: number;
  /** Peak white glare opacity (0–1) at the pointer position. */
  glareStrength?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      // Pointer relative to card center: -0.5 … 0.5
      const mx = (e.clientX - rect.left) / width - 0.5;
      const my = (e.clientY - rect.top) / height - 0.5;
      el.style.setProperty("--tilt-x", `${(-my * depth).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(mx * depth).toFixed(2)}deg`);
      el.style.setProperty("--glare-x", `${(((e.clientX - rect.left) / width) * 100).toFixed(1)}%`);
      el.style.setProperty("--glare-y", `${(((e.clientY - rect.top) / height) * 100).toFixed(1)}%`);
    },
    [depth],
  );

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Spring back to rest on the 300ms deceleration curve.
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }, []);

  // Reset any inline transform if the card unmounts mid-hover.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) {
        el.style.removeProperty("--tilt-x");
        el.style.removeProperty("--tilt-y");
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={handleMouseMove}
      onPointerLeave={handleMouseLeave}
      className={cn("tilt3d glare3d relative rounded-3xl", className)}
      style={{ ["--tilt-depth" as string]: `${depth}deg`, ["--glare-strength" as string]: glareStrength }}
    >
      {children}
    </div>
  );
}
