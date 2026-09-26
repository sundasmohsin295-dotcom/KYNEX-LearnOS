/**
 * KYNEX UI Style Matrix + Generational Persona Engine — preference core.
 *
 * Two independent runtime customizations share one storage contract:
 *
 *  1. UI STYLE (visual design language) — applied as a data attribute on
 *     <html> (`data-ui-style`) and resolved entirely in CSS via index.css
 *     profile blocks. Attribute-driven means switching is one attribute
 *     write: zero re-renders of the component tree, instant, and every
 *     module inherits it without touching their markup.
 *
 *  2. GENERATIONAL PERSONA — applied as `data-gen` (tokens for UI emphasis)
 *     plus a lexical/AI-tone profile consumed by the Professor chat action
 *     (server-side allowlist — the raw persona value is never interpolated
 *     into prompts; the backend maps it to a fixed directive).
 *
 * Persistence uses the versioned storageCodec envelope ({v,p}) so legacy
 * payloads migrate forward and poisoned ones reset to defaults. Both keys
 * carry the `kynex.` prefix, so the corrupted-storage sweep already covers
 * them. index.html mirrors the read (plain-JSON fallback tolerant) pre-paint
 * for zero FOUC; this module is the single source of truth for validation.
 */

import { decodeStored, encodeStored, readWithFallback, writeWithFallback } from "./storageCodec";

// ---------------------------------------------------------------------------
// UI style matrix
// ---------------------------------------------------------------------------

export const UI_STYLES = [
  "glass",     // Glassmorphism — frosted depth (current KYNEX default)
  "minimal",   // Flat Minimalism — solid tones, zero shadows
  "neumorph",  // Neumorphism — extruded tactile monochrome
  "clay",      // Claymorphism — puffy inflated 3D
  "bento",     // Bento Grid — dense modular blocks
] as const;

export type UiStyle = (typeof UI_STYLES)[number];

export const DEFAULT_UI_STYLE: UiStyle = "glass";

export function isUiStyle(v: unknown): v is UiStyle {
  return typeof v === "string" && (UI_STYLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Generational persona
// ---------------------------------------------------------------------------

export const PERSONAS = ["classic", "millennial", "genz", "alpha"] as const;

export type Persona = (typeof PERSONAS)[number];

export const DEFAULT_PERSONA: Persona = "classic";

export function isPersona(v: unknown): v is Persona {
  return typeof v === "string" && (PERSONAS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Storage keys (kynex.-prefixed → covered by the corruption sweep)
// ---------------------------------------------------------------------------

export const UI_STYLE_KEY = "kynex.uiStyle.v1";
export const PERSONA_KEY = "kynex.genPersona.v1";

export function loadUiStyle(): UiStyle {
  // decodeStored handles envelope/type/legacy concerns; the allowlist check
  // here closes the last gap: a structurally-valid payload carrying an
  // unknown value (hand-edited or legacy poison) resets to the default.
  const v = decodeStored<UiStyle>(readWithFallback(UI_STYLE_KEY), { fallback: DEFAULT_UI_STYLE });
  return isUiStyle(v) ? v : DEFAULT_UI_STYLE;
}

export function saveUiStyle(style: UiStyle): "persisted" | "memory_only" {
  return writeWithFallback(UI_STYLE_KEY, encodeStored(style));
}

export function loadPersona(): Persona {
  const p = decodeStored<Persona>(readWithFallback(PERSONA_KEY), { fallback: DEFAULT_PERSONA });
  return isPersona(p) ? p : DEFAULT_PERSONA;
}

export function savePersona(p: Persona): "persisted" | "memory_only" {
  return writeWithFallback(PERSONA_KEY, encodeStored(p));
}

/** Sync to <html> without React — used by the pre-paint bootstrap contract
 *  and by the provider when it takes over after mount. */
export function applyUiStyleAttribute(style: UiStyle): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiStyle = style;
}

export function applyPersonaAttribute(p: Persona): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.gen = p;
}

// ---------------------------------------------------------------------------
// Catalog metadata (labels for the customizer UI)
// ---------------------------------------------------------------------------

export const UI_STYLE_META: Record<UiStyle, { label: string; blurb: string }> = {
  glass:    { label: "Glass",       blurb: "Frosted depth, translucent layers" },
  minimal:  { label: "Minimal",     blurb: "Flat editorial, crisp geometry" },
  neumorph: { label: "Neumorph",    blurb: "Soft extruded tactile surfaces" },
  clay:     { label: "Clay",        blurb: "Puffy inflated 3D, extra-rounded" },
  bento:    { label: "Bento",       blurb: "Dense modular data blocks" },
};

export const PERSONA_META: Record<Persona, { label: string; blurb: string }> = {
  alpha:      { label: "Gen Alpha",     blurb: "Gamified, playful, reward-rich" },
  genz:       { label: "Gen Z",         blurb: "Fast, aesthetic, zero fluff" },
  millennial: { label: "Millennial",    blurb: "Structured goals, mentor tone" },
  classic:    { label: "Professional",  blurb: "Editorial, Socratic, citations" },
};

// ---------------------------------------------------------------------------
// Persona copy — lexical voice for the authenticated shell. Grounded, short.
// ---------------------------------------------------------------------------

export interface PersonaCopy {
  greeting: (name?: string) => string;
  addCta: string;
  aiToneLabel: string;
}

export const PERSONA_COPY: Record<Persona, PersonaCopy> = {
  alpha: {
    greeting: (n) => `Hey${n ? ` ${n}` : ""}! Ready to level up? ⚡`,
    addCta: "Add material",
    aiToneLabel: "Coach mode: playful, bite-sized, XP milestones",
  },
  genz: {
    greeting: (n) => (n ? `${n}, here's the move.` : "Here's the move."),
    addCta: "Add material",
    aiToneLabel: "Direct mode: bullets, no fluff, exam-sharp",
  },
  millennial: {
    greeting: (n) => (n ? `Good to see you, ${n}.` : "Good to see you."),
    addCta: "Add to Vault",
    aiToneLabel: "Mentor mode: structured, goal-oriented",
  },
  classic: {
    greeting: (n) => (n ? `Welcome back, ${n}.` : "Welcome back."),
    addCta: "Add to Vault",
    aiToneLabel: "Professor mode: Socratic, citation-grounded",
  },
};
