import { useEffect, useMemo, useState } from "react";
import { Bot, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useUiPrefs } from "@/components/UiPrefsProvider";
import {
  applyBuddyAvatarAttribute,
  buddyHintForPath,
  buddyToneFor,
  BUDDY_AVATARS,
  BUDDY_AVATAR_META,
  loadBuddyAvatar,
  loadBuddyName,
  saveBuddyAvatar,
  saveBuddyName,
  type BuddyAvatar,
} from "@/lib/studyBuddy";

/**
 * Study Buddy — KYNEX's customizable cartoon companion. Floating/docked
 * widget that explains the module you're standing in, adapts its voice to
 * the active generational persona, and lets the student pick an avatar and
 * rename it. Fully local: no AI calls, no network, no user data leaves the
 * browser — so it stays useful even when the AI service is unconfigured.
 */

const AVATAR_GLYPH: Record<BuddyAvatar, string> = {
  bot: "🤖",
  owl: "🦉",
  pixel: "👾",
  anime: "🌟",
};

/**
 * Router-independent pathname tracker.
 *
 * StudyBuddy is a GLOBAL widget mounted at the provider level (outside
 * <BrowserRouter>), so React Router hooks (useLocation) would throw:
 * "useLocation() may be used only in the context of a <Router> component".
 * This hook derives the current path from window.location instead:
 *  - `popstate` covers Back/Forward navigation,
 *  - pushState/replaceState are wrapped (SPA navigations don't fire
 *    popstate), calling through to the original History API untouched.
 * The component stays mount-safe inside OR outside a <Router>.
 */
export function useWindowPathname(): string {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setPathname(window.location.pathname);
    const history = window.history;
    // Capture the CURRENT method references (not bound copies) so unmount
    // restores the exact original objects — stable even if multiple widgets
    // ever patch the History API concurrently (LIFO restore).
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const patchedPush = function pushState(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      const result = origPush.apply(this, args);
      update();
      return result;
    } as History["pushState"];
    const patchedReplace = function replaceState(
      this: History,
      ...args: Parameters<History["replaceState"]>
    ) {
      const result = origReplace.apply(this, args);
      update();
      return result;
    } as History["replaceState"];
    history.pushState = patchedPush;
    history.replaceState = patchedReplace;
    window.addEventListener("popstate", update);
    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", update);
    };
  }, []);
  return pathname;
}

export function StudyBuddy() {
  const pathname = useWindowPathname();
  const { persona } = useUiPrefs();

  const [avatar, setAvatar] = useState<BuddyAvatar>(loadBuddyAvatar);
  const [name, setName] = useState<string>(loadBuddyName);
  const [draft, setDraft] = useState<string>(loadBuddyName);

  const tone = useMemo(() => buddyToneFor(persona), [persona]);
  const hint = useMemo(
    () => buddyHintForPath(pathname),
    [pathname],
  );

  // ⌘K palette commands (and any other writer) commit through storage +
  // this event; the widget reloads its local state to stay in sync.
  useEffect(() => {
    const sync = () => {
      setAvatar(loadBuddyAvatar());
      setName(loadBuddyName());
    };
    window.addEventListener("kynex:buddy", sync);
    return () => window.removeEventListener("kynex:buddy", sync);
  }, []);

  const pickAvatar = (a: BuddyAvatar) => {
    setAvatar(a);
    saveBuddyAvatar(a);
    applyBuddyAvatarAttribute(a);
  };

  const commitName = () => {
    saveBuddyName(draft);
    setName(loadBuddyName());
  };

  return (
    <div className="fixed bottom-20 end-4 z-40 lg:bottom-5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label={`Study Buddy: ${name}`}
            className="kynex-glass spectrum-border group grid size-12 place-items-center rounded-full text-2xl shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95"
          >
            <span className="transition-transform group-hover:-rotate-6">
              {AVATAR_GLYPH[avatar]}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-80 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl"
            >
              {AVATAR_GLYPH[avatar]}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {BUDDY_AVATAR_META[avatar].label} · {tone.voice}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Avatar
          </p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {BUDDY_AVATARS.map((a) => (
              <button
                key={a}
                title={BUDDY_AVATAR_META[a].label}
                aria-pressed={a === avatar}
                onClick={() => pickAvatar(a)}
                className={cn(
                  "grid h-12 place-items-center rounded-xl border text-xl transition-colors",
                  a === avatar
                    ? "border-primary bg-primary/10"
                    : "border-border/70 hover:bg-accent",
                )}
              >
                {AVATAR_GLYPH[a]}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Name your buddy
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <Input
              value={draft}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Sparky"
              className="h-8 rounded-lg text-sm"
            />
          </div>

          <div className="mt-3 rounded-xl bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Lightbulb className="size-3.5 text-primary" />
              {hint ? hint.title : tone.praise}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {hint ? hint.body : tone.nudge}
            </p>
          </div>

          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Bot className="size-3" /> Local companion — no AI calls, no data
            leaves your browser.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
