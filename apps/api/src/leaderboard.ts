import type { Context } from "hono";
import { leaderboardResponseSchema } from "@pixelz/shared";
import { GAME } from "@pixelz/shared";
import { sql } from "./db.js";

export async function handleLeaderboard(c: Context): Promise<Response> {
  const levelId = c.req.param("levelId");
  if (!levelId) {
    return c.json({ error: "Missing levelId" }, 400);
  }

  const lowerIsBetter = levelId.startsWith("reflex_");

  try {
    const rows = lowerIsBetter
      ? await sql`
          select
            s.score,
            s.moves,
            s.time_ms,
            u.id as user_id,
            u.nickname
          from public.scores s
          join public.app_users u on u.id = s.user_id
          where s.level_id = ${levelId}
          order by s.time_ms asc, s.score desc
          limit ${GAME.LEADERBOARD_TOP_N}
        `
      : await sql`
          select
            s.score,
            s.moves,
            s.time_ms,
            u.id as user_id,
            u.nickname
          from public.scores s
          join public.app_users u on u.id = s.user_id
          where s.level_id = ${levelId}
          order by s.score desc, s.time_ms asc
          limit ${GAME.LEADERBOARD_TOP_N}
        `;

    const entries = rows.map((row, index) => ({
      rank: index + 1,
      userId: String(row.user_id),
      nickname: row.nickname ?? null,
      score: Number(row.score),
      moves: Number(row.moves),
      timeMs: Number(row.time_ms),
    }));

    const response = leaderboardResponseSchema.parse({
      levelId,
      entries,
    });
    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[leaderboard]", message);
    return c.json({ levelId, entries: [] });
  }
}
