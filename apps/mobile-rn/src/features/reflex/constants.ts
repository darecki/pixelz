import { REFLEX_LEVELS, type ReflexLevelId } from "@pixelz/ts-game-core";

export const REFLEX_COLORS = [
  "#e53935",
  "#1e88e5",
  "#43a047",
  "#fdd835",
  "#8e24aa",
] as const;

export const COUNTDOWN_MS = 500;
export const DELAY_AFTER_CORRECT_MS = 900;

export function getRoundsForLevel(levelId: string): number {
  return REFLEX_LEVELS[levelId as ReflexLevelId] ?? 10;
}
