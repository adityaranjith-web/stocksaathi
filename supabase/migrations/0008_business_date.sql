-- 0008: a business date per shop, "Close the day", and labelled sample sales for the demo shop.
--
-- 1. shops.business_date: the shop's own "today", the same for everybody in the shop. NULL means "follow the real date".
--    A stored date in the past counts as NULL, so the business date is never behind the real date (India time).
-- 2. shops.is_sample_shop: true only for the demo shop "Sri Balaji Stores". Only that shop may get sample sales.
-- 3. sales.is_sample: true on every sample sale, so sample data can always be told apart from real sales.
-- 4. close_day(): owner on the product team only. The day's sales and deliveries become history (the business date moves
--    forward by one), and, for the demo shop only, the day can first be filled with sample sales.
-- 5. reset_business_date(): owner on the product team only. Goes back to the real date and removes what the simulation
--    made after it: sample sales and saved forecasts dated today or later. Real sales are never removed.
-- 6. shop_snapshot() also returns the business date, so a page still needs ONE database call.

alter table shops add column if not exists business_date date;
alter table shops add column if not exists is_sample_shop boolean not null default false;
alter table sales add column if not exists is_sample boolean not null default false;

-- The demo shop. (For a fresh project: run  update shops set is_sample_shop = true where name = 'Sri Balaji Stores';  after the seed.)
update shops set is_sample_shop = true where name = 'Sri Balaji Stores';

-- ---------- shop_snapshot(): same as 0006, plus the business date ----------
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

-- ---------- Close the day ----------
-- p_day is the business date the person was looking at. If it has changed meanwhile (someone else closed the day),
-- nothing happens. p_sample is a json array of {item_id, quantity}: sample sales for that day, accepted for the demo
-- shop only and only when the day has fewer than 5 sales.
create or replace function close_day(p_day date, p_sample jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_real date := (now() at time zone 'Asia/Kolkata')::date;
  v_shop uuid;
  v_bd date;
  v_is_sample boolean;
  v_count int;
  v_added int := 0;
begin
  select u.shop_id into v_shop from users u where u.id = auth.uid() and u.role = 'owner' and coalesce(u.is_team, false);
  if v_shop is null then raise exception 'Only the owner on the product team can close the day.'; end if;

  select greatest(coalesce(s.business_date, v_real), v_real), s.is_sample_shop into v_bd, v_is_sample
    from shops s where s.id = v_shop for update;
  if p_day is distinct from v_bd then
    raise exception 'The shop date has changed. Reload the page and try again.';
  end if;
  if v_bd + 1 > v_real + 60 then
    raise exception 'The shop date can be at most 60 days ahead of the real date.';
  end if;

  if p_sample is not null and jsonb_typeof(p_sample) = 'array' and jsonb_array_length(p_sample) > 0 then
    if not v_is_sample then raise exception 'Sample sales are only for the demo shop.'; end if;
    if jsonb_array_length(p_sample) > 500 then raise exception 'Too many sample sales.'; end if;
    select count(*) into v_count from sales where shop_id = v_shop and sale_date = v_bd;
    if v_count >= 5 then raise exception 'This day already has 5 or more sales, so it is not filled with sample sales.'; end if;
    insert into sales (shop_id, item_id, sale_date, quantity, entry_method, is_sample)
      select v_shop, i.id, v_bd, least(1000, greatest(1, (e ->> 'quantity')::int)), 'Quick tap', true
      from jsonb_array_elements(p_sample) e
      join items i on i.id = (e ->> 'item_id')::uuid and i.shop_id = v_shop;
    get diagnostics v_added = row_count;
  end if;

  update shops set business_date = v_bd + 1 where id = v_shop;
  return jsonb_build_object('closed', v_bd, 'business_date', v_bd + 1, 'sample_rows', v_added);
end $$;

-- ---------- Back to the real date ----------
create or replace function reset_business_date() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_real date := (now() at time zone 'Asia/Kolkata')::date;
  v_shop uuid;
  v_sales int;
begin
  select u.shop_id into v_shop from users u where u.id = auth.uid() and u.role = 'owner' and coalesce(u.is_team, false);
  if v_shop is null then raise exception 'Only the owner on the product team can change the shop date.'; end if;
  perform 1 from shops where id = v_shop for update;

  -- sample sales made for today or later: remove them and put their units back in stock
  with del as (
    delete from sales where shop_id = v_shop and is_sample and sale_date >= v_real returning item_id, quantity
  ), back as (
    update items i set current_stock = i.current_stock + d.q
      from (select item_id, sum(quantity)::int as q from del group by item_id) d where i.id = d.item_id
    returning 1
  )
  select count(*) into v_sales from del;

  -- forecasts saved for days that have not really happened yet
  delete from final_forecasts where shop_id = v_shop and run_date >= v_real;
  delete from model_scores where shop_id = v_shop and run_date >= v_real;
  delete from model_forecasts where shop_id = v_shop and run_date >= v_real;
  delete from ai_forecasts where shop_id = v_shop and run_date >= v_real;

  update shops set business_date = null where id = v_shop;
  return jsonb_build_object('business_date', v_real, 'removed_sample_sales', v_sales);
end $$;

revoke execute on function close_day(date, jsonb) from public, anon;
revoke execute on function reset_business_date() from public, anon;
grant execute on function close_day(date, jsonb) to authenticated;
grant execute on function reset_business_date() to authenticated;
