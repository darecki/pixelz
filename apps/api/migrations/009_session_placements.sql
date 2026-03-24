-- Add placement column to strictly rank players 1st, 2nd, 3rd... up to 10th
alter table public.game_session_players
  add column if not exists placement int check (placement >= 1 and placement <= 10);
