// @vitest-environment jsdom
/**
 * KYNEX Chaos Engineering Suite (§4) — automated fault injection for the
 * recovery states.
 *
 * Injected faults:
 *  - malformed/corrupted localStorage payloads (garbage JSON, hostile shapes)
 *  - storage quota exceeded / blocked storage (private mode) under a
 *    high-frequency mutation burst
 *  - telemetry send failures (simulated network outage)
 *  - rapid repeated route crashes (circuit-breaker trip + auto-close)
 *  - unhandled promise rejections
 *
 * Every fault must resolve to a safe fallback — never an unhandled
 * exception, never a crash of the test subject itself.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  decodeStored,
  encodeStored,
  readWithFallback,
  writeWithFallback,
  STORAGE_VERSION,
} from "./storageCodec";
import { useLocalStorageState } from "./useLocalStorageState";
import {
  CrashAggregator,
  fingerprintCrash,
  installCrashTelemetry,
  getAggregator,
} from "./crashTelemetry";
import {
  installGlobalErrorHandlers,
  recentCrashes,
  type CrashLogEntry,
} from "./globalErrorHandler";
import {
  RouteBreakerRegistry,
  routeKeyFromPathname,
  BREAKER_THRESHOLD,
} from "./routeCircuitBreaker";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let handlerUninstall: (() => void) | null = null;

/**
 * Replace window.localStorage wholesale for a test. jsdom 30's Storage
 * internals resist method-level spies; chaos tests must control the real
 * code path, so the storage itself is swapped. Returns a restore function.
 */
function swapStorage(fake: Partial<Storage>): () => void {
  const original = window.localStorage;
  Object.defineProperty(window, "localStorage", {
    value: fake,
    configurable: true,
    writable: false,
  });
  return () => {
    Object.defineProperty(window, "localStorage", {
      value: original,
      configurable: true,
      writable: false,
    });
  };
}

beforeEach(() => {
  window.localStorage.clear();
  handlerUninstall = installGlobalErrorHandlers();
});

afterEach(() => {
  handlerUninstall?.();
  handlerUninstall = null;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// §2 — corrupted / hostile storage payloads
// ---------------------------------------------------------------------------

describe("chaos: corrupted storage payloads resolve to safe defaults", () => {
  const fallback = "safe";

  test("garbage JSON (not parseable) resets to fallback", () => {
    expect(decodeStored("{!!!not json", { fallback })).toBe(fallback);
    expect(decodeStored("<html>injected</html>", { fallback })).toBe(fallback);
    expect(decodeStored("\u0000\u0001binary", { fallback })).toBe(fallback);
  });

  test("hostile payload shapes never reach the component", () => {
    // Objects are not valid for primitive prefs — including crafted ones.
    expect(decodeStored('{"v":1,"p":{"__proto__":{}}}', { fallback })).toBe(fallback);
    expect(decodeStored('[1,2,3]', { fallback })).toBe(fallback);
    expect(decodeStored("null", { fallback })).toBe(fallback);
    // Type mismatch inside a valid envelope (number payload, string default).
    expect(decodeStored('{"v":1,"p":42}', { fallback })).toBe(fallback);
  });

  test("legacy pre-envelope payloads still load (no silent data loss)", () => {
    expect(decodeStored('"kept"', { fallback })).toBe("kept");
    expect(decodeStored("true", { fallback: false })).toBe(true);
    expect(decodeStored("7", { fallback: 0 })).toBe(7);
  });

  test("stale envelope versions migrate; unknown future versions reset", () => {
    const migrated = decodeStored('{"v":0,"p":"old-shape"}', {
      fallback,
      migrate: (p) => `migrated:${String(p)}`,
    });
    expect(migrated).toBe("migrated:old-shape");

    // No migration provided → safe reset, never a throw.
    expect(decodeStored('{"v":0,"p":"old-shape"}', { fallback })).toBe(fallback);
    // Envelope from a "newer" build than this code → reset.
    expect(
      decodeStored(`{"v":${STORAGE_VERSION + 5},"p":"future"}`, { fallback }),
    ).toBe(fallback);
  });

  test("round-trip through the versioned envelope", () => {
    const raw = encodeStored("current");
    expect(JSON.parse(raw)).toEqual({ v: STORAGE_VERSION, p: "current" });
    expect(decodeStored(raw, { fallback })).toBe("current");
  });
});

// ---------------------------------------------------------------------------
// §2 — quota exceeded / blocked storage under high-frequency bursts
// ---------------------------------------------------------------------------

describe("chaos: quota exceeded and blocked storage degrade silently", () => {
  test("writeWithFallback reports memory_only and the session stays coherent", () => {
    const restore = swapStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      },
    });

    const outcome = writeWithFallback("kx-chaotest-key", encodeStored("persist-me"));
    expect(outcome).toBe("memory_only");

    // Read falls back to the in-memory mirror — value survives the fault.
    expect(readWithFallback("kx-chaotest-key")).toBe(encodeStored("persist-me"));
    restore();
  });

  test("normal writes persist", () => {
    const outcome = writeWithFallback("kx-chaotest-ok", encodeStored("fine"));
    expect(outcome).toBe("persisted");
    expect(readWithFallback("kx-chaotest-ok")).toBe(encodeStored("fine"));
  });

  test("50-set mutation burst coalesces into ONE storage write and never throws", () => {
    const written: string[] = [];
    const restore = swapStorage({
      getItem: () => null,
      setItem: (k, v) => {
        written.push(`${k}=${v}`);
      },
    });
    const { result, unmount } = renderHook(() =>
      useLocalStorageState<string>("kx-chaos-burst", "a"),
    );

    act(() => {
      for (let i = 0; i < 50; i++) {
        result.current[1](`v${i}`);
      }
    });

    // High-frequency mutations are coalesced — nothing hits storage yet.
    expect(written.length).toBe(0);

    // Unmount flushes the coalesced write exactly once, with the LATEST value.
    unmount();
    expect(written).toEqual([`kx-chaos-burst=${encodeStored("v49")}`]);
    restore();
  });

  test("blocked storage + burst keeps the hook session-coherent", () => {
    const restore = swapStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    const { result, unmount } = renderHook(() =>
      useLocalStorageState<string>("kx-chaos-blocked", "init"),
    );
    expect(() => {
      act(() => {
        for (let i = 0; i < 20; i++) result.current[1](`burst-${i}`);
      });
    }).not.toThrow();
    expect(result.current[0]).toBe("burst-19");
    unmount();

    // A fresh mount reads the in-memory mirror: no state regression, no throw.
    const again = renderHook(() => useLocalStorageState("kx-chaos-blocked", "init"));
    expect(again.result.current[0]).toBe("burst-19");
    again.unmount();
    restore();
  });

  test("a hostile localStorage.getItem cannot break hook mount", () => {
    const restore = swapStorage({
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {},
    });
    const { result } = renderHook(() => useLocalStorageState("kx-hostile-read", "safe"));
    expect(result.current[0]).toBe("safe");
    restore();
  });
});

// ---------------------------------------------------------------------------
// §1 — crash fingerprinting + aggregation (flooding defense)
// ---------------------------------------------------------------------------

describe("chaos: crash telemetry merges floods into bounded batches", () => {
  test("identical fingerprints merge into ONE mutable counted sample", () => {
    let at = 1_000;
    const agg = new CrashAggregator({ send: () => {}, now: () => at });

    const a = agg.capture({ kind: "error", message: "boom", route: "/twin" });
    at += 400;
    agg.capture({ kind: "error", message: "boom", route: "/twin" });
    at += 400;
    const c = agg.capture({ kind: "error", message: "boom", route: "/twin" });

    // Same fingerprint → one map entry mutated in place. The flushed batch
    // carries count: 3 for this fingerprint.
    expect(a.count).toBe(3);
    expect(c).toBe(a);
    expect(a.lastAt).toBe(1_800);
    expect(a.firstAt).toBe(1_000);
    agg.dispose();
  });

  test("different component stacks produce different fingerprints", () => {
    const fp1 = fingerprintCrash({
      kind: "error",
      message: "boom",
      scope: "RouteErrorBoundary:/twin",
      componentStack: "\n    at Boom (twin.tsx:1:1)\n    at Shell",
    });
    const fp2 = fingerprintCrash({
      kind: "error",
      message: "boom",
      scope: "RouteErrorBoundary:/twin",
      componentStack: "\n    at Chart (insights.tsx:9:9)\n    at Shell",
    });
    expect(fp1).not.toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{8}$/);
    // Same input is stable.
    expect(fp1).toBe(
      fingerprintCrash({
        kind: "error",
        message: "boom",
        scope: "RouteErrorBoundary:/twin",
        componentStack: "\n    at Boom (twin.tsx:1:1)\n    at Shell",
      }),
    );
  });

  test("a failing (network-down) sender is swallowed and never crashes the caller", async () => {
    const agg = new CrashAggregator({
      send: () => {
        throw new Error("ENETDOWN: simulated outage");
      },
      now: () => 1,
    });
    agg.capture({ kind: "rejection", message: "offline", route: "/" });

    await expect(agg.flush()).resolves.toBeUndefined();
    // Batch was consumed despite the failed send (bounded, drop-on-fail).
    await expect(agg.flush()).resolves.toBeUndefined();
    agg.dispose();
  });

  test("batch auto-flushes at maxSamples and delivers counts", async () => {
    const batches: Awaited<ReturnType<typeof Object>>[] = [];
    const sent: { count: number; message: string }[][] = [];
    const agg = new CrashAggregator({
      send: async (samples) => {
        sent.push(samples.map((s) => ({ count: s.count, message: s.message })));
      },
      now: () => 1,
      maxSamples: 2,
    });

    agg.capture({ kind: "error", message: "one", route: "/" });
    agg.capture({ kind: "error", message: "two", route: "/" }); // hits cap → flush
    await vi.waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].map((s) => s.message).sort()).toEqual(["one", "two"]);
    expect(sent[0].every((s) => s.count === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §1 — telemetry wiring end-to-end through the global handlers
// ---------------------------------------------------------------------------

describe("chaos: installed telemetry captures real window faults", () => {
  test("window error + unhandled rejection are aggregated and flushed", async () => {
    const sent: { kind: string; message: string }[][] = [];
    const uninstall = installCrashTelemetry((samples) => {
      sent.push(samples.map((s) => ({ kind: s.kind, message: s.message })));
    });

    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom-telemetry", error: new Error("boom-telemetry") }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("async fault"),
        cancelable: true,
      }),
    );

    await getAggregator()!.flush();
    expect(sent.length).toBe(1);
    const messages = sent[0].map((s) => s.message).sort();
    expect(messages).toEqual(["async fault", "boom-telemetry"]);
    expect(sent[0].every((s) => s.kind === "error" || s.kind === "rejection")).toBe(true);

    uninstall();
    expect(getAggregator()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §1 — route circuit breaker trip / auto-close / isolation
// ---------------------------------------------------------------------------

describe("chaos: route breaker trips on repeat crashes and self-heals", () => {
  test("single crash does NOT trip; threshold crash trips", () => {
    let at = 0;
    const breaker = new RouteBreakerRegistry({ now: () => at });

    expect(breaker.recordCrash("/twin")).toBe(false);
    expect(breaker.isTripped("/twin")).toBe(false);
    expect(breaker.recordCrash("/twin")).toBe(true);
    expect(breaker.isTripped("/twin")).toBe(true);
    expect(BREAKER_THRESHOLD).toBe(2);
  });

  test("crashes older than the 60s window auto-close the breaker", () => {
    let at = 0;
    const breaker = new RouteBreakerRegistry({ now: () => at });

    breaker.recordCrash("/twin");
    at += 10_000;
    expect(breaker.recordCrash("/twin")).toBe(true);
    expect(breaker.isTripped("/twin")).toBe(true);

    at += 61_000; // both crashes now outside the window
    expect(breaker.isTripped("/twin")).toBe(false);
    // Re-arms cleanly: a fresh single crash must not immediately re-trip.
    expect(breaker.recordCrash("/twin")).toBe(false);
  });

  test("breakers are isolated per route", () => {
    const breaker = new RouteBreakerRegistry({ now: () => 0 });
    breaker.recordCrash("/twin");
    breaker.recordCrash("/twin");
    expect(breaker.isTripped("/twin")).toBe(true);
    expect(breaker.isTripped("/insights")).toBe(false);
    expect(breaker.isTripped("/graph")).toBe(false);
  });

  test("reset (Reload Module) re-arms the route", () => {
    const breaker = new RouteBreakerRegistry({ now: () => 0 });
    breaker.recordCrash("/twin");
    breaker.recordCrash("/twin");
    expect(breaker.isTripped("/twin")).toBe(true);

    breaker.reset("/twin");
    expect(breaker.isTripped("/twin")).toBe(false);
    expect(breaker.recordCrash("/twin")).toBe(false);
  });

  test("parameterized paths collapse to one route key", () => {
    expect(routeKeyFromPathname("/material/abc123")).toBe("/material");
    expect(routeKeyFromPathname("/practice/kx-987")).toBe("/practice");
    expect(routeKeyFromPathname("/")).toBe("/");
    expect(routeKeyFromPathname("/twin")).toBe("/twin");
  });
});

// ---------------------------------------------------------------------------
// §4 — unhandled rejection capture (async chaos)
// ---------------------------------------------------------------------------

describe("chaos: unhandled rejections are captured, not lost", () => {
  test("a rejection event lands in the crash ring with its message", () => {
    const entries: CrashLogEntry[] = [];
    const off = (() => {
      // subscribe via a report to keep the module surface identical to app use
      return () => {};
    })();
    void off;

    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("async fault"),
        cancelable: true,
      }),
    );
    const last = recentCrashes()[recentCrashes().length - 1];
    expect(last.kind).toBe("rejection");
    expect(last.message).toBe("async fault");
    expect(last.id).toMatch(/^KX-/);
  });
});
