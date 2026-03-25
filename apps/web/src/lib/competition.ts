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
  seriesLength?: number;
  currentRound?: number;
  seriesWins?: Record<string, number>;
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
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
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
  tomorrow.setUTCHours(24, 0, 0, 0);
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
  const seriesLabel = settings?.seriesLength === 3 ? " · best of 3" : "";
  if (gameId === "reflex") {
    const rounds = levelId ? REFLEX_LEVELS[levelId as ReflexLevelId] : Number(settings?.height ?? 10);
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
  const round = Math.max(1, Math.trunc(settings?.currentRound ?? 1));
  const wins = { ...(settings?.seriesWins ?? {}) };
  if (winnerUserId) {
    wins[winnerUserId] = (wins[winnerUserId] ?? 0) + 1;
  }
  const targetWins = length === 3 ? 2 : 1;
  const decided = Object.values(wins).some((value) => value >= targetWins) || Boolean(winnerUserId && round >= length);
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
    return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
  }

  const diff = current.timeMs - target.timeMs;
  return diff < 0 ? `${(Math.abs(diff) / 1000).toFixed(2)}s faster` : `${(diff / 1000).toFixed(2)}s slower`;
}

export function getLeaderboardWindowLabel(window: LeaderboardWindow): string {
  if (window === "day") return "Daily (UTC)";
  if (window === "week") return "Weekly (UTC)";
  return "All Time";
}
