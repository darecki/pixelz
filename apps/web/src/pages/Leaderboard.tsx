import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
  PIXELZ_LEVEL_IDS,
  PIXELZ_LEVELS,
  isPixelzBoardId,
  isPredefinedPixelzLevel,
} from "@pixelz/shared";
import { createLeaderboardTimeoutSignal, fetchBoard, fetchLeaderboard, fetchMyPlayedBoards } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  formatBoardLabel,
  formatPerformanceDelta,
  getCurrentSeason,
  getLeaderboardWindowLabel,
  getLeaderboardWindowStart,
  getRivalChallengeSummary,
  getRivalIds,
  getSeasonTier,
  getSeasonWindowStart,
  toggleRival,
  type GameId,
  type LeaderboardView,
} from "../lib/competition";

type BoardMeta = {
  boardId: string;
  width: number;
  height: number;
  numColors: number;
};

const REFLEX_DEFAULT_LEVEL = "reflex_level_1";
const PIXELZ_DEFAULT_LEVEL = "pixelz_level_1";

function displayUser(e: { nickname: string | null; userId: string }) {
  return e.nickname ?? e.userId.slice(0, 8);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function getDefaultLevel(game: GameId): string {
  return game === "reflex" ? REFLEX_DEFAULT_LEVEL : PIXELZ_DEFAULT_LEVEL;
}

function isValidLevel(game: GameId, levelId: string): boolean {
  if (game === "reflex") return (REFLEX_LEVEL_IDS as readonly string[]).includes(levelId);
  if (game === "pixelz") return isPixelzBoardId(levelId);
  return false;
}

function formatCustomBoardOptionLabel(boardId: string, meta?: BoardMeta): string {
  return meta ? formatBoardLabel(boardId, meta) : `Custom board · ${boardId.slice(0, 8)}`;
}

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const levelParam = searchParams.get("level");
  const gameParam = searchParams.get("game");
  const windowParam = searchParams.get("window");
  const scopeParam = searchParams.get("scope");
  const game: GameId =
    gameParam === "pixelz"
      ? "pixelz"
      : gameParam === "reflex"
        ? "reflex"
        : levelParam && isPixelzBoardId(levelParam)
          ? "pixelz"
          : "reflex";
  const effectiveLevel = levelParam && isValidLevel(game, levelParam)
    ? levelParam
    : getDefaultLevel(game);
  const justFinished = searchParams.get("justFinished") === "1";
  const windowKey: LeaderboardView =
    windowParam === "day" || windowParam === "week" || windowParam === "season" ? windowParam : "all";
  const scope = scopeParam === "rivals" ? "rivals" : "global";
  const isPixelz = game === "pixelz";
  const season = getCurrentSeason();

  const [myBoardIds, setMyBoardIds] = useState<string[]>([]);
  const [myBoardsLoading, setMyBoardsLoading] = useState(false);
  const [boardMeta, setBoardMeta] = useState<Record<string, BoardMeta>>({});
  const [rivalIds, setRivalIds] = useState<string[]>(() => getRivalIds());
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRivalIds(getRivalIds());
  }, []);

  useEffect(() => {
    if (game !== "pixelz") return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token || cancelled) return;
      setMyBoardsLoading(true);
      fetchMyPlayedBoards(session.access_token)
        .then((r) => {
          if (!cancelled) setMyBoardIds(r.boardIds);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setMyBoardsLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  useEffect(() => {
    if (game !== "pixelz" || isPredefinedPixelzLevel(effectiveLevel) || boardMeta[effectiveLevel]) return;
    let cancelled = false;
    fetchBoard(effectiveLevel)
      .then((board) => {
        if (cancelled) return;
        setBoardMeta((prev) => (
          prev[effectiveLevel]
            ? prev
            : {
                ...prev,
                [effectiveLevel]: {
                  boardId: board.boardId,
                  width: board.width,
                  height: board.height,
                  numColors: board.numColors,
                },
              }
        ));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [boardMeta, effectiveLevel, game]);

  useEffect(() => {
    if (
      levelParam !== effectiveLevel ||
      (game === "reflex" && !levelParam) ||
      (game === "pixelz" && !levelParam) ||
      (windowParam !== windowKey && !(windowParam == null && windowKey === "all")) ||
      (scopeParam !== scope && !(scopeParam == null && scope === "global"))
    ) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("game", game);
        next.set("level", effectiveLevel);
        if (windowKey === "all") next.delete("window");
        else next.set("window", windowKey);
        if (scope === "global") next.delete("scope");
        else next.set("scope", scope);
        return next;
      });
    }
  }, [effectiveLevel, game, levelParam, scope, scopeParam, setSearchParams, windowKey, windowParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { signal, cleanup: cleanupTimeout } = createLeaderboardTimeoutSignal();

    const run = async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token ?? undefined;
        const sinceIso =
          windowKey === "season"
            ? getSeasonWindowStart().toISOString()
            : getLeaderboardWindowStart(windowKey)?.toISOString();
        const result = await fetchLeaderboard(
          effectiveLevel,
          token,
          signal,
          windowKey === "season" ? "all" : windowKey,
          sinceIso
        );
        cleanupTimeout();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        cleanupTimeout();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed");
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
      cleanupTimeout();
    };
  }, [effectiveLevel, windowKey]);

  function setGame(nextGame: GameId) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("game", nextGame);
      next.set("level", getDefaultLevel(nextGame));
      next.delete("justFinished");
      return next;
    });
  }

  function setLevel(next: string) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("level", next);
      p.delete("justFinished");
      return p;
    });
  }

  function setWindow(next: LeaderboardView) {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (next === "all") nextParams.delete("window");
      else nextParams.set("window", next);
      nextParams.delete("justFinished");
      return nextParams;
    });
  }

  function setScope(next: "global" | "rivals") {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (next === "global") nextParams.delete("scope");
      else nextParams.set("scope", next);
      return nextParams;
    });
  }

  if (loading) return <div className="page-container"><p className="loading-text">Loading leaderboard…</p></div>;
  if (error) return <div className="page-container"><p className="text-error">{error}</p></div>;
  if (!data) return null;

  const customBoardIds = myBoardIds.filter((id) => !isPredefinedPixelzLevel(id));
  const isCustomEffective = isPixelz && !isPredefinedPixelzLevel(effectiveLevel);
  const showCustomSelect = isPixelz && (customBoardIds.length > 0 || isCustomEffective);
  const visibleEntries =
    scope === "rivals"
      ? data.entries.filter((entry) => rivalIds.includes(entry.userId) || entry.userId === data.currentUserId)
      : data.entries;
  const myEntries = data.currentUserId
    ? data.entries.filter((entry) => entry.userId === data.currentUserId)
    : [];
  const bestMine = myEntries[0] ?? null;
  const latestMine = myEntries.reduce<typeof myEntries[number] | null>((latest, current) => {
    if (!latest) return current;
    return latest.createdAt > current.createdAt ? latest : current;
  }, null);
  const nextTarget =
    bestMine && bestMine.rank > 1
      ? data.entries.find((entry) => entry.rank === bestMine.rank - 1) ?? null
      : null;
  const highlightedLatestKey = latestMine ? `${latestMine.userId}-${latestMine.createdAt}` : null;
  const highlightedBestKey = bestMine ? `${bestMine.userId}-${bestMine.createdAt}` : null;
  const podium = visibleEntries.slice(0, 3);
  const percentile = bestMine ? Math.max(1, Math.round((bestMine.rank / Math.max(data.entries.length, 1)) * 100)) : null;
  const rivalSummary = getRivalChallengeSummary(
    game,
    bestMine ? { moves: bestMine.moves, timeMs: bestMine.timeMs } : null,
    data.entries,
    rivalIds,
    data.currentUserId
  );
  const colSpan = isPixelz ? 6 : 5;
  const seasonMine = windowKey === "season" ? bestMine : null;
  const seasonTier = seasonMine ? getSeasonTier(seasonMine.rank, data.entries.length) : null;

  return (
    <div className="page-container page-container--wide leaderboard-page">
      <div className="page-header">
        <p className="section-kicker">Competition</p>
        <h2>Leaderboard</h2>
        <p>
          {getLeaderboardWindowLabel(windowKey)} view for {game === "pixelz" ? "Pixelz" : "Reflex"}.
          {windowKey === "season" ? ` ${season.label} is live now.` : windowKey !== "all" ? " Resets on a shared UTC boundary." : ""}
          {scope === "rivals" ? " Showing only your starred rivals and your own runs." : ""}
        </p>
      </div>

      <div className="leaderboard-toolbar">
        <div className="btn-group">
          <button
            type="button"
            onClick={() => setGame("reflex")}
            className={`btn-toggle ${game === "reflex" ? "btn-toggle--active" : ""}`}
          >
            Reflex
          </button>
          <button
            type="button"
            onClick={() => setGame("pixelz")}
            className={`btn-toggle ${game === "pixelz" ? "btn-toggle--active" : ""}`}
          >
            Pixelz
          </button>
        </div>

        <div className="btn-group">
          {(["all", "day", "week", "season"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWindow(option)}
              className={`btn-toggle ${windowKey === option ? "btn-toggle--active" : ""}`}
            >
              {getLeaderboardWindowLabel(option)}
            </button>
          ))}
        </div>

        <div className="btn-group">
          <button
            type="button"
            onClick={() => setScope("global")}
            className={`btn-toggle ${scope === "global" ? "btn-toggle--active" : ""}`}
          >
            Global
          </button>
          <button
            type="button"
            onClick={() => setScope("rivals")}
            className={`btn-toggle ${scope === "rivals" ? "btn-toggle--active" : ""}`}
          >
            Rivals
          </button>
        </div>
      </div>

      <div className="leaderboard-filters-card card">
        <div className="flex flex-wrap gap-md items-center" style={{ alignItems: "flex-start" }}>
          {game === "reflex" ? (
            <label className="text-sm">
              Level{" "}
              <select value={effectiveLevel} onChange={(e) => setLevel(e.target.value)} className="input input--inline" style={{ width: 180 }}>
                {REFLEX_LEVEL_IDS.map((id) => (
                  <option key={id} value={id}>
                    {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <div className="btn-group">
                {PIXELZ_LEVEL_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLevel(id)}
                    className={`btn-toggle ${effectiveLevel === id ? "btn-toggle--active" : ""}`}
                  >
                    {PIXELZ_LEVELS[id]}
                  </button>
                ))}
              </div>
              {myBoardsLoading ? (
                <span className="text-muted text-sm">Loading custom boards…</span>
              ) : showCustomSelect ? (
                <select
                  value={isCustomEffective ? effectiveLevel : ""}
                  onChange={(e) => {
                    if (e.target.value) setLevel(e.target.value);
                  }}
                  className="input input--inline"
                  style={{ width: "auto", minWidth: 220 }}
                >
                  {!isCustomEffective && <option value="" disabled>My custom boards…</option>}
                  {isCustomEffective && !customBoardIds.includes(effectiveLevel) && (
                    <option value={effectiveLevel}>{formatCustomBoardOptionLabel(effectiveLevel, boardMeta[effectiveLevel])}</option>
                  )}
                  {customBoardIds.map((id) => (
                    <option key={id} value={id}>
                      {formatCustomBoardOptionLabel(id, boardMeta[id])}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          )}
          <div className="leaderboard-actions">
              <button
                type="button"
                onClick={() => {
                  if (navigator?.clipboard?.writeText) {
                    try {
                      navigator.clipboard.writeText(window.location.href).catch(() => {});
                    } catch {
                      // Ignore clipboard write failures in unsupported contexts.
                    }
                  }
                }}
                className="btn btn-sm"
              >
              Share view
            </button>
            {isPixelz && (
              <Link
                to={`/play?game=pixelz&level=${encodeURIComponent(effectiveLevel)}`}
                className="btn btn-sm btn-primary"
              >
                Play this board
              </Link>
            )}
          </div>
        </div>
      </div>

      {(bestMine || justFinished || podium.length > 0) && (
        <section className="leaderboard-summary-grid">
          {podium.map((entry, index) => (
            <article
              key={`${entry.userId}-${entry.createdAt}`}
              className={`card podium-card podium-card--${index + 1}`}
            >
              <span className="podium-rank">#{index + 1}</span>
              <h3>{displayUser(entry)}</h3>
              <p className="podium-score">
                {isPixelz
                  ? `${entry.moves} moves · ${(entry.timeMs / 1000).toFixed(2)}s`
                  : `${(entry.timeMs / 1000).toFixed(2)}s`}
              </p>
            </article>
          ))}
          <article className="card personal-summary-card">
            <p className="section-kicker">Your Snapshot</p>
            <div className="personal-chip-row">
              <div className="metric-chip">
                <span>Best rank</span>
                <strong>{bestMine ? `#${bestMine.rank}` : "Unranked"}</strong>
              </div>
              <div className="metric-chip">
                <span>Latest run</span>
                <strong>{latestMine ? `#${latestMine.rank}` : "No run yet"}</strong>
              </div>
              <div className="metric-chip">
                <span>Percentile</span>
                <strong>{percentile ? `Top ${percentile}%` : "—"}</strong>
              </div>
            </div>
            <p className="text-muted text-sm">
              {bestMine && nextTarget
                ? `Beat #${nextTarget.rank} by ${formatPerformanceDelta(
                    game,
                    { moves: bestMine.moves, timeMs: bestMine.timeMs },
                    { moves: nextTarget.moves, timeMs: nextTarget.timeMs }
                  )}.`
                : bestMine
                  ? "You’re on the board. One sharper run takes you higher."
                  : "Play a run to unlock your personal comparison cards."}
            </p>
          </article>
          {windowKey === "season" && (
            <article className="card personal-summary-card">
              <p className="section-kicker">Season Standing</p>
              <div className="personal-chip-row">
                <div className="metric-chip">
                  <span>Season</span>
                  <strong>{season.shortLabel}</strong>
                </div>
                <div className="metric-chip">
                  <span>Tier</span>
                  <strong>{seasonTier ? seasonTier.name : "Unseeded"}</strong>
                </div>
                <div className="metric-chip">
                  <span>Best season rank</span>
                  <strong>{seasonMine ? `#${seasonMine.rank}` : "No season run yet"}</strong>
                </div>
              </div>
              <p className="text-muted text-sm">
                {seasonMine
                  ? `You're sitting in ${seasonTier?.name ?? "Bronze"} for ${season.label}. Keep pushing before the quarter resets.`
                  : "Play this level during the current season to place and unlock your tier."}
              </p>
            </article>
          )}
          {rivalSummary && (
            <article className="card personal-summary-card">
              <p className="section-kicker">Rival Challenge</p>
              <div className="personal-chip-row">
                <div className="metric-chip">
                  <span>Closest rival</span>
                  <strong>{rivalSummary.rivalName}</strong>
                </div>
                <div className="metric-chip">
                  <span>Race</span>
                  <strong>{rivalSummary.chipText}</strong>
                </div>
              </div>
              <p className="text-muted text-sm">{rivalSummary.message}</p>
              {scope !== "rivals" && (
                <button type="button" onClick={() => setScope("rivals")} className="btn btn-sm">
                  Focus rival board
                </button>
              )}
            </article>
          )}
        </section>
      )}

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              {isPixelz && <th className="text-right">Moves</th>}
              <th className="text-right">Time (s)</th>
              <th>When</th>
              <th>Rival</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-muted" style={{ padding: "1.5rem" }}>
                  {scope === "rivals"
                    ? "No rival runs here yet. Star players from the global board to build a focused race."
                    : "No entries yet."}
                </td>
              </tr>
            ) : (
              visibleEntries.map((entry) => {
                const rowKey = `${entry.userId}-${entry.createdAt}`;
                const isLatest = highlightedLatestKey === rowKey;
                const isBest = highlightedBestKey === rowKey;
                return (
                  <tr
                    key={rowKey}
                    className={[
                      isLatest ? "table-row--highlight" : "",
                      isBest ? "table-row--best" : "",
                    ].join(" ").trim()}
                  >
                    <td>{entry.rank}</td>
                    <td>
                      <div className="leaderboard-user-cell">
                        <span>{displayUser(entry)}</span>
                        {data.currentUserId === entry.userId && <span className="badge">You</span>}
                        {rivalIds.includes(entry.userId) && <span className="badge badge--accent">Rival</span>}
                        {isLatest && <span className="badge badge--accent">Latest</span>}
                        {isBest && <span className="badge badge--success">Best</span>}
                      </div>
                    </td>
                    {isPixelz && <td className="text-right">{entry.moves}</td>}
                    <td className="text-right">{(entry.timeMs / 1000).toFixed(2)}</td>
                    <td className="text-muted text-sm">{formatTimestamp(entry.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={`rival-btn ${rivalIds.includes(entry.userId) ? "rival-btn--active" : ""}`}
                        onClick={() => setRivalIds(toggleRival(entry.userId))}
                        aria-label={rivalIds.includes(entry.userId) ? "Remove rival" : "Add rival"}
                      >
                        {rivalIds.includes(entry.userId) ? "★" : "☆"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
