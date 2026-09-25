/**
 * KYNEX Resilient State Hydration (§2) — versioned storage codec.
 *
 * Every persisted payload is wrapped in a versioned envelope:
 *   { v: <schema version>, p: <payload> }
 *
 * When the app schema evolves, `decodeStored` routes stale payloads through a
 * caller-provided migration, or resets to the safe default when no migration
 * exists. Legacy payloads written by earlier hook versions (bare JSON, no
 * envelope) are recognized and still load — user preferences must never
 * vanish because the storage format matured.
 *
 * QUOTA DEGRADATION: a module-level memory map mirrors every write. If
 * localStorage is unavailable or full (private mode, constrained webviews),
 * the memory mirror keeps the session coherent and the failure is silent —
 * a storage error can never freeze UI interaction.
 */

/** Bump when any persisted payload shape changes and add a migration. */
export const STORAGE_VERSION = 1;

export interface VersionedEnvelope<T> {
  v: number;
  p: T;
}

/** Legacy payloads (pre-envelope) are accepted when they structurally match
 *  the current default's primitive type — string | boolean | number prefs. */
type Primitive = string | boolean | number;

function isPrimitive(value: unknown): value is Primitive {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number";
}

export interface DecodeOptions<T> {
  /** Safe default when the payload is absent, corrupt, or unmigratable. */
  fallback: T;
  /**
   * Migrate a payload written by `fromVersion` to the current shape. Return
   * the migrated value, or null/undefined to force a safe default reset.
   */
  migrate?: (payload: unknown, fromVersion: number) => T | null | undefined;
}

/**
 * Decode a raw storage string into a current-version payload.
 * Never throws: any parse/validation failure resolves to the fallback.
 */
export function decodeStored<T extends Primitive>(
  raw: string | null,
  { fallback, migrate }: DecodeOptions<T>,
): T {
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback; // corrupted payload → safe default
  }

  // Current envelope: { v, p }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "v" in (parsed as Record<string, unknown>) &&
    "p" in (parsed as Record<string, unknown>)
  ) {
    const envelope = parsed as VersionedEnvelope<unknown>;
    if (envelope.v === STORAGE_VERSION) {
      return isPrimitive(envelope.p) && typeof envelope.p === typeof fallback
        ? (envelope.p as T)
        : fallback;
    }
    // Future envelope (app rolled forward past a newer beta) or stale one:
    // only payloads we can migrate are honored; everything else resets.
    if (envelope.v < STORAGE_VERSION && migrate) {
      const migrated = migrate(envelope.p, envelope.v);
      if (migrated != null) return migrated;
    }
    return fallback;
  }

  // Legacy bare payload: accept only if it structurally matches the default.
  if (isPrimitive(parsed) && typeof parsed === typeof fallback) {
    return parsed as T;
  }
  return fallback;
}

/** Encode a payload into the current-version envelope string. */
export function encodeStored<T>(value: T): string {
  const envelope: VersionedEnvelope<T> = { v: STORAGE_VERSION, p: value };
  return JSON.stringify(envelope);
}

// ---------------------------------------------------------------------------
// Memory mirror — the degraded-mode store when localStorage cannot serve.
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, string>();

export function memoryGet(key: string): string | null {
  return memoryStore.get(key) ?? null;
}

export function memorySet(key: string, value: string): void {
  try {
    memoryStore.set(key, value);
  } catch {
    /* an in-memory map cannot realistically throw; keep the write silent */
  }
}

/** True when a read should fall back to the in-memory mirror. */
export function readWithFallback(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memoryGet(key);
  } catch {
    return memoryGet(key); // storage blocked entirely (private mode)
  }
}

export type WriteOutcome = "persisted" | "memory_only";

/**
 * Write through localStorage with a guaranteed memory mirror. Returns how the
 * write landed so callers can expose honest degradation state if they wish.
 * Never throws: QuotaExceededError and SecurityError are swallowed by design.
 */
export function writeWithFallback(key: string, value: string): WriteOutcome {
  memorySet(key, value);
  try {
    window.localStorage.setItem(key, value);
    return "persisted";
  } catch {
    return "memory_only"; // quota exceeded / blocked: session stays coherent
  }
}
