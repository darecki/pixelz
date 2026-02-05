# Pixelz

Offline-first puzzle game (MVP: web + Vercel API + Supabase).

## Setup

- **Node:** 20+
- **pnpm:** `npm install -g pnpm`

```bash
pnpm install
pnpm build
```

## Run locally

```bash
# Web app (Vite)
pnpm dev:web

# API (Hono)
pnpm dev:api
```

Or both in parallel: `pnpm dev`

## Monorepo

- `apps/web` – React (Vite) frontend
- `apps/api` – Hono API (Vercel serverless)
- `packages/shared` – Zod schemas, events, API contracts

## Env

Copy `.env.example` to `.env.local` and fill in all values. Both the API and the web app (Vite) read from `.env.local` at the repo root.

- **DATABASE_URL:** Use the **pooler** URI from Supabase (Database → Connect → Connection pooling → Transaction or Session), not Direct. Direct (`db.xxx.supabase.co`) can cause `getaddrinfo ENOTFOUND`; pooler (`xxx.pooler.supabase.com`) works.
- **VITE_***: Same Supabase URL/key as above. **For local dev** set `VITE_API_URL=http://localhost:3000` and run the API with `pnpm dev:api` so the web app at localhost:5173 talks to your local API. (Using the Vercel API URL from localhost causes CORS and 404 unless the API is deployed and allows your origin.)

**Vercel:** Do **not** run “Pull environment variables” when linking (`vercel link`) – it overwrites `.env.local`. Add the same variables in the Vercel project (Settings → Environment Variables) and set `DATABASE_URL` to the **pooler** URI there too. For production, set `VITE_API_URL` to your deployed API URL.

## Database (Supabase)

Run the initial migration in Supabase SQL Editor (Dashboard → SQL Editor → New query). Paste and run the contents of `apps/api/migrations/001_initial.sql`.

## Testing the current state

1. **Apply the migration** in Supabase (see above) if you haven’t already.

2. **Install and build**
   ```bash
   pnpm install
   pnpm build
   ```

3. **Start the API**
   ```bash
   pnpm dev:api
   ```
   API runs at `http://localhost:3000`.

4. **Test unauthenticated endpoints**
   ```bash
   curl http://localhost:3000/health
   # → {"ok":true}

   curl http://localhost:3000/leaderboards/level_1
   # → {"levelId":"level_1","entries":[]}
   ```

5. **Test sync (requires a Supabase access token)**
   - Create a user in Supabase: Dashboard → Authentication → Users → Add user (email + password).
   - Get an access token (loads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from `.env.local`):
     ```bash
     ./scripts/get-auth-token.sh your@email.com yourpassword
     ```
     Copy the printed token, or pipe to clipboard: `./scripts/get-auth-token.sh your@email.com yourpassword | pbcopy` (macOS).
   - Call sync (replace `TOKEN` with the value from above):
     ```bash
     curl -X POST http://localhost:3000/sync \
       -H "Authorization: Bearer TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"events":[{"type":"LEVEL_COMPLETED","payload":{"levelId":"level_1","score":1000,"moves":10,"timeMs":5000}}]}'
     ```
     Expected: `{"acceptedCount":1,"rejectedCount":0}`. Then:
     ```bash
     curl http://localhost:3000/leaderboards/level_1
     ```
     You should see one entry.

6. **Web app**  
   `pnpm dev:web` → `http://localhost:5173`. Sign in, play levels (Home → Play), sync, view leaderboard.

## Deploy (Vercel)

Use **two Vercel projects** (one for the API, one for the web app) so both deploy from this repo.

### API project

1. **New Project** → Import this repo.
2. **Root Directory:** `apps/api`.
3. **Build & Development:** Leave **Build Command** empty (or use the default). Set **Install Command** to: `cd ../.. && pnpm install`. (Or in dashboard: Settings → General → Install Command.)
4. **Environment variables:** Add the same vars as in `.env.example` (no `VITE_*`). Use the **pooler** `DATABASE_URL`. Do not pull from a linked env file if it would overwrite.
5. Deploy. Note the API URL (e.g. `https://your-api.vercel.app`).

### Web project

1. **New Project** → Import the same repo again (or duplicate).
2. **Root Directory:** `apps/web`.
3. **Build & Development:** **Install Command:** `cd ../.. && pnpm install`. **Build Command:** `cd ../.. && pnpm run build --filter web`. **Output Directory:** `dist`.
4. **Environment variables:** Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and **VITE_API_URL** = your deployed API URL from the API project.
5. Deploy. The web app will call the API; CORS allows `*.vercel.app` origins.

### After deploy

- Run the DB migrations in Supabase if not already done.
- Create a user in Supabase Auth and use the web app to sign in, play, sync, and view leaderboards.

## Next steps (implementation plan)

- ~~**Phase 3:**~~ Done (web shell, auth, IndexedDB, sync, leaderboard, PWA).
- ~~**Phase 4**~~ Done (deterministic scoring, Play page, levels + random seed, event emission).
- ~~**Phase 5:**~~ Done (sync and leaderboards end-to-end: in-game "Sync and view leaderboard", leaderboard ?level= URL, background sync after level complete).
- ~~**Phase 6:**~~ Done (CI/CD: Vercel deploy, GitHub Actions lint/build, README deploy + polish).
