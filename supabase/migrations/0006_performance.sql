-- 0006: speed. The rules about who can see and change what are exactly the same as before.
-- Run after 0001 to 0005 in the Supabase SQL editor.
--
-- 1. Row-level-security policies call my_shop(), i_am_owner() and i_am_team() once per query instead of once per row
--    (they are wrapped in "(select ...)").
-- 2. The "owner writes" policies were "for all", so they also applied to SELECT next to "read own". They are split into
--    insert, update and delete, so a read is checked by one policy only. Reads are unchanged: "read own" already let the
--    owner see everything in the shop.
-- 3. Indexes on shop_id (and the date the pages filter by) for the tables the pages read.
-- 4. Two read-only functions so a page needs one trip to the database instead of eight to twenty:
--    daily_sales(since) = sales as daily totals per item, and shop_snapshot(since) = everything a page needs.
--    Both run with the caller's rights ("security invoker"), so row-level security still limits them to one shop.

-- ---------- 3. Indexes ----------
create index if not exists sales_shop_date on sales (shop_id, sale_date);
create index if not exists orders_shop_date on orders (shop_id, order_date);
create index if not exists deliveries_shop_date on deliveries (shop_id, received_on);
create index if not exists items_shop on items (shop_id);
create index if not exists distributors_shop on distributors (shop_id);
create index if not exists users_shop on users (shop_id);
create index if not exists helper_invites_shop on helper_invites (shop_id);
create index if not exists order_lines_item on order_lines (item_id);
create index if not exists final_forecasts_shop_run on final_forecasts (shop_id, run_date);
create index if not exists model_forecasts_shop_run on model_forecasts (shop_id, run_date);

-- ---------- 1 and 2. Policies ----------
-- shops
drop policy if exists "own shop" on shops;
create policy "own shop" on shops for select using (id = (select my_shop()));

-- users
drop policy if exists "own shop users" on users;
create policy "own shop users" on users for select using (shop_id = (select my_shop()));
drop policy if exists "owner removes helpers" on users;
create policy "owner removes helpers" on users for delete
  using (shop_id = (select my_shop()) and (select i_am_owner()) and role = 'helper');

-- distributors
drop policy if exists "read own" on distributors;
drop policy if exists "owner writes" on distributors;
create policy "read own" on distributors for select using (shop_id = (select my_shop()));
create policy "owner inserts" on distributors for insert with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner updates" on distributors for update
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner deletes" on distributors for delete using (shop_id = (select my_shop()) and (select i_am_owner()));

-- items
drop policy if exists "read own" on items;
drop policy if exists "owner writes" on items;
create policy "read own" on items for select using (shop_id = (select my_shop()));
create policy "owner inserts" on items for insert with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner updates" on items for update
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner deletes" on items for delete using (shop_id = (select my_shop()) and (select i_am_owner()));

-- sales (any signed-in person in the shop may record a sale; the item must belong to the same shop)
drop policy if exists "read own" on sales;
drop policy if exists "anyone in shop logs sales" on sales;
create policy "read own" on sales for select using (shop_id = (select my_shop()));
create policy "anyone in shop logs sales" on sales for insert with check (shop_id = (select my_shop()) and my_item(item_id));

-- orders
drop policy if exists "read own" on orders;
drop policy if exists "owner writes" on orders;
create policy "read own" on orders for select using (shop_id = (select my_shop()));
create policy "owner inserts" on orders for insert with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner updates" on orders for update
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()));
create policy "owner deletes" on orders for delete using (shop_id = (select my_shop()) and (select i_am_owner()));

-- order_lines
drop policy if exists "read own" on order_lines;
drop policy if exists "owner writes" on order_lines;
create policy "read own" on order_lines for select
  using (exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())));
create policy "owner inserts" on order_lines for insert
  with check ((select i_am_owner()) and my_item(item_id) and exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())));
create policy "owner updates" on order_lines for update
  using ((select i_am_owner()) and exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())))
  with check ((select i_am_owner()) and my_item(item_id) and exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())));
create policy "owner deletes" on order_lines for delete
  using ((select i_am_owner()) and exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())));

-- deliveries
drop policy if exists "read own" on deliveries;
drop policy if exists "owner writes" on deliveries;
create policy "read own" on deliveries for select using (shop_id = (select my_shop()));
create policy "owner inserts" on deliveries for insert
  with check (shop_id = (select my_shop()) and (select i_am_owner()) and my_item(item_id));
create policy "owner updates" on deliveries for update
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()) and my_item(item_id));
create policy "owner deletes" on deliveries for delete using (shop_id = (select my_shop()) and (select i_am_owner()));

-- festival calendar: everyone reads; only the product team writes
drop policy if exists "team writes calendar" on conditions_calendar;
create policy "team inserts" on conditions_calendar for insert with check ((select i_am_team()));
create policy "team updates" on conditions_calendar for update using ((select i_am_team())) with check ((select i_am_team()));
create policy "team deletes" on conditions_calendar for delete using ((select i_am_team()));

-- forecasts saved by the nightly job: read only for users
drop policy if exists "read own" on model_forecasts;
create policy "read own" on model_forecasts for select using (shop_id = (select my_shop()));
drop policy if exists "read own" on model_scores;
create policy "read own" on model_scores for select using (shop_id = (select my_shop()));
drop policy if exists "read own" on final_forecasts;
create policy "read own" on final_forecasts for select using (shop_id = (select my_shop()));

-- helper invites (one policy only, so nothing overlaps)
drop policy if exists "owner manages invites" on helper_invites;
create policy "owner manages invites" on helper_invites for all
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()));

-- AI forecasts kept for checking
drop policy if exists "read own" on ai_forecasts;
drop policy if exists "owner writes" on ai_forecasts;
create policy "read own" on ai_forecasts for select using (shop_id = (select my_shop()));
create policy "owner inserts" on ai_forecasts for insert
  with check (shop_id = (select my_shop()) and (select i_am_owner()) and my_item(item_id));
create policy "owner updates" on ai_forecasts for update
  using (shop_id = (select my_shop()) and (select i_am_owner()))
  with check (shop_id = (select my_shop()) and (select i_am_owner()) and my_item(item_id));
create policy "owner deletes" on ai_forecasts for delete using (shop_id = (select my_shop()) and (select i_am_owner()));

-- ---------- 4. One trip to the database ----------
-- Sales as daily totals per item, from a start date to today. Returned as ONE json value (an array of
-- [item_id, date, quantity]), not as rows, so the API's 1,000-row limit can never cut it short.
create or replace function daily_sales(p_since date) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(d.item_id, d.sale_date, d.qty) order by d.sale_date, d.item_id), '[]'::jsonb)
  from (
    select item_id, sale_date, sum(quantity)::int as qty
    from sales where sale_date >= p_since
    group by item_id, sale_date
  ) d
$$;

-- Everything a page needs, in one call: who the caller is, their shop, items, distributors, daily sales,
-- the festival calendar and what is on order. Row-level security applies, so it can only ever return the caller's shop.
create or replace function shop_snapshot(p_since date) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'me', (select to_jsonb(u) from (select id, shop_id, role, name, is_team from users where id = auth.uid()) u),
    'shop', (select to_jsonb(s) from (select id, name, locality from shops where id = (select shop_id from users where id = auth.uid())) s),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name)
      from (select id, distributor_id, name, category, pack, price, current_stock, lead_time_days, min_safety_stock, order_cover_days
            from items where is_active) i), '[]'::jsonb),
    'distributors', coalesce((select jsonb_agg(to_jsonb(d) order by d.name)
      from (select id, name, supplies, salesman, whatsapp, visit_day from distributors) d), '[]'::jsonb),
    'sales', daily_sales(p_since),
    'calendar', coalesce((select jsonb_agg(to_jsonb(c) order by c.day)
      from (select day, name, uplift_pct from conditions_calendar) c), '[]'::jsonb),
    'on_order', coalesce((select jsonb_object_agg(x.item_id, x.q)
      from (select item_id, sum(quantity)::int as q from order_lines where not delivered group by item_id) x), '{}'::jsonb),
    'open_orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'distributor_id', o.distributor_id, 'order_date', o.order_date, 'lines', o.lines) order by o.order_date, o.id)
      from (select ord.id, ord.distributor_id, ord.order_date,
                   (select jsonb_agg(jsonb_build_object('item_id', l.item_id, 'quantity', l.quantity) order by l.item_id)
                    from order_lines l where l.order_id = ord.id and not l.delivered) as lines
            from orders ord where ord.status = 'Sent') o
      where o.lines is not null), '[]'::jsonb)
  )
$$;

revoke execute on function daily_sales(date) from public, anon;
revoke execute on function shop_snapshot(date) from public, anon;
grant execute on function daily_sales(date) to authenticated;
grant execute on function shop_snapshot(date) to authenticated;
