import { z } from "zod";
import {
  PIXELZ_LEVEL_IDS,
  REFLEX_LEVELS,
  computePixelzScore,
  type PixelzLevelId,
  type ReflexLevelId,
} from "./constants.js";

const reflexLevelIds = Object.keys(REFLEX_LEVELS) as ReflexLevelId[];

const pixelzLevelIdSchema = z.custom<PixelzLevelId>((value) => {
  return typeof value === "string" && (PIXELZ_LEVEL_IDS as readonly string[]).includes(value);
}, "Invalid Pixelz level id");

const reflexLevelIdSchema = z.custom<ReflexLevelId>((value) => {
  return typeof value === "string" && reflexLevelIds.includes(value as ReflexLevelId);
}, "Invalid Reflex level id");

export const pixelzSessionSettingsSchema = z.object({
  width: z.number().int().min(1).max(30).default(7),
  height: z.number().int().min(1).max(30).default(10),
  numColors: z.number().int().min(2).max(10).default(5),
});

export const reflexSessionSettingsSchema = z.object({
  rounds: z.number().int().min(1).max(50),
});

export const createSessionSchema = z.union([
  z.object({
    game: z.literal("pixelz"),
    mode: z.literal("predefined"),
    levelId: pixelzLevelIdSchema,
    settings: z.undefined().optional(),
    maxPlayers: z.number().int().min(2).max(10).optional(),
  }),
  z.object({
    game: z.literal("pixelz"),
    mode: z.literal("generated"),
    levelId: z.undefined().optional(),
    settings: pixelzSessionSettingsSchema,
    maxPlayers: z.number().int().min(2).max(10).optional(),
  }),
  z.object({
    game: z.literal("reflex"),
    mode: z.literal("predefined"),
    levelId: reflexLevelIdSchema,
    settings: z.undefined().optional(),
    maxPlayers: z.number().int().min(2).max(10).optional(),
  }),
]);

export const finishSessionSchema = z.object({
  moves: z.number().int().min(0),
  timeMs: z.number().int().min(0),
  moveSequence: z.array(z.number().int().min(0).max(9)).optional(),
});

export const SESSION = {
  INVITE_CODE_LENGTH: 8,
  HEARTBEAT_INTERVAL_MS: 10_000,
  DISCONNECT_TIMEOUT_MS: 30_000,
  LOBBY_TTL_MS: 30 * 60 * 1000,
  COUNTDOWN_AFTER_READY_MS: 3_000,
} as const;

export type SessionStatus =
  | "waiting"
  | "ready"
  | "playing"
  | "finished"
  | "cancelled"
  | "abandoned";
export type PlayerStatus = "joined" | "ready" | "playing" | "finished" | "abandoned";
export type PlayerRole = "host" | "guest";

export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export type FinishSessionRequest = z.infer<typeof finishSessionSchema>;

export type PlayerResult = {
  score: number;
  moves: number;
  timeMs: number;
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
  return a.timeMs - b.timeMs;
}
