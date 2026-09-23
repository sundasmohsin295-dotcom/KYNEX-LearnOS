import { describe, expect, it } from "vitest";
import {
  all,
  andThen,
  err,
  isErr,
  isOk,
  isKynexError,
  kynexError,
  map,
  mapErr,
  ok,
  toKynexError,
  tryCatch,
  tryCatchAsync,
  unwrapOr,
  type KynexError,
  type Result,
} from "./result";

describe("result module", () => {
  it("ok/err construct the two branches and type guards agree", () => {
    const good: Result<number, KynexError> = ok(4);
    const bad: Result<number, KynexError> = err(kynexError("validation", "bad input"));

    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (good.ok) expect(good.value).toBe(4);
    if (!bad.ok) expect(bad.error.message).toBe("bad input");
  });

  it("map transforms only the success branch", () => {
    const good = map(ok(2), (n) => n * 10);
    const bad = map(err(kynexError("network", "down")), (n: number) => n * 10);

    expect(good).toEqual({ ok: true, value: 20 });
    expect(bad.ok).toBe(false);
  });

  it("mapErr reclassifies errors without touching success", () => {
    const reclassified = mapErr(err(kynexError("unknown", "boom")), (e) => ({
      ...e,
      kind: "database" as const,
    }));
    expect(reclassified.ok).toBe(false);
    if (!reclassified.ok) expect(reclassified.error.kind).toBe("database");

    const untouched = mapErr(ok(1), () => kynexError("database", "never"));
    expect(untouched).toEqual({ ok: true, value: 1 });
  });

  it("andThen short-circuits on failure", () => {
    const pipeline = andThen(ok(5), (n) => ok(n * 2));
    expect(pipeline).toEqual({ ok: true, value: 10 });

    const shortCircuit = andThen(
      err(kynexError("validation", "nope")),
      (n: number) => ok(n * 2),
    );
    expect(shortCircuit.ok).toBe(false);
  });

  it("unwrapOr returns the fallback on error", () => {
    expect(unwrapOr(ok(1), 99)).toBe(1);
    expect(unwrapOr(err(kynexError("unknown", "x")), 99)).toBe(99);
  });

  it("tryCatch captures sync throws as typed errors", () => {
    const good = tryCatch(() => 42);
    expect(good).toEqual({ ok: true, value: 42 });

    const bad = tryCatch(
      () => {
        throw new Error("parse failed");
      },
      "validation",
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.kind).toBe("validation");
      expect(bad.error.message).toBe("parse failed");
      expect(bad.error.retryable).toBe(false);
    }
  });

  it("tryCatchAsync captures rejections — offline network drops become typed errors", async () => {
    const good = await tryCatchAsync(async () => "data");
    expect(good).toEqual({ ok: true, value: "data" });

    const bad = await tryCatchAsync(
      async () => {
        throw new Error("ETIMEDOUT: connection timed out");
      },
      "network",
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.kind).toBe("network");
      expect(bad.error.retryable).toBe(true); // timeout classification
    }
  });

  it("toKynexError preserves safe short messages and caps hostile ones", () => {
    const fromError = toKynexError(new Error("Provider 401: credential rejected"));
    expect(fromError.kind).toBe("unknown");
    expect(fromError.message).toBe("Provider 401: credential rejected");
    expect(isKynexError(fromError)).toBe(true);

    const fromCircular: { loop?: unknown } = {};
    fromCircular.loop = fromCircular;
    const hostile = toKynexError(fromCircular);
    expect(hostile.message).toBe("Something went wrong.");

    const fromString = toKynexError("just a string");
    expect(fromString.message).toBe("just a string");

    // A KynexError passed through stays intact (no re-wrapping).
    const existing = kynexError("ai", "grounding failure", { retryable: false });
    expect(toKynexError(existing)).toBe(existing);
  });

  it("retryable detection matches transient network vocabulary", () => {
    expect(toKynexError(new Error("503 Service Unavailable")).retryable).toBe(true);
    expect(toKynexError(new Error("429 rate limit")).retryable).toBe(true);
    expect(toKynexError(new Error("invalid syntax")).retryable).toBe(false);
  });

  it("all collects successes and fails fast on the first error", () => {
    const good = all([ok(1), ok(2), ok(3)]);
    expect(good).toEqual({ ok: true, value: [1, 2, 3] });

    const bad = all([ok(1), err(kynexError("database", "write failed")), ok(3)]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe("database");
  });

  it("long messages are capped at 300 chars", () => {
    const long = toKynexError(new Error("x".repeat(1000)));
    expect(long.message.length).toBeLessThanOrEqual(300);
  });
});
