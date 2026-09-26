# ⚡ Project KYNEX: The Autonomous Academic Intelligence OS
*Built with IBM Bob (Enterprise Plan) for the IBM Bob 2.0 Hackathon (September 2026)*

> **Elevating student achievement through cognitive neuroscience, zero-trust security architecture, and a human-crafted anti-vibe-coded design system.**

---

## 🚀 Overview
**KYNEX** is an enterprise-grade, high-performance academic operating system designed to function as an AI professor, study coach, and secure exam radar. Built entirely using **IBM Bob's AI development environment**, KYNEX replaces generic AI tutoring gimmicks with rigorous cognitive science loops—featuring Leitner-X spaced repetition, Socratic maieutic questioning, and a military-grade zero-trust backend.

**The core loop:** `KNOW → UNDERSTAND → ACT → MASTER → ADVANCE`. Student data feeds the Twin, gaps are detected, the highest-impact action is chosen, the student executes, KYNEX measures the result, and a smarter Next Move follows.

> 📂 *Verification proof of our IBM Bob development workflows, session logs, and architectural iterations are stored in the mandatory [`bob_sessions/`](./bob_sessions) folder.*

---

## 🛠️ Built with IBM Bob Enterprise Workflow
This repository was architected, debugged, and optimized in direct collaboration with **IBM Bob** (`ibm-hackathon-lablab` team).

* **Backend & API Resilience:** Server-authoritative Convex mutations, IDOR neutralization (single trusted identity source re-verified on every query, mutation and action boundary), and strict schema validation (`schemaValidation: true`).
* **Cognitive Engine:** Algorithmic spaced-repetition scheduling (ease/interval/lapse model with due-queue surfacing) tied to mastery, accuracy and readiness signals.
* **Design Engineering:** Human-crafted, non-vibe-coded dual-mode aesthetic (paper-white light mode + obsidian dark mode) using Fraunces, IBM Plex Sans, and IBM Plex Mono with subtle living aurora mesh gradients.

---

## ✨ What's inside

| Module | What it does |
| --- | --- |
| **KYNEX Twin** | A living model of your academic state: degree, GPA targets, mastery, weak concepts, study patterns — updated every time you learn. |
| **KYNEX Move** | One highest-impact action, always. Chosen from your accuracy, mistakes and prerequisites, with the evidence shown. Never a generic to-do list. |
| **KYNEX Vault** | PDFs, DOCX, URLs, YouTube, articles, slides, pasted text. KYNEX extracts, structures and analyzes it — and tells you honestly when a format fails. |
| **KYNEX Professor** | An AI teaching system with depth: Socratic questioning, Feynman checks, teach-me loops, quiz generation. Grounded in your Vault material — never an answer dump. |
| **Mastery Engine** | Every answer updates a per-concept mastery model. Distinguishes what you *know* from what you have merely *seen*. |
| **Exam Radar & Examiner** | Preparation priority from real evidence (accuracy, recency, materials) — never a prediction of what will appear. Written-answer marking with provisional, rubric-based marks. |
| **Recall (Leitner-X)** | Spaced repetition with per-card ease, intervals and lapse tracking; due counts surface in the sidebar. |
| **Mistake Bank** | Every miss is classified (conceptual, calculation, careless, misreading…) and tracked until it is resolved by later evidence. |
| **GPA Lab** | What-if grade modeling with server-computed mathematics. |
| **Plan & Usage** | Server-authoritative quotas and daily AI usage — the client never caches entitlement state. |

---

## 🛡️ Enterprise Architecture & Security
- **Zero-Trust Perimeter:** Server-side identity re-verification (`getAuthUserId` via a single trusted identity query) on every query, mutation and action boundary. Actions never accept a user id from the client — ownership is re-checked at the action layer (defense in depth).
- **Input Sanitization (AI Perturbation Shield):** NFKC normalization, bidi-control removal, zero-width/invisible character stripping, control-char filtering, and frame-marker neutralization on all uploaded study materials and extracted web text before they reach the database or an AI prompt boundary. Web ingests additionally pass an SSRF guard (allowlisted schemes, DNS validation, redirect re-validation, response size caps).
- **Resilient Fault Tolerance:** Three-state circuit breakers (`closed → open → half_open`) persisted server-side protect all upstream AI gateway inferences; the health probe stays deliberately independent of the breaker so it can observe the provider's true state even while the circuit is open.
- **Zero-Crash Frontend:** Root + route-level error boundaries, per-route circuit breakers (two crashes in 60s trip a degraded-mode container with "Reload Module"), fingerprinted crash telemetry batched to the server, versioned localStorage codec with safe defaults, and a pre-paint theme bootstrap for zero FOUC.
- **Honest AI:** Structured output validation before persistence, classified failure modes, provisional-only marking, and explicit error states — KYNEX never pretends content was analyzed when processing failed.

**Verification:** `bun tsc -b --noEmit` clean · **256 tests across 25 files passing** (unit, adversarial cross-user attacks, AI context isolation, perturbation shield E2E, deletion integrity, chaos boundaries, global error handler).

---

## 🎨 The Human-Crafted Design System
Rejecting generic AI templates, KYNEX implements:
- **Pristine Paper-White & Obsidian Dual Mode:** A tokenized light theme (`#F8FAFC` paper, `#0F172A` slate text, WCAG AAA) and a deep obsidian dark theme, switched flicker-free via a pre-paint bootstrap script.
- **Typography Triad:** Fraunces for editorial authority, IBM Plex Sans for body clarity, and IBM Plex Mono (`.font-data`) for tabular numerical metrics, GPA counters and countdown timers.
- **Living Spectrum Engine:** Each academic module broadcasts its own (hue, chroma) position — Quantum Indigo for Socratic dialogues, Bioluminescent Emerald for spaced repetition, Solar Gold for Exam Radar — and the entire interface recolors through CSS variables: a continuous plane of one million+ accent states.
- **Purposeful Micro-Interactions:** Physics-based spring transitions (Framer Motion, `reducedMotion="user"`), cursor-tracked gleam on primary actions, and layout-locked skeletons for zero CLS.

---

## 🧱 Tech Stack
- **Frontend:** Vite · React 19 · React Router v7 · Tailwind CSS v4 · shadcn/ui · Framer Motion
- **Backend:** Convex (queries / mutations / actions) · Convex Auth (email OTP + anonymous)
- **Reliability:** Error boundaries, route circuit breakers, crash telemetry, versioned storage codec
- **Tooling:** TypeScript (strict) · Vitest · Bun

## 📂 Project Structure
```
src/
├── pages/            # Landing, Auth, Dashboard, Vault, Professor, Practice,
│                     # Examiner, Recall, Mistake Bank, Map, Planner, GPA Lab, Insights…
├── components/       # AppShell, recovery UIs, brand system, shadcn/ui primitives
├── convex/           # Zero-trust backend: security, aiEngine, learning, examiner,
│                     # circuitBreaker, aiSanitize, telemetry + adversarial test suites
├── lib/              # Motion language, spectrum engine, global error handler,
│                     # crash telemetry, storage codec, route circuit breaker
└── index.css         # Dual-mode design tokens, aurora field, glass containment
bob_sessions/         # IBM Bob development session logs (verification evidence)
```

## 🚦 Run it
```bash
bun install
bun run dev        # Vite dev server (Convex dev runs in the platform sandbox)
bun test           # 256 tests / 25 files
bun tsc -b --noEmit
```

---

## 🧪 Honest-AI commitments
1. Never fabricate exam frequency or predict what will appear — priority is labelled as modelled where it is modelled.
2. Never show fake success: failed ingests, failed analyses and failed generations surface as explicit, classified errors.
3. Marks are provisional rubric marks, clearly labelled; they are never presented as official university grades.
4. Telemetry contains no personal content — fingerprints are one-way hashes, stacks never leave the console.

---

*KNOW → UNDERSTAND → ACT → MASTER → ADVANCE*
