import { Palette, Sparkles, Users } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useUiPrefs } from "@/components/UiPrefsProvider";
import { cn } from "@/lib/utils";
import {
  PERSONA_META,
  UI_STYLES,
  UI_STYLE_META,
  PERSONAS,
  type Persona,
  type UiStyle,
} from "@/lib/uiPrefs";

/**
 * UI Theme Customizer — runtime control surface for the Style Matrix (5
 * design languages) and the Generational Persona. Switching is instant:
 * style changes are a single data-attribute write resolved in CSS (no
 * component re-render beyond the local selection state), and persona changes
 * update tokens + lexical copy + the AI tone directive on the next message.
 */
export function UiCustomizer() {
  const { style, persona, setStyle, setPersona } = useUiPrefs();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg text-xs font-semibold text-muted-foreground"
          aria-label="Customize UI style and persona"
        >
          <Palette className="size-3.5" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold">Design</p>
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
        </div>

        {/* ---- UI Style Matrix ---- */}
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          UI style
        </p>
        <div className="mt-1.5 grid grid-cols-1 gap-1" role="radiogroup" aria-label="UI style">
          {UI_STYLES.map((s: UiStyle) => {
            const active = s === style;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStyle(s)}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-left transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{UI_STYLE_META[s].label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {UI_STYLE_META[s].blurb}
                  </span>
                </span>
                {active && <span className="text-[10px] font-bold text-primary">ACTIVE</span>}
              </button>
            );
          })}
        </div>

        {/* ---- Generational persona ---- */}
        <p className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <Users className="size-3" /> Persona
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Generational persona">
          {PERSONAS.map((p: Persona) => {
            const active = p === persona;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPersona(p)}
                className={cn(
                  "rounded-xl border px-2.5 py-2 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/70 hover:bg-accent",
                )}
              >
                <span className={cn("block text-xs font-bold", active && "text-primary")}>
                  {PERSONA_META[p].label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                  {PERSONA_META[p].blurb}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          Styles change surfaces only — text contrast (AAA) and dark/light
          tokens hold in every combination. Persona also tunes the Professor's
          teaching voice.
        </p>
      </PopoverContent>
    </Popover>
  );
}
