import { sql } from "./db.js";
import { ENV } from "./env.js";

const rateLimitCache = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(identifier: string): Promise<boolean> {
  const now = Date.now();
  const { RATE_LIMIT_SYNC_REQUESTS, RATE_LIMIT_WINDOW_MS } = ENV;
  
  const existing = rateLimitCache.get(identifier);
  
  if (existing && now < existing.resetTime) {
    if (existing.count >= RATE_LIMIT_SYNC_REQUESTS) {
      return false;
    }
    existing.count++;
    return true;
  }
  
  rateLimitCache.set(identifier, {
    count: 1,
    resetTime: now + RATE_LIMIT_WINDOW_MS,
  });
  
  return true;
}

export function cleanupRateLimitCache(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitCache.entries()) {
    if (now > value.resetTime) {
      rateLimitCache.delete(key);
    }
  }
}

setInterval(cleanupRateLimitCache, 60 * 1000);
