-- 0010: "Back to real date" removes EVERY sale dated after the real date, real or sample, and puts the stock back.
--
-- Until now it removed only sample sales (0008, 0009). A real sale recorded on a simulated future day (the shop date was
-- ahead, someone tapped Sell) stayed behind, dated in the future: 0 days after the real date should be left, but the demo
-- shop kept sales for 21, 22 and 24 Nov while the real date was 20 Nov. A real sale on a day that has not happened is as
-- unreal as a sample one, so it goes too.
--
-- What goes: every sale dated AFTER the real date, plus the sample sales made for the real date itself (the fill made when
-- the real day was closed). A real sale dated the real date stays.
-- The stock goes back as exactly what each sale took: sales.stock_taken where it is set, else the quantity.
--
-- To make "else the quantity" right, on_sale() now also records stock_taken for a real sale that could not take its whole
-- quantity (stock was lower than the quantity, so it took less). An ordinary real sale takes its full quantity, so its
-- stock_taken stays empty and costs no extra write.
--
-- The answer says how many were removed: removed_sales (all), removed_real_sales, removed_sample_sales.

create or replace function on_sale() returns trigger language plpgsql security definer set search_path = public as $$
declare v_old int;
begin
  select current_stock into v_old from items where id = new.item_id for update;
  update items set current_stock = greatest(0, current_stock - new.quantity) where id = new.item_id;
  if new.is_sample or coalesce(v_old, 0) < new.quantity then
    update sales set stock_taken = least(new.quantity, greatest(0, coalesce(v_old, 0))) where id = new.id;
  end if;
  return new;
end $$;

create or replace function reset_business_date() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_real date := (now() at time zone 'Asia/Kolkata')::date;
  v_shop uuid;
  v_all int;
  v_sample int;
begin
  select u.shop_id into v_shop from users u where u.id = auth.uid() and u.role = 'owner' and coalesce(u.is_team, false);
  if v_shop is null then raise exception 'Only the owner on the product team can change the shop date.'; end if;
  perform 1 from shops where id = v_shop for update;

  with del as (
    delete from sales
     where shop_id = v_shop and (sale_date > v_real or (is_sample and sale_date >= v_real))
    returning item_id, quantity, stock_taken, is_sample
  ), back as (
    update items i set current_stock = i.current_stock + d.q
      from (select item_id, sum(coalesce(stock_taken, quantity))::int as q from del group by item_id) d where i.id = d.item_id
    returning 1
  )
  select count(*), count(*) filter (where is_sample) into v_all, v_sample from del;

  -- forecasts saved for days that have not really happened yet
  delete from final_forecasts where shop_id = v_shop and run_date >= v_real;
  delete from model_scores where shop_id = v_shop and run_date >= v_real;
  delete from model_forecasts where shop_id = v_shop and run_date >= v_real;
  delete from ai_forecasts where shop_id = v_shop and run_date >= v_real;

  update shops set business_date = null where id = v_shop;
  return jsonb_build_object('business_date', v_real, 'removed_sales', v_all, 'removed_real_sales', v_all - v_sample, 'removed_sample_sales', v_sample);
end $$;

revoke execute on function reset_business_date() from public, anon;
grant execute on function reset_business_date() to authenticated;
