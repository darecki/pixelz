import { useState, useEffect } from "react";
import { appendEvent } from "../lib/eventLog";
import { getPendingEvents, removeFirstEvents } from "../lib/eventLog";
import { performSync } from "../lib/sync";
import { STORAGE_KEYS, NICKNAME_TAKEN_REASON } from "../lib/api";

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 32;

type Props = {
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
};

export default function GameOverNickname({ disabled, buttonStyle }: Props) {
  const [displayNickname, setDisplayNickname] = useState("");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.nickname) ?? "" : "";
    setDisplayNickname(stored);
  }, []);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const nickname = editValue.trim();
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return;
    setUpdating(true);
    setError(null);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEYS.nickname, nickname);
      appendEvent({ type: "UPDATE_LAST_SCORE_NICKNAME", payload: { nickname } });
      const result = await performSync();
      const hasNicknameTaken = result?.rejectedReasons && Object.values(result.rejectedReasons).includes(NICKNAME_TAKEN_REASON);
      if (hasNicknameTaken) {
        setError("Username already taken");
        const pending = await getPendingEvents();
        if (pending.length > 0 && pending[0].type === "SET_NICKNAME") {
          await removeFirstEvents(1);
        }
      } else {
        setDisplayNickname(nickname);
        setEditing(false);
      }
    } catch {
      setError("Failed to save");
    } finally {
      setUpdating(false);
    }
  }

  const baseButtonStyle = buttonStyle ?? { padding: "0.4rem 0.75rem" };
  const label = displayNickname.trim() || "…";

  return (
    <div style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
      <p style={{ color: "#666", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
        Saved to leaderboard as{" "}
        <strong>{label}</strong>
        {!editing && (
          <>
            {"."}{" "}
            <button
              type="button"
              onClick={() => {
                setEditValue(displayNickname);
                setEditing(true);
                setError(null);
              }}
              disabled={disabled}
              style={baseButtonStyle}
            >
              Change
            </button>
          </>
        )}
      </p>
      {editing && (
        <form onSubmit={handleUpdate} style={{ marginTop: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="gameover-nickname-edit"
              type="text"
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); setError(null); }}
              minLength={NICKNAME_MIN}
              maxLength={NICKNAME_MAX}
              placeholder="e.g. player1"
              disabled={disabled || updating}
              style={{ padding: "0.4rem 0.5rem", width: "min(180px, 50vw)", fontSize: "1rem" }}
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || updating || editValue.trim().length < NICKNAME_MIN}
              style={baseButtonStyle}
            >
              {updating ? "…" : "Update"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              disabled={updating}
              style={baseButtonStyle}
            >
              Cancel
            </button>
          </div>
          {error && <p style={{ color: "#c00", fontSize: "0.9rem", marginTop: "0.25rem", marginBottom: 0 }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
