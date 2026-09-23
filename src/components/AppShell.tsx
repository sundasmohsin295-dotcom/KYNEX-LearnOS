import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  BarChart3, BookOpen, Flame, GraduationCap, Gauge, LayoutDashboard, LogOut,
  Moon, Network, Plus, Sun, Target, Wrench, Zap, RefreshCw, Fingerprint, Calculator,
  CalendarDays, ClipboardCheck, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { XP_PER_LEVEL, STREAK_MESSAGES } from "@/lib/game";
import { CommandBar } from "@/components/CommandBar";
import { applyPrivateSeo } from "@/lib/seo";

const NAV = [
  { to: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { to: "/twin", label: "Twin", icon: Fingerprint },
  { to: "/library", label: "Vault", icon: BookOpen },
  { to: "/chat", label: "Professor", icon: GraduationCap },
  { to: "/practice", label: "Practice", icon: Target },
  { to: "/examiner", label: "Examiner", icon: ClipboardCheck },
  { to: "/flashcards", label: "Recall", icon: RefreshCw },
  { to: "/mistakes", label: "Mistake Bank", icon: Wrench },
  { to: "/graph", label: "KYNEX Map", icon: Network },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/gpa", label: "GPA Lab", icon: Calculator },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/plan", label: "Plan & usage", icon: Gauge },
  { to: "/security", label: "Security", icon: ShieldCheck },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const overview = useQuery(api.profiles.myOverview);
  const flashCount = useQuery(api.learning.flashcardCount);
  const ensureProfile = useMutation(api.learning.ensureGameProfile);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // Ensure profile/game rows exist for brand-new accounts (idempotent).
  useEffect(() => {
    void ensureProfile({});
  }, [ensureProfile]);

  // Private app surface: force noindex on every authenticated route.
  useEffect(() => applyPrivateSeo(), []);

  const game = overview?.game;
  const xpInLevel = game ? game.xp % XP_PER_LEVEL : 0;
  const xpPct = game ? Math.min(100, (xpInLevel / XP_PER_LEVEL) * 100) : 0;
  const streak = game?.streakCount ?? 0;
  const streakAlive = overview?.stats.streakSafe ?? false;
  const dueCards = flashCount?.due ?? 0;

  const streakTitle =
    streak === 0
      ? "Learn something today to start your streak"
      : streakAlive
        ? `${streak}-day learning streak`
        : STREAK_MESSAGES.welcomeBack;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/70 bg-sidebar lg:flex">
        <button
          className="flex items-center gap-2.5 px-5 pt-6 pb-5 text-left"
          onClick={() => navigate("/dashboard")}
        >
          <KynexMark className="size-9" />
          <div>
            <p className="font-display text-base font-extrabold leading-none tracking-tight">KYNEX</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Academic Intelligence OS</p>
          </div>
        </button>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="flex-1">{label}</span>
              {to === "/flashcards" && dueCards > 0 && (
                <span className="rounded-full bg-xp px-1.5 py-0.5 text-[10px] font-bold text-xp-foreground">
                  {dueCards}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Command bar + level card */}
        <div className="mx-3 mb-3">
          <CommandBar />
        </div>

        <div className="mx-3 mb-3 rounded-2xl border border-border/70 bg-card/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">LEVEL {game?.level ?? 1}</span>
            <span className="flex items-center gap-1 text-xs font-bold text-xp-foreground">
              <Zap className="size-3.5 fill-xp text-xp" /> {game?.xp ?? 0} XP
            </span>
          </div>
          <Progress value={xpPct} className="mt-2 h-1.5" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {XP_PER_LEVEL - xpInLevel} XP to level {(game?.level ?? 1) + 1}
          </p>
        </div>

        <Button
          onClick={() => navigate("/add")}
          className="mx-3 mb-4 gap-2 rounded-xl shadow-lg shadow-primary/25"
        >
          <Plus className="size-4" /> Add to Vault
        </Button>

        <UserFooter />
      </aside>

      {/* ---------- Topbar (mobile) ---------- */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background px-4 py-3 lg:hidden">
        <button className="flex items-center gap-2" onClick={() => navigate("/dashboard")}>
          <KynexMark className="size-8" />
          <span className="font-display text-sm font-extrabold tracking-tight">KYNEX</span>
        </button>
        <div className="flex items-center gap-2">
          <CommandBar />
          <span title={streakTitle} className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold">
            <Flame className={cn("size-3.5", streakAlive ? "fill-chart-5/30 text-chart-5" : "text-muted-foreground")} />
            {streak}
          </span>
          <Button size="sm" className="h-8 gap-1 rounded-lg" onClick={() => navigate("/add")}>
            <Plus className="size-3.5" /> Add
          </Button>
          <UserFooter mobile />
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="relative z-10 px-4 pb-24 pt-6 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* ---------- Bottom nav (mobile) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border/70 bg-background py-1.5 lg:hidden">
        {NAV.filter((n) => [
          "/dashboard", "/practice", "/flashcards", "/mistakes", "/chat",
        ].includes(n.to)).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-5" />
                {label === "Command Center" ? "Home" : label.split(" ")[0]}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );

  function UserFooter({ mobile = false }: { mobile?: boolean }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("rounded-full", mobile && "size-8")}>
            <div className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {(user?.name ?? "L").slice(0, 1).toUpperCase()}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mobile ? "end" : "start"} className="w-52">
          <DropdownMenuLabel className="truncate">{user?.name ?? "Learner"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/twin")}>
            <Fingerprint className="mr-2 size-4" /> KYNEX Twin
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="mr-2 size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}

/** KYNEX wordmark glyph — a geometric "K" node mark. */
export function KynexMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative grid shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md", className)}>
      <svg viewBox="0 0 24 24" fill="none" className="size-[58%]">
        <path d="M7 4v16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M17 4l-7.5 8L17 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17" cy="12" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Page header used across app pages. */
export function PageHeader({
  eyebrow, title, children,
}: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        {eyebrow && (
          <p className="font-data mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
      </div>
      {children}
    </motion.div>
  );
}
