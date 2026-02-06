import { createMiddleware } from "hono/factory";
import * as jose from "jose";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not set");
}

const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", SUPABASE_URL.replace(/\/$/, ""));
const SupabaseJWKS = jose.createRemoteJWKSet(jwksUrl);

export type AuthPayload = {
  sub: string; // Supabase auth user id
  email?: string | null;
};

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
    c.set("auth", { sub, email });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
