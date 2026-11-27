-- 0011: a helper can read only what the Sell screen needs (BR7).
-- Run after 0001 to 0010 in the Supabase SQL editor. It is safe to apply before or after any app release: no app code changes.
--
-- Before: row-level security stopped other shops, and stopped a helper CHANGING things, but let a helper READ every row
-- of their own shop through the API (distributor contacts, orders, deliveries, sales history, forecasts, other people's
-- email addresses). Only the screens hid them.
--
-- After, a helper can read: their own user row, their shop, the festival calendar and the sales they recorded
-- themselves. The Sell screen gets item names and pack sizes from helper_items(), which gives out no price, stock,
-- supplier or order setting. The owner reads everything in the shop, as before. Who can write is unchanged.

-- ---------- Policies: reads ----------
-- users: yourself; the owner also sees everyone in the shop
drop policy if exists "own shop users" on users;
create policy "own shop users" on users for select
  using (id = (select auth.uid()) or (shop_id = (select my_shop()) and (select i_am_owner())));

-- items, distributors, orders, order_lines, deliveries: owner only
drop policy if exists "read own" on items;
create policy "read own" on items for select using (shop_id = (select my_shop()) and (select i_am_owner()));

drop policy if exists "read own" on distributors;
create policy "read own" on distributors for select using (shop_id = (select my_shop()) and (select i_am_owner()));

drop policy if exists "read own" on orders;
create policy "read own" on orders for select using (shop_id = (select my_shop()) and (select i_am_owner()));

drop policy if exists "read own" on order_lines;
create policy "read own" on order_lines for select
  using ((select i_am_owner()) and exists (select 1 from orders o where o.id = order_id and o.shop_id = (select my_shop())));

drop policy if exists "read own" on deliveries;
create policy "read own" on deliveries for select using (shop_id = (select my_shop()) and (select i_am_owner()));

-- sales: the owner sees all; a helper sees what they recorded (the app needs that to not save an offline sale twice)
drop policy if exists "read own" on sales;
create policy "read own" on sales for select
  using (shop_id = (select my_shop()) and ((select i_am_owner()) or logged_by = (select auth.uid())));

-- forecasts: owner only (the nightly job uses the service key, which skips row-level security)
drop policy if exists "read own" on model_forecasts;
create policy "read own" on model_forecasts for select using (shop_id = (select my_shop()) and (select i_am_owner()));
drop policy if exists "read own" on model_scores;
create policy "read own" on model_scores for select using (shop_id = (select my_shop()) and (select i_am_owner()));
drop policy if exists "read own" on final_forecasts;
create policy "read own" on final_forecasts for select using (shop_id = (select my_shop()) and (select i_am_owner()));
drop policy if exists "read own" on ai_forecasts;
create policy "read own" on ai_forecasts for select using (shop_id = (select my_shop()) and (select i_am_owner()));

-- ---------- What the Sell screen needs, and nothing more ----------
-- Item names and pack sizes of the caller's own shop, fastest sellers of the last 14 days first. It runs with the
-- function owner's rights because a helper can no longer read items or other people's sales; it returns the ORDER of
-- the items, never a quantity. The other keys are there only so the app can read the row like any item row.
create or replace function helper_items() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select s.id as shop_id,
           greatest(coalesce(s.business_date, (now() at time zone 'Asia/Kolkata')::date), (now() at time zone 'Asia/Kolkata')::date) as today
    from users u join shops s on s.id = u.shop_id
    where u.id = auth.uid()
  ), sold as (
    select x.item_id, sum(x.quantity) as q
    from sales x join me on x.shop_id = me.shop_id and x.sale_date >= me.today - 14
    group by x.item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'pack', i.pack, 'category', null, 'distributor_id', '', 'price', 0, 'current_stock', 0,
      'lead_time_days', 0, 'min_safety_stock', 0, 'order_cover_days', 1
    ) order by coalesce(sold.q, 0) desc, i.name), '[]'::jsonb)
  from items i join me on i.shop_id = me.shop_id
  left join sold on sold.item_id = i.id
  where i.is_active
$$;
revoke execute on function helper_items() from public, anon;
grant execute on function helper_items() to authenticated;

-- ---------- shop_snapshot(): same as 0008, but a helper gets the Sell list instead of the items and sales ----------
-- Everything else in it reads with the caller's rights, so for a helper distributors and orders now come back empty.
create or replace function shop_snapshot(p_since date) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'me', (select to_jsonb(u) from (select id, shop_id, role, name, is_team from users where id = auth.uid()) u),
    'shop', (select to_jsonb(s) from (select id, name, locality from shops where id = (select shop_id from users where id = auth.uid())) s),
    'business', (select jsonb_build_object(
        'business_date', greatest(coalesce(s.business_date, d.t), d.t),
        'real_date', d.t,
        'is_sample_shop', s.is_sample_shop,
        'sales_today', (select count(*) from sales where sale_date = greatest(coalesce(s.business_date, d.t), d.t)))
      from shops s, (select (now() at time zone 'Asia/Kolkata')::date as t) d
      where s.id = (select shop_id from users where id = auth.uid())),
    'items', case when (select role from users where id = auth.uid()) = 'helper' then helper_items()
      else coalesce((select jsonb_agg(to_jsonb(i) order by i.name)
        from (select id, distributor_id, name, category, pack, price, current_stock, lead_time_days, min_safety_stock, order_cover_days
              from items where is_active) i), '[]'::jsonb) end,
    'distributors', coalesce((select jsonb_agg(to_jsonb(d) order by d.name)
      from (select id, name, supplies, salesman, whatsapp, visit_day from distributors) d), '[]'::jsonb),
    -- empty for a helper: the Sell list above is already in order
    'sales', case when (select role from users where id = auth.uid()) = 'helper' then '[]'::jsonb else daily_sales(p_since) end,
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
