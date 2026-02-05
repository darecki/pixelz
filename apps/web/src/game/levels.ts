/** Predefined level ids (no extra config for MVP). */
export const PREDEFINED_LEVEL_IDS = ["level_1", "level_2"] as const;

export type LevelId = (typeof PREDEFINED_LEVEL_IDS)[number];

export function isPredefinedLevel(id: string): id is LevelId {
  return PREDEFINED_LEVEL_IDS.includes(id as LevelId);
}

/** Deterministic "par" from seed for random levels (display only). */
export function getRandomParFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 10 + (h % 41);
}
