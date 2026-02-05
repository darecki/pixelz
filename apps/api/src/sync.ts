import type { Context } from "hono";
import {
  syncRequestSchema,
  syncResponseSchema,
  type SyncEvent,
} from "@pixelz/shared";
import { GAME } from "@pixelz/shared";
import { sql } from "./db.js";
import type { AuthPayload } from "./auth.js";

function validateScore(score: number, moves: number, timeMs: number): boolean {
  if (score < 0 || score > GAME.MAX_SCORE) return false;
  if (moves < 0 || timeMs < 0) return false;
  return true;
}

async function getOrCreateAppUserId(supabaseAuthId: string): Promise<string> {
  const existing = await sql`
    select id from public.app_users where supabase_auth_id = ${supabaseAuthId}
  `;
  if (existing.length > 0) {
    return existing[0].id;
  }
  const inserted = await sql`
    insert into public.app_users (supabase_auth_id)
    values (${supabaseAuthId})
    returning id
  `;
  return inserted[0].id;
}

export async function handleSync(c: Context): Promise<Response> {
  const auth = c.get("auth") as AuthPayload;
  const body = await c.req.json().catch(() => ({}));
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const { events } = parsed.data;
  const rejectedIndices: number[] = [];
  const appUserId = await getOrCreateAppUserId(auth.sub);

  for (let i = 0; i < events.length; i++) {
    const event = events[i] as SyncEvent;
    const ok = await processEvent(event, appUserId);
    if (!ok) rejectedIndices.push(i);
  }

  const response = syncResponseSchema.parse({
    acceptedCount: events.length - rejectedIndices.length,
    rejectedCount: rejectedIndices.length,
    rejectedIndices: rejectedIndices.length > 0 ? rejectedIndices : undefined,
  });
  return c.json(response);
}

async function processEvent(event: SyncEvent, appUserId: string): Promise<boolean> {
  switch (event.type) {
    case "LEVEL_COMPLETED": {
      const { levelId, score, moves, timeMs } = event.payload;
      if (!validateScore(score, moves, timeMs)) return false;
      await sql`
        insert into public.scores (user_id, level_id, seed, score, moves, time_ms)
        values (${appUserId}, ${levelId}, null, ${score}, ${moves}, ${timeMs})
      `;
      return true;
    }
    case "RANDOM_LEVEL_PLAYED": {
      const { seed, score, moves, timeMs } = event.payload;
      if (!validateScore(score, moves, timeMs)) return false;
      const levelIdRandom = "random";
      await sql`
        insert into public.scores (user_id, level_id, seed, score, moves, time_ms)
        values (${appUserId}, ${levelIdRandom}, ${seed}, ${score}, ${moves}, ${timeMs})
      `;
      return true;
    }
    case "SET_NICKNAME": {
      const { nickname } = event.payload;
      await sql`
        update public.app_users set nickname = ${nickname} where id = ${appUserId}
      `;
      return true;
    }
    case "CREATE_CHALLENGE":
      return true;
    default:
      return false;
  }
}
