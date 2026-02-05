import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./auth.js";
import { handleSync } from "./sync.js";
import { handleLeaderboard } from "./leaderboard.js";

const app = new Hono();
app.onError((err, c) => {
  const message = err.message ?? String(err);
  console.error("[api]", message);
  return c.json({ error: "Internal Server Error", details: message }, 500);
});
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const extraOrigin = process.env.ADDITIONAL_CORS_ORIGIN?.trim();
if (extraOrigin) allowedOrigins.push(extraOrigin);

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (origin.startsWith("https://") && origin.includes(".vercel.app")) return true;
  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      return isAllowedOrigin(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

app.get("/", (c) => c.json({ name: "pixelz-api", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

app.get("/leaderboards/:levelId", handleLeaderboard);

app.use("/sync", authMiddleware);
app.post("/sync", handleSync);

// So 404s are returned by our app (with CORS), not by the platform
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;

if (process.env.VERCEL !== "1") {
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
}
