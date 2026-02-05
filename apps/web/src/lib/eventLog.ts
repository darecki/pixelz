import { openDB } from "idb";
import type { SyncEvent } from "@pixelz/shared";

const DB_NAME = "pixelz-offline";
const STORE_EVENTS = "events";
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

export async function appendEvent(event: SyncEvent): Promise<void> {
  const db = await getDB();
  await db.add(STORE_EVENTS, { ...event, clientTimestamp: event.clientTimestamp ?? Date.now() });
}

export async function getPendingEvents(): Promise<SyncEvent[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_EVENTS);
  return all.map(({ type, payload, clientTimestamp }) => ({
    type,
    payload,
    ...(clientTimestamp != null && { clientTimestamp }),
  })) as SyncEvent[];
}

export async function removeEventsByIds(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_EVENTS, "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Remove first n events (after successful sync we clear accepted by count). */
export async function removeFirstEvents(count: number): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_EVENTS);
  const toDelete = keys.slice(0, count);
  const tx = db.transaction(STORE_EVENTS, "readwrite");
  await Promise.all(toDelete.map((k) => tx.store.delete(k)));
  await tx.done;
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_EVENTS);
}
