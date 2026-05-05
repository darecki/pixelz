import {
  getDailyPixelzBoardSpec,
  isDailyPixelzBoardId,
  isPredefinedPixelzLevel,
  parseDailyPixelzBoardDateKey,
  PIXELZ_LEVEL_IDS,
  PIXELZ_LEVELS,
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
  type PixelzLevelId,
  type ReflexLevelId,
} from "./constants.js";

export type GameId = "pixelz" | "reflex";
export type LeaderboardWindow = "all" | "day" | "week";
export type LeaderboardView = LeaderboardWindow | "season";

export type ResultSnapshot = {
  moves: number;
  timeMs: number;
};

export type SeasonMeta = {
  id: string;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
  resetInMs: number;
};

export type SeasonTier = {
  name: "Legend" | "Diamond" | "Gold" | "Silver" | "Bronze";
  accent: "success" | "accent" | "warning" | "muted";
};

export type BoardSettings = {
  width?: number;
  height?: number;
  numColors?: number;
  rounds?: number;
  seriesLength?: number;
  currentRound?: number;
  seriesWins?: Record<string, number>;
};

export type DailyChallenge = {
  gameId: GameId;
  levelId: string;
  label: string;
  subtitle: string;
  dateKey: string;
};

export type DailyChallengeSet = {
  dateKey: string;
  resetInMs: number;
  challenges: DailyChallenge[];
};

export type PresetChallenge<LevelId extends string = string> = {
  levelId: LevelId;
  label: string;
  description: string;
};

export type CompetitionOverview = {
  streak: number;
  rivalsCount: number;
  completedToday: GameId[];
};

export const PIXELZ_PRESET_CHALLENGES = [
  {
    levelId: PIXELZ_LEVEL_IDS[0],
    label: "Warm-Up",
    description: "Compact official board for fast, low-commitment runs.",
  },
  {
    levelId: PIXELZ_LEVEL_IDS[4],
    label: "Mainline",
    description: "Core official board when you want the standard Pixelz lane.",
  },
  {
    levelId: PIXELZ_LEVEL_IDS[9],
    label: "Alternate",
    description: "Another official layout for mixing up your route planning.",
  },
] as const satisfies readonly PresetChallenge<PixelzLevelId>[];

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
] as const satisfies readonly PresetChallenge<ReflexLevelId>[];

function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDateKey(date);
}

export function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
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
  start.setUTCHours(0, 0, 0, 0);
  if (window === "week") {
    start.setUTCDate(start.getUTCDate() - 6);
  }
  return start;
}

export function getCurrentSeason(now = new Date()): SeasonMeta {
  const year = now.getUTCFullYear();
  const quarterIndex = Math.floor(now.getUTCMonth() / 3);
  const quarterNumber = quarterIndex + 1;
  const start = new Date(Date.UTC(year, quarterIndex * 3, 1, 0, 0, 0, 0));
  const end =
    quarterIndex === 3
      ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
      : new Date(Date.UTC(year, quarterIndex * 3 + 3, 1, 0, 0, 0, 0));

  return {
    id: `${year}-q${quarterNumber}`,
    label: `Season ${year} · Q${quarterNumber}`,
    shortLabel: `Q${quarterNumber} ${year}`,
    start,
    end,
    resetInMs: Math.max(0, end.getTime() - now.getTime()),
  };
}

export function getSeasonWindowStart(now = new Date()): Date {
  return getCurrentSeason(now).start;
}

export function getSeasonTier(rank: number | null, totalEntries: number): SeasonTier {
  if (!rank || totalEntries <= 0) return { name: "Bronze", accent: "muted" };
  const percentile = (1 - (rank - 1) / Math.max(totalEntries, 1)) * 100;
  if (rank === 1 || percentile >= 99) return { name: "Legend", accent: "success" };
  if (percentile >= 90) return { name: "Diamond", accent: "accent" };
  if (percentile >= 65) return { name: "Gold", accent: "warning" };
  if (percentile >= 35) return { name: "Silver", accent: "muted" };
  return { name: "Bronze", accent: "muted" };
}

export function getQuickPlayLevel(gameId: GameId): string {
  return gameId === "pixelz" ? PIXELZ_LEVEL_IDS[0] : REFLEX_LEVEL_IDS[1];
}

export function getDailyChallenge(gameId: GameId, now = new Date()): DailyChallenge | null {
  const dateKey = toDateKey(now);
  if (gameId === "pixelz") {
    const board = getDailyPixelzBoardSpec(now);
    return {
      gameId,
      levelId: board.boardId,
      label: "Daily Pixelz",
      subtitle: "Fresh generated board. Same layout for everyone today.",
      dateKey,
    };
  }
  return null;
}

export function getDailyChallenges(now = new Date()): DailyChallengeSet {
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const pixelzDaily = getDailyChallenge("pixelz", now);
  return {
    dateKey: toDateKey(now),
    resetInMs: tomorrow.getTime() - now.getTime(),
    challenges: pixelzDaily ? [pixelzDaily] : [],
  };
}

export function computeCompetitionOverview(
  dailyCompletions: Record<string, readonly GameId[]>,
  now = new Date(),
  rivalsCount = 0
): CompetitionOverview {
  const completedDates = Object.entries(dailyCompletions)
    .filter(([, games]) => games.length > 0)
    .map(([dateKey]) => dateKey)
    .sort();
  const completedDateSet = new Set(completedDates);
  let streak = 0;
  let cursor = toDateKey(now);

  if (!completedDateSet.has(cursor)) {
    cursor = addDays(cursor, -1);
  }

  while (completedDateSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    streak,
    rivalsCount,
    completedToday: [...(dailyCompletions[toDateKey(now)] ?? [])],
  };
}

export function formatBoardLabel(levelId: string, settings?: BoardSettings): string {
  if (levelId.startsWith("reflex_")) {
    const rounds = REFLEX_LEVELS[levelId as ReflexLevelId];
    return rounds ? `${rounds} rounds` : "Reflex challenge";
  }
  if (isDailyPixelzBoardId(levelId)) {
    const dateKey = parseDailyPixelzBoardDateKey(levelId);
    return dateKey ? `Daily board · ${dateKey}` : "Daily board";
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
  const seriesLabel = settings?.seriesLength === 3 ? " · best of 3" : "";
  if (gameId === "reflex") {
    const rounds = levelId ? REFLEX_LEVELS[levelId as ReflexLevelId] : Number(settings?.rounds ?? 10);
    return `${rounds} round duel${seriesLabel}`;
  }
  if (levelId && isPredefinedPixelzLevel(levelId)) {
    return `${PIXELZ_LEVELS[levelId as PixelzLevelId]} official board${seriesLabel}`;
  }
  return `${formatBoardLabel(levelId ?? "pixelz_custom", settings)}${seriesLabel}`;
}

export function getSeriesMeta(
  settings?: BoardSettings,
  winnerUserId?: string | null
): { length: 1 | 3; round: number; wins: Record<string, number>; targetWins: number; isBestOfThree: boolean; decided: boolean } {
  const length = settings?.seriesLength === 3 ? 3 : 1;
  if (length === 1) {
    return {
      length: 1,
      round: 1,
      wins: {},
      targetWins: 1,
      isBestOfThree: false,
      decided: false,
    };
  }
  const currentRoundRaw = Number(settings?.currentRound);
  const currentRoundSafe = Number.isFinite(currentRoundRaw) ? currentRoundRaw : 1;
  const round = Math.max(1, Math.trunc(currentRoundSafe));
  const wins = { ...(settings?.seriesWins ?? {}) };
  if (winnerUserId) {
    wins[winnerUserId] = (wins[winnerUserId] ?? 0) + 1;
  }
  const targetWins = length === 3 ? 2 : 1;
  const decided = Object.values(wins).some((value) => value >= targetWins) || round >= length;
  return {
    length,
    round,
    wins,
    targetWins,
    isBestOfThree: length === 3,
    decided,
  };
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
    if (diff === 0) return "exactly tied";
    return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
  }

  const diff = current.timeMs - target.timeMs;
  if (diff === 0) return "exactly tied";
  return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
}

export function getLeaderboardWindowLabel(window: LeaderboardView): string {
  if (window === "day") return "Daily (UTC)";
  if (window === "week") return "Weekly (UTC)";
  if (window === "season") return "Season";
  return "All Time";
}
