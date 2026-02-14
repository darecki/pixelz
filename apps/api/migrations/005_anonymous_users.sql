-- Anonymous users: play without Supabase Auth
-- Add anonymous_id and make supabase_auth_id nullable; require at least one.

alter table public.app_users
  add column if not exists anonymous_id text unique;

alter table public.app_users
  alter column supabase_auth_id drop not null;

alter table public.app_users
  add constraint app_users_has_identity
  check (
    (supabase_auth_id is not null and anonymous_id is null)
    or (supabase_auth_id is null and anonymous_id is not null)
  );

create index if not exists idx_app_users_anonymous_id
  on public.app_users (anonymous_id)
  where anonymous_id is not null;
