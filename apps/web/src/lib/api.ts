import { syncRequestSchema, syncResponseSchema, leaderboardResponseSchema } from "@pixelz/shared";
import type { SyncEvent } from "@pixelz/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function wrapFetchError(err: unknown, context: string): Error {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new Error(`${context} Could not reach API at ${API_URL}. Is the API running? (pnpm dev:api)`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function syncEvents(accessToken: string, events: SyncEvent[]) {
  const body = syncRequestSchema.parse({ events });
  let res: Response;
  try {
    res = await fetch(`${API_URL}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw wrapFetchError(err, "Sync failed.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (err as { error?: string; details?: string }).error ?? (err as { details?: string }).details ?? "Sync failed";
    throw new Error(msg);
  }
  const data = await res.json().catch(() => null);
  if (data == null) throw new Error("Sync failed: invalid response");
  try {
    return syncResponseSchema.parse(data);
  } catch (e) {
    throw new Error("Sync failed: invalid response from server");
  }
}

export async function fetchLeaderboard(levelId: string) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/leaderboards/${encodeURIComponent(levelId)}`);
  } catch (err) {
    throw wrapFetchError(err, "Leaderboard failed.");
  }
  if (!res.ok) throw new Error("Leaderboard failed");
  const data = await res.json().catch(() => null);
  if (data == null) throw new Error("Leaderboard failed");
  try {
    return leaderboardResponseSchema.parse(data);
  } catch {
    throw new Error("Leaderboard failed: invalid response from server");
  }
}
