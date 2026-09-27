# KYNEX — Pitch Deck Script (12 slides)

> **Narrative arc in one line:** *Students don't need another AI chatbot — they need an operating system that knows what they practiced and tells them the one next move that matters.*
>
> Every slide below is annotated with **[Goal]** and **[Say]** so the presenter never reads the slide verbatim. Slides carry ≤ 20 words each; the story lives in the speaker notes.

---

## Slide 1 — Title
**On slide:** `KYNEX` · *The Academic Intelligence OS* · team + hackathon badge
**[Goal]** 5 seconds, zero text-reading.
**[Say]** "Six tools, zero answers. We built the seventh thing — the one that connects them."

## Slide 2 — The Problem
**On slide:**
- 6 disconnected tools per student
- Generic AI **hallucinates** — can't see *your* syllabus
- Nobody answers: *"what do I do next?"*
**[Goal]** Make the judge feel the daily friction.
**[Say]** "A PDF reader here, a flashcard app there, a chatbot that invents facts. None of them know what the student actually practiced yesterday. Effort without direction."

## Slide 3 — The Insight
**On slide:** `Evidence beats intuition.`
**[Goal]** The one-line thesis the whole demo hangs on.
**[Say]** "Every click a student makes is evidence. KYNEX is the first system where that evidence — not a syllabus, not a guess — decides what happens next."

## Slide 4 — The Cognitive Loop
**On slide:** `KNOW → UNDERSTAND → ACT → MASTER → ADVANCE` (circular diagram, one keyword per stage)
**[Goal]** Architecture in one picture.
**[Say]** "Ingestion feeds the tutor, the tutor feeds practice, practice feeds mastery analytics, analytics feeds planning — and the loop closes by picking tomorrow's highest-impact target. One loop, five stages, zero dead ends."

## Slide 5 — KNOW: The Vault
**On slide:**
- PDF · URL · YouTube · text → structured concepts
- Sanitized, SSRF-guarded, **honest failure states**
**[Goal]** Prove ingestion is production-grade, not a toy.
**[Say]** "Every document is normalized and perturbation-shielded before it touches the database. And when a PDF fails? The student gets a precise reason — never a fake success."

## Slide 6 — UNDERSTAND: The Socratic AI Professor
**On slide:**
- Grounded in **your** Vault — no invented facts
- Withholds answers until you attempt (Socratic / Feynman modes)
- Out-of-scope gate fires **before** the model is called
**[Goal]** The hallucination story — the #1 judge skepticism — killed in 30 seconds.
**[Say]** "The professor can only teach from the student's own material. A deterministic gate rejects off-scope questions *before* we spend a token. When evidence doesn't exist, KYNEX says so."

## Slide 7 — ACT: Leitner-X Recall + Adaptive Practice
**On slide:**
- Per-card ease · interval · lapse — **all math server-side**
- Difficulty adapts to real mastery evidence
**[Goal]** Show depth of the scheduling engine, not "flashcards."
**[Say]** "This is a spaced-repetition engine with per-card state, computed entirely server-side — the client can't cheat its streak, and neither can the developer."

## Slide 8 — MASTER: Exam Radar + Mistake Bank
**On slide:**
- 5-way autopsy: conceptual · calculation · careless · misread · time
- A mistake is only *closed* by later evidence
**[Goal]** Differentiator: mistakes as first-class data.
**[Say]** "Most apps log a wrong answer and move on. KYNEX autopsies it, tracks it, and refuses to mark it resolved until the student proves it in later practice."

## Slide 9 — ADVANCE: Twin, GPA Lab & NEXT MOVE
**On slide:**
- 8-dimension mastery profile · confidence calibration
- Credit-weighted GPA projections & feasibility math
- **One** recommended next mission — always
**[Goal]** Land the outcome promise.
**[Say]** "The Twin shows eight dimensions, never one vanity number. GPA Lab runs real feasibility math. And every session ends the same way: a single, evidence-backed next move."

## Slide 10 — Zero-Trust Security
**On slide:**
- Identity resolved **server-side** · every row re-verified
- Adversarial cross-tenant suite runs **continuously**
- Circuit breakers · fail-closed quotas · append-only audit
**[Goal]** Trust signal for enterprise judges.
**[Say]** "A caller can't pass another user's id anywhere — we re-verify ownership on every read and write, and we wrote a test suite whose only job is to try to break that. It fails the build the day we get sloppy."

## Slide 11 — Scale & Polish
**On slide:**
- **33 suites · 325 automated tests** — green
- **10 languages**, native RTL typography
- 5 UI styles × 4 generational personas
**[Goal]** Breadth + engineering rigor in one glance.
**[Say]** "This isn't a demo-day prototype. Ten languages with structural RTL, five design systems that switch at runtime, and 325 tests standing guard over all of it."

## Slide 12 — Close
**On slide:** `KYNEX: stop guessing what to study.` · live-demo QR · team
**[Goal]** One sentence to remember, one action to take.
**[Say]** "Every other tool asks students what they want to learn. KYNEX is the first one that actually knows. Stop guessing what to study — scan the code, and let the evidence decide."

---

### Delivery rules (hackathon-specific)
1. **20-second rule:** no slide survives > 20s except 6 and 10 (your two technical differentiators).
2. **Demo beats:** after slide 6, cut to the live app for ≤ 45s total — Vault → Professor → Twin. Pre-load data; never ingest live on stage Wi-Fi.
3. **Never claim:** "AGI," "guaranteed grades," or features not in this deck — judges penalize overclaiming harder than missing features.
4. **If time-boxed to 3 minutes:** slides 2, 4, 6, 10, 12 only.
