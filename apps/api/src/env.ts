import { config } from "dotenv";
import { resolve } from "node:path";

if (process.env.VERCEL !== "1") {
  const envPaths = [
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const p of envPaths) {
    const result = config({ path: p });
    if (result.parsed) break;
  }
}

export const ENV = {
  DUPLICATE_SCORE_WINDOW_MS: Number(process.env.DUPLICATE_SCORE_WINDOW_MS) || 2 * 60 * 1000,
  RATE_LIMIT_SYNC_REQUESTS: Number(process.env.RATE_LIMIT_SYNC_REQUESTS) || 100,
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
} as const;
