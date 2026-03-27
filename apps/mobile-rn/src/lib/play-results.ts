import type { LevelProgressSnapshot } from "./db";
import type { LeaderboardResponse } from "@pixelz/ts-contracts";
import type { ResultSnapshot } from "@pixelz/ts-game-core";

export type ProjectedLeaderboardInsight = {
  projectedRank: number | null;
  nextTarget: {
    rank: number;
    moves: number;
    timeMs: number;
  } | null;
};

type ProjectionCandidate = {
  rank: number;
  moves: number;
  timeMs: number;
};

export function isNewPixelzBest(
  previousBest: ResultSnapshot | null,
  currentBest: LevelProgressSnapshot | null
): boolean {
  if (!currentBest) return false;
  if (!previousBest) return true;
  if (currentBest.bestMoves !== previousBest.moves) {
    return currentBest.bestMoves < previousBest.moves;
  }
  return currentBest.bestTimeMs < previousBest.timeMs;
}

export function isNewReflexBest(
  previousBest: ResultSnapshot | null,
  currentBest: LevelProgressSnapshot | null
): boolean {
  if (!currentBest) return false;
  if (!previousBest) return true;
  return currentBest.bestTimeMs < previousBest.timeMs;
}

function projectAgainstLeaderboard(
  leaderboard: LeaderboardResponse | null,
  beatsOrTiesEntry: (entry: ProjectionCandidate) => boolean
): ProjectedLeaderboardInsight {
  if (!leaderboard) {
    return {
      projectedRank: null,
      nextTarget: null,
    };
  }

  const projectedIndex = leaderboard.entries.findIndex((entry) => beatsOrTiesEntry(entry));
  const projectedRank =
    projectedIndex === -1
      ? (leaderboard.entries.at(-1)?.rank ?? 0) + 1
      : leaderboard.entries[projectedIndex].rank;
  const nextTarget =
    projectedIndex === -1
      ? leaderboard.entries.at(-1) ?? null
      : projectedIndex > 0
        ? leaderboard.entries[projectedIndex - 1]
        : null;

  return {
    projectedRank,
    nextTarget: nextTarget
      ? {
          rank: nextTarget.rank,
          moves: nextTarget.moves,
          timeMs: nextTarget.timeMs,
        }
      : null,
  };
}

export function getProjectedLeaderboardInsight(
  result: ResultSnapshot,
  leaderboard: LeaderboardResponse | null
): ProjectedLeaderboardInsight {
  return projectAgainstLeaderboard(
    leaderboard,
    (entry) => result.moves < entry.moves || (result.moves === entry.moves && result.timeMs <= entry.timeMs)
  );
}

export function getProjectedReflexLeaderboardInsight(
  timeMs: number,
  leaderboard: LeaderboardResponse | null
): ProjectedLeaderboardInsight {
  // Reflex leaderboards are sorted best-first, so lower times appear earlier in the API payload.
  return projectAgainstLeaderboard(leaderboard, (entry) => timeMs <= entry.timeMs);
}

export function qualifiesForLeaderboardPrompt(rank: number | null, leaderboardSize: number): boolean {
  if (rank == null || leaderboardSize <= 0) return false;
  if (leaderboardSize < 100) return rank <= 10;
  return rank <= Math.ceil(leaderboardSize * 0.1);
}
