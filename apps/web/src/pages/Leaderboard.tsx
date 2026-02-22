import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  REFLEX_LEVEL_IDS,
  REFLEX_LEVELS,
  PIXELZ_LEVEL_IDS,
  PIXELZ_LEVELS,
  isPixelzBoardId,
  isPredefinedPixelzLevel,
} from "@pixelz/shared";
import { fetchLeaderboard, fetchMyPlayedBoards, createLeaderboardTimeoutSignal } from "../lib/api";
import { supabase } from "../lib/supabase";

type GameId = "reflex" | "pixelz";

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

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const levelParam = searchParams.get("level");
  const gameParam = searchParams.get("game");
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
  const isPixelz = game === "pixelz";

  const [pixelzBoardInput, setPixelzBoardInput] = useState("");
  const [myBoardIds, setMyBoardIds] = useState<string[]>([]);
  const [myBoardsLoading, setMyBoardsLoading] = useState(false);
  useEffect(() => {
    if (isPixelzBoardId(effectiveLevel)) setPixelzBoardInput(effectiveLevel);
  }, [effectiveLevel]);
  useEffect(() => {
    if (game !== "pixelz") return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token || cancelled) return;
      setMyBoardsLoading(true);
      fetchMyPlayedBoards(session.access_token)
        .then((r) => { if (!cancelled) setMyBoardIds(r.boardIds); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setMyBoardsLoading(false); });
    });
    return () => { cancelled = true; };
  }, [game]);

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (levelParam !== effectiveLevel || (game === "reflex" && !levelParam) || (game === "pixelz" && !levelParam)) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("game", game);
        next.set("level", effectiveLevel);
        return next;
      });
    }
  }, [game, levelParam, effectiveLevel, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { signal, cleanup: cleanupTimeout } = createLeaderboardTimeoutSignal();
    const run = async () => {
      try {
        const result = await fetchLeaderboard(effectiveLevel, undefined, signal);
        cleanupTimeout();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
        if (!cancelled && justFinished) {
          try {
            const token = (await supabase.auth.getSession()).data.session?.access_token ?? undefined;
            const withUser = await fetchLeaderboard(effectiveLevel, token);
            if (!cancelled) setData(withUser);
          } catch {
            // Already have data
          }
        }
      } catch (err) {
        cleanupTimeout();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed");
          setLoading(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      cleanupTimeout();
    };
  }, [effectiveLevel, justFinished]);

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

  const highlightedRowKey = useMemo(() => {
    if (!data?.entries.length || !justFinished || !data.currentUserId) return null;
    const mine = data.entries.filter((e) => e.userId === data.currentUserId);
    if (mine.length === 0) return null;
    const latest = mine.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    return `${latest.userId}-${latest.createdAt}`;
  }, [data?.entries, data?.currentUserId, justFinished]);

  if (loading) return <div className="page-container"><p className="loading-text">Loading leaderboard…</p></div>;
  if (error) return <div className="page-container"><p className="text-error">{error}</p></div>;
  if (!data) return null;

  const colSpan = isPixelz ? 6 : 4;

  return (
    <div className="page-container page-container--wide">
      <div className="page-header">
        <h2>Leaderboard</h2>
      </div>

      {/* Game picker */}
      <div className="btn-group mb-md">
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

      {/* Level / board picker */}
      <div className="flex flex-wrap gap-md items-center mb-lg" style={{ alignItems: "flex-start" }}>
        {game === "reflex" ? (
          <label className="text-sm">
            Level:{" "}
            <select value={effectiveLevel} onChange={(e) => setLevel(e.target.value)} className="input input--inline" style={{ width: 160 }}>
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
            <div className="flex gap-sm items-center">
              <input
                type="text"
                value={pixelzBoardInput}
                onChange={(e) => setPixelzBoardInput(e.target.value)}
                placeholder="Board ID (pixelz_...)"
                className="input input--inline"
                style={{ width: 200 }}
              />
              <button
                type="button"
                onClick={() => pixelzBoardInput.trim() && setLevel(pixelzBoardInput.trim())}
                className="btn btn-sm"
              >
                Go
              </button>
            </div>
            {myBoardsLoading ? (
              <span className="text-muted text-sm">Loading my boards…</span>
            ) : myBoardIds.length > 0 ? (
              <div className="flex flex-wrap gap-sm items-center">
                <span className="text-muted text-sm">My boards:</span>
                {myBoardIds.slice(0, 8).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLevel(id)}
                    className={`btn-toggle ${effectiveLevel === id ? "btn-toggle--active" : ""}`}
                    title={id}
                    style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {isPredefinedPixelzLevel(id) ? PIXELZ_LEVELS[id] : id.slice(0, 12) + "…"}
                  </button>
                ))}
                {myBoardIds.length > 8 && (
                  <span className="text-muted text-xs">+{myBoardIds.length - 8} more</span>
                )}
              </div>
            ) : null}
            {isPixelz && (
              <Link
                to={`/play?game=pixelz&level=${encodeURIComponent(effectiveLevel)}`}
                className="btn btn-sm btn-primary"
                style={{ marginLeft: "auto" }}
              >
                Play this board
              </Link>
            )}
          </>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              {isPixelz && (
                <>
                  <th className="text-right">Score</th>
                  <th className="text-right">Moves</th>
                </>
              )}
              <th className="text-right">Time (s)</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-muted" style={{ padding: "1.5rem" }}>
                  No entries yet.
                </td>
              </tr>
            ) : (
              data.entries.map((e) => {
                const rowKey = `${e.userId}-${e.createdAt}`;
                const isHighlighted = highlightedRowKey === rowKey;
                return (
                  <tr
                    key={rowKey}
                    className={isHighlighted ? "table-row--highlight" : ""}
                  >
                    <td>{e.rank}</td>
                    <td>{displayUser(e)}</td>
                    {isPixelz && (
                      <>
                        <td className="text-right">{e.score.toLocaleString()}</td>
                        <td className="text-right">{e.moves}</td>
                      </>
                    )}
                    <td className="text-right">
                      {(e.timeMs / 1000).toFixed(2)}
                    </td>
                    <td className="text-muted text-sm">
                      {formatTimestamp(e.createdAt)}
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
