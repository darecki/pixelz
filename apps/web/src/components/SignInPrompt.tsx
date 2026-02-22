import { useState, type FormEvent } from "react";
import { STORAGE_KEYS } from "../lib/api";

interface SignInPromptProps {
  rank: number;
  onSignIn: () => void;
  onSkip: () => void;
}

export default function SignInPrompt({
  rank,
  onSignIn,
  onSkip,
}: SignInPromptProps) {
  const [dontRemind, setDontRemind] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (dontRemind) {
      localStorage.setItem(STORAGE_KEYS.dontRemindSignin, "true");
    }
    onSignIn();
  }

  function handleSkip() {
    if (dontRemind) {
      localStorage.setItem(STORAGE_KEYS.dontRemindSignin, "true");
    }
    onSkip();
  }

  const modalStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  };

  const contentStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: "1.5rem",
    maxWidth: 360,
    width: "100%",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "1.25rem",
    fontWeight: 700,
    marginBottom: "0.75rem",
    textAlign: "center",
  };

  const textStyle: React.CSSProperties = {
    fontSize: "1rem",
    marginBottom: "1.25rem",
    textAlign: "center",
    color: "#333",
  };

  const buttonStyle = (primary: boolean): React.CSSProperties => ({
    padding: "0.75rem 1rem",
    borderRadius: 8,
    border: primary ? "none" : "1px solid #ccc",
    backgroundColor: primary ? "#1e88e5" : "#f5f5f5",
    color: primary ? "#fff" : "#333",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    marginBottom: primary ? "0.5rem" : 0,
  });

  const checkboxLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    color: "#666",
    marginTop: "1rem",
    cursor: "pointer",
  };

  return (
    <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="signin-prompt-title">
      <form style={contentStyle} onSubmit={handleSubmit}>
        <h2 id="signin-prompt-title" style={titleStyle}>
          Great score!
        </h2>
        <p style={textStyle}>
          Your score would be <strong>#{rank}</strong> on the leaderboard!
        </p>
        <p style={{ ...textStyle, fontSize: "0.9rem", marginBottom: "1rem" }}>
          Sign in to save it and compete with others.
        </p>
        <button type="submit" style={buttonStyle(true)}>
          Sign in to save score
        </button>
        <button
          type="button"
          onClick={handleSkip}
          style={{ ...buttonStyle(false), marginBottom: 0 }}
        >
          No thanks
        </button>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(e) => setDontRemind(e.target.checked)}
          />
          Don't remind me again
        </label>
      </form>
    </div>
  );
}
