import {
  PIXELZ_LEVEL_IDS,
  PIXELZ_LEVELS,
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
  isPredefinedPixelzLevel,
  type PixelzLevelId,
  type ReflexLevelId,
} from "@pixelz/shared";

export type GameId = "pixelz" | "reflex";
export type LeaderboardWindow = "all" | "day" | "week";

type ResultSnapshot = {
  moves: number;
  timeMs: number;
};

type LevelProgress = {
  bestMoves: number;
  bestTimeMs: number;
  lastMoves: number;
  lastTimeMs: number;
  plays: number;
  lastPlayedAt: string;
};

type CompetitionState = {
  version: 1;
  levels: Record<string, LevelProgress>;
  dailyCompletions: Record<string, GameId[]>;
  rivals: string[];
};

type BoardSettings = {
  width?: number;
  height?: number;
  numColors?: number;
};

type RecordCompetitionResultInput = {
  gameId: GameId;
  levelId: string;
  moves: number;
  timeMs: number;
  completedAt?: Date;
  dailyChallenge?: boolean;
};

type DailyChallenge = {
  gameId: GameId;
  levelId: string;
  label: string;
  subtitle: string;
  dateKey: string;
};

const STORAGE_KEY = "pixelz_competition_state_v1";

const DEFAULT_STATE: CompetitionState = {
  version: 1,
  levels: {},
  dailyCompletions: {},
  rivals: [],
};

export const PIXELZ_PRESET_CHALLENGES = [
  {
    levelId: PIXELZ_LEVEL_IDS[0],
    label: "Warm-Up",
    description: "Low-pressure opener for quick solo runs.",
  },
  {
    levelId: PIXELZ_LEVEL_IDS[4],
    label: "Competitive",
    description: "Balanced official board for chasing clean wins.",
  },
  {
    levelId: PIXELZ_LEVEL_IDS[9],
    label: "Endurance",
    description: "Longer board for leaderboard grinders.",
  },
] as const;

export const REFLEX_PRESET_CHALLENGES = [
  {
    levelId: REFLEX_LEVEL_IDS[0],
    label: "Sprint",
    description: "Short race to warm up your reflexes.",
  },
  {
    levelId: REFLEX_LEVEL_IDS[1],
    label: "Ranked Run",
    description: "The standard duel format for fast rematches.",
  },
  {
    levelId: REFLEX_LEVEL_IDS[3],
    label: "Gauntlet",
    description: "Longer set for consistency under pressure.",
  },
] as const;

function compareResults(gameId: GameId, a: ResultSnapshot, b: ResultSnapshot): number {
  if (gameId === "pixelz") {
    if (a.moves !== b.moves) return a.moves - b.moves;
    return a.timeMs - b.timeMs;
  }
  return a.timeMs - b.timeMs;
}

function levelKey(gameId: GameId, levelId: string): string {
  return `${gameId}:${levelId}`;
}

function normalizeState(value: unknown): CompetitionState {
  if (!value || typeof value !== "object") return DEFAULT_STATE;
  const raw = value as Partial<CompetitionState>;
  return {
    version: 1,
    levels: raw.levels && typeof raw.levels === "object" ? raw.levels : {},
    dailyCompletions:
      raw.dailyCompletions && typeof raw.dailyCompletions === "object" ? raw.dailyCompletions : {},
    rivals: Array.isArray(raw.rivals) ? raw.rivals.filter((id): id is string => typeof id === "string") : [],
  };
}

function readState(): CompetitionState {
  if (typeof localStorage === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(state: CompetitionState) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCountdown(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => `${value}`.padStart(2, "0")).join(":");
}

export function getLeaderboardWindowStart(window: LeaderboardWindow, now = new Date()): Date | null {
  if (window === "all") return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (window === "week") {
    start.setDate(start.getDate() - 6);
  }
  return start;
}

export function getQuickPlayLevel(gameId: GameId): string {
  return gameId === "pixelz" ? PIXELZ_LEVEL_IDS[0] : REFLEX_LEVEL_IDS[1];
}

export function getDailyChallenge(gameId: GameId, now = new Date()): DailyChallenge {
  const index = dayOfYear(now);
  const dateKey = toDateKey(now);
  if (gameId === "pixelz") {
    const levelId = PIXELZ_LEVEL_IDS[index % PIXELZ_LEVEL_IDS.length];
    return {
      gameId,
      levelId,
      label: "Daily Pixelz",
      subtitle: `${PIXELZ_LEVELS[levelId]} · solve clean and fast`,
      dateKey,
    };
  }

  const levelId = REFLEX_LEVEL_IDS[index % REFLEX_LEVEL_IDS.length];
  return {
    gameId,
    levelId,
    label: "Daily Reflex",
    subtitle: `${REFLEX_LEVELS[levelId as ReflexLevelId]} rounds · one chance to pop off`,
    dateKey,
  };
}

export function getDailyChallenges(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return {
    dateKey: toDateKey(now),
    resetInMs: tomorrow.getTime() - now.getTime(),
    challenges: [getDailyChallenge("pixelz", now), getDailyChallenge("reflex", now)],
  };
}

export function getLevelProgress(gameId: GameId, levelId: string): LevelProgress | null {
  const state = readState();
  return state.levels[levelKey(gameId, levelId)] ?? null;
}

export function recordCompetitionResult(input: RecordCompetitionResultInput) {
  const state = readState();
  const key = levelKey(input.gameId, input.levelId);
  const completedAt = input.completedAt ?? new Date();
  const nextResult = { moves: input.moves, timeMs: input.timeMs };
  const previous = state.levels[key];
  const previousBest = previous
    ? { moves: previous.bestMoves, timeMs: previous.bestTimeMs }
    : null;
  const isNewBest = !previousBest || compareResults(input.gameId, nextResult, previousBest) < 0;

  state.levels[key] = {
    bestMoves: isNewBest ? input.moves : previous?.bestMoves ?? input.moves,
    bestTimeMs: isNewBest ? input.timeMs : previous?.bestTimeMs ?? input.timeMs,
    lastMoves: input.moves,
    lastTimeMs: input.timeMs,
    plays: (previous?.plays ?? 0) + 1,
    lastPlayedAt: completedAt.toISOString(),
  };

  if (input.dailyChallenge) {
    const dateKey = toDateKey(completedAt);
    const existing = new Set(state.dailyCompletions[dateKey] ?? []);
    existing.add(input.gameId);
    state.dailyCompletions[dateKey] = Array.from(existing);
  }

  writeState(state);

  return {
    isNewBest,
    previousBest,
    current: state.levels[key],
  };
}

export function getCompetitionOverview(now = new Date()) {
  const state = readState();
  const completedDates = Object.entries(state.dailyCompletions)
    .filter(([, games]) => games.length > 0)
    .map(([dateKey]) => dateKey)
    .sort();
  let streak = 0;
  let cursor = toDateKey(now);
  while (completedDates.includes(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    streak,
    rivalsCount: state.rivals.length,
    completedToday: state.dailyCompletions[toDateKey(now)] ?? [],
  };
}

export function getRivalIds(): string[] {
  return readState().rivals;
}

export function isRival(userId: string): boolean {
  return getRivalIds().includes(userId);
}

export function toggleRival(userId: string): string[] {
  const state = readState();
  const next = new Set(state.rivals);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  state.rivals = Array.from(next);
  writeState(state);
  return state.rivals;
}

export function formatBoardLabel(levelId: string, settings?: BoardSettings): string {
  if (levelId.startsWith("reflex_")) {
    const rounds = REFLEX_LEVELS[levelId as ReflexLevelId];
    return rounds ? `${rounds} rounds` : "Reflex challenge";
  }
  if (isPredefinedPixelzLevel(levelId)) {
    return PIXELZ_LEVELS[levelId as PixelzLevelId];
  }
  if (settings?.width && settings?.height && settings?.numColors) {
    return `Custom ${settings.width}x${settings.height} · ${settings.numColors} colors`;
  }
  return "Custom board";
}

export function describeSessionFormat(gameId: GameId, levelId: string | null, settings?: BoardSettings): string {
  if (gameId === "reflex") {
    const rounds = levelId ? REFLEX_LEVELS[levelId as ReflexLevelId] : Number(settings?.height ?? 10);
    return `${rounds} round duel`;
  }
  if (levelId && isPredefinedPixelzLevel(levelId)) {
    return `${PIXELZ_LEVELS[levelId as PixelzLevelId]} official board`;
  }
  return formatBoardLabel(levelId ?? "pixelz_custom", settings);
}

export function formatPerformanceDelta(
  gameId: GameId,
  current: ResultSnapshot,
  target: ResultSnapshot
): string {
  if (gameId === "pixelz") {
    if (current.moves !== target.moves) {
      const diff = current.moves - target.moves;
      return diff < 0 ? `${Math.abs(diff)} moves better` : `${diff} moves behind`;
    }
    const diff = current.timeMs - target.timeMs;
    return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
  }

  const diff = current.timeMs - target.timeMs;
  return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
}

export function getLeaderboardWindowLabel(window: LeaderboardWindow): string {
  if (window === "day") return "Daily";
  if (window === "week") return "Weekly";
  return "All Time";
}
