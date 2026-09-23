import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { KynexSunCore } from "./KynexBrand";

/**
 * KYNEX auth shell — split layout: brand story left, auth card right.
 * On mobile the emblem centers above the card. Intelligent background:
 * faint orbital geometry + radial light, nothing competing with the form.
 */
export function KynexAuthShell({
  quote = "Turn studying into intelligence.",
  children,
}: {
  quote?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="relative min-h-screen bg-background">
      {/* intelligent background: radial light + faint orbital rings */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 22% 40%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%), radial-gradient(40% 35% at 85% 80%, color-mix(in oklab, var(--chart-4, #8b5cf6) 7%, transparent), transparent 70%)",
        }}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-[-18%] top-1/2 hidden size-[70vmin] -translate-y-1/2 opacity-[0.16] lg:block"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="96" stroke="var(--border)" strokeWidth="0.6" />
        <circle cx="100" cy="100" r="72" stroke="var(--border)" strokeWidth="0.6" strokeDasharray="4 6" />
        <circle cx="100" cy="100" r="48" stroke="var(--border)" strokeWidth="0.6" />
        <circle cx="100" cy="4" r="2.4" fill="var(--primary)" />
        <circle cx="172" cy="100" r="2" fill="color-mix(in oklab, var(--chart-4, #8b5cf6) 80%, white)" />
        <circle cx="52" cy="148" r="1.6" fill="var(--primary)" />
      </svg>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center gap-16 px-4 py-10 lg:justify-between">
        {/* brand story — desktop only */}
        <div className="hidden max-w-sm flex-col items-start gap-8 lg:flex">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <KynexSunCore className="size-44" animate />
          </motion.div>
          <div>
            <p className="font-display text-4xl font-extrabold tracking-[0.18em]">KYNEX</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.26em] text-primary">
              Academic Intelligence OS
            </p>
            <p className="mt-6 max-w-xs text-lg font-medium leading-snug text-foreground/90">
              “{quote}”
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              KYNEX builds a living model of how you learn, then turns it into
              the one next move that actually improves your grades.
            </p>
          </div>
        </div>

        {/* auth card */}
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          {/* mobile emblem */}
          <div className="flex flex-col items-center gap-2 lg:hidden">
            <KynexSunCore className="size-16" />
            <p className="font-display text-lg font-extrabold tracking-[0.2em]">KYNEX</p>
          </div>
          {children}
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            By continuing you agree to our{" "}
            <a href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
