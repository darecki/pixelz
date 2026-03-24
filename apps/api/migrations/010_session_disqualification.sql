alter table public.game_session_players
  add column if not exists disqualified boolean not null default false;
