import { computePixelzScore } from "./constants.js";

export type PlayerResult = {
  score: number;
  moves: number;
  timeMs: number;
  disqualified?: boolean;
};

export function computeSessionScore(game: "pixelz" | "reflex", moves: number, timeMs: number): number {
  if (game === "pixelz") return computePixelzScore(moves, timeMs);
  return timeMs;
}

export function comparePixelzResults(a: PlayerResult, b: PlayerResult): number {
  if (a.moves !== b.moves) return a.moves - b.moves;
  return a.timeMs - b.timeMs;
}

export function compareReflexResults(a: PlayerResult, b: PlayerResult): number {
  const aDisqualified = Boolean(a.disqualified);
  const bDisqualified = Boolean(b.disqualified);
  if (aDisqualified !== bDisqualified) return aDisqualified ? 1 : -1;
  if (aDisqualified && bDisqualified) {
    if (a.moves !== b.moves) return b.moves - a.moves;
  }
  return a.timeMs - b.timeMs;
}
