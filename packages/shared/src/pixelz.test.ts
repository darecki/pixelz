import { describe, expect, it } from "vitest";
import {
  applyPixelzFloodFill,
  generatePixelzGrid,
  isPixelzFilled,
  replayPixelzMoveSequence,
  type PixelzBoardSpec,
} from "./pixelz.js";

const board: PixelzBoardSpec = {
  width: 7,
  height: 10,
  numColors: 5,
  seed: "level-1",
};

describe("generatePixelzGrid", () => {
  it("is deterministic for the same board spec", () => {
    expect(generatePixelzGrid(board)).toEqual(generatePixelzGrid(board));
  });
});

describe("applyPixelzFloodFill", () => {
  it("fills the connected region from the origin", () => {
    const grid = [
      [0, 0, 1],
      [0, 1, 1],
      [2, 2, 1],
    ];
    expect(applyPixelzFloodFill(grid, 0, 2)).toEqual([
      [2, 2, 1],
      [2, 1, 1],
      [2, 2, 1],
    ]);
  });
});

describe("isPixelzFilled", () => {
  it("detects solved and unsolved grids", () => {
    expect(isPixelzFilled([[1, 1], [1, 1]])).toBe(true);
    expect(isPixelzFilled([[1, 2], [1, 1]])).toBe(false);
  });
});

describe("replayPixelzMoveSequence", () => {
  it("rejects redundant moves", () => {
    const firstColor = generatePixelzGrid(board)[0][0];
    expect(replayPixelzMoveSequence(board, [firstColor])).toEqual({
      valid: false,
      reason: "redundant_move",
      moveIndex: 0,
    });
  });

  it("rejects out-of-range moves", () => {
    expect(replayPixelzMoveSequence(board, [5])).toEqual({
      valid: false,
      reason: "out_of_range_move",
      moveIndex: 0,
    });
  });

  it("replays a known solving sequence", () => {
    const result = replayPixelzMoveSequence(board, [1, 3, 2, 1, 3, 2, 4, 0, 1, 3]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.moves).toBe(10);
      expect(result.solved).toBe(true);
    }
  });
});
