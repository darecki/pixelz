import { syncEvents, syncEventsAnon, registerAnonymous, STORAGE_KEYS } from "./api";
import { getPendingEvents, removeFirstEvents } from "./eventLog";
import { supabase } from "./supabase";

export type SyncResult = {
  accepted: number;
  rejected: number;
  rejectedReasons?: Record<string, string>;
};

/**
 * Sync pending events to the server. Uses session if signed in, otherwise anonymous id from localStorage (registering if needed). Returns result if events were synced, null if nothing to sync or no identity.
 */
export async function performSync(): Promise<SyncResult | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const pendingEvents = await getPendingEvents();
  if (pendingEvents.length === 0) return null;

  if (session?.access_token) {
    const result = await syncEvents(session.access_token, pendingEvents);
    const totalProcessed = result.acceptedCount + result.rejectedCount;
    await removeFirstEvents(totalProcessed);
    return {
      accepted: result.acceptedCount,
      rejected: result.rejectedCount,
      ...(result.rejectedReasons && Object.keys(result.rejectedReasons).length > 0 && { rejectedReasons: result.rejectedReasons }),
    };
  }

  let anonId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.anonymousId) : null;
  if (!anonId) {
    const { anonymousId } = await registerAnonymous();
    anonId = anonymousId;
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEYS.anonymousId, anonymousId);
  }

  const storedNickname = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.nickname)?.trim() : null;
  const didPrependNickname = Boolean(storedNickname && storedNickname.length >= 1 && storedNickname.length <= 32);
  const eventsToSend = didPrependNickname
    ? [{ type: "SET_NICKNAME" as const, payload: { nickname: storedNickname! } }, ...pendingEvents]
    : pendingEvents;

  const result = await syncEventsAnon(anonId, eventsToSend);
  const totalProcessed = result.acceptedCount + result.rejectedCount;
  const toRemoveFromQueue = didPrependNickname
    ? Math.min(pendingEvents.length, totalProcessed - 1)
    : totalProcessed;
  await removeFirstEvents(toRemoveFromQueue);
  return {
    accepted: result.acceptedCount,
    rejected: result.rejectedCount,
    ...(result.rejectedReasons && Object.keys(result.rejectedReasons).length > 0 && { rejectedReasons: result.rejectedReasons }),
  };
}

/**
 * Fire-and-forget sync when online (e.g. after level complete). No UI feedback.
 */
export function trySyncInBackground(): void {
  performSync().catch(() => {
    // Ignore; user can sync manually
  });
}
