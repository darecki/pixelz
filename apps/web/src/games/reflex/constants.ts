import { REFLEX_LEVELS, type ReflexLevelId } from "@pixelz/shared";

export const REFLEX_COLORS = [
  "#e53935", // red
  "#1e88e5", // blue
  "#43a047", // green
  "#fdd835", // yellow
  "#8e24aa", // purple
] as const;

export const COUNTDOWN_MS = 500;
export const DELAY_AFTER_CORRECT_MS = 1000;
export const LONG_BEEP_MS = 400;
export const SHORT_BEEP_MS = 150;

export function getRoundsForLevel(levelId: string): number {
  return REFLEX_LEVELS[levelId as ReflexLevelId] ?? 10;
}
