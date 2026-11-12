-- Become the OWNER of the existing demo shop "Sri Balaji Stores".
--
-- How to use (once, after your first Google sign-in to the app):
--   1. Run migrations 0001 to 0005 first.
--   2. Open the app and sign in with Google. You will see "Create your shop": do NOT fill it in. Just close the tab.
--      (Signing in is what creates your login record. If you did create a shop by mistake and it is still empty,
--      this script removes it for you.)
--   3. Supabase -> SQL editor -> paste this file, change the email on the line marked CHANGE THIS, and run it.
--   4. Reload the app. You are the owner of "Sri Balaji Stores" with its 30 items and sales.
--
-- It is safe to run twice. It runs in the SQL editor, which only the project owner can open, so nobody else can
-- use it to take over a shop. It never deletes a shop that has items or sales.
-- Optional, to also edit the festival calendar (product team), run afterwards:
--   update users set is_team = true where lower(email) = lower('YOUR_GOOGLE_EMAIL@gmail.com');

do $$
declare
  v_email text := lower('YOUR_GOOGLE_EMAIL@gmail.com');   -- <<< CHANGE THIS to your own Google email
  v_shop_name text := 'Sri Balaji Stores';
  v_uid uuid;
  v_person text;
  v_shop uuid;
  v_old uuid;
  v_found int;
begin
  if v_email like 'your\_google\_email%' then
    raise exception 'Change YOUR_GOOGLE_EMAIL@gmail.com to your own Google email first.';
  end if;

  select id, coalesce(nullif(btrim(raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(raw_user_meta_data ->> 'name'), ''), split_part(email, '@', 1))
    into v_uid, v_person from auth.users where lower(email) = v_email order by created_at limit 1;
  if v_uid is null then
    raise exception 'No sign-in found for %. Sign in to the app with that Google account once, then run this again.', v_email;
  end if;

  select count(*) into v_found from shops where name = v_shop_name;
  if v_found = 0 then raise exception 'No shop called "%" exists. Run supabase/seed.sql first.', v_shop_name; end if;
  if v_found > 1 then raise exception '% shops are called "%". Remove the extra ones first.', v_found, v_shop_name; end if;
  select id into v_shop from shops where name = v_shop_name;

  -- If you already made a shop of your own on the "Create your shop" screen: remove it, but only when it is empty.
  select shop_id into v_old from users where id = v_uid;
  if v_old is not null and v_old <> v_shop then
    if exists (select 1 from items where shop_id = v_old) or exists (select 1 from sales where shop_id = v_old) then
      raise exception 'Your current shop already has items or sales, so you are not moved automatically.';
    end if;
    delete from users where id = v_uid;
    delete from shops where id = v_old;
  end if;

  insert into users (id, shop_id, name, role, email)
    values (v_uid, v_shop, left(v_person, 80), 'owner', v_email)
    on conflict (id) do update set shop_id = excluded.shop_id, role = 'owner', email = excluded.email, name = excluded.name;

  raise notice 'Done: % is now the owner of "%".', v_email, v_shop_name;
end $$;
