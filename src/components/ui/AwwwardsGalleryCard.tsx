import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AWWWARDS GALLERY CARD — editorial floating showcase card.
 *
 * Built on the same ref-driven 3D engine as Interactive3DCard (pointer moves
 * CSS variables, never setState → no per-frame React re-renders), with an
 * editorial footer: Fraunces display title, IBM Plex body, font-data eyebrow.
 *
 * Header visual uses KYNEX spectral tokens (--spectrum-hue / --spectrum-chroma)
 * instead of hardcoded indigo/purple gradients, so each card can carry its
 * module's accent while staying inside the design system in BOTH modes.
 * Reduced-motion and touch devices get a flat, lift-on-hover card (see the
 * tilt3d/glare3d media guards in index.css).
 */

export function AwwwardsGalleryCard({
  title,
  category,
  description,
  /** Hue (0–360) and chroma (0–0.37) of the card's spectral header wash. */
  hue = 255,
  chroma = 0.16,
  visual,
  onClick,
  className,
}: {
  title: string;
  category: string;
  description: string;
  hue?: number;
  chroma?: number;
  /** Optional slot for a small live visual (icon, sparkline) inside the header. */
  visual?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xc = (rect.width || 1) / 2;
    const yc = (rect.height || 1) / 2;
    // ±8° tilt from pointer position, written as CSS vars (no re-render).
    const rx = ((e.clientY - rect.top - yc) / yc) * -8;
    const ry = ((e.clientX - rect.left - xc) / xc) * 8;
    el.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
    el.style.setProperty("--glare-x", `${(((e.clientX - rect.left) / (rect.width || 1)) * 100).toFixed(1)}%`);
    el.style.setProperty("--glare-y", `${(((e.clientY - rect.top) / (rect.height || 1)) * 100).toFixed(1)}%`);
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }, []);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) {
        el.style.removeProperty("--tilt-x");
        el.style.removeProperty("--tilt-y");
      }
    };
  }, []);

  const headerWash =
    `linear-gradient(135deg,` +
    ` oklch(0.42 calc(var(--card-chroma) * 1.1) var(--card-hue) / 0.55),` +
    ` oklch(0.3 calc(var(--card-chroma) * 0.8) calc(var(--card-hue) + 30) / 0.5),` +
    ` oklch(0.24 0.03 calc(var(--card-hue) + 60) / 0.9))`;

  return (
    <div
      ref={ref}
      onPointerMove={handleMouseMove}
      onPointerLeave={handleMouseLeave}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? "link" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${category}: ${title}` : undefined}
      className={cn(
        "tilt3d glare3d group cursor-pointer rounded-3xl border border-border/80 bg-card/95 p-5 transition-shadow hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      style={{ ["--card-hue" as string]: hue, ["--card-chroma" as string]: chroma }}
    >
      {/* Ambient spectral visual header */}
      <div
        aria-hidden="true"
        className="relative flex h-44 w-full flex-col justify-between overflow-hidden rounded-2xl p-4"
        style={{ backgroundImage: headerWash }}
      >
        {/* grounding grid lines */}
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />

        <div className="relative z-10 flex items-start justify-between">
          <span className="rounded-full bg-white/15 px-3 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
            {category}
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <ArrowUpRight className="size-4" />
          </span>
        </div>

        {visual && (
          <div className="relative z-10 flex items-end justify-end text-white/90">{visual}</div>
        )}
      </div>

      {/* Editorial content footer */}
      <div className="mt-5 space-y-1.5">
        <h4 className="font-display text-xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
          {title}
        </h4>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
