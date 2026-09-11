import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useEffect } from "react";
import { NavLink, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  BookOpen, Flame, GraduationCap, LayoutDashboard, LogOut,
  Moon, Plus, Sun, Swords, Target, Zap, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { XP_PER_LEVEL } from "@/lib/game";
import { STREAK_MESSAGES } from "@/lib/game";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/chat", label: "Tutor Chat", icon: GraduationCap },
  { to: "/practice", label: "Practice", icon: Target },
  { to: "/flashcards", label: "Review", icon: RefreshCw },
  { to: "/achievements", label: "Achievements", icon: Swords },
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
        ? `${streak}-day learning streak 🔥`
        : STREAK_MESSAGES.welcomeBack;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ambient gradient field */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 size-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 size-[400px] rounded-full bg-chart-2/10 blur-3xl" />
      </div>

      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/70 bg-sidebar/80 backdrop-blur-xl lg:flex">
        <button
          className="flex items-center gap-2.5 px-5 pt-6 pb-5 text-left"
          onClick={() => navigate("/dashboard")}
        >
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-chart-4 text-primary-foreground shadow-md">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <p className="font-display text-base font-bold leading-none">STUDYOS</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">AI Learning OS</p>
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

        {/* Level card */}
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
          <Plus className="size-4" /> Add Material
        </Button>

        <UserFooter />
      </aside>

      {/* ---------- Topbar (mobile) ---------- */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button className="flex items-center gap-2" onClick={() => navigate("/dashboard")}>
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-chart-4 text-primary-foreground">
            <GraduationCap className="size-4" />
          </div>
          <span className="font-display text-sm font-bold">STUDYOS</span>
        </button>
        <div className="flex items-center gap-2">
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
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-border/70 bg-background/90 py-1.5 backdrop-blur-xl lg:hidden">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
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
                <Icon className={cn("size-5", isActive && "drop-shadow-[0_0_6px_var(--primary)]")} />
                {label.split(" ")[0]}
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
            <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-chart-4 to-primary text-xs font-bold text-primary-foreground">
              {(user?.name ?? "L").slice(0, 1).toUpperCase()}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mobile ? "end" : "start"} className="w-52">
          <DropdownMenuLabel className="truncate">{user?.name ?? "Learner"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <SparklesDot /> {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
      </div>
      {children}
    </motion.div>
  );
}

function SparklesDot() {
  return (
    <motion.span
      className="inline-block size-1.5 rounded-full bg-primary"
      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.6, 1] }}
      transition={{ repeat: Infinity, duration: 2 }}
    />
  );
}
