import type { Context } from "hono";
import { sql } from "./db.js";
import type { AuthPayload } from "./auth.js";

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
