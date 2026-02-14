import type { Context } from "hono";
import {
  syncRequestSchema,
  syncResponseSchema,
  type SyncEvent,
} from "@pixelz/shared";
import { GAME } from "@pixelz/shared";
import { sql } from "./db.js";
import type { AuthPayload, SyncAuth } from "./auth.js";

/** Exported for unit tests. */
export function validateScore(score: number, moves: number, timeMs: number): boolean {
  if (score < 0 || score > GAME.MAX_SCORE) return false;
  if (moves < 0 || timeMs < 0) return false;
  return true;
}

/** True if any row has supabase_auth_id set (signed-in user). Exported for unit tests. */
export function isNicknameTakenBySignedInUser(
  rows: { supabase_auth_id: string | null }[]
): boolean {
  return rows.some((r) => r.supabase_auth_id != null);
}

function displayName(nickname: string | null, email: string | null): string | null {
  const name = (nickname?.trim() || null) ?? email;
  return name || null;
}

async function getOrCreateAppUserId(
  supabaseAuthId: string,
  email: string | null,
  nicknameFromJwt: string | null
): Promise<string> {
  const name = displayName(nicknameFromJwt, email);
  const existing = await sql`
    select id, nickname from public.app_users where supabase_auth_id = ${supabaseAuthId}
  `;
  if (existing.length > 0) {
    if (name != null && existing[0].nickname == null) {
      await sql`
        update public.app_users set nickname = ${name} where supabase_auth_id = ${supabaseAuthId}
      `;
    }
    return existing[0].id;
  }
  const inserted = await sql`
    insert into public.app_users (supabase_auth_id, nickname)
    values (${supabaseAuthId}, ${name})
    returning id
  `;
  return inserted[0].id;
}

export async function handleSync(c: Context): Promise<Response> {
  const auth = c.get("auth") as SyncAuth;
  const body = await c.req.json().catch(() => ({}));
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const { events } = parsed.data;
  const rejectedIndices: number[] = [];
  const rejectedReasons: Record<string, string> = {};
  const appUserId =
    "anonymousAppUserId" in auth
      ? auth.anonymousAppUserId
      : await getOrCreateAppUserId(
          auth.sub,
          auth.email ?? null,
          auth.nickname ?? null
        );

  for (let i = 0; i < events.length; i++) {
    const event = events[i] as SyncEvent;
    const result = await processEvent(event, appUserId);
    if (result !== true) {
      rejectedIndices.push(i);
      if (result.reason) rejectedReasons[String(i)] = result.reason;
    }
  }

  const response = syncResponseSchema.parse({
    acceptedCount: events.length - rejectedIndices.length,
    rejectedCount: rejectedIndices.length,
    rejectedIndices: rejectedIndices.length > 0 ? rejectedIndices : undefined,
    rejectedReasons: Object.keys(rejectedReasons).length > 0 ? rejectedReasons : undefined,
  });
  return c.json(response);
}

const NICKNAME_TAKEN_REASON = "nickname_taken";

type ProcessResult = true | { reason: string };

async function processEvent(event: SyncEvent, appUserId: string): Promise<ProcessResult> {
  switch (event.type) {
    case "LEVEL_COMPLETED": {
      const { levelId, score, moves, timeMs, moveSequence } = event.payload;
      if (!validateScore(score, moves, timeMs)) return false as ProcessResult;
      if (moveSequence !== undefined) {
        if (moveSequence.length !== moves) return false as ProcessResult;
        const maxColorIndex = 9;
        if (moveSequence.some((v) => v < 0 || v > maxColorIndex)) return false as ProcessResult;
      }
      const moveSequenceValue =
        moveSequence !== undefined && moveSequence.length > 0 ? moveSequence : null;
      const duplicate = await sql`
        select 1 from public.scores
        where user_id = ${appUserId}::uuid and level_id = ${levelId} and seed is null
          and score = ${score} and moves = ${moves} and time_ms = ${timeMs}
          and created_at > now() - interval '2 minutes'
        limit 1
      `;
      if (duplicate.length > 0) return true;
      const userNick = await sql`
        select nickname from public.app_users where id = ${appUserId}::uuid limit 1
      `;
      const nickname = userNick.length > 0 && userNick[0].nickname != null ? String(userNick[0].nickname) : null;
      await sql`
        insert into public.scores (user_id, level_id, seed, score, moves, time_ms, move_sequence, nickname)
        values (${appUserId}, ${levelId}, null, ${score}, ${moves}, ${timeMs}, ${moveSequenceValue}, ${nickname})
      `;
      return true;
    }
    case "RANDOM_LEVEL_PLAYED": {
      const { seed, score, moves, timeMs } = event.payload;
      if (!validateScore(score, moves, timeMs)) return false as ProcessResult;
      const levelIdRandom = "random";
      const duplicate = await sql`
        select 1 from public.scores
        where user_id = ${appUserId}::uuid and level_id = ${levelIdRandom} and seed = ${seed}
          and score = ${score} and moves = ${moves} and time_ms = ${timeMs}
          and created_at > now() - interval '2 minutes'
        limit 1
      `;
      if (duplicate.length > 0) return true;
      const userNick = await sql`
        select nickname from public.app_users where id = ${appUserId}::uuid limit 1
      `;
      const nickname = userNick.length > 0 && userNick[0].nickname != null ? String(userNick[0].nickname) : null;
      await sql`
        insert into public.scores (user_id, level_id, seed, score, moves, time_ms, nickname)
        values (${appUserId}, ${levelIdRandom}, ${seed}, ${score}, ${moves}, ${timeMs}, ${nickname})
      `;
      return true;
    }
    case "SET_NICKNAME": {
      const { nickname } = event.payload;
      const trimmed = nickname.trim();
      const existing = await sql`
        select id, supabase_auth_id from public.app_users
        where lower(trim(nickname)) = lower(${trimmed}) and id != ${appUserId}::uuid
      `;
      if (isNicknameTakenBySignedInUser(existing as unknown as { supabase_auth_id: string | null }[])) {
        return { reason: NICKNAME_TAKEN_REASON };
      }
      await sql`
        update public.app_users set nickname = ${trimmed} where id = ${appUserId}
      `;
      return true;
    }
    case "UPDATE_LAST_SCORE_NICKNAME": {
      const { nickname } = event.payload;
      const trimmed = nickname.trim();
      const existing = await sql`
        select id, supabase_auth_id from public.app_users
        where lower(trim(nickname)) = lower(${trimmed}) and id != ${appUserId}::uuid
      `;
      if (isNicknameTakenBySignedInUser(existing as unknown as { supabase_auth_id: string | null }[])) {
        return { reason: NICKNAME_TAKEN_REASON };
      }
      await sql`
        update public.app_users set nickname = ${trimmed} where id = ${appUserId}
      `;
      await sql`
        update public.scores set nickname = ${trimmed}
        where id = (
          select id from public.scores
          where user_id = ${appUserId}::uuid
          order by created_at desc
          limit 1
        )
      `;
      return true;
    }
    case "CREATE_CHALLENGE":
      return true;
    default:
      return false as ProcessResult;
  }
}
