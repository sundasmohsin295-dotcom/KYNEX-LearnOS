import { useEffect, useState } from "react";

/**
 * KYNEX anti-freeze utilities (§3): debounce any fast-changing value before
 * it triggers background work (server queries, heavy computation).
 * Default 300ms matches the directive's strict debounce requirement.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    // Cleanup on value change/unmount — no duplicate timers, no leaks.
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
