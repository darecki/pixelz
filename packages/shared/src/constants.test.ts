import { describe, it, expect } from "vitest";
import {
  DAILY_PIXELZ_BOARD_HEIGHT,
  DAILY_PIXELZ_BOARD_NUM_COLORS,
  DAILY_PIXELZ_BOARD_WIDTH,
  GAME,
  computeScore,
  computePixelzScore,
  getDailyPixelzBoardId,
  getDailyPixelzBoardSpec,
  isReleasedDailyPixelzBoardId,
  isPixelzBoardId,
  isDailyPixelzBoardId,
  isPredefinedPixelzLevel,
  isUtcDateKey,
  parseDailyPixelzBoardDateKey,
  PIXELZ_LEVEL_IDS,
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
  toUtcDateKey,
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
  it("always returns 0 as score is no longer computed", () => {
    expect(computePixelzScore(0, 0)).toBe(0);
    expect(computePixelzScore(1, 0)).toBe(0);
    expect(computePixelzScore(0, 100)).toBe(0);
    expect(computePixelzScore(2, 50)).toBe(0);
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

describe("daily Pixelz boards", () => {
  it("builds a stable daily board id from the UTC date", () => {
    expect(getDailyPixelzBoardId(new Date("2026-03-26T23:30:00-05:00"))).toBe("pixelz_daily_2026-03-27");
    expect(toUtcDateKey(new Date("2026-03-26T00:30:00+02:00"))).toBe("2026-03-25");
  });

  it("recognizes and parses daily board ids", () => {
    expect(isDailyPixelzBoardId("pixelz_daily_2026-03-26")).toBe(true);
    expect(parseDailyPixelzBoardDateKey("pixelz_daily_2026-03-26")).toBe("2026-03-26");
    expect(isDailyPixelzBoardId("pixelz_daily_bad")).toBe(false);
    expect(isDailyPixelzBoardId("pixelz_daily_9999-99-99")).toBe(false);
    expect(isUtcDateKey("2026-03-26")).toBe(true);
    expect(isUtcDateKey("9999-99-99")).toBe(false);
  });

  it("derives a deterministic daily board spec", () => {
    expect(getDailyPixelzBoardSpec("pixelz_daily_2026-03-26")).toEqual({
      boardId: "pixelz_daily_2026-03-26",
      dateKey: "2026-03-26",
      width: DAILY_PIXELZ_BOARD_WIDTH,
      height: DAILY_PIXELZ_BOARD_HEIGHT,
      numColors: DAILY_PIXELZ_BOARD_NUM_COLORS,
      seed: "pixelz-daily:2026-03-26",
    });
  });

  it("rejects malformed daily board spec inputs instead of deriving nested prefixes", () => {
    expect(() => getDailyPixelzBoardSpec("pixelz_daily_bad")).toThrow(/Invalid daily Pixelz board input/);
  });

  it("treats only today and earlier daily boards as released", () => {
    const now = new Date("2026-03-26T12:00:00Z");
    expect(isReleasedDailyPixelzBoardId("pixelz_daily_2026-03-26", now)).toBe(true);
    expect(isReleasedDailyPixelzBoardId("pixelz_daily_2026-03-25", now)).toBe(true);
    expect(isReleasedDailyPixelzBoardId("pixelz_daily_2026-03-27", now)).toBe(false);
  });
});

describe("REFLEX_LEVELS", () => {
  it("has expected level ids", () => {
    expect(REFLEX_LEVEL_IDS).toContain("reflex_level_1");
    expect(REFLEX_LEVELS.reflex_level_1).toBe(10);
  });
});
