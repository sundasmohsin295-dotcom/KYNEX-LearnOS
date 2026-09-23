import { useCallback, useState } from "react";

/**
 * Persistent UI preference backed by localStorage. Fail-safe: if storage is
 * unavailable (private mode, embedded webviews) the default is used and
 * writes are silently ignored, so a preference can never break a feature.
 */
export function useLocalStorageState<T extends string | boolean | number>(
  key: string,
  initial: T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable: preference stays session-only */
      }
    },
    [key],
  );

  return [value, set];
}
