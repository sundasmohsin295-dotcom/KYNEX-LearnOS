import { Languages } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useUiPrefs } from "@/components/UiPrefsProvider";
import { cn } from "@/lib/utils";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

/**
 * Language selector — instant switching across the 10 supported languages.
 * Writes <html lang>/<html dir> (RTL for Arabic/Urdu) and persists through
 * the versioned codec; the pre-paint bootstrap mirrors both attributes so
 * the choice survives reloads with zero FOUC.
 */
export function LanguageSelector() {
  const { lang, setLang } = useUiPrefs();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground"
          aria-label="Change language"
        >
          <Languages className="size-3.5" />
          <span className="font-data uppercase">{lang === "zh-CN" ? "中文" : lang}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Language
        </p>
        <div className="mt-1.5 max-h-72 overflow-y-auto" role="radiogroup" aria-label="Language">
          {LANGUAGES.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={active}
                lang={l.code}
                dir={l.rtl ? "rtl" : "ltr"}
                onClick={() => setLang(l.code as LanguageCode)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{l.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {l.native}
                  </span>
                </span>
                {active && <span className="text-[10px] font-bold text-primary">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Arabic & Urdu flip the entire interface to right-to-left. The
          Professor teaches in your selected language.
        </p>
      </PopoverContent>
    </Popover>
  );
}
