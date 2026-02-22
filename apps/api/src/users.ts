import { sql } from "./db.js";

function displayName(nickname: string | null, email: string | null): string | null {
  const name = (nickname?.trim() || null) ?? email;
  return name || null;
}

export async function getOrCreateAppUserId(
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
    return String(existing[0].id);
  }
  const inserted = await sql`
    insert into public.app_users (supabase_auth_id, nickname)
    values (${supabaseAuthId}, ${name})
    returning id
  `;
  return String(inserted[0].id);
}
