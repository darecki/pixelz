import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SyncButton from "../components/SyncButton";
import { appendEvent, getPendingCount } from "../lib/eventLog";
import { PREDEFINED_LEVEL_IDS } from "../game/levels";
import { GAMES } from "../games/registry";

export default function Home() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  async function refreshPending() {
    setPendingCount(await getPendingCount());
  }

  useEffect(() => {
    refreshPending();
  }, []);

  async function addTestEvent() {
    await appendEvent({
      type: "LEVEL_COMPLETED",
      payload: { levelId: "level_1", score: 500 + Math.floor(Math.random() * 500), moves: 8, timeMs: 4000 },
    });
    await refreshPending();
  }

  return (
    <div>
      <h2>Home</h2>
      <p>Offline events are stored locally. When you're signed in and online, sync them to the server.</p>
      <SyncButton onSynced={refreshPending} />

      <div style={{ marginTop: "1.5rem" }}>
        <h3>Games</h3>
        {GAMES.map((game) => (
          <div key={game.id} style={{ marginBottom: "1rem" }}>
            <p style={{ marginBottom: "0.5rem", fontWeight: 600 }}>{game.name}</p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {game.levelIds.map((id) => (
                <Link
                  key={id}
                  to={`/play?game=${game.id}&level=${id}`}
                  style={{ padding: "0.5rem 1rem", background: "#eee", borderRadius: 4 }}
                >
                  {id === "reflex_level_1" ? "10 rounds" : id === "reflex_level_2" ? "15 rounds" : id}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <p style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>Stub (predefined levels):</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          {PREDEFINED_LEVEL_IDS.map((id) => (
            <Link key={id} to={`/play?level=${id}`} style={{ padding: "0.5rem 1rem", background: "#ddd", borderRadius: 4 }}>
              {id}
            </Link>
          ))}
        </div>
        <p style={{ marginBottom: "0.5rem" }}>Random (with seed):</p>
        <Link to="/play?seed=abc123" style={{ padding: "0.5rem 1rem", background: "#ddd", borderRadius: 4 }}>
          Random (seed: abc123)
        </Link>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <h3>Debug</h3>
        <button type="button" onClick={addTestEvent} style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}>
          Add test event
        </button>
        <button type="button" onClick={refreshPending} style={{ padding: "0.5rem 1rem" }}>
          Refresh count
        </button>
        {pendingCount !== null && <span style={{ marginLeft: "0.5rem" }}>Pending: {pendingCount}</span>}
      </div>
    </div>
  );
}
