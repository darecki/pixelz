import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getGameById } from "../games/registry";
import {
  beginSession,
  createSession,
  fetchSession,
  finishSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../lib/api";
import { useGameSession } from "../hooks/useGameSession";

function useNowTick(enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export default function SessionRoom() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const beginTriggeredRef = useRef(false);

  const refresh = useCallback(async () => {
    const next = await fetchSession(sessionId);
    setData(next);
  }, [sessionId]);
  const handleHint = useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSession(sessionId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load session");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const { progressByUser, onlineSet, broadcast, broadcastProgress } = useGameSession(
    data?.session.id ?? null,
    data?.currentUserId ?? null,
    handleHint
  );

  const tickNow = useNowTick(Boolean(data?.session.status === "ready" && data.session.startsAt));
  const remainingMs = data?.session.startsAt
    ? new Date(data.session.startsAt).getTime() - tickNow
    : 0;

  useEffect(() => {
    if (!data || data.session.status !== "ready" || !data.session.startsAt) return;
    if (remainingMs > 0 || beginTriggeredRef.current) return;
    beginTriggeredRef.current = true;
    beginSession(data.session.id)
      .catch(() => {})
      .finally(() => {
        refresh().catch(() => {});
      });
  }, [data, remainingMs, refresh]);

  useEffect(() => {
    if (data?.session.status !== "ready") {
      beginTriggeredRef.current = false;
    }
  }, [data?.session.status]);

  async function handleReady() {
    if (!data) return;
    setWorking(true);
    try {
      await markSessionReady(data.session.id);
      await refresh();
      await broadcast("player_ready", { sessionId: data.session.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark ready");
    } finally {
      setWorking(false);
    }
  }

  async function handleLeave() {
    if (!data) return;
    setWorking(true);
    try {
      await leaveSession(data.session.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave session");
      setWorking(false);
    }
  }

  async function handleComplete(result: { moves: number; timeMs: number; moveSequence?: number[] }) {
    if (!data) return;
    try {
      await finishSession(data.session.id, result);
      await refresh();
      await broadcast("player_finished", { sessionId: data.session.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete session");
    }
  }

  async function handlePlayNextGame() {
    if (!data) return;
    setWorking(true);
    try {
      let created;
      if (data.session.game === "reflex") {
        if (!data.session.levelId) throw new Error("Missing reflex level");
        created = await createSession({
          game: "reflex",
          mode: "predefined",
          levelId: data.session.levelId,
        });
      } else if (data.session.levelId?.startsWith("pixelz_level_")) {
        created = await createSession({
          game: "pixelz",
          mode: "predefined",
          levelId: data.session.levelId,
        });
      } else {
        created = await createSession({
          game: "pixelz",
          mode: "generated",
          settings: {
            width: Number((data.session.settings?.width as number | undefined) ?? 7),
            height: Number((data.session.settings?.height as number | undefined) ?? 10),
            numColors: Number((data.session.settings?.numColors as number | undefined) ?? 5),
          },
        });
      }
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create next session");
      setWorking(false);
    }
  }

  if (loading) return <div className="page-container"><p className="loading-text">Loading session…</p></div>;
  if (error) return <div className="page-container"><p className="text-error">{error}</p></div>;
  if (!data) return <div className="page-container"><p className="text-muted">Session not found.</p></div>;

  const game = getGameById(data.session.game);
  const GameComponent = game?.component;
  const selfUserId = data.currentUserId;
  const me = data.players.find((p) => p.userId === selfUserId) ?? null;
  const opponent = data.players.find((p) => p.userId !== selfUserId) ?? null;
  const opponentProgress = opponent ? progressByUser[opponent.userId] : null;

  if (data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned") {
    return (
      <div className="page-container">
        <div className="card">
          <h2 className="mb-md">Session Results</h2>
          <p className="text-secondary mb-sm">Status: <span className="badge">{data.session.status}</span></p>
          <ul className="lobby-players">
            {data.players.map((p) => (
              <li key={p.userId} className="lobby-player">
                <span className="lobby-player-name">{p.nickname ?? p.userId}</span>
                <span className="badge">{p.status}</span>
                {p.timeMs != null && <span className="text-sm"> {(p.timeMs / 1000).toFixed(2)}s</span>}
                {p.score != null && <span className="text-sm"> score {p.score}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-sm">
            <button type="button" onClick={handlePlayNextGame} disabled={working} className="btn btn-primary">
              Play Next Game
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn btn-ghost">Leave</button>
          </div>
        </div>
      </div>
    );
  }

  if (data.session.status === "waiting" || data.session.status === "ready") {
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/join/${encodeURIComponent(data.session.inviteCode)}`
        : `/join/${encodeURIComponent(data.session.inviteCode)}`;
    return (
      <div className="page-container">
        <div className="card">
          <h2 className="mb-md">Lobby</h2>
          <p className="text-secondary mb-sm">Game: <strong>{data.session.game}</strong></p>
          <p className="text-secondary mb-md">Players: <strong>{data.players.length} / {data.session.maxPlayers}</strong></p>
          <ul className="lobby-players">
            {data.players.map((p) => (
              <li key={p.userId} className="lobby-player">
                {onlineSet.has(p.userId) ? <span className="online-dot" /> : <span className="offline-dot" />}
                <span className="lobby-player-name">{p.nickname ?? p.userId}</span>
                <span className="badge">{p.role}</span>
                <span className="badge">{p.status}</span>
              </li>
            ))}
          </ul>
          <div className="invite-link mb-md">{inviteUrl}</div>
          {data.session.status === "ready" && (
            <p className="text-secondary mb-sm">Game starts in: <strong>{Math.max(0, Math.ceil(remainingMs / 1000))}s</strong></p>
          )}
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={handleReady}
              disabled={working || me?.status === "ready" || me?.status === "playing" || me?.status === "finished"}
              className="btn btn-primary"
            >
              {working ? "Please wait…" : me?.status === "ready" ? "Ready ✓" : "Ready"}
            </button>
            <button type="button" onClick={handleLeave} disabled={working} className="btn btn-ghost">
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!GameComponent || !data.session.levelId) {
    return <div className="page-container"><p className="text-error">Unable to render game session.</p></div>;
  }

  return (
    <div>
      {opponent && (
        <div className="opponent-bar">
          Opponent: <strong>{opponent.nickname ?? opponent.userId}</strong>
          {opponentProgress
            ? ` · ${opponentProgress.moves} moves · ${(opponentProgress.timeMs / 1000).toFixed(1)}s`
            : " · no progress yet"}
        </div>
      )}
      <Suspense fallback={<div className="page-container"><p className="loading-text">Loading game…</p></div>}>
        <GameComponent
          levelId={data.session.levelId}
          sessionProps={{
            seed: data.session.seed,
            onComplete: handleComplete,
            onProgress: broadcastProgress,
          }}
        />
      </Suspense>
      <div style={{ padding: "0.5rem 1rem" }}>
        <button type="button" onClick={handleLeave} disabled={working} className="btn btn-ghost btn-sm">
          Leave Session
        </button>
      </div>
    </div>
  );
}
