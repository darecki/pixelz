import { syncRequestSchema, syncResponseSchema, leaderboardResponseSchema } from "@pixelz/shared";
import { supabase } from "./supabase";

export const NICKNAME_TAKEN_REASON = "nickname_taken";
import type { SyncEvent } from "@pixelz/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const SESSION_REQUEST_TIMEOUT_MS = 15_000;

export const STORAGE_KEYS = {
  anonymousId: "pixelz_anonymous_id",
  nickname: "pixelz_nickname",
  dontRemindSignin: "pixelz_dont_remind_signin",
} as const;

export type BoardParams = {
  boardId: string;
  width: number;
  height: number;
  numColors: number;
  seed: string;
};

export type SessionGame = "pixelz" | "reflex";
export type SessionStatus = "waiting" | "ready" | "playing" | "finished" | "cancelled" | "abandoned";
export type SessionPlayerStatus = "joined" | "ready" | "playing" | "finished" | "abandoned";
export type SessionPlayerRole = "host" | "guest";
export type SessionFinishPayload = { moves: number; timeMs: number; moveSequence?: number[]; disqualified?: boolean };

export type SessionInvitePreview = {
  sessionId: string;
  game: SessionGame;
  levelId: string | null;
  settings: Record<string, unknown>;
  status: SessionStatus;
  maxPlayers: number;
  hostNickname: string | null;
};

export type SessionResponse = {
  currentUserId: string | null;
  session: {
    id: string;
    game: SessionGame;
    inviteCode: string;
    levelId: string | null;
    seed: string;
    settings: Record<string, unknown>;
    status: SessionStatus;
    maxPlayers: number;
    startsAt: string | null;
    finishedAt: string | null;
    winnerId: string | null;
  };
  players: Array<{
    userId: string;
    role: SessionPlayerRole;
    status: SessionPlayerStatus;
    score: number | null;
    moves: number | null;
    timeMs: number | null;
    moveSequence: number[] | null;
    finishedAt: string | null;
    nickname: string | null;
    placement: number | null;
    disqualified: boolean;
  }>;
};

export type CreateSessionRequest =
  | { game: "pixelz"; mode: "predefined"; levelId: string; maxPlayers?: number }
  | { game: "pixelz"; mode: "generated"; settings: { width: number; height: number; numColors: number }; maxPlayers?: number }
  | { game: "reflex"; mode: "predefined"; levelId: string; maxPlayers?: number };

export type CreateSessionResponse = { sessionId: string; inviteCode: string };

export async function createBoard(params: {
  width?: number;
  height?: number;
  numColors?: number;
}): Promise<BoardParams> {
  const res = await fetch(`${API_URL}/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to create board");
  }
  return res.json();
}

export async function fetchBoard(boardId: string): Promise<BoardParams> {
  const res = await fetch(`${API_URL}/boards/${encodeURIComponent(boardId)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Board not found");
    throw new Error("Failed to load board");
  }
  return res.json();
}

export type MyBoardsResponse = { boardIds: string[] };

export async function fetchMyPlayedBoards(accessToken: string): Promise<MyBoardsResponse> {
  const res = await fetch(`${API_URL}/users/me/boards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to load your boards");
  return res.json();
}

function wrapFetchError(err: unknown, context: string): Error {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new Error(`${context} Could not reach API at ${API_URL}. Is the API running? (pnpm dev:api)`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export type RegisterAnonymousResponse = { anonymousId: string };

export async function registerAnonymous(): Promise<RegisterAnonymousResponse> {
  const res = await fetch(`${API_URL}/anon/register`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to register as guest");
  }
  const data = await res.json();
  if (typeof data?.anonymousId !== "string") throw new Error("Invalid response from server");
  return { anonymousId: data.anonymousId };
}

async function getAuthHeadersForSessionRequest(requireJwt = false): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  if (requireJwt) {
    throw new Error("Sign in required");
  }
  let anonymousId = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.anonymousId) : null;
  if (!anonymousId) {
    const created = await registerAnonymous();
    anonymousId = created.anonymousId;
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEYS.anonymousId, anonymousId);
  }
  return { "X-Anonymous-Id": anonymousId };
}

export async function createSession(
  payload: CreateSessionRequest,
  accessToken?: string | null
): Promise<CreateSessionResponse> {
  const headers = accessToken
    ? ({ Authorization: `Bearer ${accessToken}` } as HeadersInit)
    : await getAuthHeadersForSessionRequest(true);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Create invite timed out. Check API auth/database connectivity and try again.");
    }
    throw wrapFetchError(err, "Create invite failed.");
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to create session");
  }
  return res.json();
}

export async function fetchSessionInvite(inviteCode: string): Promise<SessionInvitePreview> {
  const res = await fetch(`${API_URL}/sessions/invite/${encodeURIComponent(inviteCode)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to load invite");
  }
  return res.json();
}

export async function joinSession(sessionId: string): Promise<void> {
  const headers = await getAuthHeadersForSessionRequest(false);
  const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}/join`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to join session");
  }
}

async function postSessionAction(sessionId: string, action: "ready" | "begin" | "leave"): Promise<void> {
  const headers = await getAuthHeadersForSessionRequest(false);
  const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      (err as { error?: string; details?: string }).error ??
      (err as { details?: string }).details ??
      `Failed to ${action} session`;
    throw new Error(msg);
  }
}

export async function markSessionReady(sessionId: string): Promise<void> {
  return postSessionAction(sessionId, "ready");
}

export async function beginSession(sessionId: string): Promise<void> {
  return postSessionAction(sessionId, "begin");
}

export async function leaveSession(sessionId: string): Promise<void> {
  return postSessionAction(sessionId, "leave");
}

export async function finishSession(
  sessionId: string,
  payload: SessionFinishPayload
): Promise<void> {
  const headers = await getAuthHeadersForSessionRequest(false);
  const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      (err as { error?: string; details?: string }).error ??
      (err as { details?: string }).details ??
      "Failed to finish session";
    throw new Error(msg);
  }
}

export async function fetchSession(sessionId: string): Promise<SessionResponse> {
  const headers = await getAuthHeadersForSessionRequest(false);
  const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sessionId)}`, {
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to load session");
  }
  return res.json();
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

export async function syncEventsAnon(anonymousId: string, events: SyncEvent[]) {
  const body = syncRequestSchema.parse({ events });
  let res: Response;
  try {
    res = await fetch(`${API_URL}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Anonymous-Id": anonymousId,
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

export async function mergeAnonymous(accessToken: string, anonymousId: string): Promise<void> {
  const res = await fetch(`${API_URL}/users/me/merge-anonymous`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ anonymousId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to merge guest progress");
  }
}

const LEADERBOARD_TIMEOUT_MS = 15_000;

export async function fetchLeaderboard(
  levelId: string,
  accessToken?: string | null,
  signal?: AbortSignal | null
) {
  const headers: HeadersInit = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/leaderboards/${encodeURIComponent(levelId)}`, { headers, signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out. Check the API is running (pnpm dev:api).");
    }
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

export function createLeaderboardTimeoutSignal(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), LEADERBOARD_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(id),
  };
}
