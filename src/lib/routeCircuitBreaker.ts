/**
 * KYNEX Route Circuit Breaker (§1) — automatic degraded-mode fallback.
 *
 * One crash shows the normal recovery screen. Two crashes of the SAME route
 * within WINDOW_MS mean the module itself is broken — remounting it again
 * just traps the student in a crash loop. The breaker trips: the route
 * renders an isolated DegradedRoute container (shell intact) instead of the
 * crashing view until the window elapses, which acts as the automatic
 * half-open probe.
 *
 * State is in-memory by design: a restart of the tab re-attempts the module,
 * and the 60s window means a single transient fault never latches.
 */

export const BREAKER_WINDOW_MS = 60_000;
export const BREAKER_THRESHOLD = 2;

export interface RouteBreakerState {
  /** Crash timestamps inside the window, oldest first. */
  crashes: number[];
  trippedAt: number | null;
}

type Now = () => number;

export class RouteBreakerRegistry {
  private readonly states = new Map<string, RouteBreakerState>();
  private readonly now: Now;
  private readonly windowMs: number;
  private readonly threshold: number;

  constructor(opts?: {
    now?: Now;
    windowMs?: number;
    threshold?: number;
  }) {
    this.now = opts?.now ?? Date.now;
    this.windowMs = opts?.windowMs ?? BREAKER_WINDOW_MS;
    this.threshold = opts?.threshold ?? BREAKER_THRESHOLD;
  }

  private prune(state: RouteBreakerState): void {
    const cutoff = this.now() - this.windowMs;
    state.crashes = state.crashes.filter((at) => at > cutoff);
    // Auto-close: no fresh crashes inside the window → the breaker re-arms.
    if (state.crashes.length === 0) state.trippedAt = null;
  }

  /**
   * Record a crash for `routeKey`. Returns true if this crash TRIPPED the
   * breaker (i.e. it is now open and the route must render degraded).
   */
  recordCrash(routeKey: string): boolean {
    const state = this.states.get(routeKey) ?? { crashes: [], trippedAt: null };
    this.states.set(routeKey, state);
    this.prune(state);
    state.crashes.push(this.now());
    if (state.crashes.length >= this.threshold && state.trippedAt === null) {
      state.trippedAt = this.now();
      return true; // just tripped
    }
    return false;
  }

  /** True while the breaker is open for this route (degraded mode). */
  isTripped(routeKey: string): boolean {
    const state = this.states.get(routeKey);
    if (!state) return false;
    this.prune(state);
    return state.trippedAt !== null && state.crashes.length >= this.threshold;
  }

  /** Manual reset — the "Reload Module" action. */
  reset(routeKey: string): void {
    this.states.delete(routeKey);
  }

  /** Test introspection. */
  peek(routeKey: string): RouteBreakerState {
    const state = this.states.get(routeKey) ?? { crashes: [], trippedAt: null };
    this.prune(state);
    return state;
  }
}

/** App singleton. */
export const routeBreakers = new RouteBreakerRegistry();

/** Stable route key from a pathname — "/material/abc123" → "/material/:id".
 *  Parameterized route segments collapse so one dynamic page's crashes
 *  aggregate regardless of which entity was open. */
export function routeKeyFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments[0]}`;
}
