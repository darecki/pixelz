import type { Context } from "hono";
import { sql } from "./db.js";

const ANON_ID_PREFIX = "user_";
const ANON_ID_RANDOM_LENGTH = 12;

function generateAnonymousId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = ANON_ID_PREFIX;
  for (let i = 0; i < ANON_ID_RANDOM_LENGTH; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** POST /anon/register — create anonymous user, return { anonymousId }. No auth. */
export async function handleAnonRegister(c: Context): Promise<Response> {
  let anonymousId = generateAnonymousId();
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      const inserted = await sql`
        insert into public.app_users (anonymous_id, nickname)
        values (${anonymousId}, ${anonymousId})
        returning id
      `;
      if (inserted.length > 0) {
        return c.json({ anonymousId });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        anonymousId = generateAnonymousId();
        attempts++;
        continue;
      }
      throw err;
    }
    break;
  }
  return c.json({ error: "Failed to create anonymous user" }, 500);
}
