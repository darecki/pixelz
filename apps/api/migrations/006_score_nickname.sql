-- Store nickname per score so multiple players on same device keep distinct display names per score.
alter table public.scores
  add column if not exists nickname text;
