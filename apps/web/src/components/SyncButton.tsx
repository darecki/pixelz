import { useState, useEffect } from "react";
import { syncEvents } from "../lib/api";
import { getPendingEvents, getPendingCount, removeFirstEvents } from "../lib/eventLog";
import { supabase } from "../lib/supabase";

type Props = { onSynced?: () => void };

export default function SyncButton({ onSynced }: Props) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshCount() {
    const n = await getPendingCount();
    setPendingCount(n);
  }

  useEffect(() => {
    refreshCount();
  }, []);

  async function handleSync() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sign in to sync.");
      return;
    }
    const events = await getPendingEvents();
    if (events.length === 0) {
      setMessage("Nothing to sync.");
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncEvents(session.access_token, events);
      await removeFirstEvents(result.acceptedCount);
      await refreshCount();
      onSynced?.();
      setMessage(
        result.rejectedCount > 0
          ? `Synced: ${result.acceptedCount} accepted, ${result.rejectedCount} rejected.`
          : `Synced ${result.acceptedCount} event(s).`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      <button onClick={handleSync} disabled={syncing || pendingCount === 0} style={{ padding: "0.5rem 1rem" }}>
        {syncing ? "Syncing…" : `Sync now${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`}
      </button>
      {message && <span style={{ marginLeft: "0.5rem", color: "#666" }}>{message}</span>}
    </div>
  );
}
