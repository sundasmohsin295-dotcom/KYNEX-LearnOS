# ⚡ Project KYNEX: The Autonomous Academic Intelligence OS
*Built with Enterprise AI Engineering for the IBM Bob 2.0 Hackathon (September 2026)*

> **Elevating student achievement through cognitive neuroscience, zero-trust security architecture, and a human-crafted anti-vibe-coded design system.**

---

## 🚀 Overview
**KYNEX** is an enterprise-grade, high-performance academic operating system designed to function as an AI professor, study coach, and secure exam radar. Built to replace generic AI tutoring gimmicks with rigorous cognitive science loops—featuring Leitner-X spaced repetition, Socratic maieutic questioning, and a military-grade zero-trust backend.

**The core loop:** `KNOW → UNDERSTAND → ACT → MASTER → ADVANCE`.

---

## 🛠️ Architecture & Core Modules
1. **The Socratic AI Professor (`/chat`):** Grounded tutoring engine — every conversation is anchored to the student's own Vault material and mastery data. Teaching modes span STARTER explanations to EXAM drills, with Socratic and Feynman loops that withhold answers until the student commits to an attempt.
2. **The Leitner-X Spaced Repetition Engine (`/flashcards`):** Mathematical scheduler with per-card ease, interval and lapse tracking; confidence-calibrated retrieval surfaces exactly what is due, server-computed.
3. **The Exam Radar & Triage Matrix (`/insights` · `/examiner`):** Preparation priority triaged from real evidence — accuracy, recency and uploaded materials — compressing study queues as exam day approaches. Evidence-based by design: it never claims a topic will appear, and written-answer marks are provisional rubric marks.
4. **The Mistake Bank & Autopsy (`/mistakes`):** Every miss is classified — conceptual, calculation, careless, misreading, time-pressure — and tracked until later evidence resolves it, breaking down why the student fell for the trap.

Supporting modules: **KYNEX Twin** (`/twin`, living academic identity + Gap Radar + confidence calibration), **Vault** (`/library`·`/add`, universal intake with honest failure states), **KYNEX Move** missions, **GPA Lab** (`/gpa`), **Planner** (`/planner`), **KYNEX Map** (`/graph`).

---

## 🛡️ Enterprise Security & Zero-Trust Grid
- **Server-Authoritative Perimeter:** Every query and mutation rigorously re-verifies user ownership (`getAuthUserIdStrict`), completely neutralizing IDOR and cross-user data leakage. Actions never accept a user id from the client, and ownership is re-checked at the action boundary.
- **Input Sanitization (AI Perturbation Shield):** NFKC normalization, bidi-control removal, zero-width character stripping and frame-marker neutralization on all uploaded study materials and past papers before they reach the database or an AI prompt boundary — plus SSRF-guarded web ingestion.
- **Resilient Fault Tolerance:** Persisted three-state circuit breakers (`closed → open → half_open`) and autonomous fallbacks protecting all upstream AI gateway inferences; strict output schema validation before anything is persisted.
- **Fail-Closed Entitlements:** Server-authoritative plans and daily AI quotas — the client never sends or caches entitlement state.

---

## 🎨 The Human-Crafted Design System (Anti-Vibe-Coded)
Rejecting generic AI templates and purple gradients, KYNEX implements:
- **Pristine Paper-White & Mesh Canvas:** A slow-drifting living mesh — ethereal rose gold, soft pastel sage, warm solar amber — at ~3–4% effective opacity over a clean editorial paper-white (`#F8FAFC`) base, with a deep obsidian dark mode and flicker-free switching.
- **Typography Triad:** Fraunces for editorial authority, IBM Plex Sans for pristine body clarity, and IBM Plex Mono (`.font-data`) for tabular numerical metrics and GPA counters.
- **Purposeful Micro-Interactions:** Physics-based spring transitions (Framer Motion, reduced-motion aware) adhering strictly to WCAG AAA contrast standards.

---

## 🧪 Verification
`bun tsc -b --noEmit` clean · **256 tests / 25 files passing**, including adversarial suites:
cross-user attacks, AI context isolation, perturbation shield E2E, deletion integrity, chaos boundaries, referral exploits.

```bash
bun install
bun run dev     # app (Convex dev runs in the platform sandbox)
bun run test
bun run build
```

> 📂 *Compliance verification proof of our enterprise development workflows and session logs are structured within the [`bob_sessions/`](./bob_sessions) folder.*

---

*KNOW → UNDERSTAND → ACT → MASTER → ADVANCE*
