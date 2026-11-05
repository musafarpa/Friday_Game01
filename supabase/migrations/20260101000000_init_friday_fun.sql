-- ==============================================================================
-- FRIDAY FUN GAME 2026 - COMPLETE PRODUCTION SCHEMA & RLS POLICIES
-- Target Project: fchqdplgkxsdhcyjqqvz.supabase.co
-- Idempotent, safe incremental execution for Supabase SQL Editor / CLI
-- ==============================================================================

-- Enable pgcrypto for UUID and cryptographic hashing
create extension if not exists "pgcrypto";

-- 1. ADMINS TABLE
create table if not exists public.admins (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade unique,
    email text not null,
    created_at timestamptz default now()
);

-- 2. GAMES TABLE
create table if not exists public.games (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    game_date date default current_date,
    status text not null default 'draft' check (status in ('draft', 'registration_open', 'ready', 'active', 'waiting_for_answers', 'completed', 'cancelled')),
    settings jsonb not null default '{
        "min_participants": 3,
        "max_participants": 30,
        "questions_per_participant": 1,
        "points_correct": 10,
        "points_wrong": 0,
        "difficulty_distribution": {"easy": 40, "medium": 40, "hard": 20},
        "reveal_mode": "admin_manual_or_all",
        "allow_multiple_incoming": true
    }'::jsonb,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 3. PARTICIPANTS TABLE
create table if not exists public.participants (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    display_name text not null,
    player_code text not null, -- 'A', 'B', 'C', 'D'...
    email_or_contact text,
    avatar_url text,
    invitation_token_hash text not null,
    status text not null default 'pending' check (status in ('pending', 'joined', 'selected', 'completed')),
    joined_at timestamptz,
    created_at timestamptz default now(),
    constraint unique_game_player_code unique(game_id, player_code),
    constraint unique_game_display_name unique(game_id, display_name)
);

-- 4. TOPICS TABLE
create table if not exists public.topics (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    icon text default 'Sparkles',
    is_active boolean default true,
    created_at timestamptz default now()
);

-- 5. GAME_TOPICS TABLE
create table if not exists public.game_topics (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    topic_id uuid references public.topics(id) on delete cascade not null,
    constraint unique_game_topic unique (game_id, topic_id)
);

-- 6. GAME_ROUNDS TABLE
create table if not exists public.game_rounds (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    round_number int not null default 1,
    status text not null default 'active' check (status in ('active', 'waiting_answers', 'revealed', 'closed')),
    deadline timestamptz,
    reveal_at timestamptz,
    created_at timestamptz default now()
);

-- 7. ASSIGNMENTS TABLE
create table if not exists public.assignments (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    round_id uuid references public.game_rounds(id) on delete cascade not null,
    sender_id uuid references public.participants(id) on delete cascade not null,
    receiver_id uuid references public.participants(id) on delete cascade not null,
    topic_id uuid references public.topics(id) on delete cascade not null,
    challenge_token_hash text not null unique,
    status text not null default 'pending' check (status in ('pending', 'opened', 'submitted', 'expired')),
    created_at timestamptz default now(),
    constraint sender_not_receiver check (sender_id != receiver_id)
);

-- 8. QUESTIONS TABLE
create table if not exists public.questions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid references public.assignments(id) on delete cascade unique not null,
    topic_category text not null,
    question_text text not null,
    option_a text not null,
    option_b text not null,
    option_c text not null,
    option_d text not null,
    correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
    explanation text,
    difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
    created_at timestamptz default now()
);

-- 9. ANSWERS TABLE
create table if not exists public.answers (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid references public.assignments(id) on delete cascade unique not null,
    question_id uuid references public.questions(id) on delete cascade not null,
    participant_id uuid references public.participants(id) on delete cascade not null,
    selected_option text not null check (selected_option in ('A', 'B', 'C', 'D')),
    is_correct boolean,
    submitted_at timestamptz default now()
);

-- 10. SCORES TABLE
create table if not exists public.scores (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    round_id uuid references public.game_rounds(id) on delete cascade not null,
    participant_id uuid references public.participants(id) on delete cascade not null,
    correct_answers int not null default 0,
    wrong_answers int not null default 0,
    total_points int not null default 0,
    updated_at timestamptz default now(),
    constraint unique_game_round_participant unique (game_id, round_id, participant_id)
);

-- 11. GAME_EVENTS TABLE
create table if not exists public.game_events (
    id uuid primary key default gen_random_uuid(),
    game_id uuid references public.games(id) on delete cascade not null,
    actor_id uuid,
    event_type text not null,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
create index if not exists idx_games_status on public.games(status);
create index if not exists idx_participants_game on public.participants(game_id);
create index if not exists idx_participants_token on public.participants(invitation_token_hash);
create index if not exists idx_assignments_game on public.assignments(game_id);
create index if not exists idx_assignments_round on public.assignments(round_id);
create index if not exists idx_assignments_token on public.assignments(challenge_token_hash);
create index if not exists idx_assignments_receiver on public.assignments(receiver_id);
create index if not exists idx_questions_assignment on public.questions(assignment_id);
create index if not exists idx_answers_assignment on public.answers(assignment_id);
create index if not exists idx_answers_participant on public.answers(participant_id);
create index if not exists idx_scores_game on public.scores(game_id);

-- ==============================================================================
-- SEED DEFAULT TOPICS (Safe upsert)
-- ==============================================================================
insert into public.topics (name, description, icon, is_active) values
('Politics & Government', 'Elections, Indian Constitution, ministers, public policies, and democratic institutions.', 'Landmark', true),
('Pollution & Environment', 'Air, plastic, water pollution, climate change, waste management, and green energy.', 'Leaf', true),
('AI & Technology', 'Artificial intelligence, ChatGPT, robotics, cybersecurity, smartphones, and future tech.', 'Cpu', true),
('Social Media', 'Instagram, YouTube, WhatsApp, influencers, privacy, memes, and internet trends.', 'Share2', true),
('Kerala & Current Affairs', 'Kerala geography, history, culture, achievements, current events, and general knowledge.', 'MapPin', true),
('Cricket & Sports', 'Cricket, Football, Indian sports legends, Olympics, tournaments, and records.', 'Trophy', true),
('Movies & Entertainment', 'Malayalam and Indian cinema, legendary actors, directors, songs, and box office trivia.', 'Film', true),
('College & Office Life', 'College life, interviews, workplace culture, careers, campus stories, and office memes.', 'Briefcase', true),
('Money & Lifestyle', 'Personal finance, savings, online payments, banking, shopping, and everyday economics.', 'Wallet', true),
('Funny & Random', 'Friendship, unexpected twists, brain teasers, wacky logic puzzles, and hilarious trivia.', 'Smile', true)
on conflict (name) do update set description = excluded.description, icon = excluded.icon;

-- ==============================================================================
-- HELPER FUNCTIONS & RPCs
-- ==============================================================================

-- Check if current user is admin
create or replace function public.is_admin()
returns boolean language sql security definer as $$
    select exists (
        select 1 from public.admins where user_id = auth.uid()
    );
$$;

-- Helper to check if caller is an admin or server role
create or replace function public.is_admin_or_service()
returns boolean language sql security definer as $$
    select (auth.role() = 'service_role') or public.is_admin();
$$;

-- RPC: Get participant by token hash
create or replace function public.get_participant_by_token(p_token_hash text)
returns jsonb language plpgsql security definer as $$
declare
    v_participant record;
    v_game record;
    v_has_selected boolean;
    v_assignment record;
begin
    select * into v_participant from public.participants where invitation_token_hash = p_token_hash;
    if not found then
        return null;
    end if;

    select * into v_game from public.games where id = v_participant.game_id;

    -- Update joined status if first time
    if v_participant.status = 'pending' then
        update public.participants
        set status = 'joined', joined_at = now()
        where id = v_participant.id;
        v_participant.status := 'joined';
    end if;

    -- Check if sender has already submitted an assignment in active round
    select * into v_assignment from public.assignments 
    where sender_id = v_participant.id and game_id = v_participant.game_id
    limit 1;
    v_has_selected := found;

    return jsonb_build_object(
        'participant', row_to_json(v_participant),
        'game', row_to_json(v_game),
        'has_selected', v_has_selected,
        'existing_assignment', row_to_json(v_assignment)
    );
end;
$$;

-- RPC: Get challenge for participant (STRICT ZERO-LEAK: HIDES correct_option unless revealed!)
create or replace function public.get_challenge_by_token(p_token_hash text)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment record;
    v_game record;
    v_round record;
    v_sender record;
    v_receiver record;
    v_topic record;
    v_question record;
    v_answer record;
    v_is_revealed boolean := false;
begin
    select * into v_assignment from public.assignments where challenge_token_hash = p_token_hash;
    if not found then
        return null;
    end if;

    -- Update status to opened if still pending
    if v_assignment.status = 'pending' then
        update public.assignments set status = 'opened' where id = v_assignment.id;
        v_assignment.status := 'opened';
    end if;

    select * into v_game from public.games where id = v_assignment.game_id;
    select * into v_round from public.game_rounds where id = v_assignment.round_id;
    select id, display_name, player_code, avatar_url into v_sender from public.participants where id = v_assignment.sender_id;
    select id, display_name, player_code, avatar_url into v_receiver from public.participants where id = v_assignment.receiver_id;
    select * into v_topic from public.topics where id = v_assignment.topic_id;
    select * into v_question from public.questions where assignment_id = v_assignment.id;
    select * into v_answer from public.answers where assignment_id = v_assignment.id;

    if v_round.status = 'revealed' or v_game.status = 'completed' then
        v_is_revealed := true;
    end if;

    return jsonb_build_object(
        'assignment', jsonb_build_object(
            'id', v_assignment.id,
            'status', v_assignment.status,
            'created_at', v_assignment.created_at
        ),
        'game', jsonb_build_object(
            'id', v_game.id,
            'name', v_game.name,
            'status', v_game.status
        ),
        'round', jsonb_build_object(
            'id', v_round.id,
            'round_number', v_round.round_number,
            'status', v_round.status,
            'deadline', v_round.deadline,
            'is_revealed', v_is_revealed
        ),
        'sender', row_to_json(v_sender),
        'receiver', row_to_json(v_receiver),
        'topic', row_to_json(v_topic),
        'question', jsonb_build_object(
            'id', v_question.id,
            'topic_category', v_question.topic_category,
            'question_text', v_question.question_text,
            'option_a', v_question.option_a,
            'option_b', v_question.option_b,
            'option_c', v_question.option_c,
            'option_d', v_question.option_d,
            'difficulty', v_question.difficulty,
            -- ONLY EXPOSE CORRECT OPTION & EXPLANATION IF REVEALED
            'correct_option', case when v_is_revealed then v_question.correct_option else null end,
            'explanation', case when v_is_revealed then v_question.explanation else null end
        ),
        'user_answer', case when v_answer.id is not null then jsonb_build_object(
            'selected_option', v_answer.selected_option,
            'submitted_at', v_answer.submitted_at,
            'is_correct', case when v_is_revealed then v_answer.is_correct else null end
        ) else null end
    );
end;
$$;

-- RPC: Create challenge assignment and question atomically
create or replace function public.create_challenge_assignment(
    p_game_id uuid,
    p_round_id uuid,
    p_sender_id uuid,
    p_receiver_id uuid,
    p_topic_id uuid,
    p_challenge_token_hash text,
    p_topic_category text,
    p_question_text text,
    p_option_a text,
    p_option_b text,
    p_option_c text,
    p_option_d text,
    p_correct_option text,
    p_explanation text,
    p_difficulty text
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment_id uuid;
    v_question_id uuid;
begin
    if p_sender_id = p_receiver_id then
        raise exception 'Self-selection is not permitted.';
    end if;

    -- Insert assignment
    insert into public.assignments (
        game_id,
        round_id,
        sender_id,
        receiver_id,
        topic_id,
        challenge_token_hash,
        status
    ) values (
        p_game_id,
        p_round_id,
        p_sender_id,
        p_receiver_id,
        p_topic_id,
        p_challenge_token_hash,
        'pending'
    ) returning id into v_assignment_id;

    -- Insert question
    insert into public.questions (
        assignment_id,
        topic_category,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        explanation,
        difficulty
    ) values (
        v_assignment_id,
        p_topic_category,
        p_question_text,
        p_option_a,
        p_option_b,
        p_option_c,
        p_option_d,
        p_correct_option,
        p_explanation,
        coalesce(p_difficulty, 'medium')
    ) returning id into v_question_id;

    -- Update sender status
    update public.participants
    set status = 'selected'
    where id = p_sender_id;

    -- Record event
    insert into public.game_events (game_id, actor_id, event_type, metadata)
    values (
        p_game_id,
        p_sender_id,
        'challenge_created',
        jsonb_build_object(
            'assignment_id', v_assignment_id,
            'receiver_id', p_receiver_id,
            'topic_id', p_topic_id
        )
    );

    return jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'question_id', v_question_id
    );
end;
$$;

-- RPC: Submit challenge answer securely
create or replace function public.submit_challenge_answer(
    p_token_hash text,
    p_selected_option text
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment record;
    v_question record;
    v_round record;
    v_game record;
    v_existing_answer record;
    v_is_correct boolean;
    v_points_to_award int;
    v_points_correct int;
    v_points_wrong int;
begin
    -- 1. Validate option
    if p_selected_option not in ('A', 'B', 'C', 'D') then
        raise exception 'Invalid option selected. Must be A, B, C, or D.';
    end if;

    -- 2. Fetch assignment
    select * into v_assignment from public.assignments where challenge_token_hash = p_token_hash;
    if not found then
        raise exception 'Challenge not found or invalid link.';
    end if;

    -- 3. Check round status
    select * into v_round from public.game_rounds where id = v_assignment.round_id;
    if v_round.status in ('revealed', 'closed') then
        raise exception 'This round is already closed or revealed.';
    end if;

    -- 4. Check if already answered
    select * into v_existing_answer from public.answers where assignment_id = v_assignment.id;
    if found then
        raise exception 'An answer has already been submitted for this challenge.';
    end if;

    -- 5. Fetch question & verify correct answer
    select * into v_question from public.questions where assignment_id = v_assignment.id;
    if not found then
        raise exception 'Question details missing.';
    end if;

    v_is_correct := (v_question.correct_option = p_selected_option);

    -- 6. Fetch game settings for points
    select * into v_game from public.games where id = v_assignment.game_id;
    v_points_correct := coalesce((v_game.settings->>'points_correct')::int, 10);
    v_points_wrong := coalesce((v_game.settings->>'points_wrong')::int, 0);

    v_points_to_award := case when v_is_correct then v_points_correct else v_points_wrong end;

    -- 7. Insert answer
    insert into public.answers (
        assignment_id,
        question_id,
        participant_id,
        selected_option,
        is_correct,
        submitted_at
    ) values (
        v_assignment.id,
        v_question.id,
        v_assignment.receiver_id,
        p_selected_option,
        v_is_correct,
        now()
    );

    -- 8. Mark assignment submitted
    update public.assignments
    set status = 'submitted'
    where id = v_assignment.id;

    -- 9. Upsert into scores for this participant in this round
    insert into public.scores (
        game_id,
        round_id,
        participant_id,
        correct_answers,
        wrong_answers,
        total_points,
        updated_at
    ) values (
        v_assignment.game_id,
        v_assignment.round_id,
        v_assignment.receiver_id,
        case when v_is_correct then 1 else 0 end,
        case when v_is_correct then 0 else 1 end,
        v_points_to_award,
        now()
    )
    on conflict (game_id, round_id, participant_id) do update
    set correct_answers = public.scores.correct_answers + (case when v_is_correct then 1 else 0 end),
        wrong_answers = public.scores.wrong_answers + (case when v_is_correct then 0 else 1 end),
        total_points = public.scores.total_points + v_points_to_award,
        updated_at = now();

    -- 10. Check if all assignments for this game round are submitted
    if not exists (
        select 1 from public.assignments
        where round_id = v_assignment.round_id and status != 'submitted'
    ) then
        insert into public.game_events (game_id, event_type, metadata)
        values (v_assignment.game_id, 'all_submissions_received', jsonb_build_object('round_id', v_assignment.round_id));
    end if;

    return jsonb_build_object(
        'success', true,
        'message', 'Answer recorded successfully.'
    );
end;
$$;

-- RPC: Admin reveal round answers
create or replace function public.reveal_round_answers(p_round_id uuid)
returns jsonb language plpgsql security definer as $$
declare
    v_round record;
    v_game record;
begin
    -- Check admin permission
    if not public.is_admin() and auth.role() != 'service_role' then
        raise exception 'Unauthorized. Admin access required.';
    end if;

    select * into v_round from public.game_rounds where id = p_round_id;
    if not found then
        raise exception 'Round not found.';
    end if;

    update public.game_rounds
    set status = 'revealed',
        reveal_at = now()
    where id = p_round_id;

    update public.games
    set status = 'completed',
        updated_at = now()
    where id = v_round.game_id;

    insert into public.game_events (game_id, actor_id, event_type, metadata)
    values (v_round.game_id, auth.uid(), 'answers_revealed', jsonb_build_object('round_id', p_round_id));

    return jsonb_build_object('success', true, 'round_id', p_round_id);
end;
$$;

-- RPC: Delete game room and all cascaded data
create or replace function public.delete_game_room(p_game_id uuid)
returns jsonb language plpgsql security definer as $$
begin
    if not public.is_admin() and auth.role() != 'service_role' then
        raise exception 'Unauthorized: Admin privileges required to delete a game room.';
    end if;

    delete from public.games where id = p_game_id;
    return jsonb_build_object('success', true, 'deleted_game_id', p_game_id);
end;
$$;

-- RPC: Automated temporary game cleanup (retains completed games for 24h, removes older)
create or replace function public.cleanup_completed_games()
returns jsonb language plpgsql security definer as $$
declare
    v_count int;
begin
    if not public.is_admin() and auth.role() != 'service_role' then
        raise exception 'Unauthorized: Admin privileges required.';
    end if;

    with deleted as (
        delete from public.games
        where status = 'completed'
          and updated_at < now() - interval '24 hours'
        returning id
    )
    select count(*) into v_count from deleted;

    return jsonb_build_object('success', true, 'cleaned_count', v_count);
end;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES (Idempotent safe setup)
-- ==============================================================================

alter table public.admins enable row level security;
alter table public.games enable row level security;
alter table public.participants enable row level security;
alter table public.topics enable row level security;
alter table public.game_topics enable row level security;
alter table public.game_rounds enable row level security;
alter table public.assignments enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.scores enable row level security;
alter table public.game_events enable row level security;

-- Admins table:
drop policy if exists "Admins read own row" on public.admins;
drop policy if exists "Admins can view admin list" on public.admins;
create policy "Admins read own row" on public.admins for select using (user_id = auth.uid());
create policy "Admins can view admin list" on public.admins for select using (public.is_admin());

-- Games table:
drop policy if exists "Public can read games by ID" on public.games;
drop policy if exists "Admins full access to games" on public.games;
create policy "Public can read games by ID" on public.games for select using (true);
create policy "Admins full access to games" on public.games for all using (public.is_admin());

-- Participants table:
drop policy if exists "Anyone can read participants of a game" on public.participants;
drop policy if exists "Admins full access to participants" on public.participants;
create policy "Anyone can read participants of a game" on public.participants for select using (true);
create policy "Admins full access to participants" on public.participants for all using (public.is_admin());

-- Topics table:
drop policy if exists "Public can read active topics" on public.topics;
drop policy if exists "Admins full access to topics" on public.topics;
create policy "Public can read active topics" on public.topics for select using (true);
create policy "Admins full access to topics" on public.topics for all using (public.is_admin());

-- Game topics:
drop policy if exists "Public can read game topics" on public.game_topics;
drop policy if exists "Admins manage game topics" on public.game_topics;
create policy "Public can read game topics" on public.game_topics for select using (true);
create policy "Admins manage game topics" on public.game_topics for all using (public.is_admin());

-- Game rounds:
drop policy if exists "Public can read game rounds" on public.game_rounds;
drop policy if exists "Admins manage game rounds" on public.game_rounds;
create policy "Public can read game rounds" on public.game_rounds for select using (true);
create policy "Admins manage game rounds" on public.game_rounds for all using (public.is_admin());

-- Assignments:
drop policy if exists "Public read assignments" on public.assignments;
drop policy if exists "Public insert assignment" on public.assignments;
drop policy if exists "Admins manage assignments" on public.assignments;
create policy "Public read assignments" on public.assignments for select using (true);
create policy "Public insert assignment" on public.assignments for insert with check (true);
create policy "Admins manage assignments" on public.assignments for all using (public.is_admin());

-- Questions:
-- Only admins can read questions directly from the table.
-- Participants must read questions via the secure get_challenge_by_token RPC!
drop policy if exists "Admins full access to questions" on public.questions;
drop policy if exists "Public insert questions" on public.questions;
create policy "Admins full access to questions" on public.questions for all using (public.is_admin());
create policy "Public insert questions" on public.questions for insert with check (true);

-- Answers:
drop policy if exists "Admins full access to answers" on public.answers;
create policy "Admins full access to answers" on public.answers for all using (public.is_admin());

-- Scores:
drop policy if exists "Public read scores" on public.scores;
drop policy if exists "Admins manage scores" on public.scores;
create policy "Public read scores" on public.scores for select using (true);
create policy "Admins manage scores" on public.scores for all using (public.is_admin());

-- Game events:
drop policy if exists "Public read game events" on public.game_events;
drop policy if exists "Admins insert game events" on public.game_events;
create policy "Public read game events" on public.game_events for select using (true);
create policy "Admins insert game events" on public.game_events for all using (public.is_admin());

-- ==============================================================================
-- ENABLE SUPABASE REALTIME REPLICATION (Safe idempotent addition)
-- ==============================================================================
do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
        alter publication supabase_realtime add table public.games;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants') then
        alter publication supabase_realtime add table public.participants;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rounds') then
        alter publication supabase_realtime add table public.game_rounds;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assignments') then
        alter publication supabase_realtime add table public.assignments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answers') then
        alter publication supabase_realtime add table public.answers;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores') then
        alter publication supabase_realtime add table public.scores;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_events') then
        alter publication supabase_realtime add table public.game_events;
    end if;
end $$;
