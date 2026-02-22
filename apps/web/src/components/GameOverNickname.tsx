import { useState, useEffect } from "react";
import { appendEvent } from "../lib/eventLog";
import { getPendingEvents, removeFirstEvents } from "../lib/eventLog";
import { performSync } from "../lib/sync";
import { STORAGE_KEYS, NICKNAME_TAKEN_REASON } from "../lib/api";
import { supabase } from "../lib/supabase";

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 32;

type Props = {
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
  hideIfNoAuth?: boolean;
};

export default function GameOverNickname({ disabled, hideIfNoAuth }: Props) {
  const [displayNickname, setDisplayNickname] = useState("");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    if (hideIfNoAuth) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setIsAuthed(!!session?.access_token);
      });
    }
  }, [hideIfNoAuth]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEYS.nickname) ?? "";
    const anonId = localStorage.getItem(STORAGE_KEYS.anonymousId) ?? "";
    setDisplayNickname(stored.trim() || anonId);
  }, []);

  if (hideIfNoAuth && !isAuthed) {
    return null;
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    const nickname = editValue.trim();
    if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return;
    const previousNickname = displayNickname;
    setUpdating(true);
    setError(null);
    try {
      appendEvent({ type: "UPDATE_LAST_SCORE_NICKNAME", payload: { nickname } });
      const result = await performSync();
      const hasNicknameTaken = result?.rejectedReasons && Object.values(result.rejectedReasons).includes(NICKNAME_TAKEN_REASON);
      if (hasNicknameTaken) {
        setError("Username already taken");
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEYS.nickname, previousNickname === nickname ? "" : previousNickname);
        }
        setDisplayNickname(previousNickname === nickname ? "" : previousNickname);
        const pending = await getPendingEvents();
        if (pending.length > 0 && (pending[0].type === "SET_NICKNAME" || pending[0].type === "UPDATE_LAST_SCORE_NICKNAME")) {
          await removeFirstEvents(1);
        }
      } else {
        if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEYS.nickname, nickname);
        setDisplayNickname(nickname);
        setEditing(false);
      }
    } catch {
      setError("Failed to save");
    } finally {
      setUpdating(false);
    }
  }

  const label = displayNickname.trim() || "…";

  return (
    <div className="mt-sm mb-sm">
      <p className="text-muted text-sm">
        Saved to leaderboard as{" "}
        <strong style={{ color: "var(--text-primary)" }}>{label}</strong>
        {!editing && (
          <>
            .{" "}
            <button
              type="button"
              onClick={() => {
                setEditValue(displayNickname);
                setEditing(true);
                setError(null);
              }}
              disabled={disabled}
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex", verticalAlign: "baseline", padding: "0.2rem 0.5rem" }}
            >
              Change
            </button>
          </>
        )}
      </p>
      {editing && (
        <form onSubmit={handleUpdate} className="mt-sm">
          <div className="flex gap-sm items-center flex-wrap">
            <input
              id="gameover-nickname-edit"
              type="text"
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); setError(null); }}
              minLength={NICKNAME_MIN}
              maxLength={NICKNAME_MAX}
              placeholder="e.g. player1"
              disabled={disabled || updating}
              className="input input--inline"
              style={{ width: "min(180px, 50vw)" }}
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || updating || editValue.trim().length < NICKNAME_MIN}
              className="btn btn-sm btn-primary"
            >
              {updating ? "…" : "Update"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              disabled={updating}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-error text-sm mt-sm">{error}</p>}
        </form>
      )}
    </div>
  );
}
