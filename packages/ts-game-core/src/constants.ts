export const GAME = {
  MAX_SCORE: 1_000_000,
  NICKNAME_MAX_LENGTH: 32,
  LEADERBOARD_TOP_N: 100,
  SCORE_BASE: 10_000,
  SCORE_MOVE_PENALTY: 50,
  SCORE_TIME_PENALTY_MS: 20,
} as const;

export const REFLEX_LEVELS = {
  reflex_level_0: 5,
  reflex_level_1: 10,
  reflex_level_2: 15,
  reflex_level_3: 20,
} as const;

export type ReflexLevelId = keyof typeof REFLEX_LEVELS;
export const REFLEX_LEVEL_IDS: ReflexLevelId[] = [
  "reflex_level_0",
  "reflex_level_1",
  "reflex_level_2",
  "reflex_level_3",
];

export function computeScore(moves: number, timeMs: number): number {
  const raw =
    GAME.SCORE_BASE -
    moves * GAME.SCORE_MOVE_PENALTY -
    Math.floor(timeMs / GAME.SCORE_TIME_PENALTY_MS);
  return Math.min(GAME.MAX_SCORE, Math.max(0, Math.floor(raw)));
}

export const PIXELZ_SCORE_MOVE_PENALTY = 10_000;

export const PIXELZ_BOARD_ID_PREFIX = "pixelz_";
export const DAILY_PIXELZ_BOARD_ID_PREFIX = `${PIXELZ_BOARD_ID_PREFIX}daily_`;
export const DAILY_PIXELZ_BOARD_WIDTH = 7;
export const DAILY_PIXELZ_BOARD_HEIGHT = 10;
export const DAILY_PIXELZ_BOARD_NUM_COLORS = 5;

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

export function isUtcDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return toUtcDateKey(normalized) === value;
}

export function isDailyPixelzBoardId(levelId: string): boolean {
  if (!levelId.startsWith(DAILY_PIXELZ_BOARD_ID_PREFIX)) {
    return false;
  }
  return isUtcDateKey(levelId.slice(DAILY_PIXELZ_BOARD_ID_PREFIX.length));
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

export function isReleasedDailyPixelzBoardId(levelId: string, now = new Date()): boolean {
  const dateKey = parseDailyPixelzBoardDateKey(levelId);
  if (!dateKey) return false;
  return dateKey <= toUtcDateKey(now);
}

export function getDailyPixelzBoardSpec(input: Date | string = new Date()) {
  const dateKey =
    input instanceof Date
      ? toUtcDateKey(input)
      : isUtcDateKey(input)
        ? input
        : parseDailyPixelzBoardDateKey(input);

  if (!dateKey) {
    throw new Error(`Invalid daily Pixelz board input: ${input}`);
  }

  return {
    boardId: `${DAILY_PIXELZ_BOARD_ID_PREFIX}${dateKey}`,
    dateKey,
    width: DAILY_PIXELZ_BOARD_WIDTH,
    height: DAILY_PIXELZ_BOARD_HEIGHT,
    numColors: DAILY_PIXELZ_BOARD_NUM_COLORS,
    seed: `pixelz-daily:${dateKey}`,
  };
}

export function computePixelzScore(_moves: number, _timeMs: number): number {
  return 0;
}
