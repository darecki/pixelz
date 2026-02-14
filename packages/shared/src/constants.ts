export const GAME = {
  MAX_SCORE: 1_000_000,
  NICKNAME_MAX_LENGTH: 32,
  LEADERBOARD_TOP_N: 100,
  /** Base score before penalties (deterministic scoring). */
  SCORE_BASE: 10_000,
  /** Points lost per move. */
  SCORE_MOVE_PENALTY: 50,
  /** Time units (ms) that cost 1 point. */
  SCORE_TIME_PENALTY_MS: 20,
} as const;

/** Reflex game: levelId -> number of rounds. Leaderboard sorts by time ascending (lower is better). */
export const REFLEX_LEVELS = {
  reflex_level_0: 5,
  reflex_level_1: 10,
  reflex_level_2: 15,
  reflex_level_3: 20,
} as const;

export type ReflexLevelId = keyof typeof REFLEX_LEVELS;
export const REFLEX_LEVEL_IDS: ReflexLevelId[] = ["reflex_level_0", "reflex_level_1", "reflex_level_2", "reflex_level_3"];

/**
 * Deterministic score from moves and time. Server uses same bounds (0..MAX_SCORE).
 */
export function computeScore(moves: number, timeMs: number): number {
  const raw =
    GAME.SCORE_BASE -
    moves * GAME.SCORE_MOVE_PENALTY -
    Math.floor(timeMs / GAME.SCORE_TIME_PENALTY_MS);
  return Math.min(GAME.MAX_SCORE, Math.max(0, Math.floor(raw)));
}

/** Pixelz: points added per move. Score = timeMs + moves * PIXELZ_SCORE_MOVE_PENALTY; lower is better. */
export const PIXELZ_SCORE_MOVE_PENALTY = 10_000;

export const PIXELZ_BOARD_ID_PREFIX = "pixelz_";

/** Predefined Pixelz level ids (level 1–10); same board for everyone. */
export const PIXELZ_LEVEL_IDS = [
  "pixelz_level_1",
  "pixelz_level_2",
  "pixelz_level_3",
  "pixelz_level_4",
  "pixelz_level_5",
  "pixelz_level_6",
  "pixelz_level_7",
  "pixelz_level_8",
  "pixelz_level_9",
  "pixelz_level_10",
] as const;

export type PixelzLevelId = (typeof PIXELZ_LEVEL_IDS)[number];

/** Display label for predefined levels. */
export const PIXELZ_LEVELS: Record<PixelzLevelId, string> = {
  pixelz_level_1: "Level 1",
  pixelz_level_2: "Level 2",
  pixelz_level_3: "Level 3",
  pixelz_level_4: "Level 4",
  pixelz_level_5: "Level 5",
  pixelz_level_6: "Level 6",
  pixelz_level_7: "Level 7",
  pixelz_level_8: "Level 8",
  pixelz_level_9: "Level 9",
  pixelz_level_10: "Level 10",
};

export function isPixelzBoardId(levelId: string): boolean {
  return levelId.startsWith(PIXELZ_BOARD_ID_PREFIX);
}

export function isPredefinedPixelzLevel(levelId: string): levelId is PixelzLevelId {
  return (PIXELZ_LEVEL_IDS as readonly string[]).includes(levelId);
}

/**
 * Pixelz score: each millisecond = 1 point, each move = 10k points. Lower is better.
 */
export function computePixelzScore(moves: number, timeMs: number): number {
  return timeMs + moves * PIXELZ_SCORE_MOVE_PENALTY;
}
