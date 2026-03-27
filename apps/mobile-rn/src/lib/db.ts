import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { SyncEvent } from "@pixelz/ts-contracts";

const DB_NAME = "pixelz-mobile.db";

const PREFERENCE_KEYS = {
  anonymousId: "anonymous_id",
  nickname: "nickname",
  dontRemindSignin: "dont_remind_signin",
} as const;

type PendingEventRow = {
  id: number;
  type: SyncEvent["type"];
  payload: string;
  client_timestamp: number | null;
};

type ResultRow = {
  game_id: string;
  level_id: string;
  best_moves: number;
  best_time_ms: number;
  last_moves: number;
  last_time_ms: number;
  plays: number;
  last_played_at: string;
};

export type ProfileSnapshot = {
  totalPlays: number;
  bestBoards: number;
  recentRuns: Array<{
    gameId: string;
    levelId: string;
    bestMoves: number;
    bestTimeMs: number;
    plays: number;
    lastPlayedAt: string;
  }>;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;
let initialized = false;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DB_NAME);
  }

  const database = await databasePromise;
  if (!initialized) {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        client_timestamp INTEGER
      );

      CREATE TABLE IF NOT EXISTS level_results (
        game_id TEXT NOT NULL,
        level_id TEXT NOT NULL,
        best_moves INTEGER NOT NULL,
        best_time_ms INTEGER NOT NULL,
        last_moves INTEGER NOT NULL,
        last_time_ms INTEGER NOT NULL,
        plays INTEGER NOT NULL,
        last_played_at TEXT NOT NULL,
        PRIMARY KEY (game_id, level_id)
      );
    `);
    initialized = true;
  }

  return database;
}

export async function initializeDatabase() {
  await getDatabase();
}

export async function getPreference(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

export async function setPreference(key: string, value: string) {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT INTO preferences(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

export async function removePreference(key: string) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM preferences WHERE key = ?", key);
}

export async function appendQueuedEvent(event: SyncEvent) {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT INTO queue_events(type, payload, client_timestamp) VALUES (?, ?, ?)",
    event.type,
    JSON.stringify(event.payload),
    event.clientTimestamp ?? Date.now()
  );
}

export async function getPendingEventsWithIds(): Promise<Array<{ id: number; event: SyncEvent }>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PendingEventRow>(
    "SELECT id, type, payload, client_timestamp FROM queue_events ORDER BY id ASC"
  );

  return rows.map((row) => ({
    id: row.id,
    event: {
      type: row.type,
      payload: JSON.parse(row.payload) as SyncEvent["payload"],
      ...(row.client_timestamp != null ? { clientTimestamp: row.client_timestamp } : {}),
    } as SyncEvent,
  }));
}

export async function removeFirstQueuedEvents(count: number) {
  const database = await getDatabase();
  const ids = await database.getAllAsync<{ id: number }>(
    "SELECT id FROM queue_events ORDER BY id ASC LIMIT ?",
    count
  );
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(", ");
  await database.runAsync(
    `DELETE FROM queue_events WHERE id IN (${placeholders})`,
    ...ids.map((row) => row.id)
  );
}

export async function getPendingQueueCount() {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM queue_events"
  );
  return row?.count ?? 0;
}

export async function recordLevelResult(input: {
  gameId: "pixelz" | "reflex";
  levelId: string;
  moves: number;
  timeMs: number;
  completedAt?: string;
}) {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<ResultRow>(
    "SELECT * FROM level_results WHERE game_id = ? AND level_id = ?",
    input.gameId,
    input.levelId
  );

  const completedAt = input.completedAt ?? new Date().toISOString();
  if (!existing) {
    await database.runAsync(
      `INSERT INTO level_results(
        game_id, level_id, best_moves, best_time_ms, last_moves, last_time_ms, plays, last_played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.gameId,
      input.levelId,
      input.moves,
      input.timeMs,
      input.moves,
      input.timeMs,
      1,
      completedAt
    );
    return;
  }

  const isNewBest =
    input.gameId === "pixelz"
      ? input.moves < existing.best_moves ||
        (input.moves === existing.best_moves && input.timeMs < existing.best_time_ms)
      : input.timeMs < existing.best_time_ms;

  await database.runAsync(
    `UPDATE level_results
      SET best_moves = ?,
          best_time_ms = ?,
          last_moves = ?,
          last_time_ms = ?,
          plays = ?,
          last_played_at = ?
      WHERE game_id = ? AND level_id = ?`,
    isNewBest ? input.moves : existing.best_moves,
    isNewBest ? input.timeMs : existing.best_time_ms,
    input.moves,
    input.timeMs,
    existing.plays + 1,
    completedAt,
    input.gameId,
    input.levelId
  );
}

export async function getProfileSnapshot(): Promise<ProfileSnapshot> {
  const database = await getDatabase();
  const totals = await database.getFirstAsync<{ totalPlays: number; bestBoards: number }>(
    "SELECT COALESCE(SUM(plays), 0) as totalPlays, COUNT(*) as bestBoards FROM level_results"
  );
  const recentRuns = await database.getAllAsync<ResultRow>(
    "SELECT * FROM level_results ORDER BY last_played_at DESC LIMIT 8"
  );

  return {
    totalPlays: totals?.totalPlays ?? 0,
    bestBoards: totals?.bestBoards ?? 0,
    recentRuns: recentRuns.map((row) => ({
      gameId: row.game_id,
      levelId: row.level_id,
      bestMoves: row.best_moves,
      bestTimeMs: row.best_time_ms,
      plays: row.plays,
      lastPlayedAt: row.last_played_at,
    })),
  };
}

export { PREFERENCE_KEYS };
