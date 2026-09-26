# Session 02 — White-Screen Emergency Recovery & Render Stability Protocol

**Objective:** Diagnose and permanently eliminate client-side white-screen
crashes; enforce bulletproof error boundaries, robust mounting checks, and
zero-latency reactive rendering.

## Diagnostics performed

- Audited `ReactDOM.createRoot` mounting: `src/main.tsx` null-checks `#root`
  before mounting and renders a visible boot-failure diagnostic instead of a
  blank page if the mount node is missing.
- Audited every route: all views are lazy-loaded and wrapped in
  `<Suspense>`; the router has an explicit `*` fallback (`src/pages/NotFound.tsx`)
  so invalid URL states resolve safely instead of throwing.
- Audited all storage hooks: `src/lib/useLocalStorageState.ts` +
  `src/lib/storageCodec.ts` handle corrupted JSON payloads (safe-parse with
  version-tagged schema), quota-exceeded writes (non-blocking fallback), and
  never throw during initial render.
- Verified defensive defaults (`?? []`, `?? {}`) across `.map()` renders of
  reactive Convex queries.

## Changes shipped

1. **RootErrorBoundary** (`src/main.tsx`) — a fatal render error swaps the app
   for `src/components/SystemRecoveryScreen.tsx`: correlation ID + safe message
   only; raw stacks never render to the user.
2. **RouteErrorBoundary + route circuit breakers** (`src/lib/routeCircuitBreaker.ts`)
   — a crash in one lazy route no longer traps the shell; if the same route
   crashes twice within a 60-second window, the breaker trips and
   `src/components/DegradedRoute.tsx` renders an isolated container with a
   "Reload Module" action instead of crash-looping.
3. **Crash fingerprinting & batched telemetry** (`src/lib/crashTelemetry.ts`,
   `src/convex/telemetry.ts`) — one-way FNV-1a fingerprints (message + scope +
   component-stack head) merge recurring crashes into count-batched server
   samples; a telemetry failure can never surface or break the app.
4. **Global error handlers** (`src/lib/globalErrorHandler.ts`) — window errors
   and unhandled promise rejections are captured before first render; messages
   are capped and never include stacks.
5. **Suspense fallback with layout stability** — themed route loading state;
   skeletons lock bounding boxes to avoid CLS on hydration.

## Verification

- `bun tsc -b --noEmit` — clean.
- `bun test` includes the chaos suites written for this protocol:
  - `src/chaosBoundaries.test.tsx` — malformed JSON in storage, unhandled
    rejections and throwing components cannot white-screen the tree; recovery
    fallbacks render correctly.
  - `src/lib/chaosResilience.test.ts` — codec/storage failure paths fail
    silently and gracefully.
  - `src/lib/globalErrorHandler.test.ts` — oversized/circular/undefined error
    payloads are neutralized; a throwing telemetry listener cannot break the
    fan-out.
- Bundle hygiene: Vite manual-chunk splitting verified in `vite.config.ts`
  (react-vendor / convex-vendor / radix-ui / framer-motion / charts) so a
  corrupt cache rebuild cannot take the shell down with it.
