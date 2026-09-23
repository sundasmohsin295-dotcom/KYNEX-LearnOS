import { describe, expect, it } from "vitest";
import {
  isFiniteNumber,
  isNonEmptyString,
  isStringArrayOfLength,
  mapWithConcurrency,
  runPipeline,
  stage,
  type Stage,
} from "./pipeline";
import { kynexError, ok, err, type Result } from "./result";

describe("runPipeline", () => {
  it("runs stages in order and exposes all outputs", async () => {
    const stages: Stage<unknown>[] = [
      stage({
        name: "extract",
        run: () => ok("raw text"),
        validate: isNonEmptyString,
      }),
      stage({
        name: "count",
        run: ({ outputs }) => ok((outputs.extract as string).length),
        validate: isFiniteNumber,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(8);
      expect(result.value.outputs.extract).toBe("raw text");
      expect(result.value.outputs.count).toBe(8);
    }
  });

  it("short-circuits on the first failing stage with its exact error", async () => {
    let laterStageRan = false;
    const stages: Stage<unknown>[] = [
      stage({
        name: "fail",
        run: () => err(kynexError("validation", "input rejected")),
        validate: isNonEmptyString,
      }),
      stage({
        name: "never",
        run: () => {
          laterStageRan = true;
          return ok("x");
        },
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(false);
    expect(laterStageRan).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.message).toBe("input rejected");
    }
  });

  it("rejects stage output that fails validation — no silent pass-through", async () => {
    const stages: Stage<unknown>[] = [
      stage({
        name: "bad",
        run: () => ok("") as Result<string>, // empty string fails isNonEmptyString
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.message).toContain("invalid data");
    }
  });

  it("captures thrown errors inside a stage as typed errors", async () => {
    const stages: Stage<unknown>[] = [
      stage({
        name: "boom",
        run: async () => {
          throw new Error("ECONNRESET socket hang up");
        },
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network"); // classified from vocabulary
      expect(result.error.retryable).toBe(true);
    }
  });

  it("enforces the per-stage timeout", async () => {
    const stages: Stage<unknown>[] = [
      stage({
        name: "slow",
        timeoutMs: 50,
        run: () =>
          new Promise<Result<string>>((resolve) =>
            setTimeout(() => resolve(ok("late")), 500),
          ),
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network"); // timeout → classified retryable network failure
      expect(result.error.message).toContain("timed out");
    }
  });

  it("retries only retryable failures and succeeds on a later attempt", async () => {
    let attempts = 0;
    const stages: Stage<unknown>[] = [
      stage({
        name: "flaky",
        maxAttempts: 3,
        run: () => {
          attempts++;
          if (attempts < 3) {
            return Promise.resolve(err(kynexError("network", "503 unavailable", { retryable: true })));
          }
          return Promise.resolve(ok("recovered"));
        },
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it("does NOT retry non-retryable (validation/credential) failures", async () => {
    let attempts = 0;
    const stages: Stage<unknown>[] = [
      stage({
        name: "hard-fail",
        maxAttempts: 3,
        run: () => {
          attempts++;
          return Promise.resolve(err(kynexError("validation", "rejected")));
        },
        validate: isNonEmptyString,
      }),
    ];

    const result = await runPipeline(stages);
    expect(result.ok).toBe(false);
    expect(attempts).toBe(1);
  });

  it("respects external cancellation", async () => {
    const controller = new AbortController();
    const stages: Stage<unknown>[] = [
      stage({
        name: "first",
        run: () => ok("one"),
        validate: isNonEmptyString,
      }),
      stage({
        name: "second",
        run: () => ok("two"),
        validate: isNonEmptyString,
      }),
    ];

    controller.abort();
    const result = await runPipeline(stages, { signal: controller.signal });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("cancelled");
  });
});

describe("mapWithConcurrency", () => {
  it("processes all items and preserves input order", async () => {
    const outcome = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => ok(n * 10));
    expect(outcome.okCount).toBe(5);
    expect(outcome.errCount).toBe(0);
    expect(outcome.results.map((r) => (r.ok ? r.value : -1))).toEqual([10, 20, 30, 40, 50]);
  });

  it("one failing item does not cancel the others (batch semantics)", async () => {
    const outcome = await mapWithConcurrency([1, 2, 3], 2, async (n) =>
      n === 2 ? err(kynexError("database", "item 2 failed")) : ok(n),
    );
    expect(outcome.okCount).toBe(2);
    expect(outcome.errCount).toBe(1);
    expect(outcome.results[0]).toEqual({ ok: true, value: 1 });
    expect(outcome.results[1].ok).toBe(false);
    expect(outcome.results[2]).toEqual({ ok: true, value: 3 });
  });

  it("captures throws inside the worker — the scheduler never rejects", async () => {
    const outcome = await mapWithConcurrency(["a"], 1, async (item) => {
      if (item === "a") throw new Error("worker exploded");
      return ok(item);
    });
    expect(outcome.errCount).toBe(1);
    expect(outcome.results[0].ok).toBe(false);
  });

  it("never exceeds the concurrency limit", async () => {
    let current = 0;
    let peak = 0;
    const outcome = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
      current++;
      peak = Math.max(peak, current);
      await new Promise((r) => setTimeout(r, 5));
      current--;
      return ok(n);
    });
    expect(outcome.okCount).toBe(8);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty batch without hanging", async () => {
    const outcome = await mapWithConcurrency([], 4, async (n: never) => ok(n));
    expect(outcome.okCount).toBe(0);
    expect(outcome.errCount).toBe(0);
  });
});

describe("validators", () => {
  it("isNonEmptyString rejects empty and non-strings", () => {
    expect(isNonEmptyString("hello")).toBe(true);
    expect(isNonEmptyString("  ")).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it("isStringArrayOfLength enforces item validity and cap", () => {
    const v = isStringArrayOfLength(3);
    expect(v(["a", "b"])).toBe(true);
    expect(v(["a", "", "b"])).toBe(false);
    expect(v(["a", "b", "c", "d"])).toBe(false);
    expect(v("not-array")).toBe(false);
  });

  it("isFiniteNumber rejects NaN and Infinity", () => {
    expect(isFiniteNumber(1.5)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber("1")).toBe(false);
  });
});
