import { describe, expect, it } from "vitest";
import {
  computeCompetitionOverview,
  describeSessionFormat,
  formatBoardLabel,
  formatCountdown,
  formatPerformanceDelta,
  getCurrentSeason,
  getDailyChallenge,
  getDailyChallenges,
  getLeaderboardWindowLabel,
  getLeaderboardWindowStart,
  getQuickPlayLevel,
  getSeasonTier,
  getSeriesMeta,
  toDateKey,
} from "./competition.js";

describe("competition helpers", () => {
  it("builds UTC date keys from local boundaries", () => {
    expect(toDateKey(new Date("2026-03-25T23:30:00-05:00"))).toBe("2026-03-26");
    expect(toDateKey(new Date("2026-03-26T00:30:00+02:00"))).toBe("2026-03-25");
  });

  it("formats countdown clocks with zero padding", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(-1)).toBe("00:00:00");
  });

  it("starts daily and weekly windows from UTC midnight", () => {
    expect(getLeaderboardWindowStart("day", new Date("2026-03-25T23:30:00-05:00"))?.toISOString()).toBe(
      "2026-03-26T00:00:00.000Z"
    );
    expect(getLeaderboardWindowStart("week", new Date("2026-03-25T23:30:00-05:00"))?.toISOString()).toBe(
      "2026-03-20T00:00:00.000Z"
    );
  });

  it("creates the current quarter season from UTC boundaries", () => {
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

  it("creates a shared generated Pixelz daily board and keeps Reflex daily empty", () => {
    const pixelzDaily = getDailyChallenge("pixelz", new Date("2026-03-26T18:00:00Z"));
    const reflexDaily = getDailyChallenge("reflex", new Date("2026-03-26T18:00:00Z"));
    const dailySet = getDailyChallenges(new Date("2026-03-26T18:00:00Z"));

    expect(pixelzDaily?.levelId).toBe("pixelz_daily_2026-03-26");
    expect(pixelzDaily?.subtitle).toContain("Fresh generated board");
    expect(reflexDaily).toBeNull();
    expect(dailySet.challenges).toHaveLength(1);
  });

  it("computes streaks from local daily completion history", () => {
    const overview = computeCompetitionOverview(
      {
        "2026-03-24": ["pixelz"],
        "2026-03-25": ["reflex"],
      },
      new Date("2026-03-26T00:15:00Z"),
      3
    );

    expect(overview.streak).toBe(2);
    expect(overview.completedToday).toEqual([]);
    expect(overview.rivalsCount).toBe(3);
  });

  it("formats board labels and quick-play defaults consistently", () => {
    expect(getQuickPlayLevel("pixelz")).toBe("pixelz_level_1");
    expect(getQuickPlayLevel("reflex")).toBe("reflex_level_1");
    expect(formatBoardLabel("pixelz_daily_2026-03-26")).toBe("Daily board · 2026-03-26");
    expect(formatBoardLabel("pixelz_level_2")).toBe("Level 2");
  });

  it("describes session formats and end-of-series state", () => {
    expect(describeSessionFormat("reflex", null, { rounds: 7 })).toBe("7 round duel");
    expect(getSeriesMeta({ seriesLength: 3, currentRound: 3, seriesWins: { a: 1, b: 1 } }).decided).toBe(true);
  });

  it("formats performance deltas and window labels", () => {
    expect(formatPerformanceDelta("pixelz", { moves: 12, timeMs: 12_345 }, { moves: 12, timeMs: 12_345 })).toBe(
      "exactly tied"
    );
    expect(getLeaderboardWindowLabel("season")).toBe("Season");
  });
});
