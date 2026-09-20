// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  installGlobalErrorHandlers,
  recentCrashes,
  reportCrash,
  safeCrashMessage,
  subscribeToCrashes,
  type CrashLogEntry,
} from "./globalErrorHandler";

describe("global error handler (zero-crash core)", () => {
  let uninstall: (() => void) | null = null;

  beforeEach(() => {
    uninstall = installGlobalErrorHandlers();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  test("install is idempotent under StrictMode double-mount", () => {
    const second = installGlobalErrorHandlers();
    // Second install is a no-op that returns a safe uninstaller.
    expect(typeof second).toBe("function");
    second();
  });

  test("uncaught window errors are captured with a KX correlation id", () => {
    const entries: CrashLogEntry[] = [];
    subscribeToCrashes((e) => entries.push(e));
    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom", error: new Error("boom") }),
    );
    expect(entries.length).toBe(1);
    expect(entries[0].id).toMatch(/^KX-[0-9A-F]{4}/);
    expect(entries[0].kind).toBe("error");
    expect(entries[0].message).toBe("boom");
  });

  test("unhandled rejections are captured and default prevented", () => {
    const entries: CrashLogEntry[] = [];
    subscribeToCrashes((e) => entries.push(e));
    const event = new PromiseRejectionEvent(
      "unhandledrejection",
      { promise: Promise.resolve(), reason: new Error("async failure"), cancelable: true },
    );
    window.dispatchEvent(event);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe("rejection");
    expect(entries[0].message).toBe("async failure");
    expect(event.defaultPrevented).toBe(true);
  });

  test("ring buffer never exceeds 20 entries", () => {
    for (let i = 0; i < 30; i++) reportCrash(`fault ${i}`);
    expect(recentCrashes().length).toBe(20);
    expect(recentCrashes()[recentCrashes().length - 1].message).toBe("fault 29");
  });

  test("messages are capped at 300 chars and never include stacks", () => {
    const long = "x".repeat(900);
    const entry = reportCrash(long);
    expect(entry.message.length).toBe(301); // 300 + ellipsis
    expect(entry.message.includes("at ")).toBe(false);
  });

  test("circular objects cannot break message serialization", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const entry = reportCrash(circular);
    expect(entry.message).toBe("Unserializable error payload");
  });

  test("a throwing listener cannot break the fan-out", () => {
    const seen: string[] = [];
    const off1 = subscribeToCrashes(() => {
      throw new Error("listener fault");
    });
    const off2 = subscribeToCrashes((e) => seen.push(e.id));
    reportCrash("after faulty listener");
    expect(seen.length).toBe(1);
    off1();
    off2();
  });

  test("uninstall removes listeners (no double capture)", () => {
    uninstall?.();
    uninstall = null;
    const before = recentCrashes().length;
    // Message-only event (no error payload) — jsdom re-raises real error
    // payloads as uncaught exceptions during dispatch.
    window.dispatchEvent(new ErrorEvent("error", { message: "post-uninstall" }));
    expect(recentCrashes().length).toBe(before);
  });
});

describe("safeCrashMessage", () => {
  test("handles Error, string, and exotic inputs", () => {
    expect(safeCrashMessage(new Error("explicit"))).toBe("explicit");
    expect(safeCrashMessage("plain")).toBe("plain");
    expect(safeCrashMessage(undefined)).toBe("Unknown error");
    expect(safeCrashMessage(null)).toBe("Unknown error");
    expect(safeCrashMessage({ code: 42 })).toContain("42");
  });
});
