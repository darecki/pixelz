import { beforeEach, describe, expect, it } from "vitest";
import {
  getCompetitionOverview,
  getLeaderboardWindowStart,
  recordCompetitionResult,
  toDateKey,
} from "./competition";

describe("competition UTC daily helpers", () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
      writable: true,
    });
  });

  it("builds date keys from UTC boundaries", () => {
    expect(toDateKey(new Date("2026-03-25T23:30:00-05:00"))).toBe("2026-03-26");
    expect(toDateKey(new Date("2026-03-26T00:30:00+02:00"))).toBe("2026-03-25");
  });

  it("starts daily and weekly windows at UTC midnight", () => {
    expect(getLeaderboardWindowStart("day", new Date("2026-03-25T23:30:00-05:00"))?.toISOString()).toBe(
      "2026-03-26T00:00:00.000Z"
    );
    expect(getLeaderboardWindowStart("week", new Date("2026-03-25T23:30:00-05:00"))?.toISOString()).toBe(
      "2026-03-20T00:00:00.000Z"
    );
  });

  it("tracks daily completions against UTC day keys", () => {
    recordCompetitionResult({
      gameId: "pixelz",
      levelId: "pixelz_level_1",
      moves: 12,
      timeMs: 34000,
      dailyChallenge: true,
      completedAt: new Date("2026-03-26T00:30:00+02:00"),
    });

    expect(getCompetitionOverview(new Date("2026-03-25T23:45:00Z")).completedToday).toContain("pixelz");
    expect(getCompetitionOverview(new Date("2026-03-26T00:15:00Z")).completedToday).not.toContain("pixelz");
  });

  it("keeps the streak alive at the start of a new UTC day until the player misses a full cycle", () => {
    recordCompetitionResult({
      gameId: "pixelz",
      levelId: "pixelz_level_1",
      moves: 14,
      timeMs: 35000,
      dailyChallenge: true,
      completedAt: new Date("2026-03-24T10:00:00Z"),
    });
    recordCompetitionResult({
      gameId: "reflex",
      levelId: "reflex_level_1",
      moves: 0,
      timeMs: 4200,
      dailyChallenge: true,
      completedAt: new Date("2026-03-25T18:00:00Z"),
    });

    expect(getCompetitionOverview(new Date("2026-03-26T00:15:00Z")).streak).toBe(2);
    expect(getCompetitionOverview(new Date("2026-03-27T00:15:00Z")).streak).toBe(0);
  });
});
