import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchSessionInvite, joinSession, type SessionInvitePreview } from "../lib/api";
import { describeSessionFormat, formatBoardLabel } from "../lib/competition";

export default function JoinSession() {
  const { inviteCode = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SessionInvitePreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSessionInvite(inviteCode)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load invite");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  async function handleJoin() {
    if (!preview) return;
    setJoining(true);
    setError(null);
    try {
      await joinSession(preview.sessionId);
      navigate(`/session/${encodeURIComponent(preview.sessionId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session");
      setJoining(false);
    }
  }

  if (loading) return <div className="page-container"><p className="loading-text">Loading invite…</p></div>;
  if (error) return <div className="page-container"><p className="text-error">{error}</p></div>;
  if (!preview) return <div className="page-container"><p className="text-muted">Invite not found.</p></div>;

  const settings = preview.settings as { width?: number; height?: number; numColors?: number; seriesLength?: number };
  const formatLabel = describeSessionFormat(preview.game, preview.levelId, settings);
  const stakeLabel = preview.levelId ? formatBoardLabel(preview.levelId, settings) : "Custom format";

  return (
    <div className="page-container page-container--narrow">
      <div className="card">
        <h2 className="mb-md">Game Invite</h2>
        <p className="mb-sm">
          <span className="text-secondary">Game:</span> <strong>{preview.game}</strong>
        </p>
        {preview.hostNickname && (
          <p className="mb-sm">
            <span className="text-secondary">Host:</span> <strong>{preview.hostNickname}</strong>
          </p>
        )}
        <p className="mb-sm">
          <span className="text-secondary">Stake:</span> <strong>{stakeLabel}</strong>
        </p>
        <p className="mb-sm">
          <span className="text-secondary">Format:</span> <strong>{formatLabel}</strong>
        </p>
        <p className="mb-md">
          <span className="text-secondary">Status:</span> <span className="badge">{preview.status}</span>
        </p>
        <button type="button" onClick={handleJoin} disabled={joining || preview.status !== "waiting"} className="btn btn-primary w-full">
          {joining ? "Joining…" : "Join Game"}
        </button>
        {preview.status !== "waiting" && (
          <p className="text-muted mt-md text-center">
            This session is no longer accepting new players.
          </p>
        )}
      </div>
    </div>
  );
}
