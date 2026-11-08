-- ==============================================================================
-- ADMIN PROVISIONING - FRIDAY FUN GAME 2026
-- Run ONCE in the Supabase Dashboard SQL Editor for the admin account(s) you create under
--   Authentication -> Users -> Add user (email + strong password).
--
-- This script ONLY grants the admin role. It no longer creates a QA/test game and contains no
-- hard-coded participant tokens (the old version seeded known token hashes into production).
-- ==============================================================================

-- 1. Set the admin's email here
--    (replace the placeholder, keep the quotes)
create temporary table if not exists _admin_email (email text);
delete from _admin_email;
insert into _admin_email values ('REPLACE-WITH-ADMIN-EMAIL@example.com');

-- 2. Confirm the email so the account can sign in immediately (skip if you use email confirmation)
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) = lower((select email from _admin_email));

-- 3. Grant admin privileges (fails loudly via the check below if the user does not exist)
insert into public.admins (user_id, email)
select id, email from auth.users where lower(email) = lower((select email from _admin_email))
on conflict (user_id) do nothing;

-- 4. Verify: must return one row
select a.email, a.created_at as admin_since
  from public.admins a
  join auth.users u on u.id = a.user_id
 where lower(u.email) = lower((select email from _admin_email));
