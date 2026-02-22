import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  handleCreateSession,
  handleGetSession,
  handleGetSessionInvite,
  handleJoinSession,
  handleLeaveSession,
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
});
