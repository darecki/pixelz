import type { SyncEvent } from "@pixelz/ts-contracts";
import {
  createSessionSchema,
  leaderboardResponseSchema,
  syncRequestSchema,
  syncResponseSchema,
  type CreateSessionRequest,
  type LeaderboardResponse,
  type SyncResponse,
} from "@pixelz/ts-contracts";
import { env } from "./env";
import { getPreference, PREFERENCE_KEYS, removePreference, setPreference } from "./db";
import { supabase } from "./supabase";

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
export type SessionFinishPayload = {
  moves: number;
  timeMs: number;
  moveSequence?: number[];
  disqualified?: boolean;
};
export type CreateSessionResponse = { sessionId: string; inviteCode: string };

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
    nextSessionId: string | null;
    partyEndedAt: string | null;
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

function wrapFetchError(error: unknown, context: string) {
  if (error instanceof TypeError && error.message === "Network request failed") {
    return new Error(`${context} Could not reach API at ${env.apiUrl ?? "the configured API URL"}.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function requireApiUrl() {
  if (!env.apiUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_URL. Set the mobile env vars and restart Expo."
    );
  }
  return env.apiUrl;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function registerAnonymous(): Promise<{ anonymousId: string }> {
  const apiUrl = requireApiUrl();
  const response = await fetch(`${apiUrl}/anon/register`, { method: "POST" });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to register guest");
  }

  const payload = (await response.json()) as { anonymousId?: string };
  if (!payload.anonymousId) {
    throw new Error("Invalid guest registration response");
  }

  await setPreference(PREFERENCE_KEYS.anonymousId, payload.anonymousId);
  return { anonymousId: payload.anonymousId };
}

export async function ensureAnonymousId() {
  const existing = await getPreference(PREFERENCE_KEYS.anonymousId);
  if (existing) return existing;
  const created = await registerAnonymous();
  return created.anonymousId;
}

async function getSessionHeaders(requireJwt = false): Promise<HeadersInit> {
  const accessToken = await getAccessToken();
  if (accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
  }
  if (requireJwt) {
    throw new Error("Sign in required");
  }
  const anonymousId = await ensureAnonymousId();
  return { "X-Anonymous-Id": anonymousId };
}

export async function mergeAnonymousProgress(accessToken: string) {
  const apiUrl = requireApiUrl();
  const anonymousId = await getPreference(PREFERENCE_KEYS.anonymousId);
  if (!anonymousId) return;

  const response = await fetch(`${apiUrl}/users/me/merge-anonymous`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ anonymousId }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to merge guest progress");
  }

  await removePreference(PREFERENCE_KEYS.anonymousId);
  await removePreference(PREFERENCE_KEYS.nickname);
}

export async function fetchBoard(boardId: string): Promise<BoardParams> {
  const apiUrl = requireApiUrl();
  const response = await fetch(`${apiUrl}/boards/${encodeURIComponent(boardId)}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to load board");
  }
  return response.json();
}

export async function createBoard(params: {
  width?: number;
  height?: number;
  numColors?: number;
}): Promise<BoardParams> {
  const apiUrl = requireApiUrl();
  // Board creation is currently public on the API, so this request intentionally has no auth header.
  const response = await fetch(`${apiUrl}/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to create board");
  }
  return response.json();
}

export async function fetchLeaderboard(levelId: string): Promise<LeaderboardResponse> {
  const apiUrl = requireApiUrl();
  const token = await getAccessToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/leaderboards/${encodeURIComponent(levelId)}`, { headers });
  } catch (error) {
    throw wrapFetchError(error, "Leaderboard failed.");
  }

  if (!response.ok) {
    throw new Error("Leaderboard failed");
  }

  const payload = await response.json().catch(() => null);
  if (payload == null) {
    throw new Error("Leaderboard failed");
  }
  return leaderboardResponseSchema.parse(payload);
}

export async function fetchSessionInvite(inviteCode: string): Promise<SessionInvitePreview> {
  const apiUrl = requireApiUrl();
  const response = await fetch(`${apiUrl}/sessions/invite/${encodeURIComponent(inviteCode)}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to load invite");
  }
  return response.json();
}

export async function createSession(payload: CreateSessionRequest): Promise<CreateSessionResponse> {
  const apiUrl = requireApiUrl();
  const headers = await getSessionHeaders(true);
  const body = createSessionSchema.parse(payload);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw wrapFetchError(error, "Create invite failed.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to create session");
  }
  return response.json();
}

export async function joinSession(sessionId: string) {
  const apiUrl = requireApiUrl();
  const headers = await getSessionHeaders(false);
  const response = await fetch(`${apiUrl}/sessions/${encodeURIComponent(sessionId)}/join`, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to join session");
  }
}

export async function fetchSession(sessionId: string): Promise<SessionResponse> {
  const apiUrl = requireApiUrl();
  const headers = await getSessionHeaders(false);
  const response = await fetch(`${apiUrl}/sessions/${encodeURIComponent(sessionId)}`, { headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((errorBody as { error?: string }).error ?? "Failed to load session");
  }
  return response.json();
}

async function postSessionAction(sessionId: string, action: "ready" | "begin" | "leave") {
  const apiUrl = requireApiUrl();
  const headers = await getSessionHeaders(false);
  const response = await fetch(`${apiUrl}/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: "POST",
    headers,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }));
    const message =
      (errorBody as { error?: string; details?: string }).error ??
      (errorBody as { details?: string }).details ??
      `Failed to ${action} session`;
    throw new Error(message);
  }
}

export function markSessionReady(sessionId: string) {
  return postSessionAction(sessionId, "ready");
}

export function beginSession(sessionId: string) {
  return postSessionAction(sessionId, "begin");
}

export function leaveSession(sessionId: string) {
  return postSessionAction(sessionId, "leave");
}

export async function finishSession(sessionId: string, payload: SessionFinishPayload) {
  const apiUrl = requireApiUrl();
  const headers = await getSessionHeaders(false);
  const response = await fetch(`${apiUrl}/sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const message =
      (body as { error?: string; details?: string }).error ??
      (body as { details?: string }).details ??
      "Failed to finish session";
    throw new Error(message);
  }
}

async function postSync(headers: HeadersInit, events: SyncEvent[]): Promise<SyncResponse> {
  const apiUrl = requireApiUrl();
  const body = syncRequestSchema.parse({ events });
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw wrapFetchError(error, "Sync failed.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    const message =
      (payload as { error?: string; details?: string }).error ??
      (payload as { details?: string }).details ??
      "Sync failed";
    throw new Error(message);
  }

  const payload = await response.json().catch(() => null);
  if (payload == null) {
    throw new Error("Sync failed: invalid response");
  }
  return syncResponseSchema.parse(payload);
}

export async function syncEvents(accessToken: string, events: SyncEvent[]) {
  return postSync({ Authorization: `Bearer ${accessToken}` }, events);
}

export async function syncEventsAnon(anonymousId: string, events: SyncEvent[]) {
  return postSync({ "X-Anonymous-Id": anonymousId }, events);
}

export async function signInWithPassword(email: string, password: string) {
  const response = await supabase.auth.signInWithPassword({ email, password });
  if (response.error) {
    throw response.error;
  }
  return response.data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string) {
  const response = await supabase.auth.signUp({ email, password });
  if (response.error) {
    throw response.error;
  }
  return response.data.session;
}
