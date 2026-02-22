import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { appendEvent } from "../lib/eventLog";
import { performSync } from "../lib/sync";

type PendingScore = {
  levelId: string;
  moves: number;
  timeMs: number;
  score?: number;
  moveSequence?: number[];
};

type Mode = "signin" | "signup";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nickname: nickname.trim() || undefined } },
        });
        if (error) throw error;
        setMessage("Check your email to confirm, or sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        const pendingScoreStr = sessionStorage.getItem("pixelz_pending_score");
        if (pendingScoreStr) {
          sessionStorage.removeItem("pixelz_pending_score");
          try {
            const pending = JSON.parse(pendingScoreStr) as PendingScore;
            appendEvent({
              type: "LEVEL_COMPLETED",
              payload: {
                levelId: pending.levelId,
                score: pending.score ?? 0,
                moves: pending.moves,
                timeMs: pending.timeMs,
                moveSequence: pending.moveSequence,
              },
            });
            await performSync();
          } catch {}
        }
        
        navigate(redirect);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="text-center mb-md">{mode === "signin" ? "Sign in" : "Sign up"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
            />
          </div>
          {mode === "signup" && (
            <div className="form-group">
              <label htmlFor="nickname">Nickname (for leaderboard)</label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={32}
                placeholder="e.g. player1"
                className="input"
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input"
            />
          </div>
          {message && <p className="text-error text-sm mb-md">{message}</p>}
          <div className="flex gap-sm">
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="btn btn-ghost w-full mt-sm"
          >
            {mode === "signin" ? "Sign up instead" : "Sign in instead"}
          </button>
        </form>
      </div>
      <div className="auth-footer">
        <Link to="/">Play without account</Link>
        {" · "}
        <Link to="/leaderboard">View leaderboard</Link>
      </div>
    </div>
  );
}
