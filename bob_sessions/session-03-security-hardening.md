# Session 03 — Zero-Trust Security Hardening & AI Perturbation Shield

**Objective:** Neutralize IDOR and cross-user data leakage, harden every AI
prompt boundary against adversarial input, and make all AI gateway paths
fail-closed and observable.

## Zero-trust perimeter

- **Single trusted identity source** — `src/convex/securityGet.ts` exposes one
  `getAuthUserId`-backed query. Actions resolve identity only through it and
  never accept a user id from the client.
- **Ownership re-verification at action boundaries** — even though queries are
  already user-scoped, `src/convex/aiEngine.ts` re-checks material/conversation/
  attempt ownership inside the action layer (defense in depth).
- **Strict schema validation** — `src/convex/schema.ts` ships with
  `schemaValidation: true`; every write is validated against declared field
  validators, neutralizing mass assignment.
- **Fail-closed entitlements** — plans and daily AI quotas live server-side
  (`src/convex/security.ts`); the client never sends or caches entitlement
  state. Denial-of-wallet protection via `aiUsageDaily` day-key counters.

## AI Perturbation Shield

`src/convex/aiSanitize.ts` — every byte of untrusted text (pasted material,
extracted web/URL content, legacy chunks) passes through before storage or any
AI prompt boundary:

1. NFKC normalization — fullwidth/homoglyph lookalikes collapse to canonical forms.
2. Bidi control removal (RLO/LRO/isolates/marks) — no deceptive rendering order.
3. Invisible-char removal — zero-width, soft hyphen, variation selectors, tag
   characters: kills token smuggling.
4. Control-char stripping — C0 controls except `\n`/`\t`; CRLF → LF.
5. Frame-marker neutralization — runs of `<<<`/`>>>` collapse so content can
   never forge the `UNTRUSTED_*` structural-isolation markers.
6. Length caps enforced **after** stripping so padding cannot inflate size.

Web ingests add an SSRF guard: allowlisted schemes, DNS-based private-address
validation, per-hop redirect re-validation, response size caps, and transient-only
retry with honored `Retry-After`.

## Resilient fault tolerance

- **Three-state circuit breaker** (`src/convex/circuitBreaker.ts`) — persisted
  in `aiCircuitBreaker` so the gate is real across isolates and restarts:
  `closed → (3 consecutive failures) → open → (60s cooldown) → half_open →
  success → closed`. The health probe (`src/convex/aiStatus.ts`) is deliberately
  independent of the breaker so it can observe the provider's true state while
  the circuit is open.
- **Structured-output validation before persistence** — quiz/analysis/examiner
  outputs are schema-checked; failures are recorded as QC events and surfaced
  as classified errors, never rendered as success.
- **Client-side rate limiting for AI ops** — server-enforced fixed-window
  `rateLimits` table keyed by (user, operation).

## Verification

- `bun tsc -b --noEmit` — clean.
- `bun test` adversarial suites for this session:
  - `src/convex/crossUserAttacks.test.ts` — forged ownership, id substitution
    and cross-user reads are all rejected.
  - `src/convex/aiContextIsolation.test.ts` — material grounding cannot leak
    across users or conversations.
  - `src/convex/perturbationShieldE2E.test.ts` + `src/convex/aiSanitize.test.ts`
    — injection payloads, lookalikes and smuggled markers are neutralized
    end-to-end.
  - `src/convex/referralExploit.test.ts` — reward ledger cannot be self-referred
    or replayed.
  - `src/convex/deletionIntegrity.test.ts` — cascades leave no orphaned
    personal evidence.
- `SECURITY.md` documents the disclosure posture for judges.
