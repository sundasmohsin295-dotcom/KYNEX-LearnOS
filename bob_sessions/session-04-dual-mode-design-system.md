# Session 04 — Dual-Mode Design System, Zero-FOUC Theming & Auth Revolution

**Objective:** A human-crafted, anti-vibe-coded design system that is exquisite in
**both** light and dark mode, with flicker-free theme switching and a premium,
trustworthy authentication experience.

## Dual-mode token architecture (`src/index.css`)

- **Dark mode base:** deep obsidian/slate surfaces with a faint cool cast;
  blue is reserved for interaction. Multi-stop glowing spectrum borders and an
  ambient aurora field ride the active module spectrum.
- **Light mode base:** crisp editorial paper-white (`#F8FAFC` family) with
  pure-white cards and deep slate-charcoal text (`#0F172A` family primary,
  `#475569` secondary) for WCAG AAA contrast; aurora intensity is deliberately
  reduced so surfaces stay calm.
- All surfaces, text hierarchies and containers resolve through CSS variables —
  no hardcoded color classes in components.

## Zero-FOUC theme switching

- **Pre-paint bootstrap** (`index.html`): an inline script resolves the
  persisted theme (next-themes storage contract, key `theme`) and sets the
  `dark` class on `<html>` **before first paint**; storage failures fall back
  silently to light.
- **ThemeProvider mounted** (`src/main.tsx`): `next-themes` with
  `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange` — wrapped inside `ConvexAuthProvider`. This also
  fixed a real defect: the app-shell dark-mode toggle previously called
  `useTheme()` with no provider mounted (a silent no-op).
- Split `theme-color` metas so mobile browser chrome follows the mode.

## Typography triad enforcement

- Fraunces (`font-display`) for editorial headlines — optical sizing on, never
  italic, tight tracking.
- IBM Plex Sans (`font-sans`) for body clarity, with polished font features.
- IBM Plex Mono (`.font-data`) for tabular numerical metrics: GPA counters,
  countdown timers, confidence scores, IDs and timestamps.
- Inter is prohibited by the token file itself.

## Auth revolution

- **`src/components/brand/KynexAuthShell.tsx`** — split layout: brand story
  (animated solar-core emblem, editorial quote) beside the auth card; faint
  orbital geometry; mobile emblem fallback.
- **`src/pages/Auth.tsx`** — three-step flow: email sign-in → 6-digit OTP
  verification (resend with a 30-second cooldown, fresh-code confirmation) →
  a **recovery step** for expired/undeliverable codes (check spam, verify the
  address, or continue as guest with a truthful "everything stays attached to
  this browser" note). Error detail is enumerated-neutralized: generic user
  message, detail only in the console.
- Dead `/legal/*` links replaced with real `/terms` and `/privacy` routes.

## Living spectrum engine + motion language

- `src/lib/spectrum.tsx` — each academic module broadcasts a (hue, chroma)
  position (Quantum Indigo → Professor, Bioluminescent Emerald → Recall,
  Solar Gold → Exam Radar, Cyber-Amethyst → Twin); primary/ring/charts/aurora
  all interpolate from two numbers, giving a continuous plane of accent states.
- `src/lib/motion.tsx` — one spring-physics vocabulary (`snappy/smooth/
  expressive/spatial`) registered as the global MotionConfig default;
  `reducedMotion="user"` rewrites everything to opacity fades for users who
  prefer reduced motion.

## Verification

- `bun tsc -b --noEmit` — clean.
- `bun test` — full suite passing, including `src/convex/hookAudit.test.ts`
  (no invalid hook calls or duplicated React) after the provider-tree change.
- Manual render check: theme toggle flips both modes instantly with no flash;
  `/auth?returnTo=…` deep-links sign-in back to the originally requested
  protected route; recovery and guest paths never dead-end.
