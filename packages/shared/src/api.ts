import { z } from "zod";
import { syncEvent } from "./events.js";

export const syncRequestSchema = z.object({
  events: z.array(syncEvent),
});

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string(),
  nickname: z.string().nullable(),
  score: z.number().int().min(0),
  moves: z.number().int().min(0),
  timeMs: z.number().int().min(0),
});

export const syncResponseSchema = z.object({
  acceptedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  rejectedIndices: z.array(z.number().int()).optional(),
});

export const leaderboardResponseSchema = z.object({
  levelId: z.string(),
  entries: z.array(leaderboardEntrySchema),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
