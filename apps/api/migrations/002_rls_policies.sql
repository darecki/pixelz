-- Allow API (connection string role) to read and write. Run if leaderboard/sync return RLS errors.
create policy "Allow all for service"
  on public.app_users for all
  using (true)
  with check (true);

create policy "Allow all for service"
  on public.scores for all
  using (true)
  with check (true);
