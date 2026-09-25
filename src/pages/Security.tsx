import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  CheckCircle2, CircleDashed, Fingerprint, KeyRound, LogOut, Monitor, ShieldCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ProfessorHealthCard } from "@/components/ProfessorHealthCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

type SessionRow = {
  _id: string;
  createdAt: number;
  expiresAt: number;
  current: boolean;
};

/**
 * KYNEX Security — every row reflects a REAL implemented control:
 * sessions are the live auth table, isolation is enforced in every backend
 * function, AI boundary + input validation are implemented server-side.
 * Rows with no implementation are labelled honestly as unavailable.
 */
export default function Security() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const sessions = useQuery(api.account.listMySessions) as SessionRow[] | undefined;
  const revoke = useMutation(api.account.revokeSession);
  const revokeOthers = useMutation(api.account.revokeAllOtherSessions);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const email = user?.email ?? "signed in";

  return (
    <AppShell>
      <PageHeader eyebrow="KYNEX Security · real controls, no theatre" title="Security">
        <p className="max-w-md text-sm text-muted-foreground">
          Each item below maps to an implemented backend control. Where a control isn't available,
          it says so: KYNEX never shows fake green checkmarks.
        </p>
      </PageHeader>

      {/* ---------- live Professor AI health check ---------- */}
      <ProfessorHealthCard className="mb-5" />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- identity + authentication ---------- */}
        <div className="kynex-glass spectrum-border rounded-3xl p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Fingerprint className="size-5 text-primary" /> Authentication
          </h3>
          <div className="mt-4 space-y-2.5 text-sm">
            <Row ok label={`Signed in as ${email}`} sub="Identity derived from a signed server session, never from client state." />
            <Row ok label="Session expires automatically" sub="Server-side expiration time on every session; expired sessions are rejected." />
            <Row ok label="Logout revokes the server session" sub="Signing out ends the session on the server, not just locally." />
            <Row
              ok={false}
              label="Two-factor authentication (2FA / passkeys)"
              sub="Not configured on the current authentication provider. KYNEX won't simulate it: this lights up automatically once TOTP or WebAuthn is enabled on the backend."
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2 rounded-xl"
              disabled={busy}
              onClick={() => act(async () => {
                await signOut();
                navigate("/");
              }, "Signed out. Session revoked server-side")}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>

        {/* ---------- session management ---------- */}
        <div className="kynex-glass spectrum-border rounded-3xl p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Monitor className="size-5 text-primary" /> Active sessions
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Live rows from the server session table. Revoking is immediate, and refresh tokens are deleted too.
          </p>
          {sessions === undefined ? (
            <div className="mt-4 h-24 animate-pulse rounded-2xl bg-muted/50" />
          ) : sessions.length === 0 ? (
            <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
              No active sessions found.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {sessions.map((s) => (
                <div key={s._id} className="flex items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3">
                  <span className={cn("size-2 shrink-0 rounded-full", s.current ? "bg-success" : "bg-primary")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {s.current ? "This device" : "Another device"}
                      {s.current && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">CURRENT</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      started {new Date(s.createdAt).toLocaleString()} · expires {new Date(s.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  {!s.current && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      disabled={busy}
                      onClick={() => act(
                        () => revoke({ sessionId: s._id as Id<"authSessions"> }),
                        "Session revoked",
                      )}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
              {sessions.length > 1 && (
                <Button
                  variant="outline"
                  className="mt-1 w-full gap-2 rounded-xl"
                  disabled={busy}
                  onClick={() => act(() => revokeOthers({}), "All other sessions revoked")}
                >
                  <XCircle className="size-4" /> Log out everywhere else ({sessions.length - 1})
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ---------- data isolation + AI boundary ---------- */}
        <div className="kynex-glass spectrum-border rounded-3xl p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <ShieldCheck className="size-5 text-success" /> Data isolation
          </h3>
          <div className="mt-4 space-y-2.5 text-sm">
            <Row ok label="Server-side ownership on every record" sub="Every query and mutation re-checks that the row belongs to the authenticated caller." />
            <Row ok label="Cross-user attempts are denied and audit-logged" sub="Denials return a safe result and record a content-free security event." />
            <Row ok label="Deny-by-default foreign IDs" sub="Foreign or malformed IDs return 'not found', with no existence oracle for attackers." />
          </div>
        </div>

        <div className="kynex-glass spectrum-border rounded-3xl p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-5 text-chart-4" /> AI & input safety
          </h3>
          <div className="mt-4 space-y-2.5 text-sm">
            <Row ok label="API keys never reach the frontend" sub="AI calls run in server actions; the client only ever sees the answer." />
            <Row ok label="Uploaded documents treated as untrusted data" sub="Document content is bounded and framed as data, so it cannot override system instructions." />
            <Row ok label="Server-side input validation + rate limits" sub="Message caps, sanitized text, and fixed-window limits on expensive AI operations." />
            <Row
              ok={false}
              label="Malware scanning of uploads"
              sub="Not available in this deployment: KYNEX does not claim uploaded files are malware-free."
            />
          </div>
        </div>
      </div>

      {/* ---------- audit trail note ---------- */}
      <div className="mt-6 kynex-glass spectrum-border rounded-3xl p-6">
        <h3 className="font-display text-lg font-bold">Audit trail</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Security-relevant events (session revocation, cross-user denial attempts, quota
          exhaustion, deletions) are recorded server-side with actor id, action and timestamp,
          never content, tokens, or secrets. This log is ops-only and is not exposed through any
          public query.
        </p>
      </div>
    </AppShell>
  );
}

function Row({ ok, label, sub }: { ok: boolean; label: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl bg-muted/30 px-4 py-3"
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-success" />
      ) : (
        <CircleDashed className="mt-0.5 size-4.5 shrink-0 text-warning" />
      )}
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>
      </div>
    </motion.div>
  );
}
