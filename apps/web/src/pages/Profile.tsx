import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createLeaderboardTimeoutSignal, fetchLeaderboard } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  formatBoardLabel,
  formatCountdown,
  getCompetitionProfile,
  getCurrentSeason,
  getQuickPlayLevel,
  getSeasonTier,
  getSeasonWindowStart,
  type GameId,
} from "../lib/competition";

type SeasonStanding = {
  gameId: GameId;
  levelId: string;
  rank: number | null;
  totalEntries: number;
  leaderLine: string;
  tier: string;
};

function formatSeasonLeader(gameId: GameId, entry: { moves: number; timeMs: number } | undefined) {
  if (!entry) return "No season runs yet";
  if (gameId === "pixelz") return `${entry.moves} moves · ${(entry.timeMs / 1000).toFixed(2)}s`;
  return `${(entry.timeMs / 1000).toFixed(2)}s`;
}

export default function Profile() {
  const [now, setNow] = useState(() => new Date());
  const [seasonStandings, setSeasonStandings] = useState<Record<GameId, SeasonStanding> | null>(null);
  const [loading, setLoading] = useState(true);

  const currentSeason = useMemo(() => getCurrentSeason(now), [now]);
  const profile = useMemo(() => getCompetitionProfile(now), [now]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { signal, cleanup } = createLeaderboardTimeoutSignal();

    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? undefined;
        const sinceIso = getSeasonWindowStart().toISOString();
        const levels: Array<{ gameId: GameId; levelId: string }> = [
          { gameId: "pixelz", levelId: getQuickPlayLevel("pixelz") },
          { gameId: "reflex", levelId: getQuickPlayLevel("reflex") },
        ];
        const results = await Promise.all(
          levels.map(async ({ gameId, levelId }) => {
            const leaderboard = await fetchLeaderboard(levelId, token, signal, "all", sinceIso);
            const mine = leaderboard.currentUserId
              ? leaderboard.entries.find((entry) => entry.userId === leaderboard.currentUserId) ?? null
              : null;
            const tier = mine ? getSeasonTier(mine.rank, leaderboard.entries.length).name : "Unseeded";
            return [
              gameId,
              {
                gameId,
                levelId,
                rank: mine?.rank ?? null,
                totalEntries: leaderboard.entries.length,
                leaderLine: formatSeasonLeader(gameId, leaderboard.entries[0]),
                tier,
              },
            ] as const;
          })
        );

        if (!cancelled) {
          setSeasonStandings(Object.fromEntries(results) as Record<GameId, SeasonStanding>);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      } finally {
        cleanup();
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [currentSeason.id]);

  return (
    <div className="page-container page-container--wide leaderboard-page">
      <div className="page-header">
        <p className="section-kicker">Profile</p>
        <h2>Your Competitive Identity</h2>
        <p>Track streaks, season form, rivals, and the boards that are defining your run right now.</p>
      </div>

      <section className="leaderboard-summary-grid">
        <article className="card personal-summary-card">
          <p className="section-kicker">Season Snapshot</p>
          <div className="personal-chip-row">
            <div className="metric-chip">
              <span>Season</span>
              <strong>{currentSeason.shortLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Resets in</span>
              <strong>{formatCountdown(currentSeason.resetInMs)}</strong>
            </div>
            <div className="metric-chip">
              <span>Daily cycles</span>
              <strong>{profile.seasonDailyCompletions}</strong>
            </div>
          </div>
          <div className="leaderboard-actions">
            <Link to="/leaderboard?window=season&game=reflex" className="btn btn-sm btn-primary">
              Open Season Board
            </Link>
          </div>
        </article>

        <article className="card personal-summary-card">
          <p className="section-kicker">Core Stats</p>
          <div className="personal-chip-row">
            <div className="metric-chip">
              <span>Total plays</span>
              <strong>{profile.totalPlays}</strong>
            </div>
            <div className="metric-chip">
              <span>PB boards</span>
              <strong>{profile.pbBoards}</strong>
            </div>
            <div className="metric-chip">
              <span>Current streak</span>
              <strong>{profile.currentStreak} day{profile.currentStreak === 1 ? "" : "s"}</strong>
            </div>
            <div className="metric-chip">
              <span>Rivals</span>
              <strong>{profile.rivalsCount}</strong>
            </div>
          </div>
          <p className="text-muted text-sm">
            {profile.favoriteGame
              ? `${profile.favoriteGame === "pixelz" ? "Pixelz" : "Reflex"} is your most-played lane so far.`
              : "Play a few runs and your profile will start filling in with pressure points."}
          </p>
        </article>
      </section>

      <section className="leaderboard-summary-grid">
        {(["pixelz", "reflex"] as const).map((gameId) => {
          const standing = seasonStandings?.[gameId];
          return (
            <article key={gameId} className="card personal-summary-card">
              <p className="section-kicker">{gameId === "pixelz" ? "Pixelz Season" : "Reflex Season"}</p>
              <div className="personal-chip-row">
                <div className="metric-chip">
                  <span>Rank</span>
                  <strong>
                    {loading ? "Loading…" : standing?.rank ? `#${standing.rank}` : "Unseeded"}
                  </strong>
                </div>
                <div className="metric-chip">
                  <span>Tier</span>
                  <strong>{loading ? "…" : standing?.tier ?? "Unseeded"}</strong>
                </div>
                <div className="metric-chip">
                  <span>Leader</span>
                  <strong>{loading ? "…" : standing?.leaderLine ?? "No season runs yet"}</strong>
                </div>
              </div>
              <p className="text-muted text-sm">
                {standing
                  ? `${formatBoardLabel(standing.levelId)} is your active season track for ${gameId === "pixelz" ? "Pixelz" : "Reflex"}.`
                  : "Season standings appear here once the board loads."}
              </p>
              <div className="leaderboard-actions">
                <Link to={`/leaderboard?window=season&game=${gameId}&level=${encodeURIComponent(getQuickPlayLevel(gameId))}`} className="btn btn-sm">
                  View {gameId === "pixelz" ? "Pixelz" : "Reflex"} Season
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      <section className="leaderboard-summary-grid">
        <article className="card personal-summary-card">
          <p className="section-kicker">Recent Boards</p>
          {profile.recentlyPlayed.length > 0 ? (
            <ul className="board-list">
              {profile.recentlyPlayed.map((entry) => (
                <li key={`${entry.gameId}:${entry.levelId}`} className="board-item board-item--rich">
                  <div className="board-item-copy">
                    <strong>{formatBoardLabel(entry.levelId)}</strong>
                    <span className="text-muted text-sm">
                      {entry.gameId === "pixelz"
                        ? `${entry.bestMoves} moves · ${(entry.bestTimeMs / 1000).toFixed(2)}s`
                        : `${(entry.bestTimeMs / 1000).toFixed(2)}s PB`}
                    </span>
                  </div>
                  <div className="board-item-actions">
                    <Link to={`/play?game=${entry.gameId}&level=${encodeURIComponent(entry.levelId)}`} className="btn btn-sm btn-primary">
                      Run it back
                    </Link>
                    <Link to={`/leaderboard?game=${entry.gameId}&level=${encodeURIComponent(entry.levelId)}`} className="btn btn-sm">
                      Board
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">Your recent boards will appear here after your first few runs.</p>
          )}
        </article>

        <article className="card personal-summary-card">
          <p className="section-kicker">Achievements</p>
          <ul className="board-list">
            {profile.achievements.map((achievement) => (
              <li key={achievement.id} className="board-item board-item--rich">
                <div className="board-item-copy">
                  <strong>{achievement.label}</strong>
                  <span className="text-muted text-sm">{achievement.description}</span>
                </div>
                <span className={`status-pill ${achievement.earned ? "status-pill--success" : ""}`}>
                  {achievement.earned ? "Earned" : "In progress"}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
