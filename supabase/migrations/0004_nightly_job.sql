-- 0004: the nightly job (Vercel cron) saves forecasts for every shop.
-- Run this after 0001, 0002 and 0003 in the Supabase SQL editor.

-- The scorecard checks each saved forecast against what really sold over the days it covered,
-- so every saved forecast must say how many days it covers (lead time + order cover days).
alter table final_forecasts add column if not exists horizon_days int check (horizon_days is null or horizon_days >= 1);

-- The job connects with the service-role key, which skips row-level security, so it needs no write policies.
-- Signed-in users keep read-only access to their own shop's rows ("read own" policies from 0001).
-- Nobody signed in can write to these three tables.
