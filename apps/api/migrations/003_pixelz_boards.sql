-- Pixelz: boards (same board can be played by many; id is level_id for leaderboards)
create table if not exists public.boards (
  id text primary key,
  width int not null check (width >= 1 and width <= 30),
  height int not null check (height >= 1 and height <= 30),
  num_colors int not null check (num_colors >= 2 and num_colors <= 10),
  seed text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_boards_created_at on public.boards (created_at desc);

-- Replay: store move sequence (array of color indices) for future replay UI
alter table public.scores add column if not exists move_sequence jsonb;
