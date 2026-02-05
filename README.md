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

Copy `.env.example` to `.env.local` and fill in Supabase + database values. The API verifies Supabase Auth JWTs via JWKS (no JWT secret needed). See `.env.example` for variable names.

**Important:** For `DATABASE_URL`, use the **Connection pooling** URI from Supabase (Project Settings → Database → Connection string → **Connection pooling** tab), not the Direct connection. The direct host (`db.xxx.supabase.co`) can cause `getaddrinfo ENOTFOUND`; the pooler host (`xxx.pooler.supabase.com`) works reliably.

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

6. **Web app (optional)**  
   `pnpm dev:web` → `http://localhost:5173`. It only shows the shared constant for now; auth and sync UI come in Phase 3.

## Next steps (implementation plan)

- **Phase 3:** Web app shell + offline storage (IndexedDB, PWA, Supabase Auth UI, “Sync now”).
- **Phase 4:** Deterministic game engine + core gameplay (levels, scoring, event emission).
- **Phase 5:** Sync and leaderboards end-to-end (full sync flow, leaderboard screen).
- **Phase 6:** CI/CD (Vercel deploy, GitHub Actions) + polish.
