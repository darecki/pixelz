import { useState, useEffect } from "react";
import { getPendingCount } from "../lib/eventLog";
import { performSync } from "../lib/sync";

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
    setSyncing(true);
    setMessage(null);
    try {
      const result = await performSync();
      await refreshCount();
      if (result === null) {
        const n = await getPendingCount();
        setMessage(n === 0 ? "Nothing to sync." : "Sign in to sync.");
        return;
      }
      onSynced?.();
      setMessage(
        result.rejected > 0
          ? `Synced: ${result.accepted} accepted, ${result.rejected} rejected.`
          : `Synced ${result.accepted} event(s).`
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
