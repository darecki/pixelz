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

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="signin-prompt-title">
      <form className="modal-card" onSubmit={handleSubmit}>
        <h2 id="signin-prompt-title" className="text-center mb-sm" style={{ fontSize: "1.25rem" }}>
          Great score! 🏆
        </h2>
        <p className="text-center text-secondary mb-sm">
          Your score would be <strong>#{rank}</strong> on the leaderboard!
        </p>
        <p className="text-center text-muted text-sm mb-md">
          Sign in to save it and compete with others.
        </p>
        <button type="submit" className="btn btn-primary w-full mb-sm">
          Sign in to save score
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="btn btn-ghost w-full"
        >
          No thanks
        </button>
        <label className="flex items-center gap-sm text-muted text-sm mt-md" style={{ cursor: "pointer" }}>
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
