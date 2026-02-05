import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Mode = "signin" | "signup";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email to confirm, or sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: "2rem auto", padding: "0 1rem" }}>
      <h2>{mode === "signin" ? "Sign in" : "Sign up"}</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "0.25rem" }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: "0.25rem" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        {message && <p style={{ color: "#c00", marginBottom: "0.75rem" }}>{message}</p>}
        <button type="submit" disabled={loading} style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}>
          {loading ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ padding: "0.5rem 1rem" }}
        >
          {mode === "signin" ? "Sign up instead" : "Sign in instead"}
        </button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        <Link to="/leaderboard">View leaderboard</Link>
      </p>
    </div>
  );
}
