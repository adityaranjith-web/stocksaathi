-- 0003: helpers by Google email, product-team flag, order preparation time, AI forecast log.
-- Run this after 0001 and 0002 in the Supabase SQL editor.

-- ---------- Users: e-mail and product-team flag ----------
alter table users add column if not exists email text;
alter table users add column if not exists is_team boolean not null default false; -- product team: may edit the festival calendar (FR8)

-- ---------- Order preparation time in seconds (KPI 2) ----------
alter table orders add column if not exists prep_seconds int check (prep_seconds is null or prep_seconds between 0 and 7200);

-- ---------- Helpers: the owner adds a Google email, the helper signs in with it ----------
create table if not exists helper_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz default now()
);
-- One e-mail can belong to one shop only.
create unique index if not exists helper_invites_email on helper_invites (lower(email));
alter table helper_invites enable row level security;
create policy "owner manages invites" on helper_invites for all
  using (shop_id = my_shop() and i_am_owner())
  with check (shop_id = my_shop() and i_am_owner());

-- Called by the app right after a Google sign-in. If the signed-in e-mail has an invite, the person
-- becomes a helper of that shop. Nobody can use it to become an owner or join a shop without an invite.
create or replace function claim_invite() returns boolean language plpgsql security definer set search_path = public as $$
declare
  inv helper_invites%rowtype;
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or mail = '' then return false; end if;
  if exists (select 1 from users where id = auth.uid()) then return true; end if;
  select * into inv from helper_invites where lower(email) = mail limit 1;
  if not found then return false; end if;
  insert into users (id, shop_id, name, role, email)
    values (auth.uid(), inv.shop_id, coalesce(nullif(inv.name, ''), split_part(mail, '@', 1)), 'helper', mail);
  delete from helper_invites where id = inv.id;
  return true;
end $$;
revoke execute on function claim_invite() from public, anon;
grant execute on function claim_invite() to authenticated;

-- The owner can remove a helper (never another owner).
create policy "owner removes helpers" on users for delete
  using (shop_id = my_shop() and i_am_owner() and role = 'helper');

-- ---------- Festival calendar: product team only (FR8) ----------
create or replace function i_am_team() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and is_team)
$$;
revoke execute on function public.i_am_team() from public, anon;
grant execute on function public.i_am_team() to authenticated;
create policy "team writes calendar" on conditions_calendar for all using (i_am_team()) with check (i_am_team());

-- ---------- AI forecasts, kept so we can check them against real sales before using them ----------
create table if not exists ai_forecasts (
  shop_id uuid not null references shops(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  run_date date not null,
  provider text not null,
  ai_units_per_day numeric(10,3) not null,
  blend_units_per_day numeric(10,3) not null,
  horizon_days int not null,
  low numeric(10,3),
  high numeric(10,3),
  primary key (item_id, run_date, provider)
);
alter table ai_forecasts enable row level security;
create policy "read own" on ai_forecasts for select using (shop_id = my_shop());
create policy "owner writes" on ai_forecasts for all
  using (shop_id = my_shop() and i_am_owner())
  with check (shop_id = my_shop() and i_am_owner() and my_item(item_id));
