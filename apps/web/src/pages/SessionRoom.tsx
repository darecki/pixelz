import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getGameById } from "../games/registry";
import { supabase } from "../lib/supabase";
import {
  beginSession,
  fetchSession,
  finishSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../lib/api";

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

  useEffect(() => {
    if (!data) return;
    const channel = supabase.channel(`session:${data.session.id}`);
    channel
      .on("broadcast", { event: "*" }, () => {
        refresh().catch(() => {});
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data?.session.id, refresh]);

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
      const ch = supabase.channel(`session:${data.session.id}`);
      await ch.send({ type: "broadcast", event: "player_ready", payload: { sessionId: data.session.id } });
      await supabase.removeChannel(ch);
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
    const ch = supabase.channel(`session:${data.session.id}`);
    await ch.send({ type: "broadcast", event: "player_finished", payload: { sessionId: data.session.id } });
    await supabase.removeChannel(ch);
  }

  if (loading) return <div style={{ padding: "1rem" }}>Loading session…</div>;
  if (error) return <div style={{ padding: "1rem", color: "#c00" }}>{error}</div>;
  if (!data) return <div style={{ padding: "1rem" }}>Session not found.</div>;

  const game = getGameById(data.session.game);
  const GameComponent = game?.component;

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
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "0.9rem", color: "#666", wordBreak: "break-all" }}>Invite link: {inviteUrl}</p>
        {data.session.status === "ready" && (
          <p>Game starts in: {Math.max(0, Math.ceil(remainingMs / 1000))}s</p>
        )}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={handleReady} disabled={working}>
            {working ? "Please wait…" : "Ready"}
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
      <Suspense fallback={<div style={{ padding: "1rem" }}>Loading game…</div>}>
        <GameComponent
          levelId={data.session.levelId}
          sessionProps={{
            seed: data.session.seed,
            onComplete: handleComplete,
            onProgress: () => {},
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
