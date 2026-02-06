import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import Login from "./components/Login";
import Home from "./pages/Home";
import Leaderboard from "./pages/Leaderboard";
import Play from "./pages/Play";

function Layout({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div>
      <nav style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #ccc", marginBottom: "1rem" }}>
        <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
        <Link to="/leaderboard" style={{ marginRight: "1rem" }}>Leaderboard</Link>
        <span style={{ marginRight: "1rem", color: "#666" }}>{session.user.email}</span>
        <button type="button" onClick={signOut} style={{ padding: "0.25rem 0.5rem" }}>Sign out</button>
      </nav>
      {children}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Layout session={session}>
        <Routes>
          <Route path="/" element={session ? <Home /> : <Login />} />
          <Route path="/play" element={<Play />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
