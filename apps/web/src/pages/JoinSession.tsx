import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchSessionInvite, joinSession, type SessionInvitePreview } from "../lib/api";

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

  if (loading) return <div style={{ padding: "1rem" }}>Loading invite…</div>;
  if (error) return <div style={{ padding: "1rem", color: "#c00" }}>{error}</div>;
  if (!preview) return <div style={{ padding: "1rem" }}>Invite not found.</div>;

  return (
    <div style={{ padding: "1rem", maxWidth: 520 }}>
      <h2>Game Invite</h2>
      <p>
        <strong>Game:</strong> {preview.game}
      </p>
      {preview.hostNickname && (
        <p>
          <strong>Host:</strong> {preview.hostNickname}
        </p>
      )}
      <p>
        <strong>Status:</strong> {preview.status}
      </p>
      <button type="button" onClick={handleJoin} disabled={joining || preview.status !== "waiting"}>
        {joining ? "Joining…" : "Join Game"}
      </button>
      {preview.status !== "waiting" && (
        <p style={{ marginTop: "0.75rem", color: "#666" }}>
          This session is no longer accepting new players.
        </p>
      )}
    </div>
  );
}
