-- 0009: "Back to real date" puts back exactly the stock that sample sales took.
--
-- A sale never takes stock below 0 (see on_sale in 0001). So when a sample sale met a stock of 0 (or less than its quantity),
-- it took less than its quantity, and giving back the full quantity on "Back to real date" would have made stock grow out of
-- nothing. sales.stock_taken records what each SAMPLE sale really took, and reset_business_date() gives back that.
-- Real sales are not touched in any way: stock_taken stays empty for them, and they are never removed.

alter table sales add column if not exists stock_taken int;

create or replace function on_sale() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
  select current_stock into v_old from items where id = new.item_id for update;
  update items set current_stock = greatest(0, current_stock - new.quantity) where id = new.item_id;
  if new.is_sample then
    update sales set stock_taken = least(new.quantity, greatest(0, coalesce(v_old, 0))) where id = new.id;
  end if;
  return new;
end $$;

-- Sample sales made before this migration: assume they took their full quantity. (Where stock had reached 0 that is a
-- little too much; the project owner corrects those few rows by hand, see docs/live-setup.md section 10.)
update sales set stock_taken = quantity where is_sample and stock_taken is null;

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

  -- Sample sales made for today or later (is_sample only: a real sale is never removed). Their stock goes back as
  -- exactly what they took.
  with del as (
    delete from sales where shop_id = v_shop and is_sample and sale_date >= v_real returning item_id, quantity, stock_taken
  ), back as (
    update items i set current_stock = i.current_stock + d.q
      from (select item_id, sum(coalesce(stock_taken, quantity))::int as q from del group by item_id) d where i.id = d.item_id
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

revoke execute on function reset_business_date() from public, anon;
grant execute on function reset_business_date() to authenticated;
