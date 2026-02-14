import type { Context } from "hono";
import { sql } from "./db.js";
import type { AuthPayload } from "./auth.js";
import { getAnonymousAppUserId } from "./auth.js";

async function getAppUserId(supabaseAuthId: string): Promise<string | null> {
  const rows = await sql`
    select id from public.app_users where supabase_auth_id = ${supabaseAuthId} limit 1
  `;
  return rows.length > 0 ? String(rows[0].id) : null;
}

/** GET /users/me/boards — Pixelz board IDs the current user has played (has at least one score). */
export async function handleMyBoards(c: Context): Promise<Response> {
  const auth = c.get("auth") as AuthPayload;
  const appUserId = await getAppUserId(auth.sub);
  if (!appUserId) {
    return c.json({ boardIds: [] });
  }
  const rows = await sql`
    select level_id
    from public.scores
    where user_id = ${appUserId}::uuid and level_id like 'pixelz_%'
    group by level_id
    order by max(created_at) desc
  `;
  const boardIds = (rows as unknown as { level_id: string }[]).map((r) => r.level_id);
  return c.json({ boardIds });
}

/** POST /users/me/merge-anonymous — move anonymous scores to current user, then delete anon user. */
export async function handleMergeAnonymous(c: Context): Promise<Response> {
  const auth = c.get("auth") as AuthPayload;
  const realAppUserId = await getAppUserId(auth.sub);
  if (!realAppUserId) {
    return c.json({ error: "User not found" }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const anonymousId =
    typeof body === "object" && body !== null && typeof (body as { anonymousId?: unknown }).anonymousId === "string"
      ? (body as { anonymousId: string }).anonymousId
      : null;
  if (!anonymousId?.trim()) {
    return c.json({ error: "Missing or invalid anonymousId" }, 400);
  }
  const anonAppUserId = await getAnonymousAppUserId(anonymousId.trim());
  if (!anonAppUserId) {
    return c.json({ error: "Anonymous user not found or already merged" }, 404);
  }
  if (anonAppUserId === realAppUserId) {
    return c.json({ error: "Cannot merge same user" }, 400);
  }
  try {
    await sql`begin`;
    await sql`
      update public.scores set user_id = ${realAppUserId}::uuid where user_id = ${anonAppUserId}::uuid
    `;
    await sql`delete from public.app_users where id = ${anonAppUserId}::uuid`;
    await sql`commit`;
    return c.json({ ok: true });
  } catch (err) {
    try {
      await sql`rollback`;
    } catch {
      // ignore rollback errors
    }
    return c.json({ error: "Failed to merge anonymous user" }, 500);
  }
}
