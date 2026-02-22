import { useState, useEffect } from "react";
import { Link, useNavigate, useParams, Navigate } from "react-router-dom";
import { REFLEX_LEVELS, PIXELZ_LEVEL_IDS, PIXELZ_LEVELS } from "@pixelz/shared";
import { GAMES } from "../games/registry";
import { createBoard, createSession, fetchMyPlayedBoards } from "../lib/api";
import { supabase } from "../lib/supabase";

const PIXELZ_DEFAULTS = { width: 7, height: 10, numColors: 5 };

function playUrl(boardId: string): string {
  const path = `/play?game=pixelz&level=${encodeURIComponent(boardId)}`;
  return typeof window !== "undefined" ? window.location.origin + path : path;
}

export default function Configure() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  
  const [showCustomPixelz, setShowCustomPixelz] = useState(false);
  const [pixelzParams, setPixelzParams] = useState(PIXELZ_DEFAULTS);
  const [pixelzCreating, setPixelzCreating] = useState(false);
  const [myBoardIds, setMyBoardIds] = useState<string[]>([]);
  const [myBoardsLoading, setMyBoardsLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteReflexLevel, setInviteReflexLevel] = useState<string>("reflex_level_0");

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
        .then((r) => { if (!cancelled) setMyBoardIds(r.boardIds); })
        .catch(() => { if (!cancelled) setMyBoardIds([]); })
        .finally(() => { if (!cancelled) setMyBoardsLoading(false); });
    }
    supabase.auth.getSession().then(({ data: { session } }) => load(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => load(session));
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleNewPixelzBoard() {
    setPixelzCreating(true);
    try {
      const board = await createBoard(pixelzParams);
      navigate(`/play?game=pixelz&level=${encodeURIComponent(board.boardId)}`);
    } catch {
      setPixelzCreating(false);
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

  const selectedGame = GAMES.find((g) => g.id === gameId);

  async function handleCreateInvite() {
    setInviteError(null);
    setInviteCreating(true);
    try {
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Auth session lookup timed out. Please refresh and try again.")), 8000);
        }),
      ]);
      const {
        data: { session },
      } = sessionResult;
      if (!session?.access_token) {
        setInviteError("Sign in to create a 1:1 invite.");
        return;
      }

      const created =
        selectedGame?.id === "reflex"
          ? await createSession({
              game: "reflex",
              mode: "predefined",
              levelId: inviteReflexLevel,
            }, session.access_token)
          : await createSession({
              game: "pixelz",
              mode: "generated",
              settings: pixelzParams,
            }, session.access_token);

      const inviteUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/join/${encodeURIComponent(created.inviteCode)}`
          : `/join/${encodeURIComponent(created.inviteCode)}`;
      // Do not block navigation on clipboard APIs; some environments can stall here.
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

  if (!selectedGame) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-container">
      <Link to="/" className="back-link">← Back to Games</Link>

      <div className="page-header">
        <h2>Configure {selectedGame.name}</h2>
      </div>

      {/* ── Solo Play ── */}
      <section className="config-section">
        <h3 className="section-title">Play solo</h3>
        {selectedGame.levelType === "board" && selectedGame.id === "pixelz" ? (
          <div className="flex flex-col gap-md">
            <div className="btn-group">
              {PIXELZ_LEVEL_IDS.map((id) => (
                <Link key={id} to={`/play?game=pixelz&level=${id}`} className="btn btn-sm">
                  {PIXELZ_LEVELS[id]}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomPixelz((v) => !v)}
                className={`btn btn-sm ${showCustomPixelz ? "btn-primary" : ""}`}
              >
                {showCustomPixelz ? "Hide custom" : "Custom board"}
              </button>
            </div>
            {showCustomPixelz && (
              <div className="config-panel">
                <p className="font-semibold text-sm mb-sm">Custom board settings:</p>
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
                      style={{ width: 60 }}
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
                      style={{ width: 60 }}
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
                      style={{ width: 60 }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleNewPixelzBoard}
                    disabled={pixelzCreating}
                    className="btn"
                  >
                    {pixelzCreating ? "Creating…" : "Generate & Play"}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-md">
              <p className="font-semibold text-sm mb-sm">Boards I've played:</p>
              {myBoardsLoading || hasSession === null ? (
                <p className="loading-text text-sm">Loading…</p>
              ) : myBoardIds.length > 0 ? (
                <ul className="board-list">
                  {myBoardIds.map((boardId) => (
                    <li key={boardId} className="board-item">
                      <Link
                        to={`/play?game=pixelz&level=${encodeURIComponent(boardId)}`}
                        className="btn btn-sm btn-success"
                      >
                        Play
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyBoardLink(boardId)}
                        className="btn btn-sm"
                      >
                        {copiedId === boardId ? "Copied!" : "Copy link"}
                      </button>
                      <span className="board-item-id">
                        {boardId}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : hasSession === true ? (
                <p className="text-muted">No boards yet. Play a board to see it here.</p>
              ) : (
                <p className="text-muted">Sign in and play to see your boards here.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="btn-group">
            {selectedGame.levelIds.map((id) => (
              <Link
                key={id}
                to={`/play?game=${selectedGame.id}&level=${id}`}
                className="btn btn-sm"
              >
                {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS] != null
                  ? `${REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds`
                  : id}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 1:1 Challenge ── */}
      <section className="config-section">
        <h3 className="section-title">1:1 Challenge</h3>
        <div className="config-row">
          {selectedGame?.id === "reflex" && (
            <label className="text-sm">
              Level:{" "}
              <select
                value={inviteReflexLevel}
                onChange={(e) => setInviteReflexLevel(e.target.value)}
                className="input input--inline"
                style={{ width: 140 }}
              >
                {selectedGame.levelIds.map((id) => (
                  <option key={id} value={id}>
                    {REFLEX_LEVELS[id as keyof typeof REFLEX_LEVELS]} rounds
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={handleCreateInvite}
            disabled={inviteCreating}
            className="btn btn-primary"
          >
            {inviteCreating ? "Creating invite…" : "Create invite"}
          </button>
          {inviteError && <span className="text-error text-sm">{inviteError}</span>}
        </div>
      </section>
    </div>
  );
}
