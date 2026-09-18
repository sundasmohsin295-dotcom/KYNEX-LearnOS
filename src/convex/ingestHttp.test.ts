import { describe, expect, test } from "vitest";
import {
  ingestHttpError,
  parseRetryAfter,
  isTransientFetchStatus,
} from "./aiEngine";

/**
 * URL INGESTION HTTP TAXONOMY TESTS (Phase 7/8).
 * Guarantees: every failure class gets an honest, actionable message; 429
 * honors Retry-After; only transient statuses are retried; messages never
 * leak internals beyond the HTTP status code itself.
 */
describe("URL ingestion HTTP taxonomy", () => {
  test("429 honors Retry-After (seconds form)", () => {
    const msg = ingestHttpError(429, "30");
    expect(msg).toContain("429");
    expect(msg).toContain("30s");
    expect(msg).toContain("not analyzed");
  });

  test("429 without Retry-After still gives an honest state", () => {
    const msg = ingestHttpError(429, null);
    expect(msg).toContain("429");
    expect(msg).toContain("not analyzed");
  });

  test("403 suggests the paste fallback instead of pretending success", () => {
    expect(ingestHttpError(403, null)).toContain("past");
  });

  test("404 names the missing page", () => {
    expect(ingestHttpError(404, null)).toContain("404");
    expect(ingestHttpError(410, null)).toContain("404");
  });

  test("408 reports the timeout", () => {
    expect(ingestHttpError(408, null)).toContain("too long");
  });

  test("5xx reports server trouble and retryability", () => {
    expect(ingestHttpError(503, null)).toContain("Try again shortly");
    expect(ingestHttpError(500, null)).toContain("500");
  });

  test("other statuses keep a status-bearing message", () => {
    expect(ingestHttpError(418, null)).toContain("418");
  });

  test("parseRetryAfter: seconds form", () => {
    expect(parseRetryAfter("30", 1_000_000)).toBe(30);
  });

  test("parseRetryAfter: HTTP-date form", () => {
    const future = new Date(Date.now() + 45_000).toUTCString();
    const v = parseRetryAfter(future);
    expect(v).not.toBeNull();
    expect(v! as number).toBeLessThanOrEqual(45);
    expect(v! as number).toBeGreaterThan(0);
  });

  test("parseRetryAfter: null, junk, and cap behavior", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter("99999")).toBe(60); // capped at 60s
    expect(parseRetryAfter("0")).toBeNull(); // 0 → null → generic 429 msg
  });

  test("retry policy: only 429 and 5xx are transient", () => {
    expect(isTransientFetchStatus(429)).toBe(true);
    expect(isTransientFetchStatus(500)).toBe(true);
    expect(isTransientFetchStatus(503)).toBe(true);
    expect(isTransientFetchStatus(403)).toBe(false);
    expect(isTransientFetchStatus(404)).toBe(false);
    expect(isTransientFetchStatus(408)).toBe(false);
    expect(isTransientFetchStatus(200)).toBe(false);
  });
});
