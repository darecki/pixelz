import type { Context } from "hono";
import {
  SESSION,
  PIXELZ_BOARD_ID_PREFIX,
  REFLEX_LEVELS,
  createSessionSchema,
  finishSessionSchema,
  computeSessionScore,
  isPredefinedPixelzLevel,
  type CreateSessionRequest,
  type FinishSessionRequest,
  type PixelzLevelId,
  type ReflexLevelId,
} from "@pixelz/shared";
import { sql } from "./db.js";
import type { ResolvedAuth } from "./auth.js";
import { validatePixelzCompletion } from "./pixelzValidation.js";

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
  next_session_id: string | null;
  party_ended_at: string | null;
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
  placement: number | null;
  disqualified: boolean;
};

type SessionTimingRow = {
  can_finish: boolean;
  elapsed_ms: number;
};

const PIXELZ_CLIENT_TIME_SKEW_TOLERANCE_MS = 5_000;

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

function isTerminalSessionStatus(status: string): boolean {
  return status === "finished" || status === "cancelled" || status === "abandoned";
}

function deriveSessionPayload(session: Pick<SessionRow, "game" | "level_id" | "settings" | "max_players">): CreateSessionRequest {
  const seriesLength = parseSeriesState(session.settings).seriesLength;
  if (session.game === "reflex") {
    if (!session.level_id) throw new Error("Missing reflex level");
    return {
      game: "reflex",
      mode: "predefined",
      levelId: session.level_id as ReflexLevelId,
      maxPlayers: session.max_players,
      seriesLength,
    };
  }

  if (session.level_id && isPredefinedPixelzLevel(session.level_id)) {
    return {
      game: "pixelz",
      mode: "predefined",
      levelId: session.level_id as PixelzLevelId,
      maxPlayers: session.max_players,
      seriesLength,
    };
  }

  if (session.level_id?.startsWith(PIXELZ_BOARD_ID_PREFIX)) {
    return {
      game: "pixelz",
      mode: "generated",
      settings: {
        width: Number((session.settings?.width as number | undefined) ?? 7),
        height: Number((session.settings?.height as number | undefined) ?? 10),
        numColors: Number((session.settings?.numColors as number | undefined) ?? 5),
      },
      maxPlayers: session.max_players,
      seriesLength,
    };
  }

  if (!session.level_id) throw new Error("Missing pixelz level");
  return {
    game: "pixelz",
    mode: "generated",
    settings: {
      width: Number((session.settings?.width as number | undefined) ?? 7),
      height: Number((session.settings?.height as number | undefined) ?? 10),
      numColors: Number((session.settings?.numColors as number | undefined) ?? 5),
    },
    maxPlayers: session.max_players,
    seriesLength,
  };
}

type SessionParticipantSeed = {
  user_id: string;
  role: "host" | "guest";
};

type SeriesState = {
  seriesLength: 1 | 3;
  currentRound: number;
  seriesWins: Record<string, number>;
};

function parseSeriesState(settings: Record<string, unknown> | null | undefined): SeriesState {
  const rawLength = Number(settings?.seriesLength);
  const seriesLength: 1 | 3 = rawLength === 3 ? 3 : 1;
  const currentRound = Math.max(1, Math.trunc(Number(settings?.currentRound ?? 1)));
  const rawWins = settings?.seriesWins;
  const seriesWins = rawWins && typeof rawWins === "object"
    ? Object.fromEntries(
        Object.entries(rawWins as Record<string, unknown>)
          .filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number")
          .map(([userId, wins]) => {
            const safeWins = Number.isFinite(wins) ? wins : 0;
            return [userId, Math.max(0, Math.trunc(safeWins))];
          })
      )
    : {};
  return { seriesLength, currentRound, seriesWins };
}

function nextSeriesState(source: Pick<SessionRow, "settings" | "winner_user_id">): {
  state: SeriesState;
  hasMoreRounds: boolean;
  decided: boolean;
} {
  const previous = parseSeriesState(source.settings);
  if (previous.seriesLength === 1) {
    return {
      state: {
        seriesLength: 1,
        currentRound: 1,
        seriesWins: {},
      },
      hasMoreRounds: true,
      decided: false,
    };
  }
  const nextWins = { ...previous.seriesWins };
  if (source.winner_user_id) {
    nextWins[source.winner_user_id] = (nextWins[source.winner_user_id] ?? 0) + 1;
  }
  const targetWins = previous.seriesLength === 3 ? 2 : 1;
  const decided = Object.values(nextWins).some((wins) => wins >= targetWins);
  const nextRound = previous.currentRound + 1;
  return {
    state: {
      seriesLength: previous.seriesLength,
      currentRound: nextRound,
      seriesWins: nextWins,
    },
    hasMoreRounds: nextRound <= previous.seriesLength,
    decided,
  };
}

async function createSessionRecord(
  tx: any,
  payload: CreateSessionRequest,
  options?: {
    previousSessionId?: string | null;
    players?: SessionParticipantSeed[];
    hostUserId?: string;
    seriesState?: SeriesState | null;
  }
): Promise<{ sessionId: string; inviteCode: string }> {
  const game = payload.game;
  const maxPlayers = "maxPlayers" in payload && typeof payload.maxPlayers === "number" ? payload.maxPlayers : 2;
  const seed = crypto.randomUUID();
  const inviteCode = generateInviteCode();
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

  const seriesState = options?.seriesState ?? {
    seriesLength: payload.seriesLength === 3 ? 3 : 1,
    currentRound: 1,
    seriesWins: {},
  };
  settings = {
    ...settings,
    seriesLength: seriesState.seriesLength,
    currentRound: seriesState.currentRound,
    seriesWins: seriesState.seriesWins,
  };

  if (game === "pixelz" && payload.mode === "generated") {
    const boardId = PIXELZ_BOARD_ID_PREFIX + crypto.randomUUID();
    await tx`
      insert into public.boards (id, width, height, num_colors, seed)
      values (${boardId}, ${payload.settings.width}, ${payload.settings.height}, ${payload.settings.numColors}, ${seed})
    `;
    levelId = boardId;
  }

  const inserted = await tx`
    insert into public.game_sessions (game, invite_code, level_id, seed, settings, status, max_players, previous_session_id)
    values (${game}, ${inviteCode}, ${levelId}, ${seed}, ${settings}, 'waiting', ${maxPlayers}, ${options?.previousSessionId ?? null})
    returning id
  `;
  const sessionId = String(inserted[0].id);

  const players = options?.players ?? (options?.hostUserId
    ? [{ user_id: options.hostUserId, role: "host" as const }]
    : []);

  for (const player of players) {
    await tx`
      insert into public.game_session_players (session_id, user_id, role, status)
      values (${sessionId}::uuid, ${player.user_id}::uuid, ${player.role}, 'joined')
    `;
  }

  return { sessionId, inviteCode };
}

async function getNextSessionSummary(
  executor: typeof sql | any,
  sessionId: string
): Promise<{ sessionId: string; inviteCode: string } | null> {
  const rows = await executor`
    select id, invite_code
    from public.game_sessions s
    where previous_session_id = ${sessionId}::uuid
    limit 1
  `;
  if (rows.length === 0) return null;
  return {
    sessionId: String(rows[0].id),
    inviteCode: String(rows[0].invite_code),
  };
}

function resolveAndAssignPlacements(
  game: "pixelz" | "reflex",
  players: SessionPlayerRow[]
): { winnerUserId: string | null; placements: { id: string; placement: number }[] } {
  if (players.length === 0) return { winnerUserId: null, placements: [] };
  const sorted = [...players].sort((a, b) => {
    if (game === "pixelz") {
      const movesDelta = (a.moves ?? Number.MAX_SAFE_INTEGER) - (b.moves ?? Number.MAX_SAFE_INTEGER);
      if (movesDelta !== 0) return movesDelta;
      return (a.time_ms ?? Number.MAX_SAFE_INTEGER) - (b.time_ms ?? Number.MAX_SAFE_INTEGER);
    }
    const disqualifiedDelta = Number(a.disqualified) - Number(b.disqualified);
    if (disqualifiedDelta !== 0) return disqualifiedDelta;
    if (a.disqualified && b.disqualified) {
      const movesDelta = (b.moves ?? Number.MIN_SAFE_INTEGER) - (a.moves ?? Number.MIN_SAFE_INTEGER);
      if (movesDelta !== 0) return movesDelta;
    }
    return (a.time_ms ?? Number.MAX_SAFE_INTEGER) - (b.time_ms ?? Number.MAX_SAFE_INTEGER);
  });

  const placements: { id: string; placement: number }[] = [];
  let currentPlacement = 1;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (i > 0) {
      const prev = sorted[i - 1];
      const tie =
        game === "pixelz"
          ? current.moves === prev.moves && current.time_ms === prev.time_ms
          : current.disqualified === prev.disqualified &&
            current.moves === prev.moves &&
            current.time_ms === prev.time_ms;
      if (!tie) {
        currentPlacement = i + 1;
      }
    }
    placements.push({ id: current.id, placement: currentPlacement });
  }

  // Determine winner_user_id
  let winnerUserId: string | null = null;
  if (sorted.length === 1 && !sorted[0].disqualified) {
    winnerUserId = sorted[0].user_id;
  } else if (sorted.length > 1) {
    const eligibleWinnerIds = new Set(sorted.filter((player) => !player.disqualified).map((player) => player.id));
    const firstPlacement = placements.filter((p) => p.placement === 1 && eligibleWinnerIds.has(p.id));
    if (firstPlacement.length === 1) {
      winnerUserId = sorted.find((s) => s.id === firstPlacement[0].id)?.user_id ?? null;
    }
  }

  return { winnerUserId, placements };
}

async function getSessionWithPlayers(sessionId: string): Promise<{
  session: SessionRow;
  players: SessionPlayerRow[];
} | null> {
  const sessions = await sql`
    select
      s.id,
      s.game,
      s.invite_code,
      s.level_id,
      s.seed,
      s.settings,
      s.status,
      s.max_players,
      s.starts_at,
      s.finished_at,
      s.winner_user_id,
      next_session.id as next_session_id,
      s.party_ended_at
    from public.game_sessions s
    left join public.game_sessions next_session
      on next_session.previous_session_id = s.id
    where s.id = ${sessionId}::uuid
    limit 1
  `;
  if (sessions.length === 0) return null;
  const players = await sql`
    select
      p.id, p.session_id, p.user_id, p.role, p.status, p.score, p.moves, p.time_ms, p.move_sequence, p.finished_at, p.placement,
      p.disqualified, u.nickname
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
      nextSessionId: data.session.next_session_id,
      partyEndedAt: data.session.party_ended_at,
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
      placement: p.placement,
      disqualified: p.disqualified,
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
  for (let i = 0; i < 5; i++) {
    try {
      const created = await sql.begin((tx: any) =>
        createSessionRecord(tx, payload, { hostUserId: auth.appUserId })
      );
      return c.json(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return c.json({ error: "Failed to generate unique invite code" }, 500);
}

export async function handleCreateNextSession(c: Context): Promise<Response> {
  const auth = getResolvedAuth(c);
  const sessionId = c.req.param("id");
  if (!sessionId) return c.json({ error: "Missing session id" }, 400);

  for (let i = 0; i < 5; i++) {
    try {
      const created = await sql.begin(async (tx: any) => {
        const sessions = await tx`
          select
            id,
            game,
            invite_code,
            level_id,
            seed,
            settings,
            status,
            max_players,
            starts_at,
            finished_at,
            winner_user_id,
            null::uuid as next_session_id,
            party_ended_at
          from public.game_sessions
          where id = ${sessionId}::uuid
          for update
        `;
        if (sessions.length === 0) return { error: "Session not found", status: 404 } as const;

        const source = sessions[0] as SessionRow;
        if (!isTerminalSessionStatus(source.status)) {
          return { error: "Session does not support next game yet", status: 409 } as const;
        }

        const meRows = await tx`
          select role
          from public.game_session_players
          where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
          limit 1
          for update
        `;
        if (meRows.length === 0) return { error: "Not a session participant", status: 403 } as const;
        if (String((meRows[0] as { role: string }).role) !== "host") {
          return { error: "Only the host can create the next session", status: 403 } as const;
        }

        const existing = await getNextSessionSummary(tx, sessionId);
        if (existing) return existing;

        const series = nextSeriesState(source);
        if (series.decided || !series.hasMoreRounds) {
          return { error: "Series is already complete", status: 409 } as const;
        }

        const players = await tx`
          select user_id, role
          from public.game_session_players
          where session_id = ${sessionId}::uuid
          order by case when role = 'host' then 0 else 1 end, id asc
        `;
        const payload = deriveSessionPayload(source);
        return createSessionRecord(tx, payload, {
          previousSessionId: sessionId,
          players: players as SessionParticipantSeed[],
          seriesState: series.state,
        });
      });

      if ("error" in created) {
        return c.json({ error: created.error }, created.status as 403 | 404 | 409);
      }

      return c.json(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await getNextSessionSummary(sql, sessionId);
      if (existing) return c.json(existing);
    }
  }

  return c.json({ error: "Failed to create next session" }, 500);
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
    if (playerCount < 2) {
      return { error: "At least 2 players are required", status: 409 };
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
    if (playerCount < 2) return { error: "At least 2 players are required", status: 409 };

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
  const { moves, timeMs, moveSequence, disqualified = false } = parsed.data as FinishSessionRequest;

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

    const startsAtRows = await tx<SessionTimingRow>`
      select
        now() >= starts_at as can_finish,
        greatest(0, floor(extract(epoch from (now() - starts_at)) * 1000))::bigint as elapsed_ms
      from public.game_sessions
      where id = ${sessionId}::uuid and starts_at is not null
      limit 1
    `;
    if (startsAtRows.length === 0 || !startsAtRows[0].can_finish) {
      return { error: "Game has not started yet", status: 409 };
    }
    const serverElapsedMs = Number(startsAtRows[0].elapsed_ms);

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
      if (moveSequence !== undefined) {
        return { error: "Move sequence is not used for reflex", status: 400 };
      }
      if (rounds !== undefined && disqualified && moves >= rounds) {
        return { error: "Disqualified reflex result must end before the final round", status: 400 };
      }
      if (rounds !== undefined && !disqualified && moves !== rounds) {
        return { error: "Invalid moves for reflex level", status: 400 };
      }
    } else if (disqualified) {
      return { error: "Disqualification is only supported for reflex sessions", status: 400 };
    } else if (session.game === "pixelz") {
      if (moveSequence === undefined) {
        return { error: "Move sequence is required for pixelz sessions", status: 400 };
      }
      if (moveSequence.length !== moves) return { error: "Invalid move sequence length", status: 400 };
      const validation = await validatePixelzCompletion(tx, session.level_id ?? "", moveSequence);
      if (!validation.valid) {
        return { error: "Invalid pixelz completion", details: validation.reason, status: 400 };
      }
      if (timeMs < serverElapsedMs - PIXELZ_CLIENT_TIME_SKEW_TOLERANCE_MS) {
        return { error: "Suspicious time difference detected", status: 400 };
      }
    } else {
      return { error: "Unsupported game type", status: 400 };
    }

    const authoritativeMoves = session.game === "pixelz" ? moveSequence!.length : moves;
    const authoritativeTimeMs = timeMs;
    const score = computeSessionScore(session.game, authoritativeMoves, authoritativeTimeMs);
    const moveSequenceValue = moveSequence && moveSequence.length > 0 ? moveSequence : null;
    await tx`
      update public.game_session_players
      set status = 'finished',
          score = ${score},
          moves = ${authoritativeMoves},
          time_ms = ${authoritativeTimeMs},
          move_sequence = ${moveSequenceValue},
          disqualified = ${disqualified},
          finished_at = now()
      where session_id = ${sessionId}::uuid and user_id = ${auth.appUserId}::uuid
    `;

    const players = await tx`
      select
        p.id, p.session_id, p.user_id, p.role, p.status, p.score, p.moves, p.time_ms, p.move_sequence, p.finished_at, p.placement,
        p.disqualified, u.nickname
      from public.game_session_players p
      left join public.app_users u on u.id = p.user_id
      where p.session_id = ${sessionId}::uuid
      for update of p
    `;
    const playerRows = players as unknown as SessionPlayerRow[];
    const allFinished = playerRows.every((p) => p.status === "finished");
    if (allFinished) {
      const { winnerUserId, placements } = resolveAndAssignPlacements(session.game, playerRows);
      
      for (const p of placements) {
        await tx`
          update public.game_session_players
          set placement = ${p.placement}
          where id = ${p.id}::uuid
        `;
      }

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

  if ("error" in result) {
    const payload = "details" in result && result.details
      ? { error: result.error, details: result.details }
      : { error: result.error };
    return c.json(payload, result.status as 400 | 403 | 404 | 409);
  }
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
      if (me.role === "host") {
        const nextSession = await getNextSessionSummary(tx, sessionId);
        if (!nextSession) {
          await tx`
            update public.game_sessions
            set party_ended_at = coalesce(party_ended_at, now())
            where id = ${sessionId}::uuid
          `;
        }
      }
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
