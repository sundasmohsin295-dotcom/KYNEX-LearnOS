import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { KynexMark } from "@/components/AppShell";
import {
  recentCrashes,
  subscribeToCrashes,
  type CrashLogEntry,
} from "@/lib/globalErrorHandler";

/**
 * KYNEX SystemRecoveryScreen (§2) — the graceful fallback when a fatal error
 * escapes every boundary. Dark, calm, KYNEX-branded. Shows a human-readable
 * message plus a correlation ID (never a raw stack — stacks stay in console
 * for engineering). "Reboot System" performs a full reload; because the
 * Convex auth session lives in an httpOnly cookie, the user returns to their
 * authenticated workspace without re-entering credentials.
 */
export function SystemRecoveryScreen({
  message,
  correlationId,
  onReboot,
}: {
  message: string;
  correlationId: string;
  onReboot: () => void;
}) {
  const [crashes, setCrashes] = useState<readonly CrashLogEntry[]>(recentCrashes());

  useEffect(
    () =>
      subscribeToCrashes(() => {
        setCrashes(recentCrashes());
      }),
    [],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(56,189,248,0.10), transparent 70%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-lg rounded-2xl border border-border/70 bg-card p-8 text-center shadow-2xl"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-border/70 bg-muted/40">
          <KynexMark className="size-8 text-primary" />
        </div>
        <h1 className="mt-5 font-display text-xl font-extrabold tracking-tight">
          System Recovery
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          KYNEX hit an unexpected fault and stopped safely. Your data is intact
          and your session is preserved.
        </p>

        <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-4 text-left">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="size-3.5" /> What happened
          </p>
          <p className="mt-1.5 break-words text-sm">{message}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="size-3.5" />
            Reference <span className="font-mono font-bold text-foreground">{correlationId}</span>
            {crashes.length > 1 && (
              <span className="text-muted-foreground/70">
                · {crashes.length - 1} earlier event{crashes.length > 2 ? "s" : ""} this session
              </span>
            )}
          </p>
        </div>

        <button
          onClick={onReboot}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.99]"
        >
          <RefreshCw className="size-4" /> Reboot System
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Rebooting restarts KYNEX. If the fault repeats, quote the reference
          above to support.
        </p>
      </motion.div>
    </div>
  );
}
