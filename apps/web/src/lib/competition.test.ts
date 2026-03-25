import { beforeEach, describe, expect, it } from "vitest";
import {
  describeSessionFormat,
  formatPerformanceDelta,
  getCompetitionProfile,
  getCompetitionOverview,
  getCurrentSeason,
  getLeaderboardWindowStart,
  getRivalChallengeSummary,
  getSeriesMeta,
  getSeasonTier,
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

  it("summarizes the closest rival challenge for an active run", () => {
    const summary = getRivalChallengeSummary(
      "pixelz",
      { moves: 12, timeMs: 21000 },
      [
        { userId: "rival-a", nickname: "Ari", rank: 2, moves: 11, timeMs: 24000 },
        { userId: "rival-b", nickname: "Bea", rank: 5, moves: 14, timeMs: 17000 },
      ],
      ["rival-a", "rival-b"]
    );

    expect(summary?.status).toBe("behind");
    expect(summary?.rivalName).toBe("Ari");
    expect(summary?.message).toContain("1 move behind Ari");
  });

  it("gives an unplayed rival prompt when the player has no benchmark yet", () => {
    const summary = getRivalChallengeSummary(
      "reflex",
      null,
      [{ userId: "rival-a", nickname: "Ari", rank: 3, moves: 10, timeMs: 4321 }],
      ["rival-a"]
    );

    expect(summary?.status).toBe("unplayed");
    expect(summary?.chipText).toContain("Ari");
    expect(summary?.message).toContain("Put up your first answer");
  });

  it("builds the current quarter season using UTC boundaries", () => {
    const season = getCurrentSeason(new Date("2026-05-15T12:00:00Z"));
    expect(season.id).toBe("2026-q2");
    expect(season.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(season.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("derives season tiers from rank and field size", () => {
    expect(getSeasonTier(1, 100).name).toBe("Legend");
    expect(getSeasonTier(8, 100).name).toBe("Diamond");
    expect(getSeasonTier(30, 100).name).toBe("Gold");
    expect(getSeasonTier(55, 100).name).toBe("Silver");
    expect(getSeasonTier(null, 100).name).toBe("Bronze");
  });

  it("treats a best-of-3 at the round limit as decided even without a round winner", () => {
    const meta = getSeriesMeta({ seriesLength: 3, currentRound: 3, seriesWins: { "host-1": 1, "guest-1": 1 } });

    expect(meta.isBestOfThree).toBe(true);
    expect(meta.decided).toBe(true);
  });

  it("uses reflex rounds from settings when there is no predefined level id", () => {
    expect(describeSessionFormat("reflex", null, { rounds: 7 })).toBe("7 round duel");
  });

  it("describes identical runs as exactly tied", () => {
    expect(formatPerformanceDelta("reflex", { moves: 5, timeMs: 4321 }, { moves: 5, timeMs: 4321 })).toBe("exactly tied");
    expect(formatPerformanceDelta("pixelz", { moves: 12, timeMs: 12345 }, { moves: 12, timeMs: 12345 })).toBe("exactly tied");
  });

  it("aggregates a usable competition profile from local progress", () => {
    recordCompetitionResult({
      gameId: "pixelz",
      levelId: "pixelz_level_1",
      moves: 10,
      timeMs: 20000,
      dailyChallenge: true,
      completedAt: new Date("2026-04-02T12:00:00Z"),
    });
    recordCompetitionResult({
      gameId: "reflex",
      levelId: "reflex_level_1",
      moves: 10,
      timeMs: 4000,
      completedAt: new Date("2026-04-03T12:00:00Z"),
    });

    const profile = getCompetitionProfile(new Date("2026-04-03T18:00:00Z"));
    expect(profile.totalPlays).toBe(2);
    expect(profile.pbBoards).toBe(2);
    expect(profile.favoriteGame).toBe("pixelz");
    expect(profile.currentSeason.id).toBe("2026-q2");
    expect(profile.achievements.find((achievement) => achievement.id === "dual-threat")?.earned).toBe(true);
  });
});
