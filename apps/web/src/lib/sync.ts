import { syncEvents } from "./api";
import { getPendingEvents, removeFirstEvents } from "./eventLog";
import { supabase } from "./supabase";

export type SyncResult = { accepted: number; rejected: number };

/**
 * Sync pending events to the server. Returns result if signed in and events were synced, null otherwise.
 */
export async function performSync(): Promise<SyncResult | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const events = await getPendingEvents();
  if (events.length === 0) return null;
  const result = await syncEvents(session.access_token, events);
  await removeFirstEvents(result.acceptedCount);
  return { accepted: result.acceptedCount, rejected: result.rejectedCount };
}

/**
 * Fire-and-forget sync when online (e.g. after level complete). No UI feedback.
 */
export function trySyncInBackground(): void {
  performSync().catch(() => {
    // Ignore; user can sync manually
  });
}
