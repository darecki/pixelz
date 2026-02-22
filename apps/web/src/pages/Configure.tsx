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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setInviteError("Sign in to create a 1:1 invite.");
        setInviteCreating(false);
        return;
      }

      const created =
        selectedGame?.id === "reflex"
          ? await createSession({
              game: "reflex",
              mode: "predefined",
              levelId: inviteReflexLevel,
            })
          : await createSession({
              game: "pixelz",
              mode: "generated",
              settings: pixelzParams,
            });

      const inviteUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/join/${encodeURIComponent(created.inviteCode)}`
          : `/join/${encodeURIComponent(created.inviteCode)}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
      } catch {
      }
      navigate(`/session/${encodeURIComponent(created.sessionId)}`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
      setInviteCreating(false);
    }
  }

  if (!selectedGame) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ padding: "0 1rem", maxWidth: 600 }}>
      {/* Back link */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/" style={{ color: "#1e88e5", textDecoration: "none", fontSize: "0.95rem" }}>
          &larr; Back to Games
        </Link>
      </div>

      <h2 style={{ marginBottom: "1.5rem" }}>Configure {selectedGame.name}</h2>

      {/* ── Solo Play ── */}
      <section style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Play solo</h3>
        {selectedGame.levelType === "board" && selectedGame.id === "pixelz" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 420 }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {PIXELZ_LEVEL_IDS.map((id) => (
                <Link
                  key={id}
                  to={`/play?game=pixelz&level=${id}`}
                  style={{ padding: "0.5rem 0.75rem", background: "#eee", borderRadius: 4, textDecoration: "none", color: "#333" }}
                >
                  {PIXELZ_LEVELS[id]}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomPixelz((v) => !v)}
                style={{ padding: "0.5rem 0.75rem", background: "#e3f2fd", borderRadius: 4, cursor: "pointer", border: "1px solid #bbdefb" }}
              >
                {showCustomPixelz ? "Hide custom" : "Generate custom board"}
              </button>
            </div>
            {showCustomPixelz && (
              <div style={{ padding: "1rem", background: "#f5f5f5", borderRadius: 8 }}>
                <p style={{ marginBottom: "0.75rem", fontSize: "0.95rem", fontWeight: 600 }}>Custom board:</p>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ fontSize: "0.9rem" }}>
                    Width:{" "}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={pixelzParams.width}
                      onChange={(e) => setPixelzParams((p) => ({ ...p, width: Number(e.target.value) || 7 }))}
                      style={{ width: 50, padding: "0.25rem" }}
                    />
                  </label>
                  <label style={{ fontSize: "0.9rem" }}>
                    Height:{" "}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={pixelzParams.height}
                      onChange={(e) => setPixelzParams((p) => ({ ...p, height: Number(e.target.value) || 10 }))}
                      style={{ width: 50, padding: "0.25rem" }}
                    />
                  </label>
                  <label style={{ fontSize: "0.9rem" }}>
                    Colors:{" "}
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={pixelzParams.numColors}
                      onChange={(e) => setPixelzParams((p) => ({ ...p, numColors: Number(e.target.value) || 5 }))}
                      style={{ width: 50, padding: "0.25rem" }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleNewPixelzBoard}
                    disabled={pixelzCreating}
                    style={{ padding: "0.5rem 1rem", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                  >
                    {pixelzCreating ? "Creating…" : "New board — Generate & Play"}
                  </button>
                </div>
              </div>
            )}
            <div style={{ marginTop: "1rem" }}>
              <p style={{ marginBottom: "0.75rem", fontSize: "0.95rem", fontWeight: 600 }}>Boards I've played:</p>
              {myBoardsLoading || hasSession === null ? (
                <p style={{ color: "#666", fontSize: "0.9rem" }}>Loading…</p>
              ) : myBoardIds.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {myBoardIds.map((boardId) => (
                    <li key={boardId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", background: "#fafafa", padding: "0.5rem", border: "1px solid #eee", borderRadius: 6 }}>
                      <Link
                        to={`/play?game=pixelz&level=${encodeURIComponent(boardId)}`}
                        style={{ padding: "0.35rem 0.6rem", background: "#e8f5e9", borderRadius: 4, fontSize: "0.9rem", textDecoration: "none", color: "#1b5e20", border: "1px solid #c8e6c9" }}
                      >
                        Play
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyBoardLink(boardId)}
                        style={{ padding: "0.35rem 0.6rem", background: "#e3f2fd", borderRadius: 4, fontSize: "0.9rem", cursor: "pointer", border: "1px solid #bbdefb", color: "#0d47a1" }}
                      >
                        {copiedId === boardId ? "Copied!" : "Copy link"}
                      </button>
                      <span style={{ fontSize: "0.85rem", color: "#666", wordBreak: "break-all" }}>
                        {boardId}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : hasSession === true ? (
                <p style={{ color: "#666", fontSize: "0.9rem" }}>No boards yet. Play a board to see it here.</p>
              ) : (
                <p style={{ color: "#666", fontSize: "0.9rem" }}>Sign in and play to see your boards here.</p>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {selectedGame.levelIds.map((id) => (
              <Link
                key={id}
                to={`/play?game=${selectedGame.id}&level=${id}`}
                style={{ padding: "0.5rem 1rem", background: "#eee", borderRadius: 4, textDecoration: "none", color: "#333", border: "1px solid #ddd" }}
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
      <section>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>1:1 Challenge</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {selectedGame?.id === "reflex" && (
            <label style={{ fontSize: "0.9rem" }}>
              Level:{" "}
              <select
                value={inviteReflexLevel}
                onChange={(e) => setInviteReflexLevel(e.target.value)}
                style={{ marginLeft: "0.25rem" }}
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
            style={{ padding: "0.5rem 0.9rem", background: "#e8f5e9", borderRadius: 4, cursor: "pointer", border: "1px solid #c8e6c9" }}
          >
            {inviteCreating ? "Creating invite…" : "Create invite"}
          </button>
          {inviteError && <span style={{ color: "#c00", fontSize: "0.9rem" }}>{inviteError}</span>}
        </div>
      </section>
    </div>
  );
}
