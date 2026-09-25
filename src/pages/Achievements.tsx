import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Award, Brain, Crown, Flame, Lock, Sparkles, Star, Target, Trophy, Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { XP_PER_LEVEL, levelTitle } from "@/lib/game";
import { ACHIEVEMENT_META } from "@/convex/achievementMeta";

const ICON: Record<string, typeof Trophy> = {
  spark: Sparkles,
  target: Target,
  trophy: Trophy,
  brain: Brain,
  columns: Award,
  flame: Flame,
  fire: Flame,
  comet: Flame,
  star: Star,
  crown: Crown,
  cards: Award,
  hundred: Target,
};

export default function Achievements() {
  const overview = useQuery(api.profiles.myOverview);
  const data = useQuery(api.learning.listAchievements);

  const earned = new Set((data?.earned ?? []).map((a) => a.key));
  const all = Object.entries(ACHIEVEMENT_META);
  const earnedCount = all.filter(([k]) => earned.has(k)).length;
  const pct = all.length > 0 ? Math.round((earnedCount / all.length) * 100) : 0;

  return (
    <AppShell>
      <PageHeader eyebrow="Trophy case" title="Achievements" />

      {/* level card */}
      {overview && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 sm:p-8"
        >
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                Level {overview.game.level} · {levelTitle(overview.game.level)}
              </p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                {overview.game.xp} XP
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {XP_PER_LEVEL - (overview.game.xp % XP_PER_LEVEL)} XP to level {overview.game.level + 1}
              </p>
            </div>
            <div className="flex gap-6">
              <Stat label="Longest streak" value={`${overview.game.longestStreak}d`} icon={Flame} />
              <Stat label="Badges" value={`${earnedCount}/${all.length}`} icon={Trophy} />
              <Stat label="Mastered" value={`${overview.stats.mastered}`} icon={Brain} />
            </div>
          </div>
          <Progress value={Math.round(((overview.game.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)} className="relative mt-5 h-2" />
        </motion.div>
      )}

      {/* badge grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {all.map(([key, meta], i) => {
          const has = earned.has(key);
          const Icon = ICON[meta.icon] ?? Trophy;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "card-lift rounded-3xl border p-5",
                has
                  ? "border-xp/40 bg-xp/5"
                  : "border-border/70 bg-card opacity-70",
              )}
            >
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "grid size-11 place-items-center rounded-2xl",
                    has
                      ? "bg-xp/20 text-xp-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {has ? <Icon className="size-5" /> : <Lock className="size-4" />}
                </div>
                {has && (
                  <span className="flex items-center gap-1 rounded-full bg-xp/20 px-2.5 py-1 text-[10px] font-bold text-xp-foreground">
                    <Zap className="size-3" /> +40 XP
                  </span>
                )}
              </div>
              <p className={cn("mt-3 font-display font-bold", !has && "text-muted-foreground")}>
                {meta.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* completion */}
      <div className="mt-6 kynex-glass spectrum-border rounded-3xl p-6 text-center">
        <p className="font-display text-lg font-bold">
          {earnedCount === all.length
            ? "Every badge unlocked."
            : `${pct}% of the trophy case filled`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Badges unlock from real learning: correct answers, mastery and consistency.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Trophy }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}
