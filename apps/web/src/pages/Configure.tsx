import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { REFLEX_LEVELS } from "@pixelz/shared";
import { GAMES } from "../games/registry";
import { createBoard, createSession, fetchBoard, fetchMyPlayedBoards } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  PIXELZ_PRESET_CHALLENGES,
  REFLEX_PRESET_CHALLENGES,
  formatBoardLabel,
  getDailyChallenge,
} from "../lib/competition";

type ModeTab = "solo" | "multi";

type BoardMeta = {
  boardId: string;
  width: number;
  height: number;
  numColors: number;
};

const PIXELZ_DEFAULTS = { width: 7, height: 10, numColors: 5 };

function clampInviteMaxPlayers(value: number): number {
  if (Number.isNaN(value)) return 2;
  return Math.min(10, Math.max(2, Math.trunc(value)));
}

function playUrl(boardId: string): string {
  const path = `/play?game=pixelz&level=${encodeURIComponent(boardId)}`;
  return typeof window !== "undefined" ? window.location.origin + path : path;
}

export default function Configure() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pixelzParams, setPixelzParams] = useState(PIXELZ_DEFAULTS);
  const [pixelzCreating, setPixelzCreating] = useState(false);
  const [myBoardIds, setMyBoardIds] = useState<string[]>([]);
  const [myBoardsLoading, setMyBoardsLoading] = useState(false);
  const [myBoardMeta, setMyBoardMeta] = useState<Record<string, BoardMeta>>({});
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteReflexLevel, setInviteReflexLevel] = useState<string>("reflex_level_1");
  const [inviteMaxPlayers, setInviteMaxPlayers] = useState(2);
  const [seriesLength, setSeriesLength] = useState<1 | 3>(1);

  const selectedGame = GAMES.find((g) => g.id === gameId);
  const activeMode = searchParams.get("mode") === "multi" ? "multi" : "solo";
  const dailyChallenge = selectedGame ? getDailyChallenge(selectedGame.id as "pixelz" | "reflex") : null;

  useEffect(() => {
    let cancelled = false;
    function load(session: { access_token: string } | null) {
      if (cancelled) return;
      const signedIn = Boolean(session?.access_token);
      setHasSession(signedIn);
      if (!signedIn) {
        setMyBoardIds([]);
        setMyBoardsLoading(false);
        return;
      }
      setMyBoardsLoading(true);
      fetchMyPlayedBoards(session!.access_token)
        .then((r) => {
          if (!cancelled) setMyBoardIds(r.boardIds);
        })
        .catch(() => {
          if (!cancelled) setMyBoardIds([]);
        })
        .finally(() => {
          if (!cancelled) setMyBoardsLoading(false);
        });
    }
    supabase.auth.getSession().then(({ data: { session } }) => load(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => load(session));
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedGame?.id !== "pixelz" || myBoardIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      myBoardIds.map(async (boardId) => {
        const board = await fetchBoard(boardId).catch(() => null);
        if (!board) return null;
        return [boardId, { boardId, width: board.width, height: board.height, numColors: board.numColors }] as const;
      })
    ).then((results) => {
      if (cancelled) return;
      const next = Object.fromEntries(results.filter((entry): entry is readonly [string, BoardMeta] => Boolean(entry)));
      setMyBoardMeta(next);
    });
    return () => {
      cancelled = true;
    };
  }, [myBoardIds, selectedGame?.id]);

  async function withSession<T>(work: (accessToken: string) => Promise<T>): Promise<T | null> {
    const sessionResult = await new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Auth session lookup timed out. Please refresh and try again."));
      }, 8000);

      supabase.auth
        .getSession()
        .then((result) => {
          window.clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
    const { data: { session } } = sessionResult;
    if (!session?.access_token) {
      setInviteError("Sign in to create a multiplayer invite.");
      return null;
    }
    return work(session.access_token);
  }

  async function handleNewPixelzBoard() {
    setPixelzCreating(true);
    setInviteError(null);
    try {
      const board = await createBoard(pixelzParams);
      navigate(`/play?game=pixelz&level=${encodeURIComponent(board.boardId)}`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create board");
    } finally {
      setPixelzCreating(false);
    }
  }

  async function handleCreateGeneratedInvite() {
    setInviteError(null);
    setInviteCreating(true);
    try {
      const created = await withSession((accessToken) =>
        createSession(
          {
            game: "pixelz",
            mode: "generated",
            settings: pixelzParams,
            maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
            seriesLength,
          },
          accessToken
        )
      );
      if (!created) return;
      const inviteUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/join/${encodeURIComponent(created.inviteCode)}`
          : `/join/${encodeURIComponent(created.inviteCode)}`;
      void Promise.race([
        navigator.clipboard.writeText(inviteUrl),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]).catch(() => undefined);
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviteCreating(false);
    }
  }

  async function handleCreatePresetPixelzInvite(levelId: string) {
    setInviteError(null);
    setInviteCreating(true);
    try {
      const created = await withSession((accessToken) =>
        createSession(
          {
            game: "pixelz",
            mode: "predefined",
            levelId,
            maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
            seriesLength,
          },
          accessToken
        )
      );
      if (!created) return;
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviteCreating(false);
    }
  }

  async function handleCreateReflexInvite() {
    setInviteError(null);
    setInviteCreating(true);
    try {
      const created = await withSession((accessToken) =>
        createSession(
          {
            game: "reflex",
            mode: "predefined",
            levelId: inviteReflexLevel,
            maxPlayers: clampInviteMaxPlayers(inviteMaxPlayers),
            seriesLength,
          },
          accessToken
        )
      );
      if (!created) return;
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviteCreating(false);
    }
  }

  async function copyBoardLink(boardId: string) {
    const url = playUrl(boardId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(boardId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  }

  function setMode(mode: ModeTab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("mode", mode);
      return next;
    });
  }

  if (!selectedGame) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container page-container--wide">
      <Link to="/" className="back-link">← Back to Home</Link>

      <div className="page-header">
        <p className="section-kicker">Setup</p>
        <h2>{selectedGame.name} Queue</h2>
        <p>
          Pick a track first. Solo drops you right into a run. Multiplayer packages the stakes and creates a clean invite.
        </p>
      </div>

      {dailyChallenge && (
        <div className="card config-highlight">
          <div>
            <p className="section-kicker">Daily Challenge</p>
            <h3>{dailyChallenge.label}</h3>
            <p className="text-secondary">{dailyChallenge.subtitle}</p>
            <p className="text-muted text-sm">Shared worldwide board. Resets at 00:00 UTC.</p>
          </div>
          <Link
            to={`/play?game=${selectedGame.id}&level=${encodeURIComponent(dailyChallenge.levelId)}&daily=1`}
            className="btn btn-primary"
          >
            Play Global Daily
          </Link>
        </div>
      )}

      <div className="mode-toggle-row">
        <button
          type="button"
          onClick={() => setMode("solo")}
          className={`btn-toggle btn-toggle--large ${activeMode === "solo" ? "btn-toggle--active" : ""}`}
        >
          Solo
        </button>
        <button
          type="button"
          onClick={() => setMode("multi")}
          className={`btn-toggle btn-toggle--large ${activeMode === "multi" ? "btn-toggle--active" : ""}`}
        >
          Multiplayer
        </button>
      </div>

      {activeMode === "solo" ? (
        <section className="config-section">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Solo Runs</p>
              <h3>Fast start presets</h3>
            </div>
          </div>

          {selectedGame.id === "pixelz" ? (
            <>
              <div className="preset-grid">
                {PIXELZ_PRESET_CHALLENGES.map((preset) => (
                  <article key={preset.levelId} className="card preset-card">
                    <h4>{preset.label}</h4>
                    <p className="text-secondary text-sm">{preset.description}</p>
                    <p className="text-muted text-sm">{formatBoardLabel(preset.levelId)}</p>
                    <Link
                      to={`/play?game=pixelz&level=${encodeURIComponent(preset.levelId)}`}
                      className="btn btn-primary"
                    >
                      Play Now
                    </Link>
                  </article>
                ))}
              </div>

              <details className="config-drawer">
                <summary>Advanced custom board</summary>
                <div className="config-panel">
                  <p className="text-secondary text-sm mb-sm">
                    Build a shareable custom board when you want a different shape or color count.
                  </p>
                  <div className="config-row">
                    <label className="text-sm">
                      Width{" "}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={pixelzParams.width}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, width: Number(e.target.value) || 7 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <label className="text-sm">
                      Height{" "}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={pixelzParams.height}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, height: Number(e.target.value) || 10 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <label className="text-sm">
                      Colors{" "}
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={pixelzParams.numColors}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, numColors: Number(e.target.value) || 5 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <button type="button" onClick={handleNewPixelzBoard} disabled={pixelzCreating} className="btn btn-primary">
                      {pixelzCreating ? "Generating…" : "Generate & Play"}
                    </button>
                    {inviteError && <span className="text-error text-sm">{inviteError}</span>}
                  </div>
                </div>
              </details>

              <div className="mt-md">
                <div className="section-heading-row">
                  <div>
                    <p className="section-kicker">Recent Boards</p>
                    <h3>Your replay library</h3>
                  </div>
                </div>
                {myBoardsLoading || hasSession === null ? (
                  <p className="loading-text text-sm">Loading…</p>
                ) : myBoardIds.length > 0 ? (
                  <ul className="board-list">
                    {myBoardIds.map((boardId) => {
                      const meta = myBoardMeta[boardId];
                      return (
                        <li key={boardId} className="board-item board-item--rich">
                          <div className="board-item-copy">
                            <strong>{formatBoardLabel(boardId, meta)}</strong>
                            <span className="board-item-id">{boardId}</span>
                          </div>
                          <div className="board-item-actions">
                            <Link
                              to={`/play?game=pixelz&level=${encodeURIComponent(boardId)}`}
                              className="btn btn-sm btn-success"
                            >
                              Replay
                            </Link>
                            <button type="button" onClick={() => copyBoardLink(boardId)} className="btn btn-sm">
                              {copiedId === boardId ? "Copied!" : "Copy link"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : hasSession === true ? (
                  <p className="text-muted">No boards yet. Finish a custom run and it will land here.</p>
                ) : (
                  <p className="text-muted">Sign in and play to build a reusable board library.</p>
                )}
              </div>
            </>
          ) : (
            <div className="preset-grid">
              {REFLEX_PRESET_CHALLENGES.map((preset) => (
                <article key={preset.levelId} className="card preset-card">
                  <h4>{preset.label}</h4>
                  <p className="text-secondary text-sm">{preset.description}</p>
                  <p className="text-muted text-sm">{REFLEX_LEVELS[preset.levelId]} rounds</p>
                  <Link
                    to={`/play?game=reflex&level=${encodeURIComponent(preset.levelId)}`}
                    className="btn btn-primary"
                  >
                    Start Run
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="config-section">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">Multiplayer</p>
              <h3>Package the stakes before you invite</h3>
            </div>
          </div>

          <div className="card multiplayer-summary-card">
            <div className="metric-chip">
              <span>Format</span>
              <strong>{seriesLength === 3 ? "Best of 3" : "Single match"}</strong>
            </div>
            <div className="metric-chip">
              <span>Players</span>
              <strong>Up to {inviteMaxPlayers}</strong>
            </div>
            <div className="metric-chip">
              <span>Ready check</span>
              <strong>Live lobby</strong>
            </div>
          </div>

          <div className="config-row mb-md">
            <label className="text-sm" htmlFor="invite-max-players">
              Max Players{" "}
            </label>
            <input
              id="invite-max-players"
              type="number"
              min={2}
              max={10}
              value={inviteMaxPlayers}
              onChange={(e) => setInviteMaxPlayers(clampInviteMaxPlayers(Number(e.target.value)))}
              className="input input--inline"
              style={{ width: 72 }}
            />
            <div className="btn-group">
              <button
                type="button"
                onClick={() => setSeriesLength(1)}
                className={`btn-toggle ${seriesLength === 1 ? "btn-toggle--active" : ""}`}
              >
                Single Match
              </button>
              <button
                type="button"
                onClick={() => setSeriesLength(3)}
                className={`btn-toggle ${seriesLength === 3 ? "btn-toggle--active" : ""}`}
              >
                Best of 3
              </button>
            </div>
          </div>

          {selectedGame.id === "reflex" ? (
            <div className="card">
              <p className="text-secondary text-sm mb-sm">Choose the duel length before you create the lobby.</p>
              <div className="config-row">
                <label className="text-sm">
                  Level{" "}
                  <select
                    value={inviteReflexLevel}
                    onChange={(e) => setInviteReflexLevel(e.target.value)}
                    className="input input--inline"
                    style={{ width: 180 }}
                  >
                    {selectedGame.levelIds.map((id) => (
                      <option key={id} value={id}>
                        {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleCreateReflexInvite}
                  disabled={inviteCreating}
                  className="btn btn-primary"
                >
                  {inviteCreating ? "Creating invite…" : "Create invite"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="preset-grid">
                {PIXELZ_PRESET_CHALLENGES.map((preset) => (
                  <article key={preset.levelId} className="card preset-card">
                    <h4>{preset.label}</h4>
                    <p className="text-secondary text-sm">{preset.description}</p>
                    <p className="text-muted text-sm">{formatBoardLabel(preset.levelId)}</p>
                    <button
                      type="button"
                      onClick={() => handleCreatePresetPixelzInvite(preset.levelId)}
                      disabled={inviteCreating}
                      className="btn btn-primary"
                    >
                      Create Match
                    </button>
                  </article>
                ))}
              </div>

              <details className="config-drawer">
                <summary>Custom generated lobby</summary>
                <div className="config-panel">
                  <p className="text-secondary text-sm mb-sm">
                    Use this when you want a one-off board that becomes the match stake.
                  </p>
                  <div className="config-row">
                    <label className="text-sm">
                      Width{" "}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={pixelzParams.width}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, width: Number(e.target.value) || 7 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <label className="text-sm">
                      Height{" "}
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={pixelzParams.height}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, height: Number(e.target.value) || 10 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <label className="text-sm">
                      Colors{" "}
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={pixelzParams.numColors}
                        onChange={(e) => setPixelzParams((p) => ({ ...p, numColors: Number(e.target.value) || 5 }))}
                        className="input input--inline"
                        style={{ width: 72 }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleCreateGeneratedInvite}
                      disabled={inviteCreating}
                      className="btn btn-primary"
                    >
                      {inviteCreating ? "Creating invite…" : "Create custom invite"}
                    </button>
                  </div>
                </div>
              </details>
            </>
          )}

          {inviteError && <p className="text-error text-sm mt-sm">{inviteError}</p>}
        </section>
      )}
    </div>
  );
}
