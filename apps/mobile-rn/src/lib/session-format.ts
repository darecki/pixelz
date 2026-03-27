import type { BoardSettings } from "@pixelz/ts-game-core";

export function toBoardSettings(value: unknown): BoardSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const next: BoardSettings = {};

  if (typeof candidate.width === "number") next.width = candidate.width;
  if (typeof candidate.height === "number") next.height = candidate.height;
  if (typeof candidate.numColors === "number") next.numColors = candidate.numColors;
  if (typeof candidate.rounds === "number") next.rounds = candidate.rounds;
  if (typeof candidate.seriesLength === "number" && (candidate.seriesLength === 1 || candidate.seriesLength === 3)) {
    next.seriesLength = candidate.seriesLength;
  }
  if (typeof candidate.currentRound === "number") next.currentRound = candidate.currentRound;
  if (candidate.seriesWins && typeof candidate.seriesWins === "object" && !Array.isArray(candidate.seriesWins)) {
    next.seriesWins = Object.fromEntries(
      Object.entries(candidate.seriesWins).filter((entry): entry is [string, number] => typeof entry[1] === "number")
    );
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
