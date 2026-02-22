import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import Login from "./components/Login";
import Home from "./pages/Home";
import Leaderboard from "./pages/Leaderboard";
import Play from "./pages/Play";
import JoinSession from "./pages/JoinSession";
import SessionRoom from "./pages/SessionRoom";
import { mergeAnonymous, STORAGE_KEYS } from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";

function Layout({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div>
      <nav style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #ccc", marginBottom: "1rem" }}>
        {session ? (
          <>
            <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
            <Link to="/leaderboard" style={{ marginRight: "1rem" }}>Leaderboard</Link>
            <span style={{ marginRight: "1rem", color: "#666" }}>{session.user.email}</span>
            <button type="button" onClick={signOut} style={{ padding: "0.25rem 0.5rem" }}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
            <Link to="/leaderboard" style={{ marginRight: "1rem" }}>Leaderboard</Link>
            <Link to="/login" style={{ marginRight: "1rem" }}>Sign in</Link>
          </>
        )}
      </nav>
      {children}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  function runMergeIfAnon(session: { access_token: string }) {
    const anonId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.anonymousId) : null;
    if (!anonId) return;
    mergeAnonymous(session.access_token, anonId)
      .then(() => {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(STORAGE_KEYS.anonymousId);
          localStorage.removeItem(STORAGE_KEYS.nickname);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.access_token) runMergeIfAnon(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.access_token) runMergeIfAnon(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Layout session={session}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/play" element={<Play />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/join/:inviteCode" element={<JoinSession />} />
            <Route path="/session/:sessionId" element={<SessionRoom />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}
