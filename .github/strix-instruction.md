# KYNEX Strix Mission Brief

You are conducting an **authorized internal security assessment** of KYNEX, an
AI academic platform (React + Vite SPA, Convex backend, Bun toolchain).

## Scope

- Target: the repository checkout provided (and only it).
- Test only what you can reach from this sandbox. Never pivot to external
  hosts, production Convex deployments, or third-party services.

## Credentials policy

- Run unauthenticated. Use no real user accounts, no live sessions, no
  production data. If a check requires authentication you cannot obtain in the
  sandbox, record it as "requires authenticated re-test" and move on.

## Priority checks (in order)

1. **Multi-tenant isolation (IDOR)**: every Convex query/mutation must resolve
   the caller from the server session (`getAuthUserId`) and re-verify record
   ownership (`userId` equality) before any read or write. Flag any handler
   that trusts a client-supplied ID for authorization decisions.
2. **Access-denial telemetry**: foreign-object access must be denied AND logged
   (`logAccessDenied`), not silently swallowed.
3. **RAG / prompt-injection boundary**: uploaded study materials are untrusted
   data blocks. Verify ingestion paths apply NFKC normalization and
   zero-width/bidi stripping before text reaches the Professor engine, and that
   AI output is schema-validated before persistence.
4. **Wallet protection**: AI provider calls must be gated by rate limits and
   fail-closed daily quotas (`enforceRateLimit`, `consumeDailyAiQuota`), with
   provider credentials only in server-side `process.env`, never in client
   bundles.
5. **Client surface**: no secrets in the SPA bundle; auth flows keep protected
   routes behind the server session, not client state.

## Report expectations

For each finding: concrete PoC, affected file/function, severity, and a
suggested minimal patch. If you find nothing in a category, say so explicitly
rather than padding with speculative findings.
