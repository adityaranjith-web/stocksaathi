-- 0007: protect the two "Demo login" accounts (see docs/live-setup.md, section 8).
--
-- A reviewer who signs in as the demo OWNER can do everything an owner can, including "Delete my account and all shop
-- data", which would wipe the demo shop for everyone. A reviewer could also remove the demo HELPER. This migration:
--   1. adds users.is_demo (false for everybody, set to true only by supabase/link_demo_accounts.sql),
--   2. makes delete_my_account() refuse a demo account,
--   3. stops the "remove helper" rule from removing a demo helper.
-- Nothing else changes: demo accounts otherwise behave exactly like an owner and a helper.

alter table users add column if not exists is_demo boolean not null default false;

create or replace function delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_shop_name text;
  v_people uuid[];
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  if exists (select 1 from users where id = v_uid and is_demo) then
    raise exception 'The demo account cannot delete the shop. Sign in with your own account to delete a shop.';
  end if;
  select u.shop_id, s.name into v_shop, v_shop_name
    from users u join shops s on s.id = u.shop_id
    where u.id = v_uid and u.role = 'owner';
  if v_shop is null then raise exception 'Only the shop owner can delete the account.'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_shop_name)) then
    raise exception 'The shop name you typed does not match.';
  end if;

  select coalesce(array_agg(id), '{}') into v_people from users where shop_id = v_shop; -- the owner and the helpers

  -- Delete from the inside out (see 0005).
  delete from order_lines where order_id in (select id from orders where shop_id = v_shop);
  delete from deliveries where shop_id = v_shop;
  delete from sales where shop_id = v_shop;
  delete from ai_forecasts where shop_id = v_shop;
  delete from final_forecasts where shop_id = v_shop;
  delete from model_scores where shop_id = v_shop;
  delete from model_forecasts where shop_id = v_shop;
  delete from orders where shop_id = v_shop;
  delete from items where shop_id = v_shop;
  delete from distributors where shop_id = v_shop;
  delete from helper_invites where shop_id = v_shop;
  delete from users where shop_id = v_shop;
  delete from shops where id = v_shop;
  delete from auth.users where id = any (v_people); -- the owner's and the helpers' sign-in records
end $$;
revoke execute on function delete_my_account(text) from public, anon;
grant execute on function delete_my_account(text) to authenticated;

drop policy if exists "owner removes helpers" on users;
create policy "owner removes helpers" on users for delete
  using (shop_id = (select my_shop()) and (select i_am_owner()) and role = 'helper' and not is_demo);
