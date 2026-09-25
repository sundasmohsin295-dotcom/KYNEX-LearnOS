import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { Activity, RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Professor AI service status — the frontend surface for the server-side
 * health check (`api.aiStatus.aiStatus`). Shows ONLY safe status information
 * (state taxonomy, model name, check time, email delivery path). It never
 * displays or requests any secret value.
 *
 * The probe is a real generation round-trip against the configured provider,
 * rate-limited server-side (4/hour/user), so this component:
 *  - reuses a 60-second in-process result cache across remounts,
 *  - dedupes concurrent probes, and
 *  - always offers an explicit manual re-check.
 * When the check itself fails (rate limit, signed-out), the raw safe error is
 * shown — never a fake "operational" state.
 */

type AiStatusResult = {
  status: string;
  message: string;
  model: string;
  checkedAt: number;
  emailPath: string;
};

const EMAIL_PATH_LABEL: Record<string, string> = {
  "otp-api": "Dedicated OTP key (FREEBUFF_OTP_API_KEY)",
  gateway: "Platform integration key",
  none: "Not configured: verification emails cannot send yet",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  READY: { label: "Operational", cls: "bg-success/15 text-success" },
  AUTHENTICATION_FAILED: { label: "Credential rejected", cls: "bg-destructive/15 text-destructive" },
  CONFIGURATION_REQUIRED: { label: "Configuration required", cls: "bg-warning/15 text-warning" },
  RATE_LIMITED: { label: "Rate limited", cls: "bg-warning/15 text-warning" },
  QUOTA_EXHAUSTED: { label: "Quota exhausted", cls: "bg-destructive/15 text-destructive" },
  PROVIDER_UNAVAILABLE: { label: "Provider unreachable", cls: "bg-warning/15 text-warning" },
  INVALID_REQUEST: { label: "Invalid probe result", cls: "bg-warning/15 text-warning" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, cls: "bg-warning/15 text-warning" };
}

// ---- module-level probe cache (dedupes remounts + concurrent mounts) ----
let cached: AiStatusResult | null = null;
let cachedAt = 0;
let inflight: Promise<AiStatusResult> | null = null;
const CACHE_MS = 60_000;

export function ProfessorHealthCard({ className }: { className?: string }) {
  const checkAi = useAction(api.aiStatus.aiStatus);
  const [result, setResult] = useState<AiStatusResult | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = async (force: boolean) => {
    if (busy) return;
    // Fresh cache + not forced → reuse without burning a probe.
    if (!force && cached && Date.now() - cachedAt < CACHE_MS) {
      setResult(cached);
      setError(null);
      return;
    }
    if (inflight) {
      // Another mount is already probing — share its result.
      setBusy(true);
      try {
        const shared = await inflight;
        if (mounted.current) {
          setResult(shared);
          setError(null);
        }
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : "The status check couldn't run.");
      } finally {
        if (mounted.current) setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError(null);
    inflight = checkAi({})
      .then((r) => {
        cached = r;
        cachedAt = Date.now();
        return r;
      })
      .finally(() => {
        inflight = null;
      });
    try {
      const r = await inflight;
      if (mounted.current) setResult(r);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "The status check couldn't run.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // First mount: probe once (or serve the fresh cache). Deferred via a
  // cancelled timeout so no setState runs synchronously inside the effect
  // (avoids cascading renders; unmounts can cancel the pending probe). The
  // run() callback itself is intentionally excluded from deps.
  useEffect(() => {
    const t = setTimeout(() => void run(false), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = result ? statusMeta(result.status) : null;

  return (
    <div className={cn("kynex-glass spectrum-border rounded-3xl p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Activity className="size-5 text-chart-4" /> Professor AI service status
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-xl text-xs"
          disabled={busy}
          onClick={() => void run(true)}
        >
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
          {busy ? "Checking…" : "Re-run check"}
        </Button>
      </div>

      {!result && !error && (
        <p className="mt-4 animate-pulse text-sm text-muted-foreground">Checking the AI service…</p>
      )}

      {error && (
        <div className="mt-4 rounded-xl bg-warning/10 px-4 py-3">
          <p className="text-sm font-semibold text-warning">Status check couldn't run</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide", meta!.cls)}>
              {meta!.label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              model {result.model} · checked {new Date(result.checkedAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{result.message}</p>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="text-xs font-semibold">Verification email delivery</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {EMAIL_PATH_LABEL[result.emailPath] ?? result.emailPath}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
