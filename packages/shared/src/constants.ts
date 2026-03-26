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
export const DAILY_PIXELZ_BOARD_ID_PREFIX = `${PIXELZ_BOARD_ID_PREFIX}daily_`;
export const DAILY_PIXELZ_BOARD_WIDTH = 7;
export const DAILY_PIXELZ_BOARD_HEIGHT = 10;
export const DAILY_PIXELZ_BOARD_NUM_COLORS = 5;

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

export function isDailyPixelzBoardId(levelId: string): boolean {
  return /^pixelz_daily_\d{4}-\d{2}-\d{2}$/.test(levelId);
}

export function toUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDailyPixelzBoardDateKey(levelId: string): string | null {
  return isDailyPixelzBoardId(levelId) ? levelId.slice(DAILY_PIXELZ_BOARD_ID_PREFIX.length) : null;
}

export function getDailyPixelzBoardId(date = new Date()): string {
  return `${DAILY_PIXELZ_BOARD_ID_PREFIX}${toUtcDateKey(date)}`;
}

export function getDailyPixelzBoardSpec(input: Date | string = new Date()) {
  const dateKey = input instanceof Date
    ? toUtcDateKey(input)
    : parseDailyPixelzBoardDateKey(input) ?? input;

  return {
    boardId: `${DAILY_PIXELZ_BOARD_ID_PREFIX}${dateKey}`,
    dateKey,
    width: DAILY_PIXELZ_BOARD_WIDTH,
    height: DAILY_PIXELZ_BOARD_HEIGHT,
    numColors: DAILY_PIXELZ_BOARD_NUM_COLORS,
    seed: `pixelz-daily:${dateKey}`,
  };
}

/**
 * Pixelz score is now obsolete. Ranking strictly uses moves and timeMs directly.
 * We return 0 to satisfy the DB schema (score >= 0).
 */
export function computePixelzScore(moves: number, timeMs: number): number {
  return 0;
}
