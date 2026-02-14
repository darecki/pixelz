-- Backfill: scores with null nickname currently show app_users.nickname on leaderboard.
-- Freeze each to the user's current nickname so changing nickname only affects the latest score.
update public.scores s
set nickname = u.nickname
from public.app_users u
where s.user_id = u.id and s.nickname is null and u.nickname is not null;
