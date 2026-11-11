-- StockSaathi schema: the 12 tables in BRD Appendix A3.
-- Every shop's data is private to that shop (row-level security on shop_id).

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  locality text,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'helper'))
);

create table distributors (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  supplies text,
  salesman text,
  whatsapp text,
  visit_day text
);

create table items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  distributor_id uuid references distributors(id),
  name text not null,
  category text,
  pack text,
  price numeric(10,2) not null default 0,
  current_stock int not null default 0,
  lead_time_days int not null default 2 check (lead_time_days >= 0),
  min_safety_stock int not null default 2 check (min_safety_stock >= 0),
  order_cover_days int not null default 7 check (order_cover_days >= 1),
  is_active boolean not null default true,
  unique (shop_id, name)
);

create table sales (
  id bigint generated always as identity primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  sale_date date not null,
  sold_at timestamptz default now(),
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2),
  entry_method text not null check (entry_method in ('Quick tap', 'CSV upload')),
  logged_by uuid references users(id)
);
create index sales_item_date on sales (item_id, sale_date);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  distributor_id uuid not null references distributors(id),
  order_date date not null default current_date,
  status text not null default 'Sent' check (status in ('Sent', 'Delivered')),
  owner_note text,
  whatsapp_payload jsonb
);

create table order_lines (
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity int not null check (quantity > 0),
  delivered boolean not null default false,
  primary key (order_id, item_id)
);

create table deliveries (
  id bigint generated always as identity primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  order_id uuid references orders(id),
  item_id uuid not null references items(id),
  quantity int not null check (quantity > 0),
  received_on date not null default current_date
);

-- Festival and holiday dates entered by the product team (FR8). Shared by all shops, read-only for them.
create table conditions_calendar (
  day date primary key,
  name text not null,
  type text not null default 'festival',
  uplift_pct int not null default 0
);

-- One row per item, model and forecast run: lets us measure accuracy (KPI 3) and show "Why this number".
create table model_forecasts (
  shop_id uuid not null references shops(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  run_date date not null,
  model text not null check (model in ('M1','M2','M3','M4','M5')),
  units_per_day numeric(10,3) not null,
  primary key (item_id, run_date, model)
);

create table model_scores (
  shop_id uuid not null references shops(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  run_date date not null,
  model text not null,
  error_14d numeric(10,3) not null,
  weight numeric(6,4) not null,
  primary key (item_id, run_date, model)
);

create table final_forecasts (
  shop_id uuid not null references shops(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  run_date date not null,
  units_per_day numeric(10,3) not null,
  spread numeric(10,3) not null,
  confidence text not null check (confidence in ('High','Medium','Low')),
  status text not null,
  order_qty int not null default 0,
  primary key (item_id, run_date)
);

-- ---------- row-level security: a user sees only their own shop ----------
create or replace function my_shop() returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from users where id = auth.uid()
$$;
create or replace function i_am_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'owner')
$$;

alter table shops enable row level security;
alter table users enable row level security;
alter table distributors enable row level security;
alter table items enable row level security;
alter table sales enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table deliveries enable row level security;
alter table conditions_calendar enable row level security;
alter table model_forecasts enable row level security;
alter table model_scores enable row level security;
alter table final_forecasts enable row level security;

create policy "own shop" on shops for select using (id = my_shop());
create policy "own shop users" on users for select using (shop_id = my_shop());
create policy "read own" on distributors for select using (shop_id = my_shop());
create policy "owner writes" on distributors for all using (shop_id = my_shop() and i_am_owner()) with check (shop_id = my_shop() and i_am_owner());
create policy "read own" on items for select using (shop_id = my_shop());
create policy "owner writes" on items for all using (shop_id = my_shop() and i_am_owner()) with check (shop_id = my_shop() and i_am_owner());
-- BR7: helpers may only record sales
create policy "read own" on sales for select using (shop_id = my_shop());
-- The item must belong to the same shop, so nobody can change another shop's stock through the triggers below.
create or replace function my_item(i uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from items where id = i and shop_id = (select shop_id from users where id = auth.uid()))
$$;
create policy "anyone in shop logs sales" on sales for insert with check (shop_id = my_shop() and my_item(item_id));
create policy "read own" on orders for select using (shop_id = my_shop());
create policy "owner writes" on orders for all using (shop_id = my_shop() and i_am_owner()) with check (shop_id = my_shop() and i_am_owner());
create policy "read own" on order_lines for select using (exists (select 1 from orders o where o.id = order_id and o.shop_id = my_shop()));
create policy "owner writes" on order_lines for all using (i_am_owner() and exists (select 1 from orders o where o.id = order_id and o.shop_id = my_shop()))
  with check (i_am_owner() and my_item(item_id) and exists (select 1 from orders o where o.id = order_id and o.shop_id = my_shop()));
create policy "read own" on deliveries for select using (shop_id = my_shop());
create policy "owner writes" on deliveries for all using (shop_id = my_shop() and i_am_owner()) with check (shop_id = my_shop() and i_am_owner() and my_item(item_id));
create policy "everyone reads" on conditions_calendar for select using (true);
create policy "read own" on model_forecasts for select using (shop_id = my_shop());
create policy "read own" on model_scores for select using (shop_id = my_shop());
create policy "read own" on final_forecasts for select using (shop_id = my_shop());

-- Stock moves with sales and deliveries.
create or replace function on_sale() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update items set current_stock = greatest(0, current_stock - new.quantity) where id = new.item_id;
  return new;
end $$;
create trigger sale_reduces_stock after insert on sales for each row execute function on_sale();

create or replace function on_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update items set current_stock = current_stock + new.quantity where id = new.item_id;
  update order_lines set delivered = true
    where item_id = new.item_id and delivered = false
      and order_id in (select id from orders where shop_id = new.shop_id and status = 'Sent');
  update orders set status = 'Delivered'
    where shop_id = new.shop_id and status = 'Sent'
      and not exists (select 1 from order_lines l where l.order_id = orders.id and not l.delivered);
  return new;
end $$;
create trigger delivery_adds_stock after insert on deliveries for each row execute function on_delivery();

insert into conditions_calendar (day, name, uplift_pct) values
  ('2026-10-19', 'Ayutha Pooja', 30),
  ('2026-10-20', 'Vijaya Dasami', 20),
  ('2026-11-08', 'Deepavali', 40),
  ('2026-12-25', 'Christmas', 15);
