-- ==============================================================================
-- ADMIN PROVISIONING & QA TEST GAME SETUP - FRIDAY FUN GAME 2026
-- Run this script in your Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/fchqdplgkxsdhcyjqqvz/sql/new
-- ==============================================================================

DO $$
DECLARE
    v_user_id uuid;
    v_admin_email text := 'admin@fridayfun.com'; -- Admin email
    v_game_id uuid;
    v_round_id uuid;
BEGIN
    -- 1. Auto-confirm email in auth.users so password login works immediately
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE email = v_admin_email;

    -- 2. Fetch the user id
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;

    -- 3. Grant Admin privileges in public.admins
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.admins (user_id, email, is_superadmin)
        VALUES (v_user_id, v_admin_email, true)
        ON CONFLICT (user_id) DO UPDATE SET is_superadmin = true;
        
        RAISE NOTICE 'SUCCESS: User % (ID: %) confirmed and granted Admin privileges!', v_admin_email, v_user_id;
    ELSE
        RAISE NOTICE 'NOTICE: User % not found in auth.users yet.', v_admin_email;
    END IF;

    -- 4. Create the QA Test Game Room if not already existing
    SELECT id INTO v_game_id FROM public.games WHERE name = 'FRIDAY FUN – QA TEST ROOM' LIMIT 1;
    
    IF v_game_id IS NULL THEN
        INSERT INTO public.games (
            name,
            description,
            game_date,
            status,
            settings,
            created_by
        ) VALUES (
            'FRIDAY FUN – QA TEST ROOM',
            'Real Multiplayer QA Verification Game Room',
            CURRENT_DATE,
            'active',
            '{
                "min_participants": 3,
                "max_participants": 30,
                "questions_per_participant": 1,
                "points_correct": 10,
                "points_wrong": 0,
                "difficulty_distribution": {"easy": 40, "medium": 40, "hard": 20},
                "reveal_mode": "admin_manual_or_all",
                "allow_multiple_incoming": true
            }'::jsonb,
            v_user_id
        ) RETURNING id INTO v_game_id;

        RAISE NOTICE 'SUCCESS: Created QA Game Room: % (ID: %)', 'FRIDAY FUN – QA TEST ROOM', v_game_id;

        -- Create Round 1
        INSERT INTO public.game_rounds (game_id, round_number, status)
        VALUES (v_game_id, 1, 'active')
        RETURNING id INTO v_round_id;

        -- Insert the 4 QA Participants
        -- A: Arun (token: token_arun_qa_2026)
        INSERT INTO public.participants (game_id, display_name, player_code, invitation_token_hash, status)
        VALUES (
            v_game_id, 'Arun', 'A',
            '84664b36981c091fae9f99ed0a659830b4f94daf02723bdb61250aa966cfeee3',
            'joined'
        );

        -- B: Rahul (token: token_rahul_qa_2026)
        INSERT INTO public.participants (game_id, display_name, player_code, invitation_token_hash, status)
        VALUES (
            v_game_id, 'Rahul', 'B',
            '758d57b69851776f2955651d8a7d5ee54da12c2195b725baaf9790fdb86b9d26',
            'joined'
        );

        -- C: Amal (token: token_amal_qa_2026)
        INSERT INTO public.participants (game_id, display_name, player_code, invitation_token_hash, status)
        VALUES (
            v_game_id, 'Amal', 'C',
            'a27eaf5655da1c1faf13429e822b6dda21e7e4ca82c2b06cf3fdd56d5327b493',
            'joined'
        );

        -- D: Nikhil (token: token_nikhil_qa_2026)
        INSERT INTO public.participants (game_id, display_name, player_code, invitation_token_hash, status)
        VALUES (
            v_game_id, 'Nikhil', 'D',
            '335c06ea6fb52b32bdb5455e57767d89d87e354492d9bc4c376e8fa7f01a65e9',
            'joined'
        );

        RAISE NOTICE 'SUCCESS: 4 QA Participants (Arun, Rahul, Amal, Nikhil) created!';
    ELSE
        RAISE NOTICE 'QA Game Room already exists: %', v_game_id;
    END IF;
END $$;
