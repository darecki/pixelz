import { hashString, mulberry32 } from "@pixelz/shared";

/**
 * Generate a deterministic 2D grid of color indices (0..numColors-1) from a seed string.
 */
export function generateGrid(
  width: number,
  height: number,
  numColors: number,
  seed: string
): number[][] {
  const rng = mulberry32(hashString(seed));
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(Math.floor(rng() * numColors));
    }
    grid.push(row);
  }
  return grid;
}
