import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: connectionString.includes("supabase") ? "require" : false,
});

export type AppUser = {
  id: string;
  supabase_auth_id: string;
  nickname: string | null;
  created_at: Date;
};

export type ScoreRow = {
  id: string;
  user_id: string;
  level_id: string;
  seed: string | null;
  score: number;
  moves: number;
  time_ms: number;
  created_at: Date;
};
