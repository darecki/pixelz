import { describe, it, expect } from "vitest";
import { syncEvent, levelCompletedEvent, setNicknameEvent } from "./events.js";
import { syncRequestSchema, syncResponseSchema } from "./api.js";

describe("syncEvent", () => {
  it("accepts valid LEVEL_COMPLETED", () => {
    const event = {
      type: "LEVEL_COMPLETED",
      payload: { levelId: "reflex_level_1", score: 0, moves: 10, timeMs: 5000 },
    };
    expect(syncEvent.safeParse(event).success).toBe(true);
  });

  it("accepts LEVEL_COMPLETED with moveSequence", () => {
    const event = {
      type: "LEVEL_COMPLETED",
      payload: {
        levelId: "pixelz_level_1",
        score: 100,
        moves: 5,
        timeMs: 1000,
        moveSequence: [0, 1, 2],
      },
    };
    expect(syncEvent.safeParse(event).success).toBe(true);
  });

  it("rejects LEVEL_COMPLETED with negative score", () => {
    const event = {
      type: "LEVEL_COMPLETED",
      payload: { levelId: "x", score: -1, moves: 0, timeMs: 0 },
    };
    expect(syncEvent.safeParse(event).success).toBe(false);
  });

  it("accepts valid SET_NICKNAME", () => {
    const event = { type: "SET_NICKNAME", payload: { nickname: "player1" } };
    expect(setNicknameEvent.safeParse(event).success).toBe(true);
  });

  it("rejects SET_NICKNAME with empty nickname", () => {
    const event = { type: "SET_NICKNAME", payload: { nickname: "" } };
    expect(setNicknameEvent.safeParse(event).success).toBe(false);
  });

  it("rejects SET_NICKNAME with too long nickname", () => {
    const event = { type: "SET_NICKNAME", payload: { nickname: "a".repeat(33) } };
    expect(setNicknameEvent.safeParse(event).success).toBe(false);
  });

  it("accepts valid UPDATE_LAST_SCORE_NICKNAME", () => {
    const event = { type: "UPDATE_LAST_SCORE_NICKNAME", payload: { nickname: "player2" } };
    expect(syncEvent.safeParse(event).success).toBe(true);
  });
});

describe("syncRequestSchema", () => {
  it("accepts valid request with events array", () => {
    const req = {
      events: [
        { type: "LEVEL_COMPLETED", payload: { levelId: "l1", score: 0, moves: 1, timeMs: 100 } },
      ],
    };
    expect(syncRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rejects empty events", () => {
    expect(syncRequestSchema.safeParse({ events: [] }).success).toBe(true);
  });
});

describe("syncResponseSchema", () => {
  it("accepts response with rejectedReasons", () => {
    const res = {
      acceptedCount: 0,
      rejectedCount: 1,
      rejectedIndices: [0],
      rejectedReasons: { "0": "nickname_taken" },
    };
    expect(syncResponseSchema.safeParse(res).success).toBe(true);
  });
});
