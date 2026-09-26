# Session 01 — Core OS Build: KNOW → UNDERSTAND → ACT → MASTER → ADVANCE

**Objective:** Ship the KYNEX product itself — not a chatbot wrapper. A complete
academic operating system where every module reads from one academic model.

## Build order and outcomes

1. **Universal intake (KYNEX Vault).** `/add` accepts URLs, YouTube links, pasted
   text and files, with an explicit processing pipeline
   (Receiving → Reading → Understanding → Structuring → Ready) and honest error
   states — a failed ingest is never rendered as success.
   - Backend: `src/convex/aiEngine.ts` (`ingestUrl` with SSRF guard, bounded
     retries, redirect re-validation), `src/convex/materials.ts`.
2. **Deep chapter analysis engine.** Every material gets a structured analysis:
   simple/deep explanations, ranked concepts, definitions, formulas, examples,
   real-world applications, prerequisites, common mistakes and misconceptions,
   concept relationships, cause-effect, apply-targets, and examiner questions.
   Importance/difficulty ranking is derived from content evidence — exam
   frequency is never invented.
3. **KYNEX Professor (AI chat).** `src/pages/Chat.tsx` — conversations grounded
   in Vault material with modes from STARTER to EXAM depth, Socratic and Feynman
   loops, quiz-me flows. History lives in Convex; ownership is re-verified at
   the action boundary (`src/convex/aiEngine.ts` `chat` action).
4. **Mastery engine + missions.** `src/convex/learning.ts`,
   `src/convex/missions.ts`, `src/convex/missionMath.ts` — per-concept mastery
   updates from every answer; Missions auto-target weak concepts
   (≥ 85% with repeated evidence = mastered; < 60% = weak).
5. **Recall (Leitner-X spaced repetition).** `src/pages/Flashcards.tsx`,
   `src/convex/learning.ts` — per-card ease/interval/lapse scheduling with a
   server-computed due queue surfaced in the sidebar.
6. **Exam Radar & Examiner.** `src/pages/ExaminerPage.tsx`,
   `src/convex/examiner.ts`, `src/convex/readiness.ts` — preparation priority
   from accuracy/recency/materials, provisional rubric marking for written
   answers (never presented as official grades).
7. **Twin, GPA Lab, Mistake Bank, Knowledge Map, Planner, Insights.** The
   identity surface (`src/pages/Twin.tsx`), what-if grade math
   (`src/convex/gpaMath.ts`), classified mistake tracking until resolved by
   later evidence, and the planner/insights views over the same data.

## Product decisions locked in this session

- One Next Move at a time, with the evidence shown — never a generic to-do list.
- The Professor teaches one concept at a time and withholds answers until the
  student commits to an attempt.
- Modelled/estimated numbers are always labelled as modelled.

## Verification

- `bun tsc -b --noEmit` — clean.
- `bun test` — full suite passing, including `src/convex/tutorScope.test.ts`
  (Professor grounding cannot escape its material scope).
