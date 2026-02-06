import type { Context } from "hono";
import { leaderboardResponseSchema } from "@pixelz/shared";
import { GAME } from "@pixelz/shared";
import { sql } from "./db.js";
import { verifyTokenOptional } from "./auth.js";

const LEADERBOARD_HANDLER_TIMEOUT_MS = 10_000;

async function getAppUserIdBySupabaseAuthId(supabaseAuthId: string): Promise<string | null> {
  const rows = await sql`
    select id from public.app_users where supabase_auth_id = ${supabaseAuthId} limit 1
  `;
  return rows.length > 0 ? String(rows[0].id) : null;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Leaderboard timeout")), ms);
  });
}

export async function handleLeaderboard(c: Context): Promise<Response> {
  const levelId = c.req.param("levelId");
  if (!levelId) {
    return c.json({ error: "Missing levelId" }, 400);
  }

  let currentUserId: string | null = null;

  try {
    await Promise.race([
      (async () => {
        const auth = await verifyTokenOptional(c.req.header("Authorization") ?? null);
        currentUserId = auth ? await getAppUserIdBySupabaseAuthId(auth.sub) : null;
      })(),
      timeout(LEADERBOARD_HANDLER_TIMEOUT_MS),
    ]);
  } catch (err) {
    if (err instanceof Error && err.message === "Leaderboard timeout") {
      console.error("[leaderboard] Timeout (auth lookup). Returning empty.");
      return c.json({ levelId, entries: [], currentUserId: undefined });
    }
    throw err;
  }

  const lowerIsBetter = levelId.startsWith("reflex_");

  try {
    const rows = await Promise.race([
      lowerIsBetter
        ? sql`
          select
            s.score,
            s.moves,
            s.time_ms,
            to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at_iso,
            u.id as user_id,
            u.nickname
          from public.scores s
          join public.app_users u on u.id = s.user_id
          where s.level_id = ${levelId}
          order by s.time_ms asc, s.score desc
          limit ${GAME.LEADERBOARD_TOP_N}
        `
        : sql`
          select
            s.score,
            s.moves,
            s.time_ms,
            to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at_iso,
            u.id as user_id,
            u.nickname
          from public.scores s
          join public.app_users u on u.id = s.user_id
          where s.level_id = ${levelId}
          order by s.score desc, s.time_ms asc
          limit ${GAME.LEADERBOARD_TOP_N}
        `,
      timeout(LEADERBOARD_HANDLER_TIMEOUT_MS),
    ]) as Awaited<ReturnType<typeof sql>>;

    const entries = rows.map((row, index) => ({
      rank: index + 1,
      userId: String(row.user_id),
      nickname: row.nickname ?? null,
      score: Number(row.score),
      moves: Number(row.moves),
      timeMs: Number(row.time_ms),
      createdAt: String(row.created_at_iso ?? ""),
    }));

    const response = leaderboardResponseSchema.parse({
      levelId,
      entries,
      ...(currentUserId != null && { currentUserId }),
    });
    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Leaderboard timeout") {
      console.error("[leaderboard] Timeout (DB query). Returning empty.");
    } else {
      console.error("[leaderboard]", message);
    }
    return c.json({ levelId, entries: [], currentUserId: currentUserId ?? undefined });
  }
}
