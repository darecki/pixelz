import { hashString, mulberry32 } from "./prng.js";

export type PixelzBoardSpec = {
  width: number;
  height: number;
  numColors: number;
  seed: string;
};

export type PixelzReplayResult =
  | {
      valid: true;
      moves: number;
      solved: boolean;
      finalColor: number;
      grid: number[][];
    }
  | {
      valid: false;
      reason:
        | "invalid_board"
        | "invalid_move_value"
        | "out_of_range_move"
        | "redundant_move";
      moveIndex?: number;
    };

export function generatePixelzGrid(spec: PixelzBoardSpec): number[][] {
  const rng = mulberry32(hashString(spec.seed));
  const grid: number[][] = [];
  for (let y = 0; y < spec.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < spec.width; x++) {
      row.push(Math.floor(rng() * spec.numColors));
    }
    grid.push(row);
  }
  return grid;
}

export function applyPixelzFloodFill(
  grid: number[][],
  fromColor: number,
  toColor: number
): number[][] {
  if (fromColor === toColor) return grid.map((row) => row.slice());
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const next = grid.map((row) => row.slice());
  const stack: [number, number][] = [[0, 0]];
  if (width === 0 || height === 0 || next[0][0] !== fromColor) return next;
  next[0][0] = toColor;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && next[ny][nx] === fromColor) {
        next[ny][nx] = toColor;
        stack.push([nx, ny]);
      }
    }
  }
  return next;
}

export function isPixelzFilled(grid: number[][]): boolean {
  if (grid.length === 0 || grid[0]?.length === 0) return true;
  const color = grid[0][0];
  return grid.flat().every((value) => value === color);
}

export function replayPixelzMoveSequence(
  spec: PixelzBoardSpec,
  moveSequence: number[]
): PixelzReplayResult {
  if (
    !Number.isInteger(spec.width) ||
    !Number.isInteger(spec.height) ||
    !Number.isInteger(spec.numColors) ||
    spec.width <= 0 ||
    spec.height <= 0 ||
    spec.numColors <= 1
  ) {
    return { valid: false, reason: "invalid_board" };
  }

  let grid = generatePixelzGrid(spec);

  for (let i = 0; i < moveSequence.length; i++) {
    const move = moveSequence[i];
    if (!Number.isInteger(move)) {
      return { valid: false, reason: "invalid_move_value", moveIndex: i };
    }
    if (move < 0 || move >= spec.numColors) {
      return { valid: false, reason: "out_of_range_move", moveIndex: i };
    }
    const currentColor = grid[0][0];
    if (move === currentColor) {
      return { valid: false, reason: "redundant_move", moveIndex: i };
    }
    grid = applyPixelzFloodFill(grid, currentColor, move);
  }

  return {
    valid: true,
    moves: moveSequence.length,
    solved: isPixelzFilled(grid),
    finalColor: grid[0][0],
    grid,
  };
}
