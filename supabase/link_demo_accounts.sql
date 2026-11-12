-- Link the two "Demo login" accounts to the demo shop "Sri Balaji Stores": one as owner, one as helper.
--
-- How to use (once, after you create the two users in Supabase and run migration 0007):
--   1. Supabase -> Authentication -> Users -> Add user -> Create new user. Make TWO users with an email and a password
--      you choose, and tick "Auto Confirm User" (so no email is sent). The passwords are kept by Supabase only.
--      Never write a password in this file, in the code or in GitHub.
--   2. Run migrations 0001 to 0007 (0007 adds the protection for demo accounts).
--   3. Change the two emails on the lines marked CHANGE THIS to the emails of the two users, paste this file into
--      the Supabase SQL editor and run it.
--   4. In Vercel add DEMO_OWNER_EMAIL and DEMO_HELPER_EMAIL (the same two emails) and redeploy. The sign-in page then
--      shows a "Demo login" form.
--
-- Safe to run twice. It runs in the SQL editor, which only the project owner can open. It never deletes a shop that
-- has items or sales. The demo owner cannot delete the shop and nobody can remove the demo helper (migration 0007).

do $$
declare
  v_owner_email  text := lower('DEMO_OWNER_EMAIL@YOUR-DOMAIN');    -- <<< CHANGE THIS
  v_helper_email text := lower('DEMO_HELPER_EMAIL@YOUR-DOMAIN');   -- <<< CHANGE THIS
  v_shop_name text := 'Sri Balaji Stores';
  v_shop uuid;
  v_found int;
  v_email text;
  v_uid uuid;
  v_old uuid;
  v_role text;
begin
  if v_owner_email like 'demo\_owner\_email@%' or v_helper_email like 'demo\_helper\_email@%' then
    raise exception 'Change the two emails (DEMO_OWNER_EMAIL@YOUR-DOMAIN and DEMO_HELPER_EMAIL@YOUR-DOMAIN) to the emails of your two demo users.';
  end if;
  if v_owner_email = v_helper_email then raise exception 'The owner and the helper need two different emails.'; end if;
  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'is_demo') then
    raise exception 'Run migration 0007_demo_accounts.sql first.';
  end if;

  select count(*) into v_found from shops where name = v_shop_name;
  if v_found = 0 then raise exception 'No shop called "%" exists. Run supabase/seed.sql first.', v_shop_name; end if;
  if v_found > 1 then raise exception '% shops are called "%". Remove the extra ones first.', v_found, v_shop_name; end if;
  select id into v_shop from shops where name = v_shop_name;

  foreach v_email in array array[v_owner_email, v_helper_email] loop
    v_role := case when v_email = v_owner_email then 'owner' else 'helper' end;
    select id into v_uid from auth.users where lower(email) = v_email order by created_at limit 1;
    if v_uid is null then
      raise exception 'No user with the email % exists. Create it in Supabase -> Authentication -> Users first.', v_email;
    end if;

    -- If this account already has a shop of its own, remove it, but only when it is empty.
    select shop_id into v_old from users where id = v_uid;
    if v_old is not null and v_old <> v_shop then
      if exists (select 1 from items where shop_id = v_old) or exists (select 1 from sales where shop_id = v_old) then
        raise exception 'The account % already has a shop with items or sales, so it is not moved automatically.', v_email;
      end if;
      delete from users where id = v_uid;
      delete from shops where id = v_old;
    end if;

    insert into users (id, shop_id, name, role, email, is_demo)
      values (v_uid, v_shop, case when v_role = 'owner' then 'Demo owner' else 'Demo helper' end, v_role, v_email, true)
      on conflict (id) do update set shop_id = excluded.shop_id, role = excluded.role, email = excluded.email, name = excluded.name, is_demo = true;
  end loop;

  raise notice 'Done: % is the demo owner and % is the demo helper of "%".', v_owner_email, v_helper_email, v_shop_name;
end $$;
