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
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.get("/", (c) => c.json({ name: "pixelz-api", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

app.get("/leaderboards/:levelId", handleLeaderboard);

app.use("/sync", authMiddleware);
app.post("/sync", handleSync);

export default app;

if (process.env.VERCEL !== "1") {
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
}
