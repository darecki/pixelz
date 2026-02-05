import { z } from "zod";

const levelCompletedPayload = z.object({
  levelId: z.string(),
  score: z.number().int().min(0),
  moves: z.number().int().min(0),
  timeMs: z.number().int().min(0),
});

const randomLevelPlayedPayload = z.object({
  seed: z.string(),
  score: z.number().int().min(0),
  moves: z.number().int().min(0),
  timeMs: z.number().int().min(0),
});

const setNicknamePayload = z.object({
  nickname: z.string().min(1).max(32),
});

const createChallengePayload = z.object({
  seed: z.string(),
  opponentId: z.string().optional(),
});

export const levelCompletedEvent = z.object({
  type: z.literal("LEVEL_COMPLETED"),
  payload: levelCompletedPayload,
  clientTimestamp: z.number().int().optional(),
});

export const randomLevelPlayedEvent = z.object({
  type: z.literal("RANDOM_LEVEL_PLAYED"),
  payload: randomLevelPlayedPayload,
  clientTimestamp: z.number().int().optional(),
});

export const setNicknameEvent = z.object({
  type: z.literal("SET_NICKNAME"),
  payload: setNicknamePayload,
  clientTimestamp: z.number().int().optional(),
});

export const createChallengeEvent = z.object({
  type: z.literal("CREATE_CHALLENGE"),
  payload: createChallengePayload,
  clientTimestamp: z.number().int().optional(),
});

export const syncEvent = z.discriminatedUnion("type", [
  levelCompletedEvent,
  randomLevelPlayedEvent,
  setNicknameEvent,
  createChallengeEvent,
]);

export type SyncEvent = z.infer<typeof syncEvent>;
export type LevelCompletedEvent = z.infer<typeof levelCompletedEvent>;
export type RandomLevelPlayedEvent = z.infer<typeof randomLevelPlayedEvent>;
export type SetNicknameEvent = z.infer<typeof setNicknameEvent>;
export type CreateChallengeEvent = z.infer<typeof createChallengeEvent>;
