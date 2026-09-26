import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  applyPersonaAttribute,
  applyUiStyleAttribute,
  DEFAULT_PERSONA,
  DEFAULT_UI_STYLE,
  isPersona,
  isUiStyle,
  loadPersona,
  loadUiStyle,
  PERSONA_KEY,
  savePersona,
  saveUiStyle,
  UI_STYLE_KEY,
  type Persona,
  type UiStyle,
} from "@/lib/uiPrefs";
import {
  applyLanguageAttributes,
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_KEY,
  loadLanguage,
  saveLanguage,
  type LanguageCode,
} from "@/lib/languages";
import { readWithFallback } from "@/lib/storageCodec";

interface UiPrefsContextValue {
  style: UiStyle;
  persona: Persona;
  lang: LanguageCode;
  setStyle: (s: UiStyle) => void;
  setPersona: (p: Persona) => void;
  setLang: (l: LanguageCode) => void;
}

const UiPrefsContext = createContext<UiPrefsContextValue | null>(null);

function readStyleAttr(): UiStyle {
  try {
    const v = document.documentElement.getAttribute("data-ui-style");
    if (isUiStyle(v)) return v;
  } catch {
    /* no document (SSR/tests) — fall through */
  }
  return loadUiStyle();
}

function readPersonaAttr(): Persona {
  try {
    const v = document.documentElement.getAttribute("data-gen");
    if (isPersona(v)) return v;
  } catch {
    /* no document — fall through */
  }
  return loadPersona();
}

function readStyleRaw(): string | null {
  try {
    return readWithFallback(UI_STYLE_KEY);
  } catch {
    return null;
  }
}

function readPersonaRaw(): string | null {
  try {
    return readWithFallback(PERSONA_KEY);
  } catch {
    return null;
  }
}

function readLangAttr(): LanguageCode {
  try {
    const el = document.documentElement;
    const v = el.getAttribute("lang");
    if (isLanguage(v)) return v;
  } catch {
    /* no document — fall through */
  }
  return loadLanguage();
}

/**
 * Runtime UI preference runtime: reads the attributes the pre-paint
 * bootstrap set (falling back to the persisted payload when the attribute
 * is absent, e.g. a test DOM), then owns both attribute writes and
 * persistence on change. Mirrors ThemeProvider's contract — index.html sets
 * the initial state, this provider keeps it in sync after mount.
 */
export function UiPrefsProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyleState] = useState<UiStyle>(readStyleAttr);
  const [persona, setPersonaState] = useState<Persona>(readPersonaAttr);
  const [lang, setLangState] = useState<LanguageCode>(readLangAttr);

  const setStyle = useCallback((s: UiStyle) => {
    if (!isUiStyle(s)) return;
    setStyleState(s);
    applyUiStyleAttribute(s);
    saveUiStyle(s);
  }, []);

  const setPersona = useCallback((p: Persona) => {
    if (!isPersona(p)) return;
    setPersonaState(p);
    applyPersonaAttribute(p);
    savePersona(p);
  }, []);

  const setLang = useCallback((l: LanguageCode) => {
    if (!isLanguage(l)) return;
    setLangState(l);
    applyLanguageAttributes(l);
    saveLanguage(l);
  }, []);

  const value = useMemo(
    () => ({ style, persona, lang, setStyle, setPersona, setLang }),
    [style, persona, lang, setStyle, setPersona, setLang],
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs(): UiPrefsContextValue {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) {
    // Never throw — the CSS attribute drives the visual style anyway, so a
    // provider-less context (e.g. a stray test mount) just loses controls.
    return {
      style: DEFAULT_UI_STYLE,
      persona: DEFAULT_PERSONA,
      lang: DEFAULT_LANGUAGE,
      setStyle: applyUiStyleAttribute,
      setPersona: applyPersonaAttribute,
      setLang: applyLanguageAttributes,
    };
  }
  return ctx;
}

/** Exported for tests only: the raw persisted payloads. */
export const __test = { readStyleRaw, readPersonaRaw };
