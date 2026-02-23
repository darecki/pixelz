import type { Context } from "hono";
import {
  SESSION,
  PIXELZ_BOARD_ID_PREFIX,
  REFLEX_LEVELS,
  createSessionSchema,
  finishSessionSchema,
  computeSessionScore,
} from "@pixelz/shared";
import { sql } from "./db.js";
import type { ResolvedAuth } from "./auth.js";

type SessionRow = {
  id: string;
  game: "pixelz" | "reflex";
  invite_code: string;
  level_id: string | null;
  seed: string;
  settings: Record<string, unknown>;
  status: string;
  max_players: number;
  starts_at: string | null;
  finished_at: string | null;
  winner_user_id: string | null;
};

type SessionPlayerRow = {
  id: string;
  session_id: string;
  user_id: string;
  role: "host" | "guest";
  status: "joined" | "ready" | "playing" | "finished" | "abandoned";
  score: number | null;
  moves: number | null;
  time_ms: number | null;
  move_sequence: number[] | null;
  finished_at: string | null;
  nickname: string | null;
};

function getResolvedAuth(c: Context): ResolvedAuth {
  return c.get("resolvedAuth") as ResolvedAuth;
}

function generateInviteCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(SESSION.INVITE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SESSION.INVITE_CODE_LENGTH; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function isUniqueViolation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("unique") || msg.includes("duplicate");
}

function resolveWinner(game: "pixelz" | "reflex", players: SessionPlayerRow[]): string | null {
  if (players.length === 0) return null;
  const sorted = [...players].sort((a, b) => {
    if (game === "pixelz") {
      const movesDelta = (a.moves ?? Number.MAX_SAFE_INTEGER) - (b.moves ?? Number.MAX_SAFE_INTEGER);
      if (movesDelta !== 0) return movesDelta;
      return (a.time_ms ?? Number.MAX_SAFE_INTEGER) - (b.time_ms ?? Number.MAX_SAFE_INTEGER);
    }
    return (a.time_ms ?? Number.MAX_SAFE_INTEGER) - (b.time_ms ?? Number.MAX_SAFE_INTEGER);
  });
  if (sorted.length < 2) return sorted[0]?.user_id ?? null;
  const first = sorted[0];
  const second = sorted[1];
  const tie =
    game === "pixelz"
      ? (first.moves === second.moves && first.time_ms === second.time_ms)
      : first.time_ms === second.time_ms;
  return tie ? null : first.user_id;
}

async function getSessionWithPlayers(sessionId: string): Promise<{
  session: SessionRow;
  players: SessionPlayerRow[];
} | null> {
  const sessions = await sql`
    select id, game, invite_code, level_id, seed, settings, status, max_players, starts_at, finished_at, winner_user_id
    from public.game_sessions
    where id = ${sessionId}::uuid
    limit 1
  `;
  if (sessions.length === 0) return null;
  const players = await sql`
    select
      p.id, p.session_id, p.user_id, p.role, p.status, p.score, p.moves, p.time_ms, p.move_sequence, p.finished_at,
      u.nickname
    from public.game_session_players p
    left join public.app_users u on u.id = p.user_id
    where p.session_id = ${sessionId}::uuid
    order by case when p.role = 'host' then 0 else 1 end, p.id asc
  `;
  return {
    session: sessions[0] as SessionRow,
    players: players as unknown as SessionPlayerRow[],
  };
}

function sessionResponse(data: { session: SessionRow; players: SessionPlayerRow[] }, currentUserId?: string) {
  return {
    currentUserId: currentUserId ?? null,
    session: {
      id: data.session.id,
      game: data.session.game,
      inviteCode: data.session.invite_code,
      levelId: data.session.level_id,
      seed: data.session.seed,
      settings: data.session.settings,
      status: data.session.status,
      maxPlayers: data.session.max_players,
      startsAt: data.session.starts_at,
      finishedAt: data.session.finished_at,
      winnerId: data.session.winner_user_id,
    },
    players: data.players.map((p) => ({
      userId: p.user_id,
      role: p.role,
      status: p.status,
      score: p.score,
      moves: p.moves,
      timeMs: p.time_ms,
      moveSequence: p.move_sequence,
      finishedAt: p.finished_at,
      nickname: p.nickname,
    })),
  };
}

export async function handleCreateSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  if (auth.isAnonymous) {
    return c.json({ error: "Only signed-in users can create sessions" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const payload = parsed.data;
  const game = payload.game;
  const seed = crypto.randomUUID();
  let levelId: string | null =
    "levelId" in payload && typeof payload.levelId === "string" ? payload.levelId : null;
  let settings: Record<string, unknown>;
  if (game === "reflex") {
    const rounds =
      levelId && levelId in REFLEX_LEVELS
        ? REFLEX_LEVELS[levelId as keyof typeof REFLEX_LEVELS]
        : 10;
    settings = { rounds };
  } else if (payload.mode === "generated") {
    settings = payload.settings;
  } else {
    settings = {};
  }

  for (let i = 0; i < 5; i++) {
    const inviteCode = generateInviteCode();
    try {
      const created = await sql.begin(async (tx: any) => {
        if (game === "pixelz" && payload.mode === "generated") {
          const boardId = PIXELZ_BOARD_ID_PREFIX + crypto.randomUUID();
          await tx`
            insert into public.boards (id, width, height, num_colors, seed)
            values (${boardId}, ${payload.settings.width}, ${payload.settings.height}, ${payload.settings.numColors}, ${seed})
          `;
          levelId = boardId;
        }
        const inserted = await tx`
          insert into public.game_sessions (game, invite_code, level_id, seed, settings, status, max_players)
          values (${game}, ${inviteCode}, ${levelId}, ${seed}, ${settings}, 'waiting', 2)
          returning id
        `;
        const sessionId = String(inserted[0].id);
        await tx`
          insert into public.game_session_players (session_id, user_id, role, status)
          values (${sessionId}::uuid, ${auth.appUserId}::uuid, 'host', 'joined')
        `;
        return { sessionId, inviteCode };
      });
      return c.json(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return c.json({ error: "Failed to generate unique invite code" }, 500);
}

export async function handleGetSessionInvite(c: Context): Promise<Response> {
  const inviteCode = c.req.param("inviteCode");
  if (!inviteCode?.trim()) return c.json({ error: "Missing invite code" }, 400);

  const rows = await sql`
    select
      s.id,
      s.game,
      s.level_id,
      s.settings,
      s.status,
      s.max_players,
      host_user.nickname as host_nickname
    from public.game_sessions s
    left join public.game_session_players host_player
      on host_player.session_id = s.id and host_player.role = 'host'
    left join public.app_users host_user
      on host_user.id = host_player.user_id
    where s.invite_code = ${inviteCode}
    limit 1
  `;
  if (rows.length === 0) {
    return c.json({ error: "Invite not found" }, 404);
  }
  const row = rows[0] as {
    id: string;
    game: string;
    level_id: string | null;
    settings: Record<string, unknown>;
    status: string;
    max_players: number;
    host_nickname: string | null;
  };
  return c.json({
    sessionId: row.id,
    game: row.game,
    levelId: row.level_id,
    settings: row.settings,
    status: row.status,
    maxPlayers: row.max_players,
    hostNickname: row.host_nickname,
  });
}

export async function handleJoinSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const result = await sql.begin(async (tx: any) => {
    const sessions = await tx`
      select id, status, max_players from public.game_sessions where id = ${sessionId}::uuid for update
    `;
    if (sessions.length === 0) return { error: "Session not found", status: 404 };
    const session = sessions[0] as { status: string; max_players: number };
    if (session.status !== "waiting") return { error: "Session is not joinable", status: 409 };

    const existing = await tx`
      select 1 from public.game_session_players
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
      limit 1
    `;
    if (existing.length > 0) return { ok: true };

    const countRows = await tx`
      select count(*) as count from public.game_session_players where session_id = ${sessionId}::uuid
    `;
    const playerCount = Number((countRows[0] as { count: string }).count);
    if (playerCount >= session.max_players) return { error: "Session is full", status: 409 };

    await tx`
      insert into public.game_session_players (session_id, user_id, role, status)
      values (${sessionId}::uuid, ${auth.appUserId}::uuid, 'guest', 'joined')
    `;
    return { ok: true };
  });

  if ("error" in result) return c.json({ error: result.error }, result.status as 404 | 409);
  return c.json({ ok: true });
}

export async function handleReadySession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const result = await sql.begin(async (tx: any) => {
    const sessions = await tx`
      select id, status, max_players from public.game_sessions where id = ${sessionId}::uuid for update
    `;
    if (sessions.length === 0) return { error: "Session not found", status: 404 };
    const session = sessions[0] as { status: string; max_players: number };
    if (session.status !== "waiting" && session.status !== "ready") {
      return { error: "Session is not in lobby state", status: 409 };
    }

    const participants = await tx`
      select id, status from public.game_session_players
      where session_id = ${sessionId}::uuid
      for update
    `;
    const meRow = await tx`
      select id, status from public.game_session_players
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
      for update
    `;
    if (meRow.length === 0) return { error: "Not a session participant", status: 403 };

    const playerCount = participants.length;
    if (playerCount !== session.max_players) {
      return { error: "Lobby is not full", status: 409 };
    }

    const currentStatus = String((meRow[0] as { status: string }).status);
    if (currentStatus === "ready") return { ok: true };
    if (currentStatus !== "joined") return { error: "Player cannot become ready", status: 409 };

    await tx`
      update public.game_session_players
      set status = 'ready'
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
    `;

    const refreshed = await tx`
      select status from public.game_session_players where session_id = ${sessionId}::uuid
    `;
    const allReady = (refreshed as unknown as { status: string }[]).every((p) => p.status === "ready");
    if (allReady) {
      await tx`
        update public.game_sessions
        set status = 'ready',
            starts_at = now() + (${Math.floor(SESSION.COUNTDOWN_AFTER_READY_MS / 1000)} * interval '1 second')
        where id = ${sessionId}::uuid
      `;
    }
    return { ok: true };
  });

  if ("error" in result) return c.json({ error: result.error }, result.status as 403 | 404 | 409);
  return c.json({ ok: true });
}

export async function handleBeginSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const result = await sql.begin(async (tx: any) => {
    const sessions = await tx`
      select id, status, max_players, starts_at
      from public.game_sessions
      where id = ${sessionId}::uuid
      for update
    `;
    if (sessions.length === 0) return { error: "Session not found", status: 404 };
    const session = sessions[0] as { status: string; max_players: number; starts_at: string | null };

    const me = await tx`
      select 1 from public.game_session_players
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
      limit 1
    `;
    if (me.length === 0) return { error: "Not a session participant", status: 403 };

    const countRows = await tx`
      select count(*) as count from public.game_session_players where session_id = ${sessionId}::uuid
    `;
    const playerCount = Number((countRows[0] as { count: string }).count);
    if (playerCount !== session.max_players) return { error: "Lobby is not full", status: 409 };

    if (session.status === "playing") return { ok: true };
    if (session.status !== "ready") return { error: "Session is not ready to begin", status: 409 };

    const startRows = await tx`
      select now() >= starts_at as can_start
      from public.game_sessions
      where id = ${sessionId}::uuid and starts_at is not null
      limit 1
    `;
    if (startRows.length === 0 || !(startRows[0] as { can_start: boolean }).can_start) {
      return { error: "Game countdown has not finished", status: 409 };
    }

    await tx`
      update public.game_sessions set status = 'playing' where id = ${sessionId}::uuid
    `;
    await tx`
      update public.game_session_players
      set status = 'playing'
      where session_id = ${sessionId}::uuid and status in ('joined', 'ready')
    `;
    return { ok: true };
  });
  if ("error" in result) return c.json({ error: result.error }, result.status as 403 | 404 | 409);
  return c.json({ ok: true });
}

export async function handleFinishSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const parsed = finishSessionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  const { moves, timeMs, moveSequence } = parsed.data;

  const result = await sql.begin(async (tx: any) => {
    const sessions = await tx`
      select id, game, level_id, status, starts_at
      from public.game_sessions
      where id = ${sessionId}::uuid
      for update
    `;
    if (sessions.length === 0) return { error: "Session not found", status: 404 };
    const session = sessions[0] as {
      game: "pixelz" | "reflex";
      level_id: string | null;
      status: string;
      starts_at: string | null;
    };
    if (session.status !== "playing") return { error: "Session is not playing", status: 409 };

    const startsAtRows = await tx`
      select now() >= starts_at as can_finish
      from public.game_sessions
      where id = ${sessionId}::uuid and starts_at is not null
      limit 1
    `;
    if (startsAtRows.length === 0 || !(startsAtRows[0] as { can_finish: boolean }).can_finish) {
      return { error: "Game has not started yet", status: 409 };
    }

    const meRows = await tx`
      select status from public.game_session_players
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
      for update
    `;
    if (meRows.length === 0) return { error: "Not a session participant", status: 403 };
    const myStatus = String((meRows[0] as { status: string }).status);
    if (myStatus === "finished") return { ok: true };
    if (myStatus !== "playing") return { error: "Player is not in playing state", status: 409 };

    if (session.game === "reflex") {
      const rounds = session.level_id
        ? REFLEX_LEVELS[session.level_id as keyof typeof REFLEX_LEVELS]
        : undefined;
      if (rounds !== undefined && moves !== rounds) {
        return { error: "Invalid moves for reflex level", status: 400 };
      }
    } else if (moveSequence !== undefined) {
      if (moveSequence.length !== moves) return { error: "Invalid move sequence length", status: 400 };
      if (moveSequence.some((value) => value < 0 || value > 9)) {
        return { error: "Invalid move sequence values", status: 400 };
      }
    }

    const score = computeSessionScore(session.game, moves, timeMs);
    const moveSequenceValue = moveSequence && moveSequence.length > 0 ? moveSequence : null;
    await tx`
      update public.game_session_players
      set status = 'finished',
          score = ${score},
          moves = ${moves},
          time_ms = ${timeMs},
          move_sequence = ${moveSequenceValue},
          finished_at = now()
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
    `;

    const players = await tx`
      select
        p.id, p.session_id, p.user_id, p.role, p.status, p.score, p.moves, p.time_ms, p.move_sequence, p.finished_at,
        u.nickname
      from public.game_session_players p
      left join public.app_users u on u.id = p.user_id
      where p.session_id = ${sessionId}::uuid
      for update of p
    `;
    const playerRows = players as unknown as SessionPlayerRow[];
    const allFinished = playerRows.every((p) => p.status === "finished");
    if (allFinished) {
      const winnerUserId = resolveWinner(session.game, playerRows);
      await tx`
        update public.game_sessions
        set status = 'finished',
            finished_at = now(),
            winner_user_id = ${winnerUserId}
        where id = ${sessionId}::uuid
      `;
    }
    return { ok: true };
  });

  if ("error" in result) return c.json({ error: result.error }, result.status as 400 | 403 | 404 | 409);
  return c.json({ ok: true });
}

export async function handleLeaveSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const result = await sql.begin(async (tx: any) => {
    const sessions = await tx`
      select id, status from public.game_sessions where id = ${sessionId}::uuid for update
    `;
    if (sessions.length === 0) return { error: "Session not found", status: 404 };
    const session = sessions[0] as { status: string };

    const players = await tx`
      select id, role from public.game_session_players
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
      for update
    `;
    if (players.length === 0) return { error: "Not a session participant", status: 403 };
    const me = players[0] as { role: "host" | "guest" };

    if (session.status === "finished" || session.status === "cancelled" || session.status === "abandoned") {
      return { ok: true };
    }

    if (session.status === "waiting" || session.status === "ready") {
      if (me.role === "host") {
        await tx`
          update public.game_sessions set status = 'cancelled', finished_at = now() where id = ${sessionId}::uuid
        `;
      } else {
        await tx`
          delete from public.game_session_players
          where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
        `;
        await tx`
          update public.game_sessions
          set status = 'waiting',
              starts_at = null
          where id = ${sessionId}::uuid
        `;
        await tx`
          update public.game_session_players
          set status = 'joined'
          where session_id = ${sessionId}::uuid and role = 'host'
        `;
      }
      return { ok: true };
    }

    await tx`
      update public.game_session_players
      set status = 'abandoned'
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
    `;
    await tx`
      update public.game_sessions set status = 'abandoned', finished_at = now() where id = ${sessionId}::uuid
    `;
    return { ok: true };
  });

  if ("error" in result) return c.json({ error: result.error }, result.status as 403 | 404);
  return c.json({ ok: true });
}

export async function handleGetSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  const participant = await sql`
    select 1 from public.game_session_players
    where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
    limit 1
  `;
  if (participant.length === 0) return c.json({ error: "Not a session participant" }, 403);

  const data = await getSessionWithPlayers(sessionId);
  if (!data) return c.json({ error: "Session not found" }, 404);
  return c.json(sessionResponse(data, auth.appUserId));
}
