import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLeaderboard } from "../lib/api";
import {
  formatCountdown,
  getCompetitionOverview,
  getDailyChallenges,
  getLeaderboardWindowStart,
  getLevelProgress,
  getQuickPlayLevel,
  type GameId,
} from "../lib/competition";
import ReflexPreviewFrame from "../components/ReflexPreviewFrame";
import PixelzPreviewFrame from "../components/PixelzPreviewFrame";

type DailySnapshot = {
  entries: number;
  leader: string | null;
  bestLine: string | null;
};

const GAME_COPY: Record<GameId, { title: string; subtitle: string; accentClass: string; leaderboardGame: string }> = {
  reflex: {
    title: "Reflex",
    subtitle: "Tight rounds, instant rematches, and split-second bragging rights.",
    accentClass: "card-accent-strip--coral",
    leaderboardGame: "reflex",
  },
  pixelz: {
    title: "Pixelz",
    subtitle: "Chase cleaner boards, lower move counts, and cleaner challenge links.",
    accentClass: "card-accent-strip--teal",
    leaderboardGame: "pixelz",
  },
};

function formatDailyLeader(gameId: GameId, entry: { nickname: string | null; userId: string; moves: number; timeMs: number } | undefined) {
  if (!entry) return null;
  const who = entry.nickname ?? entry.userId.slice(0, 8);
  if (gameId === "pixelz") {
    return {
      leader: who,
      bestLine: `${entry.moves} moves · ${(entry.timeMs / 1000).toFixed(2)}s`,
    };
  }
  return {
    leader: who,
    bestLine: `${(entry.timeMs / 1000).toFixed(2)}s best`,
  };
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());
  const [dailyStats, setDailyStats] = useState<Record<GameId, DailySnapshot>>({
    pixelz: { entries: 0, leader: null, bestLine: null },
    reflex: { entries: 0, leader: null, bestLine: null },
  });
  const [dailyLoading, setDailyLoading] = useState(true);
  const [overview, setOverview] = useState(() => getCompetitionOverview());

  const daily = useMemo(() => getDailyChallenges(now), [now]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setOverview(getCompetitionOverview());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDailyLoading(true);
    Promise.all(
      daily.challenges.map(async (challenge) => {
        const dayStart = getLeaderboardWindowStart("day", now)?.toISOString();
        const data = await fetchLeaderboard(challenge.levelId, undefined, undefined, "day", dayStart).catch(() => ({
          entries: [],
        }));
        const formatted = formatDailyLeader(challenge.gameId, data.entries[0]);
        return [
          challenge.gameId,
          {
            entries: data.entries.length,
            leader: formatted?.leader ?? null,
            bestLine: formatted?.bestLine ?? null,
          },
        ] as const;
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setDailyStats(Object.fromEntries(entries) as Record<GameId, DailySnapshot>);
      })
      .finally(() => {
        if (!cancelled) setDailyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [daily, now]);

  return (
    <div className="page-container page-container--wide home-dashboard">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Competitive Arcade</div>
          <h1>Pixelz</h1>
          <p className="hero-subtitle">
            Jump straight into a run, lock in the daily challenge, or start a room before the heat drops.
          </p>
          <div className="hero-actions">
            <Link to={`/play?game=pixelz&level=${encodeURIComponent(getQuickPlayLevel("pixelz"))}`} className="btn btn-primary btn-lg">
              Quick Play Pixelz
            </Link>
            <Link to={`/play?game=reflex&level=${encodeURIComponent(getQuickPlayLevel("reflex"))}`} className="btn btn-lg">
              Quick Play Reflex
            </Link>
          </div>
        </div>
        <div className="hero-stats-grid">
          <div className="hero-stat-card">
            <span className="hero-stat-label">Daily Reset</span>
            <strong>{formatCountdown(daily.resetInMs)}</strong>
            <span className="text-muted text-sm">Fresh challenge at local midnight</span>
          </div>
          <div className="hero-stat-card">
            <span className="hero-stat-label">Current Streak</span>
            <strong>{overview.streak} day{overview.streak === 1 ? "" : "s"}</strong>
            <span className="text-muted text-sm">
              {overview.completedToday.length > 0 ? "Today is locked in" : "Finish a daily run to keep it alive"}
            </span>
          </div>
          <div className="hero-stat-card">
            <span className="hero-stat-label">Rivals Tracked</span>
            <strong>{overview.rivalsCount}</strong>
            <span className="text-muted text-sm">Star leaderboard players to build your hit list</span>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Daily Challenge</p>
            <h2>One board, one reset, one reason to come back</h2>
          </div>
          <Link to="/leaderboard" className="btn btn-sm">
            Open Leaderboards
          </Link>
        </div>

        <div className="daily-grid">
          {daily.challenges.map((challenge) => {
            const gameCopy = GAME_COPY[challenge.gameId];
            const stats = dailyStats[challenge.gameId];
            const progress = getLevelProgress(challenge.gameId, challenge.levelId);
            const completedToday = overview.completedToday.includes(challenge.gameId);

            return (
              <article key={challenge.gameId} className="card daily-card">
                <div className={`card-accent-strip ${gameCopy.accentClass}`} />
                <div className="daily-card-top">
                  <div>
                    <p className="daily-card-label">{challenge.label}</p>
                    <h3>{gameCopy.title}</h3>
                    <p className="game-card-desc">{challenge.subtitle}</p>
                  </div>
                  <span className={`status-pill ${completedToday ? "status-pill--success" : ""}`}>
                    {completedToday ? "Completed today" : "Open now"}
                  </span>
                </div>

                <div className="daily-card-metrics">
                  <div className="metric-chip">
                    <span>Players today</span>
                    <strong>{dailyLoading ? "..." : stats.entries}</strong>
                  </div>
                  <div className="metric-chip">
                    <span>Top today</span>
                    <strong>{dailyLoading ? "..." : stats.bestLine ?? "No scores yet"}</strong>
                  </div>
                  <div className="metric-chip">
                    <span>Your PB</span>
                    <strong>
                      {progress
                        ? challenge.gameId === "pixelz"
                          ? `${progress.bestMoves} moves`
                          : `${(progress.bestTimeMs / 1000).toFixed(2)}s`
                        : "No run yet"}
                    </strong>
                  </div>
                </div>

                <div className="daily-card-footer">
                  <p className="text-muted text-sm">
                    {stats.leader ? `Leader: ${stats.leader}` : "Be the first score on the board today."}
                  </p>
                  <div className="daily-card-actions">
                    <Link
                      to={`/play?game=${challenge.gameId}&level=${encodeURIComponent(challenge.levelId)}&daily=1`}
                      className="btn btn-primary"
                    >
                      Play Daily
                    </Link>
                    <Link
                      to={`/leaderboard?game=${challenge.gameId}&level=${encodeURIComponent(challenge.levelId)}&window=day`}
                      className="btn"
                    >
                      View Daily Board
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Play Now</p>
            <h2>Pick your pressure</h2>
          </div>
        </div>

        <div className="game-selector game-selector--expanded">
          {(Object.keys(GAME_COPY) as GameId[]).map((gameId) => {
            const gameCopy = GAME_COPY[gameId];
            const progress = getLevelProgress(gameId, getQuickPlayLevel(gameId));
            return (
              <article key={gameId} className="card card--interactive game-hub-card">
                <div className={`card-accent-strip ${gameCopy.accentClass}`} />
                <div className="game-card-preview">
                  {gameId === "reflex" ? <ReflexPreviewFrame /> : <PixelzPreviewFrame />}
                </div>
                <div className="game-card-body">
                  <p className="game-card-title">{gameCopy.title}</p>
                  <p className="game-card-desc">{gameCopy.subtitle}</p>
                  <div className="mini-stat-row">
                    <span className="mini-stat">
                      PB:{" "}
                      <strong>
                        {progress
                          ? gameId === "pixelz"
                            ? `${progress.bestMoves} moves`
                            : `${(progress.bestTimeMs / 1000).toFixed(2)}s`
                          : "none"}
                      </strong>
                    </span>
                    <span className="mini-stat">
                      Plays: <strong>{progress?.plays ?? 0}</strong>
                    </span>
                  </div>
                  <div className="game-hub-actions">
                    <Link
                      to={`/play?game=${gameId}&level=${encodeURIComponent(getQuickPlayLevel(gameId))}`}
                      className="btn btn-primary"
                    >
                      Quick Play
                    </Link>
                    <Link to={`/configure/${gameId}?mode=multi`} className="btn">
                      Create Match
                    </Link>
                    <Link to={`/leaderboard?game=${gameId}`} className="btn btn-ghost">
                      Leaderboard
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
