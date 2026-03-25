import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getGameById } from "../games/registry";
import PixelzReplayViewer from "../components/PixelzReplayViewer";
import {
  beginSession,
  createNextSession,
  fetchBoard,
  fetchSession,
  finishSession,
  leaveSession,
  markSessionReady,
  type SessionResponse,
} from "../lib/api";
import { useGameSession } from "../hooks/useGameSession";
import { describeSessionFormat, formatBoardLabel, getSeriesMeta } from "../lib/competition";

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
  const [pixelzBoard, setPixelzBoard] = useState<Awaited<ReturnType<typeof fetchBoard>> | null>(null);
  const [showWinnerReplay, setShowWinnerReplay] = useState(false);
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
  const handleHint = useCallback(async () => {
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
  const isTerminalSession = Boolean(
    data && (data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned")
  );
  const currentPlayer = data?.players.find((p) => p.userId === data.currentUserId) ?? null;
  const shouldPollPlayingResults = Boolean(
    data?.session.status === "playing" && currentPlayer?.status === "finished"
  );

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
    if (!data) return;
    const shouldPoll =
      data.session.status === "waiting" ||
      data.session.status === "ready" ||
      shouldPollPlayingResults ||
      (isTerminalSession && !data.session.nextSessionId && !data.session.partyEndedAt);
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      refresh().catch(() => {});
    }, LOBBY_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [data, isTerminalSession, refresh, shouldPollPlayingResults]);

  useEffect(() => {
    const nextSessionId = data?.session.nextSessionId;
    if (!nextSessionId || nextSessionId === sessionId) return;
    navigate(`/session/${encodeURIComponent(nextSessionId)}`, { replace: true });
  }, [data?.session.nextSessionId, navigate, sessionId]);

  useEffect(() => {
    return () => {
      if (inviteCopyTimeoutRef.current != null) {
        window.clearTimeout(inviteCopyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (data?.session.game !== "pixelz" || !data.session.levelId) {
      setPixelzBoard(null);
      setShowWinnerReplay(false);
      return;
    }
    let cancelled = false;
    setShowWinnerReplay(false);
    fetchBoard(data.session.levelId)
      .then((board) => {
        if (!cancelled) setPixelzBoard(board);
      })
      .catch(() => {
        if (!cancelled) setPixelzBoard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.session.game, data?.session.levelId]);

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
      if (isTerminalSession && currentPlayer?.role === "host" && !data.session.nextSessionId) {
        void broadcast("party_closed", { sessionId: data.session.id }).catch(() => {});
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave session");
    } finally {
      setWorking(false);
    }
  }

  async function handleComplete(result: { moves: number; timeMs: number; moveSequence?: number[]; disqualified?: boolean }) {
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
      const created = await createNextSession(data.session.id);
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
      void broadcast("next_game_created", { nextSessionId: created.sessionId }).catch(() => {});
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
  const me = currentPlayer;
  const opponents = data.players.filter((p) => p.userId !== selfUserId);
  const settings = data.session.settings as { width?: number; height?: number; numColors?: number; rounds?: number };
  const stakesLabel = describeSessionFormat(data.session.game, data.session.levelId, settings);
  const boardLabel = data.session.levelId ? formatBoardLabel(data.session.levelId, settings) : "Custom format";
  const seriesMeta = getSeriesMeta(settings, isTerminalSession ? data.session.winnerId : null);
  const nextRoundLabel =
    seriesMeta.length === 3
      ? seriesMeta.round + 1 === 3
        ? "Play Decider"
        : `Play Round ${seriesMeta.round + 1}`
      : "Play Next Game";

  if (data.session.status === "finished" || data.session.status === "cancelled" || data.session.status === "abandoned") {
    const canCreateNextSession = me?.role === "host" && !seriesMeta.decided;
    const sortedPlayers = [...data.players].sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return 0; // fallback if neither has placement
    });
    const replayWinner = sortedPlayers.find((player) => player.placement === 1 && (player.moveSequence?.length ?? 0) > 0) ?? null;

    return (
      <div className="page-container">
        <div className="card">
          <div className="session-header">
            <div>
              <p className="section-kicker">Match complete</p>
              <h2 className="mb-sm">Session Results</h2>
            </div>
            <span className="badge">{data.session.status}</span>
          </div>
          <div className="metric-chip-row mb-md">
            <div className="metric-chip">
              <span>Game</span>
              <strong>{game?.name ?? data.session.game}</strong>
            </div>
            <div className="metric-chip">
              <span>Format</span>
              <strong>{stakesLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Series</span>
              <strong>
                {seriesMeta.length === 3
                  ? `Round ${seriesMeta.round} of 3`
                  : "Single match"}
              </strong>
            </div>
            <div className="metric-chip">
              <span>Players</span>
              <strong>{data.players.length} / {data.session.maxPlayers}</strong>
            </div>
          </div>
          {seriesMeta.length === 3 && (
            <div className="metric-chip-row mb-md">
              {sortedPlayers.map((player) => (
                <div key={player.userId} className="metric-chip">
                  <span>{player.nickname ?? player.userId}</span>
                  <strong>{seriesMeta.wins[player.userId] ?? 0} wins</strong>
                </div>
              ))}
            </div>
          )}
          <ul className="lobby-players">
            {sortedPlayers.map((p) => (
              <li key={p.userId} className="lobby-player lobby-player--result">
                {p.placement != null && (
                  <span className={`badge ${p.placement === 1 ? "badge-success" : p.placement <= 3 ? "badge-primary" : ""}`}>
                    #{p.placement}
                  </span>
                )}
                <span className="lobby-player-name">{p.nickname ?? p.userId}</span>
                <span className="badge">{p.status}</span>
                {p.disqualified && <span className="badge">DQ</span>}
                {p.timeMs != null && <span className="text-sm"> {(p.timeMs / 1000).toFixed(2)}s</span>}
                {p.score != null && <span className="text-sm"> score {p.score}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-sm">
            {canCreateNextSession ? (
              <button type="button" onClick={handlePlayNextGame} disabled={working} className="btn btn-primary">
                {nextRoundLabel}
              </button>
            ) : seriesMeta.length === 3 && seriesMeta.decided ? (
              <span className="text-muted">Series complete. Start a fresh match to run it back.</span>
            ) : data.session.partyEndedAt ? (
              <span className="text-muted">The host ended the party.</span>
            ) : (
              <span className="text-muted">Waiting for host to start the next game.</span>
            )}
            {data.session.game === "pixelz" && replayWinner && pixelzBoard && (
              <button
                type="button"
                onClick={() => setShowWinnerReplay((current) => !current)}
                className="btn"
              >
                {showWinnerReplay ? "Hide winner replay" : "Watch winner replay"}
              </button>
            )}
            <button type="button" onClick={handleLeave} disabled={working} className="btn btn-ghost">
              Leave
            </button>
          </div>
          {showWinnerReplay && replayWinner && pixelzBoard && replayWinner.moveSequence && (
            <PixelzReplayViewer
              board={pixelzBoard}
              moveSequence={replayWinner.moveSequence}
              title={`${replayWinner.nickname ?? replayWinner.userId}'s winning solve`}
              subtitle={`Replaying the ${replayWinner.moveSequence.length}-move winning path.`}
            />
          )}
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
          <div className="session-header">
            <div>
              <p className="section-kicker">Lobby</p>
              <h2 className="mb-sm">{game?.name ?? data.session.game}</h2>
            </div>
            <span className={`status-pill ${data.session.status === "ready" ? "status-pill--success" : ""}`}>
              {data.session.status === "ready" ? "Countdown live" : "Waiting room"}
            </span>
          </div>
          <div className="metric-chip-row mb-md">
            <div className="metric-chip">
              <span>Match stake</span>
              <strong>{boardLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Format</span>
              <strong>{stakesLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Series</span>
              <strong>{seriesMeta.length === 3 ? `Round ${seriesMeta.round} of 3` : "Single match"}</strong>
            </div>
            <div className="metric-chip">
              <span>Players</span>
              <strong>{data.players.length} / {data.session.maxPlayers}</strong>
            </div>
          </div>
          <ul className="lobby-players">
            {data.players.map((p) => (
              <li key={p.userId} className="lobby-player lobby-player--rich">
                {onlineSet.has(p.userId) ? <span className="online-dot" /> : <span className="offline-dot" />}
                <div className="lobby-player-copy">
                  <span className="lobby-player-name">{p.nickname ?? p.userId}</span>
                  <span className="text-muted text-sm">{p.role === "host" ? "Host" : "Guest"}</span>
                </div>
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
              disabled={working || me?.status === "ready" || me?.status === "playing" || me?.status === "finished" || data.players.length < 2}
              className="btn btn-primary"
            >
              {working ? "Please wait…" : me?.status === "ready" ? "Ready ✓" : data.players.length < 2 ? "Waiting for players…" : "Ready"}
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
      <div className="page-container page-container--wide">
        <div className="multiplayer-stage-card">
          <div>
            <p className="section-kicker">Live Match</p>
            <h2>{game?.name ?? data.session.game}</h2>
          </div>
          <div className="metric-chip-row">
            <div className="metric-chip">
              <span>Stake</span>
              <strong>{boardLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Format</span>
              <strong>{stakesLabel}</strong>
            </div>
            <div className="metric-chip">
              <span>Series</span>
              <strong>{seriesMeta.length === 3 ? `Round ${seriesMeta.round} of 3` : "Single match"}</strong>
            </div>
            <div className="metric-chip">
              <span>Your status</span>
              <strong>{me?.status ?? "playing"}</strong>
            </div>
          </div>
        </div>
      </div>
      {opponents.length > 0 && (
        <div className="page-container page-container--wide">
          <div className="flex flex-col gap-sm mb-md opponents-container">
          {opponents.map((opp) => {
            const progress = progressByUser[opp.userId];
            const resultSummary =
              opp.status === "finished" && opp.moves != null && opp.timeMs != null
                ? `finished · ${opp.moves} moves · ${(opp.timeMs / 1000).toFixed(1)}s`
                : progress
                  ? `${progress.moves} moves · ${(progress.timeMs / 1000).toFixed(1)}s`
                : onlineSet.has(opp.userId)
                  ? "playing"
                  : "playing · offline";
            return (
              <div key={opp.userId} className="opponent-bar opponent-bar--card">
                <div>
                  <strong>{opp.nickname ?? opp.userId}</strong>
                  <p className="text-muted text-sm">{onlineSet.has(opp.userId) ? "Live in match" : "Connection dropped"}</p>
                </div>
                <span>{resultSummary}</span>
              </div>
            );
          })}
        </div>
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
