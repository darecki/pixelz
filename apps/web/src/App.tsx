import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import Login from "./components/Login";
import Home from "./pages/Home";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Play from "./pages/Play";
import JoinSession from "./pages/JoinSession";
import SessionRoom from "./pages/SessionRoom";
import Configure from "./pages/Configure";
import { mergeAnonymous, STORAGE_KEYS } from "./lib/api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ThemeToggle from "./components/ThemeToggle";

function Layout({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="app-container">
      <nav className="nav">
        <Link to="/" className="nav-brand">PIXELZ</Link>
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
        <Link to="/profile" className="nav-link">Profile</Link>
        <div className="nav-spacer" />
        {session ? (
          <>
            <span className="nav-user">{session.user.email}</span>
            <button type="button" onClick={signOut} className="btn btn-ghost btn-sm">Sign out</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-sm btn-primary">Sign in</Link>
        )}
        <ThemeToggle />
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
    return <div className="page-container"><p className="loading-text">Loading…</p></div>;
  }

  return (
    <BrowserRouter>
      <Layout session={session}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/configure/:gameId" element={<Configure />} />
            <Route path="/login" element={<Login />} />
            <Route path="/play" element={<Play />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/join/:inviteCode" element={<JoinSession />} />
            <Route path="/session/:sessionId" element={<SessionRoom />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}
