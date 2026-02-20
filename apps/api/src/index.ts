import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware, syncAuthMiddleware, type SyncAuth } from "./auth.js";
import { handleSync } from "./sync.js";
import { handleLeaderboard } from "./leaderboard.js";
import { handleCreateBoard, handleGetBoard } from "./boards.js";
import { handleMyBoards, handleMergeAnonymous } from "./me.js";
import { handleAnonRegister } from "./anon.js";
import { checkRateLimit } from "./rateLimit.js";

type AppVariables = {
  auth: SyncAuth;
};

const app = new Hono<{ Variables: AppVariables }>();

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
    allowHeaders: ["Content-Type", "Authorization", "X-Anonymous-Id"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// Handle preflight so OPTIONS never hits auth (avoids 405)
app.options("*", (c) => c.body(null, 204));

app.get("/", (c) => c.json({ name: "pixelz-api", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

app.get("/leaderboards/:levelId", handleLeaderboard);

app.post("/anon/register", handleAnonRegister);

app.post("/boards", handleCreateBoard);
app.get("/boards/:boardId", handleGetBoard);

app.use("/users/me", authMiddleware);
app.get("/users/me/boards", handleMyBoards);
app.post("/users/me/merge-anonymous", handleMergeAnonymous);

app.use("/sync", syncAuthMiddleware);
app.post("/sync", async (c, next) => {
  const auth = c.get("auth") as { anonymousAppUserId?: string; sub?: string };
  const identifier = auth.anonymousAppUserId ?? auth.sub ?? "unknown";
  if (!(await checkRateLimit(identifier))) {
    return c.json({ error: "Too many requests", details: "Rate limit exceeded" }, 429);
  }
  await next();
});
app.post("/sync", handleSync);

// So 404s are returned by our app (with CORS), not by the platform
app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;

if (process.env.VERCEL !== "1") {
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
}
