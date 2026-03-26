import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatCountdown,
  getCompetitionOverview,
  getDailyChallenges,
  getLevelProgress,
  getQuickPlayLevel,
  type GameId,
} from "../lib/competition";
import ReflexPreviewFrame from "../components/ReflexPreviewFrame";
import PixelzPreviewFrame from "../components/PixelzPreviewFrame";

const GAME_COPY: Record<GameId, { title: string; subtitle: string; accentClass: string }> = {
  reflex: {
    title: "Reflex",
    subtitle: "Tight rounds, instant rematches, and split-second bragging rights.",
    accentClass: "card-accent-strip--coral",
  },
  pixelz: {
    title: "Pixelz",
    subtitle: "Chase cleaner boards, lower move counts, and cleaner challenge links.",
    accentClass: "card-accent-strip--teal",
  },
};

function formatPersonalBest(gameId: GameId, progress: ReturnType<typeof getLevelProgress>) {
  if (!progress) return "No run yet";
  return gameId === "pixelz" ? `${progress.bestMoves} moves` : `${(progress.bestTimeMs / 1000).toFixed(2)}s`;
}

export default function Home() {
  const [now, setNow] = useState(() => new Date());

  const daily = useMemo(() => getDailyChallenges(now), [now]);
  const dailyChallenges = useMemo(() => daily.challenges, [daily]);
  const overview = useMemo(() => getCompetitionOverview(now), [now]);
  const challengeByGame = useMemo(
    () => Object.fromEntries(dailyChallenges.map((challenge) => [challenge.gameId, challenge])) as Partial<Record<GameId, typeof dailyChallenges[number]>>,
    [dailyChallenges]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="page-container page-container--wide home-dashboard">
      <header className="home-chooser-header">
        <h1>Pixelz</h1>
        <p className="home-subtitle">Select your challenge</p>
      </header>

      <section className="home-status-bar">
        <div className="home-status-item">
          <span>Daily Reset</span>
          <strong>{formatCountdown(daily.resetInMs)}</strong>
        </div>
        <div className="home-status-item">
          <span>Current Streak</span>
          <strong>{overview.streak} day{overview.streak === 1 ? "" : "s"}</strong>
        </div>
        <div className="home-status-links">
          <Link to="/leaderboard" className="home-shortcut-link">
            Leaderboards
          </Link>
          <Link to="/profile" className="home-shortcut-link">
            Profile
          </Link>
          <Link to="/configure/pixelz?mode=multi" className="home-shortcut-link">
            Create Match
          </Link>
        </div>
      </section>

      <section className="chooser-grid">
        {(Object.keys(GAME_COPY) as GameId[]).map((gameId) => {
          const gameCopy = GAME_COPY[gameId];
          const progress = getLevelProgress(gameId, getQuickPlayLevel(gameId));
          const challenge = challengeByGame[gameId];
          const completedToday = Boolean(challenge) && overview.completedToday.includes(gameId);

          return (
            <article key={gameId} className="card card--interactive chooser-card">
              <div className={`card-accent-strip ${gameCopy.accentClass}`} />
              <div className="game-card-preview chooser-card-preview">
                {gameId === "reflex" ? <ReflexPreviewFrame /> : <PixelzPreviewFrame />}
              </div>
              <div className="chooser-card-body">
                <div className="chooser-card-header">
                  <div>
                    <h2 className="game-card-title">{gameCopy.title}</h2>
                    <p className="game-card-desc chooser-card-copy">{gameCopy.subtitle}</p>
                  </div>
                  <span className={`status-pill ${completedToday ? "status-pill--success" : ""}`}>
                    {challenge ? (completedToday ? "Daily done" : "Daily live") : "Quick queue"}
                  </span>
                </div>

                <div className="chooser-card-meta">
                  <span className="mini-stat">
                    {challenge ? (
                      <>Today: <strong>{challenge.label}</strong></>
                    ) : (
                      <>Mode: <strong>Quick Play</strong></>
                    )}
                  </span>
                  <span className="mini-stat">
                    PB: <strong>{progress ? formatPersonalBest(gameId, progress) : "none"}</strong>
                  </span>
                </div>

                <div className="chooser-card-actions">
                  <Link
                    to={`/play?game=${gameId}&level=${encodeURIComponent(getQuickPlayLevel(gameId))}`}
                    className="btn btn-primary"
                  >
                    Quick Play
                  </Link>
                  {challenge && (
                    <Link
                      to={`/play?game=${gameId}&level=${encodeURIComponent(challenge.levelId)}&daily=1`}
                      className="btn"
                    >
                      Today&apos;s Challenge
                    </Link>
                  )}
                  <Link to={`/configure/${gameId}?mode=solo`} className="home-shortcut-link">
                    More options
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
