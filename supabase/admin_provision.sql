-- ==============================================================================
-- ADMIN PROVISIONING & QA TEST GAME SETUP - FRIDAY FUN GAME 2026
-- Run this in Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/fchqdplgkxsdhcyjqqvz/sql/new
-- ==============================================================================

-- STEP 1: Auto-confirm the admin's email so login works immediately
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'admin@fridayfun.com';

-- STEP 2: Grant Admin privileges in public.admins
INSERT INTO public.admins (user_id, email)
SELECT id, email
FROM auth.users
WHERE email = 'admin@fridayfun.com'
ON CONFLICT (user_id) DO NOTHING;

-- STEP 3: Create the QA Test Game Room
INSERT INTO public.games (name, description, game_date, status, settings)
VALUES (
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
    }'::jsonb
)
ON CONFLICT DO NOTHING;

-- STEP 4: Create Round 1
INSERT INTO public.game_rounds (game_id, round_number, status)
SELECT id, 1, 'active'
FROM public.games
WHERE name = 'FRIDAY FUN – QA TEST ROOM'
LIMIT 1;

-- STEP 5: Insert the 4 QA Participants (Arun, Rahul, Amal, Nikhil)
INSERT INTO public.participants (game_id, display_name, player_code, invitation_token_hash, status)
SELECT 
    g.id, 
    p.display_name, 
    p.player_code, 
    p.invitation_token_hash, 
    'joined'
FROM public.games g
CROSS JOIN (
    VALUES 
        ('Arun', 'A', '84664b36981c091fae9f99ed0a659830b4f94daf02723bdb61250aa966cfeee3'),
        ('Rahul', 'B', '758d57b69851776f2955651d8a7d5ee54da12c2195b725baaf9790fdb86b9d26'),
        ('Amal', 'C', 'a27eaf5655da1c1faf13429e822b6dda21e7e4ca82c2b06cf3fdd56d5327b493'),
        ('Nikhil', 'D', '335c06ea6fb52b32bdb5455e57767d89d87e354492d9bc4c376e8fa7f01a65e9')
) AS p(display_name, player_code, invitation_token_hash)
WHERE g.name = 'FRIDAY FUN – QA TEST ROOM'
ON CONFLICT DO NOTHING;
