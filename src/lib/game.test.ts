import { describe, expect, test } from "vitest";
import { IDENTITY_RANKS, identityRank, levelTitle } from "./game";

/**
 * Identity ranks must stay deterministic and honest: each rank is a pure
 * threshold mapping over the student's own measured stats. No cohort
 * comparisons ("top 10%") that KYNEX has no data to claim, and the fallback
 * rank must always exist for a brand-new account (0/0/0).
 */
describe("identityRank (deterministic, measured-only)", () => {
  test("a brand-new account lands on the fallback Foundation rank", () => {
    expect(identityRank({ accuracy: 0, mastered: 0, streak: 0 }).key).toBe("foundation");
  });

  test("thresholds gate in order: Builder → Sharpshooter → Topper Core", () => {
    expect(identityRank({ accuracy: 60, mastered: 1, streak: 0 }).key).toBe("builder");
    expect(identityRank({ accuracy: 59, mastered: 1, streak: 0 }).key).toBe("foundation");
    expect(identityRank({ accuracy: 75, mastered: 3, streak: 0 }).key).toBe("sharpshooter");
    expect(identityRank({ accuracy: 74, mastered: 3, streak: 9 }).key).toBe("builder");
    expect(identityRank({ accuracy: 85, mastered: 8, streak: 7 }).key).toBe("topper_core");
    expect(identityRank({ accuracy: 85, mastered: 8, streak: 6 }).key).toBe("sharpshooter");
    expect(identityRank({ accuracy: 100, mastered: 50, streak: 30 }).key).toBe("topper_core");
  });

  test("rank list is ordered from hardest to easiest with a fallback", () => {
    expect(IDENTITY_RANKS[0].key).toBe("topper_core");
    expect(IDENTITY_RANKS[IDENTITY_RANKS.length - 1].key).toBe("foundation");
    expect(IDENTITY_RANKS[IDENTITY_RANKS.length - 1].requires).toEqual({});
  });

  test("levelTitle clamps beyond the highest title without crashing", () => {
    expect(levelTitle(1)).toBe("Novice");
    expect(levelTitle(999)).toBe("Luminary");
  });
});
