import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KynexMark } from "@/components/AppShell";
import { LockedSkeleton } from "@/components/LoadLock";

/**
 * KYNEX DegradedRoute (§1) — the isolated container a route-level circuit
 * breaker renders when the same lazy module crashes twice within the window.
 * The app shell stays alive; only the broken view is bypassed. "Reload
 * Module" re-arms the breaker and remounts the subtree.
 */
export function DegradedRoute({
  routeKey,
  onReload,
}: {
  routeKey: string;
  onReload: () => void;
}) {
  return (
    <div className="rounded-3xl border border-warning/40 bg-warning/5 p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-border/70 bg-card">
          <KynexMark className="size-7 text-primary" />
        </div>
        <h2 className="mt-4 flex items-center justify-center gap-2 font-display text-lg font-bold">
          <ShieldAlert className="size-4 text-warning" /> This module is resting
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The <span className="font-mono font-semibold text-foreground">{routeKey}</span> module
          failed to load twice in a row, so KYNEX stopped retrying it to protect your session.
          Everything else keeps working.
        </p>
        <Button onClick={onReload} className="mt-5 gap-2 rounded-xl">
          <RefreshCw className="size-4" /> Reload module
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Your progress in other areas is unaffected. Reloading re-attempts the module once.
        </p>
      </div>
      {/* Layout-locked placeholder keeps the shell's height stable while the
          breaker is open — no jarring collapse of the route area. */}
      <LockedSkeleton className="mt-6" height="96px" label="Module paused" />
    </div>
  );
}
