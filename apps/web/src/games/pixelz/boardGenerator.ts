import { generatePixelzGrid } from "@pixelz/shared";

/**
 * Generate a deterministic 2D grid of color indices (0..numColors-1) from a seed string.
 */
export function generateGrid(
  width: number,
  height: number,
  numColors: number,
  seed: string
): number[][] {
  return generatePixelzGrid({ width, height, numColors, seed });
}
