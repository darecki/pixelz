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
