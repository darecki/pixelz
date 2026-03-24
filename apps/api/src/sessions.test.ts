import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  handleBeginSession,
  handleCreateSession,
  handleCreateNextSession,
  handleFinishSession,
  handleGetSession,
  handleGetSessionInvite,
  handleJoinSession,
  handleLeaveSession,
  handleReadySession,
} from "./sessions.js";

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { begin: ReturnType<typeof vi.fn> };
  fn.begin = vi.fn();
  return { mockSql: fn };
});
vi.mock("./db.js", () => ({ sql: mockSql }));

function createAuthedApp(userId = "user-1", isAnonymous = false) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as any).set("resolvedAuth", { appUserId: userId, isAnonymous, nickname: null });
    await next();
  });
  return app;
}

function makeTxMock(results: unknown[]) {
  let index = 0;
  return vi.fn(async () => {
    const next = results[index++];
    if (next instanceof Error) throw next;
    return next ?? [];
  });
}

function sqlTextFromCall(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray;
  return strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("GET /sessions/invite/:inviteCode", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("allows unauthenticated access and returns minimal preview fields", async () => {
    mockSql.mockResolvedValue([
      {
        id: "session-1",
        game: "pixelz",
        level_id: "pixelz_level_1",
        settings: { width: 7, height: 10, numColors: 5 },
        status: "waiting",
        max_players: 2,
        host_nickname: "Host",
      },
    ]);

    const app = new Hono();
    app.get("/sessions/invite/:inviteCode", handleGetSessionInvite);

    const res = await app.request("/sessions/invite/abc123");
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      sessionId: "session-1",
      game: "pixelz",
      levelId: "pixelz_level_1",
      settings: { width: 7, height: 10, numColors: 5 },
      status: "waiting",
      maxPlayers: 2,
      hostNickname: "Host",
    });
    expect(json).not.toHaveProperty("players");
    expect(json).not.toHaveProperty("winnerId");
  });

  it("returns 404 when invite code is not found", async () => {
    mockSql.mockResolvedValue([]);
    const app = new Hono();
    app.get("/sessions/invite/:inviteCode", handleGetSessionInvite);
    const res = await app.request("/sessions/invite/missing");
    expect(res.status).toBe(404);
  });

  it("returns 400 when invite code is blank", async () => {
    const app = new Hono();
    app.get("/sessions/invite/:inviteCode", handleGetSessionInvite);
    const res = await app.request("/sessions/invite/%20%20");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing invite code" });
  });
});

describe("session auth guards", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("rejects create session for anonymous identity", async () => {
    const app = createAuthedApp("anon-user", true);
    app.post("/sessions", handleCreateSession);
    const res = await app.request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: "reflex", mode: "predefined", levelId: "reflex_level_0" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects get session for non-participant", async () => {
    mockSql.mockResolvedValue([]);
    const app = createAuthedApp("user-1");
    app.get("/sessions/:id", handleGetSession);
    const res = await app.request("/sessions/session-1");
    expect(res.status).toBe(403);
  });

  it("returns nextSessionId when a successor session exists", async () => {
    mockSql
      .mockResolvedValueOnce([{ exists: 1 }])
      .mockResolvedValueOnce([{
        id: "session-1",
        game: "pixelz",
        invite_code: "abc123",
        level_id: "pixelz_level_1",
        seed: "seed-1",
        settings: {},
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: "session-2",
      }])
      .mockResolvedValueOnce([{
        id: "player-1",
        session_id: "session-1",
        user_id: "host-1",
        role: "host",
        status: "finished",
        score: 123,
        moves: 10,
        time_ms: 5000,
        move_sequence: null,
        finished_at: "2026-03-24T10:00:00Z",
        placement: 1,
        disqualified: false,
        nickname: "Host",
      }]);
    const app = createAuthedApp("host-1");
    app.get("/sessions/:id", handleGetSession);

    const res = await app.request("/sessions/session-1");

    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, any>;
    expect(json.session.nextSessionId).toBe("session-2");
  });
});

describe("POST /sessions", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("creates a session and returns invite code (happy path)", async () => {
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => {
      const tx = makeTxMock([[], [{ id: "session-1" }], []]);
      return cb(tx);
    });

    const app = createAuthedApp("host-1");
    app.post("/sessions", handleCreateSession);
    const res = await app.request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        game: "pixelz",
        mode: "generated",
        settings: { width: 7, height: 10, numColors: 5 },
      }),
    });

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { sessionId: string; inviteCode: string };
    expect(payload.sessionId).toBe("session-1");
    expect(payload.inviteCode).toHaveLength(8);
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
  });

  it("retries invite generation when first insert hits unique violation", async () => {
    mockSql.begin
      .mockImplementationOnce(async (cb: (tx: any) => Promise<unknown>) => {
        const tx = makeTxMock([[], new Error("duplicate key value violates unique constraint")]);
        return cb(tx);
      })
      .mockImplementationOnce(async (cb: (tx: any) => Promise<unknown>) => {
        const tx = makeTxMock([[], [{ id: "session-2" }], []]);
        return cb(tx);
      });

    const app = createAuthedApp("host-1");
    app.post("/sessions", handleCreateSession);
    const res = await app.request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        game: "pixelz",
        mode: "generated",
        settings: { width: 7, height: 10, numColors: 5 },
      }),
    });

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { sessionId: string };
    expect(payload.sessionId).toBe("session-2");
    expect(mockSql.begin).toHaveBeenCalledTimes(2);
  });
});

describe("POST /sessions/:id/join", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("allows a user already in session to join idempotently (same account)", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "waiting", max_players: 2 }],
      [{ exists: 1 }],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("user-1");
    app.post("/sessions/:id/join", handleJoinSession);
    const res = await app.request("/sessions/session-1/join", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(tx).toHaveBeenCalledTimes(2);
  });

  it("rejects join when lobby is already full", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "waiting", max_players: 2 }],
      [],
      [{ count: "2" }],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("user-2");
    app.post("/sessions/:id/join", handleJoinSession);
    const res = await app.request("/sessions/session-1/join", { method: "POST" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Session is full" });
  });

  it("rejects join when session is not waiting", async () => {
    const tx = makeTxMock([[{ id: "session-1", status: "playing", max_players: 2 }]]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("user-2");
    app.post("/sessions/:id/join", handleJoinSession);
    const res = await app.request("/sessions/session-1/join", { method: "POST" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Session is not joinable" });
  });
});

describe("POST /sessions/:id/ready", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("allows the present players to ready up even when the lobby is below max capacity", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "waiting", max_players: 3 }],
      [
        { id: "host-player", status: "joined" },
        { id: "guest-player", status: "joined" },
      ],
      [{ id: "host-player", status: "joined" }],
      [],
      [
        { status: "ready" },
        { status: "ready" },
      ],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/ready", handleReadySession);
    const res = await app.request("/sessions/session-1/ready", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("set status = 'ready'"))).toBe(true);
    expect(issuedSql.some((q) => q.includes("starts_at = now()"))).toBe(true);
  });
});

describe("POST /sessions/:id/begin", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("begins a ready session with the players who joined, even when max capacity was higher", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "ready", max_players: 3, starts_at: "2026-03-24T10:00:00Z" }],
      [{ exists: 1 }],
      [{ count: "2" }],
      [{ can_start: true }],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/begin", handleBeginSession);
    const res = await app.request("/sessions/session-1/begin", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("update public.game_sessions set status = 'playing'"))).toBe(true);
    expect(issuedSql.some((q) => q.includes("update public.game_session_players"))).toBe(true);
  });
});

describe("POST /sessions/:id/next", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("creates a successor session with the prior roster and a previous_session_id link", async () => {
    const tx = makeTxMock([
      [{
        id: "session-1",
        game: "reflex",
        invite_code: "abc123",
        level_id: "reflex_level_0",
        seed: "seed-1",
        settings: { rounds: 10 },
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: null,
      }],
      [{ role: "host" }],
      [],
      [
        { user_id: "host-1", role: "host" },
        { user_id: "guest-1", role: "guest" },
      ],
      [{ id: "session-2" }],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/next", handleCreateNextSession);
    const res = await app.request("/sessions/session-1/next", { method: "POST" });

    expect(res.status).toBe(200);
    const payload = await res.json() as { sessionId: string; inviteCode: string };
    expect(payload.sessionId).toBe("session-2");
    expect(payload.inviteCode).toHaveLength(8);

    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("previous_session_id"))).toBe(true);
    expect(issuedSql.filter((q) => q.includes("insert into public.game_session_players")).length).toBe(2);
  });

  it("creates a fresh generated pixelz rematch using the same settings", async () => {
    const tx = makeTxMock([
      [{
        id: "session-1",
        game: "pixelz",
        invite_code: "abc123",
        level_id: "pixelz_old",
        seed: "seed-1",
        settings: { width: 7, height: 10, numColors: 5 },
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: null,
      }],
      [{ role: "host" }],
      [],
      [
        { user_id: "host-1", role: "host" },
        { user_id: "guest-1", role: "guest" },
      ],
      [],
      [{ id: "session-2" }],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/next", handleCreateNextSession);
    const res = await app.request("/sessions/session-1/next", { method: "POST" });

    expect(res.status).toBe(200);
    const boardInsert = tx.mock.calls.find((call) => sqlTextFromCall(call).includes("insert into public.boards"));
    expect(boardInsert).toBeDefined();
    expect(boardInsert).toContain(7);
    expect(boardInsert).toContain(10);
    expect(boardInsert).toContain(5);
  });

  it("keeps predefined pixelz rematches on the predefined level path", async () => {
    const tx = makeTxMock([
      [{
        id: "session-1",
        game: "pixelz",
        invite_code: "abc123",
        level_id: "pixelz_level_1",
        seed: "seed-1",
        settings: {},
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: null,
      }],
      [{ role: "host" }],
      [],
      [
        { user_id: "host-1", role: "host" },
        { user_id: "guest-1", role: "guest" },
      ],
      [{ id: "session-2" }],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/next", handleCreateNextSession);
    const res = await app.request("/sessions/session-1/next", { method: "POST" });

    expect(res.status).toBe(200);
    const boardInsert = tx.mock.calls.find((call) => sqlTextFromCall(call).includes("insert into public.boards"));
    expect(boardInsert).toBeUndefined();
    const sessionInsert = tx.mock.calls.find((call) => sqlTextFromCall(call).includes("insert into public.game_sessions"));
    expect(sessionInsert).toBeDefined();
    expect(sessionInsert).toContain("pixelz_level_1");
  });

  it("returns the existing successor session idempotently", async () => {
    const tx = makeTxMock([
      [{
        id: "session-1",
        game: "reflex",
        invite_code: "abc123",
        level_id: "reflex_level_0",
        seed: "seed-1",
        settings: { rounds: 10 },
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: null,
      }],
      [{ role: "host" }],
      [{ id: "session-2", invite_code: "next123" }],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/next", handleCreateNextSession);
    const res = await app.request("/sessions/session-1/next", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: "session-2", inviteCode: "next123" });
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("insert into public.game_sessions"))).toBe(false);
  });

  it("rejects non-host users", async () => {
    const tx = makeTxMock([
      [{
        id: "session-1",
        game: "reflex",
        invite_code: "abc123",
        level_id: "reflex_level_0",
        seed: "seed-1",
        settings: { rounds: 10 },
        status: "finished",
        max_players: 2,
        starts_at: null,
        finished_at: "2026-03-24T10:00:00Z",
        winner_user_id: "host-1",
        next_session_id: null,
      }],
      [{ role: "guest" }],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("guest-1");
    app.post("/sessions/:id/next", handleCreateNextSession);
    const res = await app.request("/sessions/session-1/next", { method: "POST" });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the host can create the next session" });
  });
});

describe("POST /sessions/:id/leave", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("cancels session when host leaves from lobby", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "waiting" }],
      [{ id: "p-1", role: "host" }],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/leave", handleLeaveSession);
    const res = await app.request("/sessions/session-1/leave", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("set status = 'cancelled'"))).toBe(true);
  });

  it("removes guest and resets lobby when guest leaves in ready state", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "ready" }],
      [{ id: "p-2", role: "guest" }],
      [],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("guest-1");
    app.post("/sessions/:id/leave", handleLeaveSession);
    const res = await app.request("/sessions/session-1/leave", { method: "POST" });

    expect(res.status).toBe(200);
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("delete from public.game_session_players"))).toBe(true);
    expect(issuedSql.some((q) => q.includes("set status = 'waiting'"))).toBe(true);
    expect(issuedSql.some((q) => q.includes("set status = 'joined'"))).toBe(true);
  });

  it("marks the party as ended when the host leaves after the session is finished", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", status: "finished" }],
      [{ id: "p-1", role: "host" }],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/leave", handleLeaveSession);
    const res = await app.request("/sessions/session-1/leave", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const issuedSql = tx.mock.calls.map((call) => sqlTextFromCall(call));
    expect(issuedSql.some((q) => q.includes("party_ended_at"))).toBe(true);
  });
});

describe("POST /sessions/:id/finish", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.begin.mockReset();
  });

  it("keeps a disqualified reflex player from winning the session", async () => {
    const tx = makeTxMock([
      [{ id: "session-1", game: "reflex", level_id: "reflex_level_0", status: "playing", starts_at: "2026-03-24T10:00:00Z" }],
      [{ can_finish: true }],
      [{ status: "playing" }],
      [],
      [
        {
          id: "player-host",
          session_id: "session-1",
          user_id: "host-1",
          role: "host",
          status: "finished",
          score: 100,
          moves: 0,
          time_ms: 100,
          move_sequence: null,
          finished_at: "2026-03-24T10:00:05Z",
          nickname: "Host",
          placement: null,
          disqualified: true,
        },
        {
          id: "player-guest",
          session_id: "session-1",
          user_id: "guest-1",
          role: "guest",
          status: "finished",
          score: 450,
          moves: 5,
          time_ms: 450,
          move_sequence: null,
          finished_at: "2026-03-24T10:00:06Z",
          nickname: "Guest",
          placement: null,
          disqualified: false,
        },
      ],
      [],
      [],
      [],
    ]);
    mockSql.begin.mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));

    const app = createAuthedApp("host-1");
    app.post("/sessions/:id/finish", handleFinishSession);
    const res = await app.request("/sessions/session-1/finish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moves: 0, timeMs: 100, disqualified: true }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const winnerUpdate = tx.mock.calls.find((call) => sqlTextFromCall(call).includes("winner_user_id"));
    expect(winnerUpdate).toBeDefined();
    expect(winnerUpdate).toContain("guest-1");
  });
});
