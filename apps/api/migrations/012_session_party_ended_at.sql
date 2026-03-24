alter table public.game_sessions
  add column if not exists party_ended_at timestamptz;
