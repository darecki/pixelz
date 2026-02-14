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
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.nickname) ?? "" : "";
    setValue(stored);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nickname = value.trim();
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return;
    setSaving(true);
    setError(null);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEYS.nickname, nickname);
      appendEvent({ type: "SET_NICKNAME", payload: { nickname } });
      const result = await performSync();
      const hasNicknameTaken = result?.rejectedReasons && Object.values(result.rejectedReasons).includes(NICKNAME_TAKEN_REASON);
      if (hasNicknameTaken) {
        setError("Username already taken");
        const pending = await getPendingEvents();
        if (pending.length > 0 && pending[0].type === "SET_NICKNAME") {
          await removeFirstEvents(1);
        }
      } else {
        setSaved(true);
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
      <label htmlFor="gameover-nickname" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem" }}>
        Nickname (for leaderboard)
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          id="gameover-nickname"
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          minLength={NICKNAME_MIN}
          maxLength={NICKNAME_MAX}
          placeholder="e.g. player1"
          disabled={disabled || saving}
          style={{ padding: "0.4rem 0.5rem", width: "min(180px, 50vw)", fontSize: "1rem" }}
        />
        <button
          type="submit"
          disabled={disabled || saving || value.trim().length < NICKNAME_MIN}
          style={buttonStyle ?? { padding: "0.4rem 0.75rem" }}
        >
          {saving ? "…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p style={{ color: "#c00", fontSize: "0.9rem", marginTop: "0.25rem", marginBottom: 0 }}>{error}</p>}
    </form>
  );
}
