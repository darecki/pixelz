/**
 * Mulberry32 seeded PRNG. Same seed string => same sequence.
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

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
