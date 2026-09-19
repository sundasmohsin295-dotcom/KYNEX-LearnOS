/**
 * KYNEX Zero-Crash Architecture (§2) — global error capture.
 *
 * Web equivalent of `Thread.setDefaultUncaughtExceptionHandler`:
 *  - `window.addEventListener("error")` + `"unhandledrejection"` capture
 *    fatal errors and async promise rejections that escape React boundaries.
 *  - Every event gets a short correlation ID (KX-XXXX) for support and a
 *    secret-safe in-memory ring-buffer entry (message capped, no stacks,
 *    no storage) — the recovery screen subscribes to it instead of the app
 *    force-closing with a raw system error.
 *
 * Security posture: raw stacks never render to the user — only the
 * correlation ID and a human-readable message. Stacks stay in console.
 */

export interface CrashLogEntry {
  id: string; // correlation id, e.g. "KX-8F21"
  kind: "error" | "rejection";
  message: string;
  at: number;
}

type Listener = (entry: CrashLogEntry) => void;

const MAX_LOG = 20;
const MAX_MESSAGE = 300;

const log: CrashLogEntry[] = [];
const listeners = new Set<Listener>();
let sequence = 0;
let installed = false;

/** Short human-friendly correlation id: KX-8F21 */
function nextCorrelationId(): string {
  sequence += 1;
  const suffix = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `KX-${suffix}${sequence > 1 ? `.${sequence}` : ""}`;
}

/** JSON stringify that cannot throw on circular structures. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, MAX_MESSAGE) ?? "Unknown error";
  } catch {
    return "Unserializable error payload";
  }
}

/** Cap message length; never store or render full stacks. */
export function safeCrashMessage(raw: unknown): string {
  const s =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : raw == null
          ? ""
          : safeStringify(raw);
  const trimmed = (s || "Unknown error").trim();
  return trimmed.length > MAX_MESSAGE ? `${trimmed.slice(0, MAX_MESSAGE)}…` : trimmed;
}

function push(entry: CrashLogEntry): void {
  log.push(entry);
  if (log.length > MAX_LOG) log.shift();
  console.error(`[${entry.id}] ${entry.kind}:`, entry.message);
  for (const l of listeners) {
    try {
      l(entry);
    } catch {
      // A throwing listener must never break the handler.
    }
  }
}

function handleErrorEvent(event: ErrorEvent): void {
  push({
    id: nextCorrelationId(),
    kind: "error",
    message: safeCrashMessage(
      event.error instanceof Error
        ? event.error
        : (event.message || "Unknown window error"),
    ),
    at: Date.now(),
  });
}

function handleRejectionEvent(event: PromiseRejectionEvent): void {
  event.preventDefault?.();
  push({
    id: nextCorrelationId(),
    kind: "rejection",
    message: safeCrashMessage(event.reason),
    at: Date.now(),
  });
}

/**
 * Install the global handlers once at boot. Idempotent; safe under React
 * StrictMode double-mount. Returns an uninstaller (used by tests).
 */
export function installGlobalErrorHandlers(): () => void {
  if (installed) return () => {};
  installed = true;
  window.addEventListener("error", handleErrorEvent);
  window.addEventListener("unhandledrejection", handleRejectionEvent);
  return () => {
    window.removeEventListener("error", handleErrorEvent);
    window.removeEventListener("unhandledrejection", handleRejectionEvent);
    listeners.clear();
    installed = false;
  };
}

/** Subscribe to new crash events (the recovery screen uses this). */
export function subscribeToCrashes(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Recent crash entries, newest last. In-memory only — never persisted. */
export function recentCrashes(): readonly CrashLogEntry[] {
  return log;
}

/** Manual capture for caught-but-notable errors (keeps one log shape). */
export function reportCrash(raw: unknown, kind: CrashLogEntry["kind"] = "error"): CrashLogEntry {
  const entry: CrashLogEntry = {
    id: nextCorrelationId(),
    kind,
    message: safeCrashMessage(raw),
    at: Date.now(),
  };
  push(entry);
  return entry;
}
