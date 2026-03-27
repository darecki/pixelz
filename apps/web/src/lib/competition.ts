import {
  computeCompetitionOverview,
  describeSessionFormat,
  formatBoardLabel,
  formatCountdown,
  formatPerformanceDelta,
  getCurrentSeason,
  getDailyChallenge,
  getDailyChallenges,
  getLeaderboardWindowLabel,
  getLeaderboardWindowStart,
  getQuickPlayLevel,
  getSeasonWindowStart,
  getSeasonTier,
  getSeriesMeta,
  PIXELZ_LEVEL_IDS,
  REFLEX_LEVEL_IDS,
  toDateKey,
  type BoardSettings,
  type DailyChallenge,
  type GameId,
  type LeaderboardView,
  type LeaderboardWindow,
  type ResultSnapshot,
  type SeasonMeta,
  type SeasonTier,
} from "@pixelz/shared";

export {
  describeSessionFormat,
  formatBoardLabel,
  formatCountdown,
  formatPerformanceDelta,
  getCurrentSeason,
  getDailyChallenge,
  getDailyChallenges,
  getLeaderboardWindowLabel,
  getLeaderboardWindowStart,
  getQuickPlayLevel,
  getSeasonWindowStart,
  getSeasonTier,
  getSeriesMeta,
  toDateKey,
};

export type {
  BoardSettings,
  DailyChallenge,
  GameId,
  LeaderboardView,
  LeaderboardWindow,
  ResultSnapshot,
  SeasonMeta,
  SeasonTier,
};

export type RivalLeaderboardEntry = {
  userId: string;
  nickname: string | null;
  rank: number;
  moves: number;
  timeMs: number;
};

export type RivalChallengeSummary = {
  gameId: GameId;
  rivalUserId: string;
  rivalName: string;
  rank: number;
  status: "ahead" | "behind" | "tied" | "unplayed";
  chipText: string;
  message: string;
};

export type ProfileAchievement = {
  id: string;
  label: string;
  description: string;
  earned: boolean;
};

export type CompetitionProfile = {
  totalPlays: number;
  pbBoards: number;
  dailyCyclesCompleted: number;
  currentStreak: number;
  rivalsCount: number;
  favoriteGame: GameId | null;
  currentSeason: SeasonMeta;
  seasonDailyCompletions: number;
  recentlyPlayed: Array<{
    gameId: GameId;
    levelId: string;
    bestMoves: number;
    bestTimeMs: number;
    plays: number;
    lastPlayedAt: string;
  }>;
  achievements: ProfileAchievement[];
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

type RecordCompetitionResultInput = {
  gameId: GameId;
  levelId: string;
  moves: number;
  timeMs: number;
  completedAt?: Date;
  dailyChallenge?: boolean;
};

const STORAGE_KEY = "pixelz_competition_state_v1";

function createDefaultState(): CompetitionState {
  return {
    version: 1,
    levels: {},
    dailyCompletions: {},
    rivals: [],
  };
}

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

function gameFromLevelKey(key: string): GameId {
  return key.startsWith("pixelz:") ? "pixelz" : "reflex";
}

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

function parseStoredLevelKey(key: string): { gameId: GameId; levelId: string } | null {
  if (key.startsWith("pixelz:")) {
    const levelId = key.slice("pixelz:".length);
    return levelId ? { gameId: "pixelz", levelId } : null;
  }
  if (key.startsWith("reflex:")) {
    const levelId = key.slice("reflex:".length);
    return levelId ? { gameId: "reflex", levelId } : null;
  }
  return null;
}

function toStoredNonNegativeInt(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.trunc(numeric));
}

function toStoredIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeLevelProgress(value: unknown): LevelProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<LevelProgress>;
  const bestMoves = toStoredNonNegativeInt(raw.bestMoves);
  const bestTimeMs = toStoredNonNegativeInt(raw.bestTimeMs);
  const lastMoves = toStoredNonNegativeInt(raw.lastMoves);
  const lastTimeMs = toStoredNonNegativeInt(raw.lastTimeMs);
  const plays = toStoredNonNegativeInt(raw.plays);
  const lastPlayedAt = toStoredIsoString(raw.lastPlayedAt);

  if (
    bestMoves == null ||
    bestTimeMs == null ||
    lastMoves == null ||
    lastTimeMs == null ||
    plays == null ||
    lastPlayedAt == null
  ) {
    return null;
  }

  return {
    bestMoves,
    bestTimeMs,
    lastMoves,
    lastTimeMs,
    plays,
    lastPlayedAt,
  };
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

function normalizeState(value: unknown): CompetitionState {
  if (!value || typeof value !== "object") return createDefaultState();
  const raw = value as Partial<CompetitionState>;
  const rawLevels = raw.levels && typeof raw.levels === "object" ? raw.levels : {};
  const rawDailyCompletions =
    raw.dailyCompletions && typeof raw.dailyCompletions === "object" ? raw.dailyCompletions : {};
  const levels = Object.fromEntries(
    Object.entries(rawLevels).flatMap(([key, levelValue]) => {
      if (parseStoredLevelKey(key) == null) return [];
      const normalized = normalizeLevelProgress(levelValue);
      return normalized ? [[key, normalized] as const] : [];
    })
  );
  const dailyCompletions = Object.fromEntries(
    Object.entries(rawDailyCompletions).flatMap(([dateKey, games]) => {
      if (!isValidDateKey(dateKey) || !Array.isArray(games)) return [];
      const validGames = Array.from(new Set(games.filter((game): game is GameId => game === "pixelz" || game === "reflex")));
      return validGames.length > 0 ? [[dateKey, validGames] as const] : [];
    })
  );
  return {
    version: 1,
    levels,
    dailyCompletions,
    rivals: Array.isArray(raw.rivals) ? raw.rivals.filter((id): id is string => typeof id === "string") : [],
  };
}

function readState(): CompetitionState {
  if (typeof localStorage === "undefined") return createDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function writeState(state: CompetitionState) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function rivalName(entry: RivalLeaderboardEntry): string {
  return entry.nickname ?? entry.userId.slice(0, 8);
}

function formatResultLine(gameId: GameId, result: ResultSnapshot): string {
  if (gameId === "pixelz") {
    return `${result.moves} moves · ${(result.timeMs / 1000).toFixed(2)}s`;
  }
  return `${(result.timeMs / 1000).toFixed(2)}s`;
}

function getRivalGap(gameId: GameId, current: ResultSnapshot, target: ResultSnapshot) {
  if (gameId === "pixelz" && current.moves !== target.moves) {
    const moveDiff = current.moves - target.moves;
    return {
      status: moveDiff < 0 ? "ahead" : "behind",
      text: `${Math.abs(moveDiff)} move${Math.abs(moveDiff) === 1 ? "" : "s"} ${moveDiff < 0 ? "ahead" : "behind"}`,
      distance: Math.abs(moveDiff) * 1_000_000 + Math.abs(current.timeMs - target.timeMs),
    } as const;
  }

  const timeDiff = current.timeMs - target.timeMs;
  if (timeDiff === 0) {
    return {
      status: "tied",
      text: "Tied",
      distance: 0,
    } as const;
  }

  return {
    status: timeDiff < 0 ? "ahead" : "behind",
    text: `${(Math.abs(timeDiff) / 1000).toFixed(2)}s ${timeDiff < 0 ? "ahead" : "behind"}`,
    distance: Math.abs(timeDiff),
  } as const;
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
  return computeCompetitionOverview(state.dailyCompletions, now, state.rivals.length);
}

export function getCompetitionProfile(now = new Date()): CompetitionProfile {
  const state = readState();
  const currentSeason = getCurrentSeason(now);
  const levelEntries = Object.entries(state.levels)
    .map(([key, value]) => ({
      gameId: gameFromLevelKey(key),
      levelId: key.split(":").slice(1).join(":"),
      ...value,
    }))
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
  const totalPlays = levelEntries.reduce((sum, entry) => sum + entry.plays, 0);
  const pbBoards = levelEntries.length;
  const favoriteGame =
    levelEntries.length === 0
      ? null
      : (["pixelz", "reflex"] as const).reduce<GameId>((best, gameId) => {
          const bestCount = levelEntries.filter((entry) => entry.gameId === best).reduce((sum, entry) => sum + entry.plays, 0);
          const nextCount = levelEntries.filter((entry) => entry.gameId === gameId).reduce((sum, entry) => sum + entry.plays, 0);
          return nextCount > bestCount ? gameId : best;
        }, "pixelz");
  const overview = getCompetitionOverview(now);
  const seasonDailyCompletions = Object.entries(state.dailyCompletions).filter(
    ([dateKey, games]) => games.length > 0 && new Date(`${dateKey}T00:00:00.000Z`) >= currentSeason.start
  ).length;

  const achievements: ProfileAchievement[] = [
    {
      id: "first-benchmark",
      label: "First Benchmark",
      description: "Set a personal best on any board.",
      earned: pbBoards >= 1,
    },
    {
      id: "streak-starter",
      label: "Streak Starter",
      description: "Hold a 3-day daily streak.",
      earned: overview.streak >= 3,
    },
    {
      id: "rival-hunter",
      label: "Rival Hunter",
      description: "Track at least 3 rivals.",
      earned: state.rivals.length >= 3,
    },
    {
      id: "arcade-regular",
      label: "Arcade Regular",
      description: "Log 10 total runs.",
      earned: totalPlays >= 10,
    },
    {
      id: "dual-threat",
      label: "Dual Threat",
      description: "Set PBs in both Pixelz and Reflex.",
      earned: new Set(levelEntries.map((entry) => entry.gameId)).size >= 2,
    },
  ];

  return {
    totalPlays,
    pbBoards,
    dailyCyclesCompleted: Object.values(state.dailyCompletions).filter((games) => games.length > 0).length,
    currentStreak: overview.streak,
    rivalsCount: state.rivals.length,
    favoriteGame,
    currentSeason,
    seasonDailyCompletions,
    recentlyPlayed: levelEntries.slice(0, 6),
    achievements,
  };
}

export function getRivalIds(): string[] {
  return readState().rivals;
}

export function qualifiesForPrompt(rank: number, leaderboardSize: number): boolean {
  if (leaderboardSize < 100) return rank <= 10;
  return rank <= Math.ceil(leaderboardSize * 0.1);
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

export function getRivalChallengeSummary(
  gameId: GameId,
  current: ResultSnapshot | null,
  entries: RivalLeaderboardEntry[],
  rivalIds: string[],
  currentUserId?: string | null
): RivalChallengeSummary | null {
  const rivals = entries.filter((entry) => rivalIds.includes(entry.userId) && entry.userId !== currentUserId);
  if (rivals.length === 0) return null;

  if (!current) {
    const target = rivals[0];
    const name = rivalName(target);
    return {
      gameId,
      rivalUserId: target.userId,
      rivalName: name,
      rank: target.rank,
      status: "unplayed",
      chipText: `${name} · ${formatResultLine(gameId, target)}`,
      message: `${name} leads your rival pack here with ${formatResultLine(gameId, target)}. Put up your first answer.`,
    };
  }

  const closest = rivals.reduce((best, entry) => {
    if (!best) return entry;
    const bestGap = getRivalGap(gameId, current, best);
    const nextGap = getRivalGap(gameId, current, entry);
    return nextGap.distance < bestGap.distance ? entry : best;
  }, rivals[0]);
  const name = rivalName(closest);
  const gap = getRivalGap(gameId, current, closest);

  if (gap.status === "tied") {
    return {
      gameId,
      rivalUserId: closest.userId,
      rivalName: name,
      rank: closest.rank,
      status: "tied",
      chipText: `${name} · tied`,
      message: `You're tied with ${name} at #${closest.rank}. One cleaner run breaks it.`,
    };
  }

  if (gap.status === "ahead") {
    return {
      gameId,
      rivalUserId: closest.userId,
      rivalName: name,
      rank: closest.rank,
      status: "ahead",
      chipText: `${name} · ${gap.text}`,
      message: `You're ${gap.text} of ${name}. Keep the pressure on.`,
    };
  }

  return {
    gameId,
    rivalUserId: closest.userId,
    rivalName: name,
    rank: closest.rank,
    status: "behind",
    chipText: `${name} · ${gap.text}`,
    message: `You're ${gap.text} ${name} for #${closest.rank}.`,
  };
}
