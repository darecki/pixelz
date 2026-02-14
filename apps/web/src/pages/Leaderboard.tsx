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
      if (next.has("justFinished")) next.set("justFinished", "1");
      return next;
    });
  }

  function setLevel(next: string) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("level", next);
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

  if (loading) return <p>Loading leaderboard…</p>;
  if (error) return <p style={{ color: "#c00" }}>{error}</p>;
  if (!data) return null;

  const colSpan = isPixelz ? 6 : 4;

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Leaderboard</h2>

      {/* Game picker */}
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={() => setGame("reflex")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: game === "reflex" ? "#eee" : "transparent",
            fontWeight: game === "reflex" ? 600 : 400,
          }}
        >
          Reflex
        </button>
        <button
          type="button"
          onClick={() => setGame("pixelz")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: game === "pixelz" ? "#eee" : "transparent",
            fontWeight: game === "pixelz" ? 600 : 400,
          }}
        >
          Pixelz
        </button>
      </div>

      {/* Level / board picker */}
      <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
        {game === "reflex" ? (
          <label>
            Level:{" "}
            <select value={effectiveLevel} onChange={(e) => setLevel(e.target.value)}>
              {REFLEX_LEVEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {PIXELZ_LEVEL_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLevel(id)}
                  style={{
                    padding: "0.35rem 0.6rem",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: effectiveLevel === id ? "#e3f2fd" : "transparent",
                    fontSize: "0.9rem",
                  }}
                >
                  {PIXELZ_LEVELS[id]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                value={pixelzBoardInput}
                onChange={(e) => setPixelzBoardInput(e.target.value)}
                placeholder="Board ID (pixelz_...)"
                style={{ width: 200 }}
              />
              <button
                type="button"
                onClick={() => pixelzBoardInput.trim() && setLevel(pixelzBoardInput.trim())}
                style={{ padding: "0.35rem 0.6rem" }}
              >
                Go
              </button>
            </div>
            {myBoardsLoading ? (
              <span style={{ fontSize: "0.9rem", color: "#666" }}>Loading my boards…</span>
            ) : myBoardIds.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", color: "#666" }}>My boards:</span>
                {myBoardIds.slice(0, 8).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLevel(id)}
                    style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      background: effectiveLevel === id ? "#e8f5e9" : "transparent",
                      fontSize: "0.8rem",
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={id}
                  >
                    {isPredefinedPixelzLevel(id) ? PIXELZ_LEVELS[id] : id.slice(0, 12) + "…"}
                  </button>
                ))}
                {myBoardIds.length > 8 && (
                  <span style={{ fontSize: "0.85rem", color: "#666" }}>+{myBoardIds.length - 8} more</span>
                )}
              </div>
            ) : null}
            {isPixelz && (
              <Link
                to={`/play?game=pixelz&level=${encodeURIComponent(effectiveLevel)}`}
                style={{ padding: "0.5rem 1rem", background: "#e3f2fd", borderRadius: 4, marginLeft: "auto" }}
              >
                Play this board
              </Link>
            )}
          </>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Rank</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>User</th>
            {isPixelz && (
              <>
                <th style={{ textAlign: "right", padding: "0.5rem" }}>Score</th>
                <th style={{ textAlign: "right", padding: "0.5rem" }}>Moves</th>
              </>
            )}
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Time (s)</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>When</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{ padding: "1rem", color: "#666" }}>
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
                  style={
                    isHighlighted
                      ? { backgroundColor: "rgba(255, 220, 100, 0.35)" }
                      : undefined
                  }
                >
                  <td style={{ padding: "0.5rem" }}>{e.rank}</td>
                  <td style={{ padding: "0.5rem" }}>{displayUser(e)}</td>
                  {isPixelz && (
                    <>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{e.score.toLocaleString()}</td>
                      <td style={{ textAlign: "right", padding: "0.5rem" }}>{e.moves}</td>
                    </>
                  )}
                  <td style={{ textAlign: "right", padding: "0.5rem" }}>
                    {(e.timeMs / 1000).toFixed(2)}
                  </td>
                  <td style={{ padding: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
                    {formatTimestamp(e.createdAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
