import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KYNEX Progressive Hydration (§3) — layout-locked skeletons + deferred
 * heavy mounts.
 *
 * LockedSkeleton renders with EXPLICIT bounding-box dimensions, so the
 * loading state occupies exactly the space the hydrated content will. This
 * eliminates Cumulative Layout Shift when data arrives — the skeleton and
 * the content swap in place instead of pushing the page around.
 *
 * DeferredMount holds non-critical interactive children (diagnostic graphs,
 * chart panels, chat transcripts) until the browser is idle AND the surface
 * is near the viewport, keeping the main thread free for navigation and
 * first paint. While deferred, it renders a layout-locked LockedSkeleton —
 * never an unstyled zero-height hole.
 */

export function LockedSkeleton({
  className,
  height,
  aspect,
  label = "Loading content",
}: {
  className?: string;
  /** Explicit fixed height (any Tailwind height class or px value). */
  height?: string;
  /** Explicit aspect ratio, e.g. "16 / 9" — wins over height when both set. */
  aspect?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("animate-pulse rounded-2xl bg-muted/60", className)}
      style={{
        aspectRatio: aspect,
        height: aspect ? undefined : height,
        minHeight: height ?? undefined,
      }}
    />
  );
}

interface DeferredMountProps {
  children: ReactNode;
  /** Skeleton shown while deferred — MUST carry locked dimensions. */
  fallback: ReactNode;
  /**
   * Skip deferral entirely (e.g. above-the-fold panels). Default false.
   */
  immediate?: boolean;
  /** Class applied to the sizing host so the deferred block participates in
   *  the parent layout grid exactly where the real panel will sit. */
  className?: string;
}

function scheduleIdle(cb: () => void): () => void {
  // requestIdleCallback is unavailable in some webviews + jsdom; setTimeout
  // keeps the deferral honest without blocking interaction forever.
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(() => cb(), { timeout: 750 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 120);
  return () => clearTimeout(id);
}

export function DeferredMount({
  children,
  fallback,
  immediate = false,
  className,
}: DeferredMountProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(immediate);
  const [visible, setVisible] = useState(immediate);

  // Idle deferral: wait for a main-thread gap before mounting heavy children.
  useEffect(() => {
    if (immediate || ready) return;
    return scheduleIdle(() => setReady(true));
  }, [immediate, ready]);

  // Intersection deferral: don't mount offscreen panels at all.
  useEffect(() => {
    if (immediate || visible) return;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [immediate, visible]);

  const mounted = ready && visible;
  return (
    <div ref={hostRef} aria-busy={!mounted} className={className}>
      {mounted ? children : fallback}
    </div>
  );
}
