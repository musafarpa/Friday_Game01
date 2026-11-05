-- ==============================================================================
-- ADMIN PROVISIONING SCRIPT
-- Run this in Supabase SQL Editor after creating an admin user in Auth > Users
-- ==============================================================================

-- Example: Replace with your admin's email that you signed up with in Supabase Auth
DO $$
DECLARE
    v_user_id uuid;
    v_admin_email text := 'admin@fridayfun.com'; -- <<< CHANGE THIS TO YOUR ADMIN EMAIL
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.admins (user_id, email)
        VALUES (v_user_id, v_admin_email)
        ON CONFLICT (user_id) DO NOTHING;
        RAISE NOTICE 'User % has been successfully granted Admin privileges!', v_admin_email;
    ELSE
        RAISE NOTICE 'User with email % not found in auth.users. Please sign up or invite user in Supabase Auth first.', v_admin_email;
    END IF;
END $$;
