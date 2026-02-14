/**
 * Run pending SQL migrations from apps/api/migrations/ in order.
 * Usage: pnpm --filter api run migrate
 * Requires DATABASE_URL (e.g. from .env.local).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

// Load env (same paths as env.js)
const envPaths = [
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env.local"),
];
for (const p of envPaths) {
  const result = config({ path: p });
  if (result.parsed) break;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Set it in .env.local or the environment.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: connectionString.includes("supabase") ? "require" : false,
});

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

async function main() {
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
  if (sqlFiles.length === 0) {
    console.log("No migration files found.");
    return;
  }

  await sql.unsafe(`
    create table if not exists public._schema_migrations (
      name text primary key,
      run_at timestamptz not null default now()
    )
  `);

  const run = await sql`select name from public._schema_migrations`;
  const runSet = new Set((run as unknown as { name: string }[]).map((r) => r.name));

  for (const file of sqlFiles) {
    const name = file;
    if (runSet.has(name)) {
      console.log("Skip (already run):", name);
      continue;
    }
    const path = join(MIGRATIONS_DIR, file);
    const body = await readFile(path, "utf-8");
    console.log("Run:", name);
    await sql.unsafe(body);
    await sql`insert into public._schema_migrations (name) values (${name})`;
  }

  console.log("Migrations done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
