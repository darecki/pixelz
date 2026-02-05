# Deploy Pixelz to Vercel + Supabase

Step-by-step: connect the repo to Vercel (API + Web), set env vars, run migrations, then verify.

**Prerequisites:** Repo pushed to GitHub, Supabase project created, and `.env.local` filled (you’ll copy values into Vercel).

---

## 1. Vercel – API project

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. **Import** your GitHub repo (e.g. `darecki/pixelz`). Authorize GitHub if asked.
3. **Configure:**
   - **Root Directory:** click **Edit** → set to `apps/api` → **Save**.
   - **Framework Preset:** leave as “Other” (or “No framework”).
   - **Build and Output Settings:**  
     - **Install Command:** `cd ../.. && pnpm install` (toggle **on**).
     - **Build Command:** Leave as default (`pnpm run build` is fine). The API’s `package.json` build script builds `@pixelz/shared` first, then runs `tsc`.
     - **Output Directory:** leave default
4. **Environment variables:** Add these (use **Production**; add **Preview** too if you want PR previews). Copy values from your `.env.local` (or Supabase/Database dashboard).

   | Name | Value | Where to get it |
   |------|--------|------------------|
   | `SUPABASE_URL` | `https://YOUR_REF.supabase.co` | Supabase → Project Settings → API → Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | `eyJ...` | Supabase → Project Settings → API → anon public |
   | `SUPABASE_SECRET_KEY` | `eyJ...` | Supabase → Project Settings → API → service_role (keep secret) |
   | `DATABASE_URL` | `postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres` | Supabase → Project Settings → Database → Connection pooling → **URI** (Transaction or Session). Use the **pooler** URL, not Direct. Replace `[YOUR-PASSWORD]` with your DB password. |
   | `ADDITIONAL_CORS_ORIGIN` | (optional) Your exact web URL, e.g. `https://pixelz-web.vercel.app` | **Set this if you see CORS errors.** Use the exact web app URL (no trailing slash). Helps when the browser origin must match precisely. |


5. Click **Deploy**. Wait for the build to finish.
6. Copy the **production URL** (e.g. `https://pixelz-api-xxx.vercel.app`). You need it for the Web project.

---

## 2. Vercel – Web project

1. **Add New** → **Project** again → Import the **same** repo.
2. **Configure:**
   - **Root Directory:** `apps/web`.
   - **Build and Output Settings** (from `apps/web/vercel.json`; override in UI if needed):
     - **Install Command:** `cd ../.. && pnpm install`
     - **Build Command:** `cd ../.. && pnpm --filter "web..." run build`
     - **Output Directory:** `dist`
3. **Environment variables:** Add these. Use the **API production URL** from step 1 for `VITE_API_URL`.

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` (e.g. `https://YOUR_REF.supabase.co`) |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Same as `SUPABASE_PUBLISHABLE_KEY` (anon public key) |
   | `VITE_API_URL` | Your API project URL, e.g. `https://pixelz-api-xxx.vercel.app` (no trailing slash) |

4. Click **Deploy**. The web app will call the API; CORS allows `*.vercel.app`.

---

## 3. Supabase – Run migrations

Run these in **Supabase Dashboard** → **SQL Editor** → **New query**. Execute **one script at a time**.

### 3.1 Migration 001 – Tables and indexes

Paste and run the contents of `apps/api/migrations/001_initial.sql`, or run this:

```sql
-- App users: linked to Supabase Auth via supabase_auth_id (auth.users.id)
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  supabase_auth_id text not null unique,
  nickname text,
  created_at timestamptz not null default now()
);

-- Scores: one row per level/random play (server-validated)
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  level_id text not null,
  seed text,
  score int not null check (score >= 0),
  moves int not null check (moves >= 0),
  time_ms bigint not null check (time_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_scores_leaderboard
  on public.scores (level_id, score desc);

create index if not exists idx_app_users_supabase_auth_id
  on public.app_users (supabase_auth_id);

alter table public.app_users enable row level security;
alter table public.scores enable row level security;
```

### 3.2 Migration 002 – RLS policies (if sync/leaderboard hit RLS errors)

```sql
create policy "Allow all for service"
  on public.app_users for all
  using (true)
  with check (true);

create policy "Allow all for service"
  on public.scores for all
  using (true)
  with check (true);
```

---

## 4. Supabase – Create a test user

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter email and password (e.g. a test account).
3. Confirm or enable email if your project requires it.

---

## 5. Verify

1. Open the **Web** project URL (e.g. `https://pixelz-web-xxx.vercel.app`).
2. Sign in with the user you created.
3. **Home** → **Play** → complete a level → **Sync and view leaderboard**.
4. Confirm the leaderboard shows your entry (and that the API URL in the browser is your Vercel API).

---

## Optional: Git and previews

- In each Vercel project: **Settings** → **Git**. Production branch is usually `main`; pushes to `main` deploy to production.
- To get preview URLs for pull requests: **Settings** → **Git** → enable **Preview deployments** for the repo.

## Troubleshooting

- **API deployment fails at `tsc` (Cannot find module `@pixelz/shared`):** The API’s build script in `apps/api/package.json` builds the shared package first. Ensure **Install Command** is `cd ../.. && pnpm install` so the monorepo is installed; then the default **Build Command** (`pnpm run build`) will run the script that builds shared then the API.
- **API returns 500 / “Could not reach API”:** Check API project env vars (especially `DATABASE_URL` uses the **pooler** URI). Check **Deployments** → latest → **Functions** logs.
- **CORS / 404 from Web to API:** The API build outputs `index.js` at the project root (`apps/api/`) so Vercel finds the serverless entry. Set **API** env var `ADDITIONAL_CORS_ORIGIN` to your exact web URL (e.g. `https://pixelz-web.vercel.app`, no trailing slash), then redeploy. If you still see 404 + CORS, check Vercel → API project → Deployments → Function logs to confirm the function is invoked.
- **Leaderboard empty after sync:** Run migration 002 (RLS policies) if you see RLS errors in API logs. Ensure you’re signed in and synced from the Play result screen.
