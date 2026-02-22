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
    await finishSession(data.session.id, result);
    await refresh();
    await broadcast("player_finished", { sessionId: data.session.id });
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

  if (loading) return <div style={{ padding: "1rem" }}>Loading session…</div>;
  if (error) return <div style={{ padding: "1rem", color: "#c00" }}>{error}</div>;
  if (!data) return <div style={{ padding: "1rem" }}>Session not found.</div>;

  const game = getGameById(data.session.game);
  const GameComponent = game?.component;
  const selfUserId = data.currentUserId;
  const me = data.players.find((p) => p.userId === selfUserId) ?? null;
  const opponent = data.players.find((p) => p.userId !== selfUserId) ?? null;
  const opponentProgress = opponent ? progressByUser[opponent.userId] : null;

  if (data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned") {
    return (
      <div style={{ padding: "1rem", maxWidth: 720 }}>
        <h2>Session Results</h2>
        <p>Status: {data.session.status}</p>
        <ul style={{ paddingLeft: "1rem" }}>
          {data.players.map((p) => (
            <li key={p.userId}>
              {p.nickname ?? p.userId} - {p.status}
              {p.timeMs != null ? ` - ${(p.timeMs / 1000).toFixed(2)}s` : ""}
              {p.score != null ? ` - score ${p.score}` : ""}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={handlePlayNextGame} disabled={working}>
            Play Next Game
          </button>
          <button type="button" onClick={() => navigate("/")}>Leave</button>
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
      <div style={{ padding: "1rem", maxWidth: 720 }}>
        <h2>Lobby</h2>
        <p>Game: {data.session.game}</p>
        <p>Players: {data.players.length} / {data.session.maxPlayers}</p>
        <ul style={{ paddingLeft: "1rem" }}>
          {data.players.map((p) => (
            <li key={p.userId}>
              {p.nickname ?? p.userId} - {p.role} - {p.status}
              {onlineSet.has(p.userId) ? " (online)" : " (offline)"}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "0.9rem", color: "#666", wordBreak: "break-all" }}>Invite link: {inviteUrl}</p>
        {data.session.status === "ready" && (
          <p>Game starts in: {Math.max(0, Math.ceil(remainingMs / 1000))}s</p>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleReady}
            disabled={working || me?.status === "ready" || me?.status === "playing" || me?.status === "finished"}
          >
            {working ? "Please wait…" : me?.status === "ready" ? "Ready ✓" : "Ready"}
          </button>
          <button type="button" onClick={handleLeave} disabled={working}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  if (!GameComponent || !data.session.levelId) {
    return <div style={{ padding: "1rem", color: "#c00" }}>Unable to render game session.</div>;
  }

  return (
    <div>
      {opponent && (
        <div style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", color: "#333" }}>
          Opponent: {opponent.nickname ?? opponent.userId}
          {opponentProgress
            ? ` · ${opponentProgress.moves} moves · ${(opponentProgress.timeMs / 1000).toFixed(1)}s`
            : " · no progress yet"}
        </div>
      )}
      <Suspense fallback={<div style={{ padding: "1rem" }}>Loading game…</div>}>
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
        <button type="button" onClick={handleLeave} disabled={working}>
          Leave Session
        </button>
      </div>
    </div>
  );
}
