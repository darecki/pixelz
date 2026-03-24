alter table public.game_sessions
  add column if not exists previous_session_id uuid references public.game_sessions(id) on delete set null;

create unique index if not exists idx_game_sessions_previous_session
  on public.game_sessions (previous_session_id)
  where previous_session_id is not null;
