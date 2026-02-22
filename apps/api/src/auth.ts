import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import { sql } from "./db.js";
import { getOrCreateAppUserId } from "./users.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set");
}

const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", SUPABASE_URL.replace(/\/$/, ""));
const SupabaseJWKS = jose.createRemoteJWKSet(jwksUrl);

/** Returns auth payload if token is valid, otherwise null. Does not send 401. */
export async function verifyTokenOptional(token: string | null): Promise<AuthPayload | null> {
  if (!token?.startsWith("Bearer ")) return null;
  const jwt = token.slice(7);
  try {
    const { payload } = await jose.jwtVerify(jwt, SupabaseJWKS);
    const sub = payload.sub as string;
    if (!sub) return null;
    const email = (payload.email as string | undefined) ?? null;
    const userMetadata = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
    const nickname = (userMetadata.nickname as string | undefined) ?? null;
    return { sub, email, nickname };
  } catch {
    return null;
  }
}

export type AuthPayload = {
  sub: string; // Supabase auth user id
  email?: string | null;
  nickname?: string | null;
};

export type ResolvedAuth = {
  appUserId: string;
  isAnonymous: boolean;
  nickname: string | null;
};

/** Sync route accepts either JWT or X-Anonymous-Id. */
export type SyncAuth = AuthPayload | { anonymousAppUserId: string };

/** Look up app_user id by anonymous_id. Returns null if not found or already merged. */
export async function getAnonymousAppUserId(anonymousId: string): Promise<string | null> {
  if (!anonymousId || typeof anonymousId !== "string") return null;
  const trimmed = anonymousId.trim();
  if (!trimmed) return null;
  const rows = await sql`
    select id from public.app_users where anonymous_id = ${trimmed} limit 1
  `;
  return rows.length > 0 ? String(rows[0].id) : null;
}

export const authMiddleware = createMiddleware<{
  Variables: { auth: AuthPayload };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  try {
    const { payload } = await jose.jwtVerify(token, SupabaseJWKS);
    const sub = payload.sub as string;
    if (!sub) {
      return c.json({ error: "Invalid token payload" }, 401);
    }
    const email = (payload.email as string | undefined) ?? null;
    const userMetadata = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
    const nickname = (userMetadata.nickname as string | undefined) ?? null;
    c.set("auth", { sub, email, nickname });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

/**
 * Flexible auth middleware for routes that accept:
 * - Bearer JWT (resolved to app user, created if needed)
 * - X-Anonymous-Id (resolved to existing anonymous app user)
 */
export const flexAuthMiddleware = createMiddleware<{
  Variables: { resolvedAuth: ResolvedAuth };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const parsed = await verifyTokenOptional(authHeader ?? null);
  if (parsed) {
    const appUserId = await getOrCreateAppUserId(
      parsed.sub,
      parsed.email ?? null,
      parsed.nickname ?? null
    );
    c.set("resolvedAuth", {
      appUserId,
      isAnonymous: false,
      nickname: parsed.nickname ?? null,
    });
    await next();
    return;
  }

  const anonId = c.req.header("X-Anonymous-Id");
  if (anonId) {
    const appUserId = await getAnonymousAppUserId(anonId);
    if (appUserId) {
      c.set("resolvedAuth", { appUserId, isAnonymous: true, nickname: null });
      await next();
      return;
    }
  }

  return c.json({ error: "Missing or invalid Authorization header or X-Anonymous-Id" }, 401);
});

/** For POST /sync: accept either Bearer JWT or X-Anonymous-Id. */
export const syncAuthMiddleware = createMiddleware<{
  Variables: { auth: SyncAuth };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const parsed = await verifyTokenOptional(authHeader ?? null);
  if (parsed) {
    c.set("auth", parsed);
    await next();
    return;
  }
  const anonId = c.req.header("X-Anonymous-Id");
  if (!anonId) {
    return c.json({ error: "Missing or invalid Authorization header or X-Anonymous-Id" }, 401);
  }
  const appUserId = await getAnonymousAppUserId(anonId);
  if (!appUserId) {
    return c.json({ error: "Missing or invalid Authorization header or X-Anonymous-Id" }, 401);
  }
  c.set("auth", { anonymousAppUserId: appUserId });
  await next();
});
