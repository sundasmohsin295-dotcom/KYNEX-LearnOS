# KYNEX — Code Review Report (Convex + TypeScript)

> Scope: full `src/` tree (57 TS/TSX source files, 20 Convex backend modules), audited September 2026.
> Method: strict alias-resolved compilation audit (`tsconfig.audit.json`, `strict: true` → `noImplicitAny: true`), targeted grep surveys, and manual reading of representative call sites. No code was changed without a green re-verification (`tsc -p tsconfig.app.json --noEmit` + 33 files / 325 tests).

---

## Pillar 1 — Implicit `any` types: **PASS (0 findings)**

- Full-project strict audit with `@/*` path aliases resolved: **0 errors, 0 TS7006** across `src/`.
- Earlier session hardened the 13 sites where contextual typing could silently degrade if module resolution ever broke (e.g., a misconfigured CI or an isolated-file check):
  - `src/pages/Twin.tsx` (9 sites): dimension/gap/band/proveIt/memory callbacks now annotated with real server types imported from `@/convex/intel` (`MasterDimension`, `GapItem`, `CalibrationBand`, `ProveItRow`, `MemoryRow`, `BeatYouResult`) — not guessed shapes.
  - `src/pages/Writer.tsx` (4 sites): all `onChange` handlers explicitly typed (`React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>`).
  - `src/pages/Visualize.tsx`: clean, no changes needed.
- Policy: **no `any` was introduced anywhere**; `noImplicitAny` stays `true` (strict family on in both `tsconfig.app.json` and `tsconfig.node.json`).

## Pillar 2 — Unhandled error cases: **PASS (1 verified gap, 0 open)**

Verified during this review:

- **GPA course input validation** — dual-validated at the single source of truth: `src/convex/gpaMath.ts` exports `isValidGradePoint(value, scale)` and `isValidCreditHours(value)` (0.5–30); `gpa.ts` enforces them server-side, `GpaLab.tsx` mirrors them client-side with live scale bounds. A previously divergent client copy was eliminated.
- **HTTP 429 rate-limit path** — `ingestHttpError` classifies 429 as transient with `Retry-After` awareness; the client (`AddMaterial.tsx`) surfaces a distinct 12-second amber state instead of a generic failure.
- **AI credential absence** — the chat action captures `hasMaterial` before the model call and appends local-guidance fallback text on `ai_not_configured` / `ai_key_rejected`; the UI never dead-ends.
- **Empty/PDF password/broken-worker ingest paths** — typed errors (`FileReadError`, `FilePasswordError`, `FileEmptyError`) with precise user copy; the PDF worker source is version-pinned with a CDN fallback chain.

Pattern-level finding: Convex handlers consistently distinguish **"empty result for anonymous caller"** (`return []` / `return null` on `!userId` — read handlers) from **"action requires identity"** (`throw new Error("Not authenticated")` — mutation handlers, e.g. `profiles.setAcademicProfile`). This is deliberate and correct for this codebase's auth model; flagged here so reviewers don't mistake reads returning `[]` for swallowed errors.

## Pillar 3 — Server-side user validation & scoping: **PASS (49 equality checks verified)**

- **Identity resolution:** every Convex function resolves the caller via `getAuthUserId(ctx)` server-side. Two modules with abuse surface (`gamification.ts`, `referrals.ts`) use the throwing `getAuthUserIdStrict` wrapper; the remaining 18 modules follow the null-guard pattern above. Both patterns are equivalent for isolation because of the next point.
- **Row ownership re-verification:** 49 explicit `row.userId === caller` equality checks gate every read and write of tenant-owned rows; list queries additionally use `withIndex("by_user", q => q.eq("userId", caller))` (index usage confirmed in `account.ts` ×23, `intelligence.ts` ×28, `gamification.ts` ×15, `learning.ts` ×13, and others). Client-supplied ids are treated as references to *check*, never as identity.
- **Continuous adversarial proof:** `crossUserAttacks.test.ts` (16 tests) attempts cross-tenant reads, writes and deletes and expects every attempt to fail.
- **KYNEX-owned disclosure:** `getAuthUserIdStrict` is currently used by 2 modules and the other 18 use `getAuthUserId` + row equality. The README states this honestly rather than claiming a uniform strict wrapper everywhere. *Optional hardening (not a bug): migrate the remaining 18 modules to the strict wrapper for uniformity.*

## Pillar 4 — Performance bottlenecks: **PASS (2 findings, 0 open)**

- **Route-level code splitting:** 26 routes are lazy-loaded (`React.lazy`), keeping the first-paint bundle small; vendor chunking is configured in `vite.config.ts`.
- **Convex read patterns:** list handlers use compound/prefixed indexes (`by_user`, `by_user_and_material`, `by_user_and_status`) instead of full-table scans followed by client-side filtering (usage counts in Pillar 3). No `ctx.db.query(...).collect()` without an index was found on hot paths.
- **Reactive-subscription hygiene:** Convex queries are used as subscriptions directly; no duplicate server state was found mirrored into ad-hoc client stores.
- **Known accepted trade-offs (documented, not bugs):** the grading-scale string union and a few per-render memo candidates in `GpaLab.tsx` are computed cheaply enough that memoization would add noise; revisit only if profiling says otherwise.

---

## Verdict

| Pillar | Status | Findings requiring code change |
|---|---|---|
| Implicit `any` | ✅ PASS | 0 open (13 sites pre-hardened this cycle) |
| Error handling | ✅ PASS | 0 open |
| Server-side scoping | ✅ PASS | 0 open (1 optional uniformity hardening noted) |
| Performance | ✅ PASS | 0 open (2 documented trade-offs) |

**Zero critical issues. One optional hardening task** (uniform `getAuthUserIdStrict` adoption) is logged for post-hackathon hygiene.

*Verification at time of report: `bunx tsc -p tsconfig.app.json --noEmit` → exit 0; `bun run test` → 33 files / 325 tests, all passing.*
