-- 0010: "Start your shop": the owner's own estimate of how many of an item sell per day.
--
-- A new shop has no sales yet, so the Forecast Desk has nothing to learn from. The owner says "about 8 a day" for each item,
-- and StockSaathi uses that as the forecast and blends in the real sales as they arrive, until the item has 14 days of
-- sales (see lib/cold-start.ts). After that the estimate is not used any more and the Forecast Desk works as always.
--
-- items.est_daily_sales is NULL for every existing item, so nothing changes for a shop that has not used the guide.
-- Who may change it is already decided by the existing item policies (the owner changes items, a helper cannot).

alter table items add column if not exists est_daily_sales numeric(10,2) check (est_daily_sales is null or est_daily_sales >= 0);

-- shop_snapshot(): same as 0008, and the items now carry est_daily_sales.
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
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name)
      from (select id, distributor_id, name, category, pack, price, current_stock, lead_time_days, min_safety_stock, order_cover_days, est_daily_sales
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

revoke execute on function shop_snapshot(date) from public, anon;
grant execute on function shop_snapshot(date) to authenticated;
