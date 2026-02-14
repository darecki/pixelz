import { describe, it, expect } from "vitest";
import {
  GAME,
  computeScore,
  computePixelzScore,
  isPixelzBoardId,
  isPredefinedPixelzLevel,
  PIXELZ_LEVEL_IDS,
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
} from "./constants.js";

describe("computeScore", () => {
  it("returns 0 for minimal score", () => {
    expect(computeScore(0, 0)).toBe(GAME.SCORE_BASE);
  });

  it("clamps to MAX_SCORE", () => {
    expect(computeScore(0, 0)).toBeLessThanOrEqual(GAME.MAX_SCORE);
    expect(computeScore(0, 100_000_000)).toBe(0);
  });

  it("decreases with moves and time", () => {
    const a = computeScore(0, 0);
    const b = computeScore(1, 0);
    const c = computeScore(0, GAME.SCORE_TIME_PENALTY_MS);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(a);
  });
});

describe("computePixelzScore", () => {
  it("combines time and moves with penalty", () => {
    expect(computePixelzScore(0, 0)).toBe(0);
    expect(computePixelzScore(1, 0)).toBe(10_000);
    expect(computePixelzScore(0, 100)).toBe(100);
    expect(computePixelzScore(2, 50)).toBe(20_050);
  });
});

describe("isPixelzBoardId", () => {
  it("returns true for pixelz_ prefix", () => {
    expect(isPixelzBoardId("pixelz_foo")).toBe(true);
    expect(isPixelzBoardId("pixelz_level_1")).toBe(true);
  });

  it("returns false for others", () => {
    expect(isPixelzBoardId("reflex_level_1")).toBe(false);
    expect(isPixelzBoardId("")).toBe(false);
  });
});

describe("isPredefinedPixelzLevel", () => {
  it("returns true for PIXELZ_LEVEL_IDS", () => {
    for (const id of PIXELZ_LEVEL_IDS) {
      expect(isPredefinedPixelzLevel(id)).toBe(true);
    }
  });

  it("returns false for custom board ids", () => {
    expect(isPredefinedPixelzLevel("pixelz_abc123")).toBe(false);
    expect(isPredefinedPixelzLevel("reflex_level_1")).toBe(false);
  });
});

describe("REFLEX_LEVELS", () => {
  it("has expected level ids", () => {
    expect(REFLEX_LEVEL_IDS).toContain("reflex_level_1");
    expect(REFLEX_LEVELS.reflex_level_1).toBe(10);
  });
});
