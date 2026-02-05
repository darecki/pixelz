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

-- RLS: allow service role (API) full access; optional later for direct client access
alter table public.app_users enable row level security;
alter table public.scores enable row level security;

-- Policy: service role and authenticated API use connection string with role that bypasses RLS
-- So no policies needed for server-side only access. Add later if Supabase client is used from client.
