import type { SyncEvent } from "@pixelz/ts-contracts";
import {
  appendQueuedEvent,
  getPendingEventsWithIds,
  getPreference,
  getPendingQueueCount,
  PREFERENCE_KEYS,
  removeFirstQueuedEvents,
} from "./db";
import { ensureAnonymousId, syncEvents, syncEventsAnon } from "./api";
import { supabase } from "./supabase";
import { useQueueStore } from "../stores/queue-store";

export async function enqueueEvent(event: SyncEvent) {
  await appendQueuedEvent(event);
  const pendingCount = await getPendingQueueCount();
  useQueueStore.getState().setPendingCount(pendingCount);
}

export async function performSync() {
  const pending = await getPendingEventsWithIds();
  if (pending.length === 0) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const events = pending.map((entry) => entry.event);

  if (session?.access_token) {
    const result = await syncEvents(session.access_token, events);
    const processed = result.acceptedCount + result.rejectedCount;
    await removeFirstQueuedEvents(processed);
    await useQueueStore.getState().refreshPendingCount();
    return result;
  }

  const anonymousId = await ensureAnonymousId();
  const nickname = await getPreference(PREFERENCE_KEYS.nickname);
  const shouldPrependNickname = Boolean(nickname && nickname.trim().length > 0);
  const result = await syncEventsAnon(
    anonymousId,
    shouldPrependNickname
      ? [{ type: "SET_NICKNAME", payload: { nickname: nickname!.trim() } }, ...events]
      : events
  );
  const processed = result.acceptedCount + result.rejectedCount;
  const removeCount = shouldPrependNickname ? Math.max(0, processed - 1) : processed;
  await removeFirstQueuedEvents(removeCount);
  await useQueueStore.getState().refreshPendingCount();
  return result;
}

export function trySyncInBackground() {
  void performSync().catch(() => {});
}
