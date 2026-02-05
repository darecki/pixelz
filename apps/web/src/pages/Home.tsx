import { useState, useEffect } from "react";
import SyncButton from "../components/SyncButton";
import { appendEvent, getPendingCount } from "../lib/eventLog";

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
      <div style={{ marginTop: "1rem" }}>
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
