-- 1:1 sessions (expandable to multiplayer)

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('pixelz', 'reflex')),
  invite_code text not null unique,
  level_id text,
  seed text not null,
  settings jsonb not null default '{}',
  status text not null default 'waiting'
    check (status in ('waiting', 'ready', 'playing', 'finished', 'cancelled', 'abandoned')),
  max_players int not null default 2 check (max_players >= 2),
  winner_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  starts_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_game_sessions_status_active
  on public.game_sessions (status)
  where status in ('waiting', 'ready', 'playing');

create table if not exists public.game_session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.app_users(id),
  role text not null check (role in ('host', 'guest')),
  status text not null default 'joined'
    check (status in ('joined', 'ready', 'playing', 'finished', 'abandoned')),
  score int check (score >= 0),
  moves int check (moves >= 0),
  time_ms bigint check (time_ms >= 0),
  move_sequence jsonb,
  finished_at timestamptz,
  unique (session_id, user_id)
);

create unique index if not exists idx_game_session_one_host
  on public.game_session_players (session_id)
  where role = 'host';

create index if not exists idx_game_session_players_session
  on public.game_session_players (session_id);

create index if not exists idx_game_session_players_user
  on public.game_session_players (user_id);

alter table public.game_sessions enable row level security;
alter table public.game_session_players enable row level security;
