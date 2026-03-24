import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getGameById } from "../games/registry";
import {
  beginSession,
  createSession,
  fetchSession,
  finishSession,
  joinSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../lib/api";
import { useGameSession } from "../hooks/useGameSession";

const LOBBY_POLL_INTERVAL_MS = 1000;

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
  const [copiedInvite, setCopiedInvite] = useState(false);
  const beginTriggeredRef = useRef(false);
  const inviteCopyTimeoutRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchSession(sessionId);
    setData(next);
  }, [sessionId]);
  const handleHint = useCallback(async (event?: string, payload?: Record<string, unknown>) => {
    if (event === "next_game_created" && payload?.nextSessionId) {
      const nextId = payload.nextSessionId as string;
      try {
        await joinSession(nextId);
        navigate(`/session/${encodeURIComponent(nextId)}`);
      } catch (err) {
        console.error("Auto-join failed:", err);
      }
    } else {
      refresh().catch(() => {});
    }
  }, [refresh, navigate]);

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

  useEffect(() => {
    if (!data || (data.session.status !== "waiting" && data.session.status !== "ready")) return;
    const id = window.setInterval(() => {
      refresh().catch(() => {});
    }, LOBBY_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [data, refresh]);

  useEffect(() => {
    return () => {
      if (inviteCopyTimeoutRef.current != null) {
        window.clearTimeout(inviteCopyTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopyInviteUrl(inviteUrl: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      if (inviteCopyTimeoutRef.current != null) {
        window.clearTimeout(inviteCopyTimeoutRef.current);
      }
      inviteCopyTimeoutRef.current = window.setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      // no-op, users can still copy manually
    }
  }

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
          maxPlayers: data.session.maxPlayers,
        });
      } else if (data.session.levelId?.startsWith("pixelz_level_")) {
        created = await createSession({
          game: "pixelz",
          mode: "predefined",
          levelId: data.session.levelId,
          maxPlayers: data.session.maxPlayers,
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
          maxPlayers: data.session.maxPlayers,
        });
      }
      await broadcast("next_game_created", { nextSessionId: created.sessionId });
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create next session");
    } finally {
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
  const opponents = data.players.filter((p) => p.userId !== selfUserId);

  if (data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned") {
    const canCreateNextSession = me?.role === "host";
    const sortedPlayers = [...data.players].sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return 0; // fallback if neither has placement
    });

    return (
      <div className="page-container">
        <div className="card">
          <h2 className="mb-md">Session Results</h2>
          <p className="text-secondary mb-sm">Status: <span className="badge">{data.session.status}</span></p>
          <ul className="lobby-players">
            {sortedPlayers.map((p) => (
              <li key={p.userId} className="lobby-player">
                {p.placement != null && (
                  <span className={`badge ${p.placement === 1 ? "badge-success" : p.placement <= 3 ? "badge-primary" : ""}`}>
                    #{p.placement}
                  </span>
                )}
                <span className="lobby-player-name">{p.nickname ?? p.userId}</span>
                <span className="badge">{p.status}</span>
                {p.timeMs != null && <span className="text-sm"> {(p.timeMs / 1000).toFixed(2)}s</span>}
                {p.score != null && <span className="text-sm"> score {p.score}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-sm">
            {canCreateNextSession ? (
              <button type="button" onClick={handlePlayNextGame} disabled={working} className="btn btn-primary">
                Play Next Game
              </button>
            ) : (
              <span className="text-muted">Waiting for host to start the next game.</span>
            )}
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
          <button
            type="button"
            onClick={() => {
              handleCopyInviteUrl(inviteUrl).catch(() => {});
            }}
            className="invite-link mb-md"
            title={copiedInvite ? "Copied!" : "Click to copy invite link"}
          >
            <span className="invite-link-text">{inviteUrl}</span>
            <span className="invite-link-action" aria-hidden="true">
              {copiedInvite ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                  <path
                    d="M5 13L9.5 17.5L19 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                  <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M15 9V6C15 4.9 14.1 4 13 4H6C4.9 4 4 4.9 4 6V13C4 14.1 4.9 15 6 15H9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            {copiedInvite && <span className="invite-link-status">Copied!</span>}
          </button>
          {data.session.status === "ready" && (
            <p className="text-secondary mb-sm">Game starts in: <strong>{Math.max(0, Math.ceil(remainingMs / 1000))}s</strong></p>
          )}
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={handleReady}
              disabled={working || me?.status === "ready" || me?.status === "playing" || me?.status === "finished" || data.players.length < data.session.maxPlayers}
              className="btn btn-primary"
            >
              {working ? "Please wait…" : me?.status === "ready" ? "Ready ✓" : data.players.length < data.session.maxPlayers ? "Waiting for players…" : "Ready"}
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
      {opponents.length > 0 && (
        <div className="flex flex-col gap-sm mb-md opponents-container">
          {opponents.map((opp) => {
            const prog = progressByUser[opp.userId];
            return (
              <div key={opp.userId} className="opponent-bar">
                <strong>{opp.nickname ?? opp.userId}</strong>
                {prog
                  ? ` · ${prog.moves} moves · ${(prog.timeMs / 1000).toFixed(1)}s`
                  : " · no progress yet"}
              </div>
            );
          })}
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
