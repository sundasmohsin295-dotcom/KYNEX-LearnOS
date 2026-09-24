# KYNEX Security: Strix Autonomous Pentesting Integration

KYNEX runs the open-source [Strix](https://github.com/usestrix/strix) AI
pentesting agent continuously against its own codebase. Strix validates
findings with real proofs-of-concept inside a Docker sandbox, so the report
contains confirmed vulnerabilities with PoCs, not static-analysis noise.

**Authorized use only.** Strix actively attacks whatever you point it at.
Every configuration in this repo targets only the KYNEX checkout itself.
Never aim these scans at systems you do not own or lack written permission
to test.

## What runs, where

| Surface | File | Behavior |
| --- | --- | --- |
| CI gate | `.github/workflows/security-gate.yml` | On every pull request: diff-scoped `quick` Strix scan + static hygiene (typecheck, tests, lint). Nightly 03:00 UTC full sweep via `schedule`. Merge-blocking: mark the `strix-pentest` job a required status check. |
| Agent mission brief | `.github/strix-instruction.md` | Scope rules, credentials policy, and KYNEX-specific priority checks (IDOR/tenant isolation, denial telemetry, RAG injection boundary, wallet protection, client secret exposure). |
| Local runs | `scripts/strix-local.sh` | Same scan as CI from your machine: `bash scripts/strix-local.sh` (quick) or `bash scripts/strix-local.sh deep`. Requires Docker running. |
| Scan reports | `strix_runs/` | Written per run; gitignored. CI uploads them as workflow artifacts (30-day retention). `strix view` opens the local dashboard. |

## Secrets and configuration

- `STRIX_LLM` — provider/model routing string (e.g. `anthropic/claude-sonnet-4-6`).
- `LLM_API_KEY` — API key for that provider.
- Set both as **GitHub Actions repository secrets** for CI; export them
  locally or let Strix persist them in `~/.strix/cli-config.json`.
- Optional: `LLM_API_BASE` for local models (Ollama/LM Studio).
- No LLM key ever reaches the KYNEX client bundle; these are CI/operator
  secrets only. CI runs with `permissions: contents: read` and the scan step
  caps spend with `--max-budget 10` (USD, whole scan).

## Exit codes and merge blocking

Headless Strix (`-n`) exits:

- `0` — scan completed, no vulnerabilities found
- `1` — fatal error (missing credentials, Docker unavailable, config error)
- `2` — vulnerabilities found

Both non-zero codes fail the workflow, so a required-check rule blocks the
merge. The report artifact and `strix view` dashboard carry the details.

## Think–plan–act–observe remediation loop

1. **Think/plan** — Strix maps the changed attack surface (PR diff scope in CI)
   and decomposes the mission brief into agent tasks.
2. **Act** — agents execute recon and exploit attempts inside the sandbox;
   multi-agent coordination chains findings across surfaces (e.g. IDOR probe
   → privilege escalation attempt).
3. **Observe** — each finding ships with a working PoC, affected file,
   severity, and suggested minimal patch.
4. **Fix** — map each finding to a KYNEX patch, add/extend a regression test
   (the `src/convex/*.test.ts` suites already include adversarial
   `crossUserAttacks`, `aiContextIsolation`, and `securityQuota` cases), and
   rerun `bash scripts/strix-local.sh` to confirm the PoC no longer
   reproduces before pushing.

## Baseline guarantees under continuous test

- Every Convex query/mutation resolves the caller server-side and re-verifies
  record ownership; foreign access is denied **and logged**.
- Uploaded study material is untrusted data: NFKC normalization +
  zero-width/bidi stripping before the Professor engine, schema-validated AI
  output before persistence, provider calls behind rate limits and fail-closed
  daily quotas.
- Zero secrets in client bundles; provider credentials only reach
  server-side `process.env` inside Convex actions.
