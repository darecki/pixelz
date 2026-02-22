import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { handleGetSessionInvite } from "./sessions.js";

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("./db.js", () => ({ sql: mockSql }));

describe("GET /sessions/invite/:inviteCode", () => {
  beforeEach(() => {
    mockSql.mockReset();
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
});
