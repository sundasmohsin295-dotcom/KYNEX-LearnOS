/**
 * KYNEX Global Language Engine — localization core.
 *
 * Ten languages covering the world's most-spoken academic audiences, with
 * native RTL support for Arabic and Urdu. The active language is applied as
 * `<html lang>` + `<html dir>` — the exact attributes browsers, screen
 * readers and CSS logical properties resolve against — and persisted through
 * the versioned storageCodec envelope ({v,p}) so hand-tampered or legacy
 * payloads reset to English instead of crashing or mis-rendering.
 *
 * The AI layer consumes only the allowlisted BCP-47 `code`; the backend maps
 * it to a fixed directive (same discipline as modes/personas — the raw
 * string is never interpolated into prompts).
 */

import { decodeStored, encodeStored, readWithFallback, writeWithFallback } from "./storageCodec";

export interface LanguageDef {
  /** BCP-47 tag written to <html lang> and sent to the AI directive map. */
  code: string;
  /** English name (selector row label). */
  name: string;
  /** Endonym (selector row sub-label, always rendered LTR-safe). */
  native: string;
  /** Right-to-left script. Drives <html dir="rtl">. */
  rtl: boolean;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { code: "en",    name: "English",            native: "English",               rtl: false },
  { code: "zh-CN", name: "Mandarin (Simplified)", native: "简体中文",             rtl: false },
  { code: "hi",    name: "Hindi",              native: "हिन्दी",                 rtl: false },
  { code: "es",    name: "Spanish",            native: "Español",               rtl: false },
  { code: "fr",    name: "French",             native: "Français",              rtl: false },
  { code: "ar",    name: "Arabic (MSA)",       native: "العربية",               rtl: true },
  { code: "bn",    name: "Bengali",            native: "বাংলা",                  rtl: false },
  { code: "pt",    name: "Portuguese",         native: "Português",             rtl: false },
  { code: "id",    name: "Indonesian",         native: "Bahasa Indonesia",      rtl: false },
  { code: "ur",    name: "Urdu",               native: "اردو",                  rtl: true },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

const CODES: readonly string[] = LANGUAGES.map((l) => l.code);
const RTL_CODES: ReadonlySet<string> = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

export function isLanguage(v: unknown): v is LanguageCode {
  return typeof v === "string" && CODES.includes(v);
}

export function languageDef(code: LanguageCode): LanguageDef {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isRtl(code: LanguageCode): boolean {
  return RTL_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Persistence (kynex.-prefixed → covered by the corruption sweep)
// ---------------------------------------------------------------------------

export const LANGUAGE_KEY = "kynex.lang.v1";

export function loadLanguage(): LanguageCode {
  const v = decodeStored<LanguageCode>(readWithFallback(LANGUAGE_KEY), {
    fallback: DEFAULT_LANGUAGE,
  });
  // Allowlist check closes the last gap: a structurally-valid envelope
  // carrying an unknown code (hand-edited storage) resets to English.
  return isLanguage(v) ? v : DEFAULT_LANGUAGE;
}

export function saveLanguage(code: LanguageCode): "persisted" | "memory_only" {
  return writeWithFallback(LANGUAGE_KEY, encodeStored(code));
}

// ---------------------------------------------------------------------------
// Attribute application — mirrors the pre-paint bootstrap contract
// ---------------------------------------------------------------------------

export function applyLanguageAttributes(code: LanguageCode): void {
  if (typeof document === "undefined") return;
  const def = languageDef(code);
  document.documentElement.lang = def.code;
  // dir is a property on HTMLElement — setting it is idempotent and cheap.
  document.documentElement.dir = def.rtl ? "rtl" : "ltr";
}
