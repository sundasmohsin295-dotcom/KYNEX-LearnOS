import { useCallback, useEffect, useRef, useState } from "react";
import {
  decodeStored,
  encodeStored,
  readWithFallback,
  writeWithFallback,
  type DecodeOptions,
} from "./storageCodec";

/**
 * KYNEX Resilient State Hydration (§2) — persistent UI preference hook.
 *
 * Upgrades over the naive hook:
 *  - Versioned payloads ({ v, p } envelope) with per-key migrations, so a
 *    schema change can never throw during hydration — stale payloads
 *    migrate or reset to the safe default.
 *  - Quota/blocked-storage degradation: writes coalesce (min 150ms) and fall
 *    back to an in-memory mirror; the UI keeps working and the value stays
 *    session-coherent even when localStorage is full or unavailable.
 *  - Corrupted payloads (malformed JSON, wrong shape) resolve to the
 *    default — never an unhandled parse exception during initial render.
 */

/** Coalesce window for storage writes (ms). High-frequency mutations like
 *  quiz progress collapse into one setItem per window. */
const WRITE_COALESCE_MS = 150;

interface PendingWrite {
  value: string;
  timer: ReturnType<typeof setTimeout> | null;
}
const pendingWrites = new Map<string, PendingWrite>();
let flushListenerInstalled = false;

function flushPendingWrite(key: string): void {
  const pending = pendingWrites.get(key);
  if (!pending) return;
  if (pending.timer !== null) clearTimeout(pending.timer);
  pendingWrites.delete(key);
  writeWithFallback(key, pending.value);
}

/** Page-hide flush: a tab closed inside the coalesce window must not lose
 *  the last write. Installed once, idempotent, listener is passive. */
function installPageHideFlush(): void {
  if (flushListenerInstalled) return;
  flushListenerInstalled = true;
  const flushAll = () => {
    for (const key of [...pendingWrites.keys()]) flushPendingWrite(key);
  };
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

export interface UseLocalStorageStateOptions<T> {
  /**
   * Migrate a payload written by an older storage version to the current
   * shape. Return the migrated value, or null/undefined to force a safe
   * reset to `initial`.
   */
  migrate?: (payload: unknown, fromVersion: number) => T | null | undefined;
}

export function useLocalStorageState<T extends string | boolean | number>(
  key: string,
  initial: T,
  options?: UseLocalStorageStateOptions<T>,
): [T, (v: T) => void] {
  const decodeOptions: DecodeOptions<T> = {
    fallback: initial,
    migrate: options?.migrate,
  };

  const [value, setValue] = useState<T>(() => {
    try {
      return decodeStored(readWithFallback(key), decodeOptions);
    } catch {
      // Absolute last resort — decodeStored itself never throws, but a
      // hostile storage getter must not take down the mount either.
      return initial;
    }
  });

  const latest = useRef(value);
  latest.current = value;

  const set = useCallback(
    (v: T) => {
      setValue(v);
      const encoded = encodeStored(v);
      // Memory mirror is synchronous: any reader mounting inside the
      // coalesce window still sees the fresh value.
      const pending = pendingWrites.get(key);
      if (pending?.timer !== null && pending) {
        clearTimeout(pending.timer);
      }
      const timer =
        typeof setTimeout === "function"
          ? setTimeout(() => {
              const entry = pendingWrites.get(key);
              pendingWrites.delete(key);
              if (entry) writeWithFallback(key, entry.value);
            }, WRITE_COALESCE_MS)
          : null;
      pendingWrites.set(key, { value: encoded, timer });
      installPageHideFlush();
    },
    [key],
  );

  // Unmount flush: keep persistence prompt without leaking timers.
  useEffect(() => {
    return () => {
      const pending = pendingWrites.get(key);
      if (pending) flushPendingWrite(key);
    };
  }, [key]);

  return [value, set];
}
