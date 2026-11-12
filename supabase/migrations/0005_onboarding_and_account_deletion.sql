-- 0005: "Create your shop" for new Google users, a consent record, and "Delete my account and all shop data".
-- Run this after 0001 to 0004 in the Supabase SQL editor.
--
-- Both functions are SECURITY DEFINER (they run with the database owner's rights) because a signed-in user is
-- not allowed to write to the shops table or to auth.users directly. Each function checks who is calling and what
-- they may do, so nobody can use them to reach another shop.

-- ---------- Consent record (DPDP Act, 2023): when the person agreed to the privacy notice, and which version ----------
alter table users add column if not exists consented_at timestamptz;
alter table users add column if not exists consent_version text;

-- ---------- Fix: removing a helper must not be blocked by the sales they recorded ----------
-- Found by the database tests: sales.logged_by pointed at users(id) with no delete rule, so the owner could not remove
-- any helper who had recorded a sale. Now the sales stay and only the link to the removed person is cleared.
alter table sales drop constraint if exists sales_logged_by_fkey;
alter table sales add constraint sales_logged_by_fkey foreign key (logged_by) references users(id) on delete set null;

-- ---------- Create your shop ----------
-- Called by a signed-in Google user who has no shop and no helper invite. They become the owner of a new, empty shop.
create or replace function create_shop(p_name text, p_locality text, p_consent boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_loc text := btrim(coalesce(p_locality, ''));
  v_person text;
  v_shop uuid;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  if p_consent is not true then raise exception 'Please agree to the privacy notice to continue.'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'The shop name must be 2 to 80 characters.'; end if;
  if char_length(v_loc) > 80 then raise exception 'The locality must be 80 characters or fewer.'; end if;
  if exists (select 1 from users where id = v_uid) then raise exception 'You already have a shop.'; end if;
  -- A person who was invited as a helper must join that shop, not start a new one.
  if v_email <> '' and exists (select 1 from helper_invites where lower(email) = v_email) then
    raise exception 'You were invited as a helper. Sign out and sign in again to join that shop.';
  end if;

  v_person := coalesce(
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
    nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Owner');

  insert into shops (name, locality) values (v_name, nullif(v_loc, '')) returning id into v_shop;
  insert into users (id, shop_id, name, role, email, consented_at, consent_version)
    values (v_uid, v_shop, left(v_person, 80), 'owner', nullif(v_email, ''), now(), 'DPDP-2026-11');
  return v_shop;
end $$;
revoke execute on function create_shop(text, text, boolean) from public, anon;
grant execute on function create_shop(text, text, boolean) to authenticated;

-- ---------- Delete my account and all shop data (BRD section 7) ----------
-- Only the owner. The owner must type the shop name. Deletes the shop and everything in it (items, distributors,
-- sales, orders, deliveries, forecasts, helper invites), the helpers' accounts for this shop, and the owner's own
-- sign-in record. Other shops are not touched. The festival calendar is shared by all shops and is not touched.
create or replace function delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid;
  v_shop_name text;
  v_people uuid[];
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  select u.shop_id, s.name into v_shop, v_shop_name
    from users u join shops s on s.id = u.shop_id
    where u.id = v_uid and u.role = 'owner';
  if v_shop is null then raise exception 'Only the shop owner can delete the account.'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_shop_name)) then
    raise exception 'The shop name you typed does not match.';
  end if;

  select coalesce(array_agg(id), '{}') into v_people from users where shop_id = v_shop; -- the owner and the helpers

  -- Delete from the inside out. Letting the shop's "on delete cascade" do it all at once fails, because order lines
  -- point at items and the database checks that before it has removed the orders (found by the database tests).
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
