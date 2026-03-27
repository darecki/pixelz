import { getDailyPixelzBoardSpec } from "@pixelz/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPixelzBoardSpec, validatePixelzCompletion } from "./pixelzValidation.js";

const { mockExecutor } = vi.hoisted(() => ({
  mockExecutor: vi.fn(),
}));

describe("getPixelzBoardSpec", () => {
  beforeEach(() => {
    mockExecutor.mockReset();
  });

  it("returns null when the board does not exist", async () => {
    mockExecutor.mockResolvedValue([]);
    await expect(getPixelzBoardSpec(mockExecutor as any, "missing")).resolves.toBeNull();
  });

  it("maps the board row into a shared board spec", async () => {
    mockExecutor.mockResolvedValue([{ width: 7, height: 10, num_colors: 5, seed: "level-1" }]);
    await expect(getPixelzBoardSpec(mockExecutor as any, "pixelz_level_1")).resolves.toEqual({
      width: 7,
      height: 10,
      numColors: 5,
      seed: "level-1",
    });
  });

  it("derives daily boards without hitting the database", async () => {
    const daily = getDailyPixelzBoardSpec("pixelz_daily_2026-03-26");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));
    await expect(getPixelzBoardSpec(mockExecutor as any, daily.boardId)).resolves.toEqual({
      width: daily.width,
      height: daily.height,
      numColors: daily.numColors,
      seed: daily.seed,
    });
    expect(mockExecutor).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("rejects unreleased daily boards without hitting the database", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));
    await expect(getPixelzBoardSpec(mockExecutor as any, "pixelz_daily_2026-03-27")).resolves.toBeNull();
    expect(mockExecutor).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("validatePixelzCompletion", () => {
  beforeEach(() => {
    mockExecutor.mockReset();
  });

  it("rejects a missing board", async () => {
    mockExecutor.mockResolvedValue([]);
    await expect(validatePixelzCompletion(mockExecutor as any, "missing", [1, 2, 3])).resolves.toEqual({
      valid: false,
      reason: "board_not_found",
    });
  });

  it("rejects an unsolved sequence", async () => {
    mockExecutor.mockResolvedValue([{ width: 7, height: 10, num_colors: 5, seed: "level-1" }]);
    await expect(validatePixelzCompletion(mockExecutor as any, "pixelz_level_1", [3])).resolves.toEqual({
      valid: false,
      reason: "board_not_solved",
    });
  });

  it("accepts a solving sequence", async () => {
    mockExecutor.mockResolvedValue([{ width: 7, height: 10, num_colors: 5, seed: "level-1" }]);
    await expect(
      validatePixelzCompletion(mockExecutor as any, "pixelz_level_1", [1, 3, 2, 1, 3, 2, 4, 0, 1, 3])
    ).resolves.toEqual({
      valid: true,
      moves: 10,
    });
  });
});
