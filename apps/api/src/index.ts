import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ name: "pixelz-api", status: "ok" }));

app.get("/health", (c) => c.json({ ok: true }));

export default app;
