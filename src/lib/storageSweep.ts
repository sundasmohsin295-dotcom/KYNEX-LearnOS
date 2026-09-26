/**
 * Corrupted-storage sweep (zero-crash hardening).
 *
 * When a fatal render error occurs, a corrupted persisted payload is one of
 * the plausible causes (a poisoned envelope re-parsed on every boot would
 * crash the same view repeatedly). This sweep inspects KYNEX-owned keys —
 * keys carrying the `kynex.` prefix plus the theme key owned by next-themes —
 * and removes any entry that fails strict JSON parsing or the versioned
 * envelope shape check. Values that parse fine are left untouched: the sweep
 * is surgical, never a blunt `localStorage.clear()` (which would nuke
 * unrelated keys and next-themes' own data on every crash).
 *
 * Safety: every access is try/catch wrapped (private mode, disabled storage),
 * and it only ever touches keys this app owns.
 */

/** KYNEX-owned storage keys: everything prefixed, plus the theme key. */
function isOwnedKey(key: string): boolean {
  return key.startsWith("kynex.") || key === "theme";
}

/** Keys written by the branded splash (pre-dates the kynex. prefix). */
const LEGACY_OWNED_KEYS = new Set(["kynex.splash.seen.v1"]);

/** Structural check mirroring storageCodec's envelope shape ({ v, p }). */
function looksVersioned(parsed: unknown): boolean {
  if (typeof parsed !== "object" || parsed === null) return false;
  const o = parsed as Record<string, unknown>;
  return typeof o.v === "number" && "p" in o;
}

export interface SweepResult {
  inspected: number;
  removed: string[];
}

/** Sweep KYNEX-owned localStorage entries; remove structurally-broken ones.
 *  Never throws. Safe to call from an error boundary path. */
export function sweepCorruptedStorage(): SweepResult {
  const result: SweepResult = { inspected: 0, removed: [] };
  try {
    if (typeof window === "undefined" || !window.localStorage) return result;
    const dead: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || (!isOwnedKey(key) && !LEGACY_OWNED_KEYS.has(key))) continue;
      result.inspected += 1;
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        continue; // unreadable — leave it; reads have their own fallbacks
      }
      if (raw === null) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        dead.push(key); // malformed JSON → poisoned payload
        continue;
      }
      // The splash flag is stored bare ("1"-style values are fine as strings);
      // KYNEX-prefixed data keys must carry the versioned envelope.
      if (!looksVersioned(parsed) && typeof parsed !== "string" && typeof parsed !== "boolean" && typeof parsed !== "number") {
        dead.push(key);
      }
    }
    for (const key of dead) {
      try {
        window.localStorage.removeItem(key);
        result.removed.push(key);
      } catch {
        // removal failed (quota/security) — nothing more we can do here
      }
    }
  } catch {
    // storage entirely unavailable — sweep is best-effort by contract
  }
  return result;
}
