import type { Context } from "hono";
import { PIXELZ_BOARD_ID_PREFIX } from "@pixelz/shared";
import { sql } from "./db.js";

const DEFAULT_WIDTH = 7;
const DEFAULT_HEIGHT = 10;
const DEFAULT_NUM_COLORS = 5;
const MIN_WIDTH = 1;
const MAX_WIDTH = 30;
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 30;
const MIN_NUM_COLORS = 2;
const MAX_NUM_COLORS = 10;

type CreateBoardBody = {
  width?: number;
  height?: number;
  numColors?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export async function handleCreateBoard(c: Context): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as CreateBoardBody;
  const width = clamp(
    body.width ?? DEFAULT_WIDTH,
    MIN_WIDTH,
    MAX_WIDTH
  );
  const height = clamp(
    body.height ?? DEFAULT_HEIGHT,
    MIN_HEIGHT,
    MAX_HEIGHT
  );
  const numColors = clamp(
    body.numColors ?? DEFAULT_NUM_COLORS,
    MIN_NUM_COLORS,
    MAX_NUM_COLORS
  );
  const seed = crypto.randomUUID();
  const boardId = PIXELZ_BOARD_ID_PREFIX + crypto.randomUUID();

  await sql`
    insert into public.boards (id, width, height, num_colors, seed)
    values (${boardId}, ${width}, ${height}, ${numColors}, ${seed})
  `;

  return c.json({
    boardId,
    width,
    height,
    numColors,
    seed,
  });
}

export async function handleGetBoard(c: Context): Promise<Response> {
  const boardId = c.req.param("boardId");
  if (!boardId) {
    return c.json({ error: "Missing boardId" }, 400);
  }

  const rows = await sql`
    select id, width, height, num_colors, seed
    from public.boards
    where id = ${boardId}
    limit 1
  `;

  if (rows.length === 0) {
    return c.json({ error: "Board not found" }, 404);
  }

  const row = rows[0] as { id: string; width: number; height: number; num_colors: number; seed: string };
  return c.json({
    boardId: row.id,
    width: row.width,
    height: row.height,
    numColors: row.num_colors,
    seed: row.seed,
  });
}
