import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Brain, Check, Crown, Eye, Gauge, MessagesSquare, ScanSearch, Sparkles, X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { KynexEmptyState } from "@/components/brand/KynexBrand";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Plan & usage — the honest subscription surface.
 *
 * Every number here comes from the server-authoritative quota system
 * (src/convex/security.ts myQuotaStatus). Nothing is estimated client-side.
 * The upgrade panel is transparent about checkout not being connected yet:
 * a disabled CTA with a truthful explanation, never a fake purchase flow.
 */
export default function PlanPage() {
  const quota = useQuery(api.security.myQuotaStatus);

  const FREE = {
    materials: "3 materials in the Vault",
    aiTeaching: "40 Professor messages / day",
    practice: "8 quiz generations / day",
    twin: "Basic Twin + NEXT MOVE",
  };
  const PRO = [
    { icon: Gauge, text: "10× daily AI teaching, practice & analysis limits" },
    { icon: Brain, text: "Deeper Professor modes (University, Deep Dive, Viva)" },
    { icon: ScanSearch, text: "Exam Radar with past-paper pattern intelligence" },
    { icon: Crown, text: "Advanced Academic Twin & mastery analytics" },
    { icon: MessagesSquare, text: "Priority AI capacity at busy hours" },
    { icon: Sparkles, text: "Early access to new intelligence features" },
  ];

  return (
    <AppShell>
      <PageHeader eyebrow="Plan & usage" title="Your plan" />

      {/* ---------- Current usage (real data only) ---------- */}
      {quota === undefined ? (
        <div className="grid gap-5 md:grid-cols-3">
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
        </div>
      ) : quota === null ? (
        <KynexEmptyState
          title="Sign in to see your usage"
          body="Your AI usage is tracked server-side per account. Sign in to see where you stand."
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <UsageCard
            icon={Brain}
            label="AI teaching"
            used={quota.chatUsed}
            cap={quota.chatCap}
            sub="Professor messages today (resets midnight UTC)"
          />
          <UsageCard
            icon={Sparkles}
            label="Analysis"
            used={quota.analysisUsed}
            cap={quota.analysisCap}
            sub="Material analyses today (resets midnight UTC)"
          />
          <UsageCard
            icon={MessagesSquare}
            label="Practice"
            used={quota.quizUsed}
            cap={quota.quizCap}
            sub="Quiz generations today (resets midnight UTC)"
          />
        </div>
      )}

      {/* ---------- Free vs Pro ---------- */}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Free
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                {quota ? `${quota.plan === "pro" ? "Pro" : "Your plan"}` : "Current plan"}
              </span>
              <Eye className="size-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>Genuine value, never the bare minimum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {Object.values(FREE).map((f) => (
              <p key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-primary/30">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="size-5 text-primary" /> KYNEX Pro
            </CardTitle>
            <CardDescription>
              Deeper intelligence for serious exam preparation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {PRO.map((p) => (
              <p key={p.text} className="flex items-start gap-2">
                <p.icon className="mt-0.5 size-4 shrink-0 text-primary" /> {p.text}
              </p>
            ))}

            {/* Honest state: checkout not connected yet. No fake buy button. */}
            <div className="mt-4 rounded-xl border border-border/70 bg-muted/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <X className="size-4 text-muted-foreground" />
                Checkout isn't connected yet
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                We won't show a Subscribe button that can't complete a real purchase.
                When billing goes live, this panel shows transparent pricing and your
                cancellation options.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Transparency strip ---------- */}
      <div className="mt-6 kynex-glass spectrum-border rounded-2xl/60 p-5 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">How limits work</p>
        <p className="mt-1 leading-relaxed">
          Usage is enforced server-side on every AI call: the client never decides what you're
          allowed to do. Free quotas reset at midnight UTC; nothing is hidden behind confusing
          tiers. If you hit a limit, KYNEX tells you exactly what to do tomorrow rather than
          nagging you to upgrade.
        </p>
      </div>

      <div className="mt-4 flex justify-center">
        <Button asChild variant="ghost" className="text-muted-foreground">
          <a href="/security">Review your account security</a>
        </Button>
      </div>
    </AppShell>
  );
}

function UsageCard({
  icon: Icon,
  label,
  used,
  cap,
  sub,
}: {
  icon: typeof Brain;
  label: string;
  used: number;
  cap: number;
  sub: string;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone =
    pct >= 100 ? "text-destructive" : pct >= 80 ? "text-amber-500" : "text-success";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="kynex-glass spectrum-border rounded-3xl p-6"
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" /> {label}
        </p>
        <span className={`text-xs font-bold ${tone}`}>
          {used}/{cap} today
        </span>
      </div>
      <Progress value={pct} className="mt-3 h-2" />
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  );
}
