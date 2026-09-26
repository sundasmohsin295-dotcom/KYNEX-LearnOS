# IBM Bob Development Session Logs — Project KYNEX

This folder is the **mandatory verification evidence** for the IBM Bob 2.0 Hackathon
submission (`ibm-hackathon-lablab`). It contains consolidated engineering session
logs covering the major architectural iterations of Project KYNEX.

## What these logs are (and are not)

- **They are:** structured per-session records — objective, diagnostics, changes,
  and verification — for each major build/recovery/polish cycle, written from the
  development timeline of this repository.
- **They are not:** raw screenshots or vendor transcript exports. Every concrete
  claim is instead backed by something re-runnable in this repo: a test suite, a
  typecheck, or a file you can open.

## Session index

| Session | Log | Focus |
| --- | --- | --- |
| 01 | [`session-01-core-os-build.md`](./session-01-core-os-build.md) | Product build: the KNOW → UNDERSTAND → ACT → MASTER → ADVANCE loop and the academic modules (Twin, Vault, Professor, Mastery, Exam Radar, Recall). |
| 02 | [`session-02-white-screen-recovery.md`](./session-02-white-screen-recovery.md) | White-screen emergency recovery: error boundaries, route circuit breakers, crash telemetry, versioned storage codec, chaos tests. |
| 03 | [`session-03-security-hardening.md`](./session-03-security-hardening.md) | Zero-trust hardening: server-side identity re-verification, AI Perturbation Shield, circuit breakers, quota fail-closed, adversarial test suites. |
| 04 | [`session-04-dual-mode-design-system.md`](./session-04-dual-mode-design-system.md) | Dual-mode design system: paper-white light mode, zero-FOUC theme bootstrap, auth revolution, typography triad enforcement. |

## Re-run the verification evidence

All claims in the logs resolve to these commands, run from the repository root:

```bash
bun install          # restore dependencies
bun tsc -b --noEmit  # strict TypeScript, project-wide — expected: clean
bun test             # 25 test files / 256 tests — expected: all passing
```

Adversarial suites referenced in the logs (all included in `bun test`):

| Suite | File | Proves |
| --- | --- | --- |
| Cross-user attacks | `src/convex/crossUserAttacks.test.ts` | IDOR / cross-user leakage neutralized |
| AI context isolation | `src/convex/aiContextIsolation.test.ts` | Material grounding cannot be cross-contaminated |
| Perturbation shield | `src/convex/perturbationShieldE2E.test.ts`, `src/convex/aiSanitize.test.ts` | NFKC / zero-width / bidi / frame-marker neutralization |
| Chaos boundaries | `src/chaosBoundaries.test.tsx`, `src/lib/chaosResilience.test.ts` | Malformed storage, rejections and faults cannot white-screen the app |
| Global error handler | `src/lib/globalErrorHandler.test.ts` | Crash capture cannot itself crash; stacks never leak |
| Referral exploit | `src/convex/referralExploit.test.ts` | Reward ledger cannot be self-referred or replayed |
| Deletion integrity | `src/convex/deletionIntegrity.test.ts` | Cascades leave no orphaned personal evidence |
