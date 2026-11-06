-- ==============================================================================
-- MIGRATION: 20260102000000_min_7_questions_per_topic.sql
-- Friday Fun Game 2026: Minimum 7 Questions Per Topic Architecture
-- ==============================================================================

-- 1. Allow pre-generated questions in public.questions before assignment
alter table public.questions alter column assignment_id drop not null;
alter table public.questions drop constraint if exists questions_assignment_id_key;

-- 2. Add game_id, topic_id, and is_used to public.questions
alter table public.questions add column if not exists game_id uuid references public.games(id) on delete cascade;
alter table public.questions add column if not exists topic_id uuid references public.topics(id) on delete cascade;
alter table public.questions add column if not exists is_used boolean not null default false;

-- 3. Indexes for fast pool retrieval and duplicate prevention
create index if not exists idx_questions_game_id on public.questions(game_id);
create index if not exists idx_questions_game_topic on public.questions(game_id, topic_id);
create index if not exists idx_questions_game_used on public.questions(game_id, is_used);
create index if not exists idx_questions_game_category on public.questions(game_id, lower(trim(topic_category)));

-- 4. Constraint to prevent duplicate question text in the same game room
create unique index if not exists unique_game_question_text on public.questions(game_id, lower(trim(question_text)));

-- 5. Track question pool status on public.game_topics
alter table public.game_topics add column if not exists questions_count int not null default 0;
alter table public.game_topics add column if not exists status text not null default 'pending';
alter table public.game_topics add column if not exists error_message text;

-- 6. RPC: Save a pre-generated question to the game's pool
create or replace function public.save_game_question(
    p_game_id uuid,
    p_topic_id uuid,
    p_topic_category text,
    p_question_text text,
    p_option_a text,
    p_option_b text,
    p_option_c text,
    p_option_d text,
    p_correct_option text,
    p_explanation text,
    p_difficulty text default 'medium'
)
returns jsonb language plpgsql security definer as $$
declare
    v_question_id uuid;
begin
    -- Only admin or service role can save pool questions
    if not public.is_admin() and auth.role() != 'service_role' then
        raise exception 'Unauthorized: Admin privileges required to save game questions.';
    end if;

    -- Validate options distinct
    if p_option_a = p_option_b or p_option_a = p_option_c or p_option_a = p_option_d
       or p_option_b = p_option_c or p_option_b = p_option_d or p_option_c = p_option_d then
        raise exception 'Invalid question: All 4 options must be distinct.';
    end if;

    -- Insert or ignore duplicate
    insert into public.questions (
        game_id,
        topic_id,
        topic_category,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_option,
        explanation,
        difficulty,
        is_used
    ) values (
        p_game_id,
        p_topic_id,
        p_topic_category,
        p_question_text,
        p_option_a,
        p_option_b,
        p_option_c,
        p_option_d,
        p_correct_option,
        p_explanation,
        coalesce(p_difficulty, 'medium'),
        false
    )
    on conflict (game_id, lower(trim(question_text))) do nothing
    returning id into v_question_id;

    -- Update game_topics questions_count and status
    update public.game_topics
    set questions_count = (
        select count(*) from public.questions
        where game_id = p_game_id and (topic_id = p_topic_id or lower(trim(topic_category)) = lower(trim(p_topic_category)))
    ),
    status = case
        when (select count(*) from public.questions where game_id = p_game_id and (topic_id = p_topic_id or lower(trim(topic_category)) = lower(trim(p_topic_category)))) >= 7 then 'complete'
        else 'incomplete'
    end
    where game_id = p_game_id and topic_id = p_topic_id;

    return jsonb_build_object(
        'success', true,
        'question_id', v_question_id
    );
end;
$$;

-- 7. RPC: Check if game is ready to start (all selected topics have at least 7 questions)
create or replace function public.check_game_ready_to_start(p_game_id uuid)
returns jsonb language plpgsql security definer as $$
declare
    v_total_topics int;
    v_complete_topics int;
    v_incomplete_topics text[];
    v_details jsonb;
begin
    select count(*) into v_total_topics
    from public.game_topics
    where game_id = p_game_id;

    if v_total_topics = 0 then
        return jsonb_build_object(
            'ready', false,
            'total_topics', 0,
            'complete_topics', 0,
            'reason', 'No topics selected for this game.'
        );
    end if;

    with topic_counts as (
        select 
            gt.topic_id,
            t.name as topic_name,
            count(q.id) as question_count
        from public.game_topics gt
        join public.topics t on t.id = gt.topic_id
        left join public.questions q on q.game_id = gt.game_id 
            and (q.topic_id = gt.topic_id or lower(trim(q.topic_category)) = lower(trim(t.name)))
        where gt.game_id = p_game_id
        group by gt.topic_id, t.name
    )
    select 
        count(*) filter (where question_count >= 7),
        array_agg(topic_name) filter (where question_count < 7),
        jsonb_agg(jsonb_build_object(
            'topic_id', topic_id,
            'topic_name', topic_name,
            'question_count', question_count,
            'is_complete', (question_count >= 7)
        ))
    into v_complete_topics, v_incomplete_topics, v_details
    from topic_counts;

    return jsonb_build_object(
        'ready', (v_complete_topics = v_total_topics),
        'total_topics', v_total_topics,
        'complete_topics', v_complete_topics,
        'incomplete_topics', coalesce(v_incomplete_topics, array[]::text[]),
        'details', v_details
    );
end;
$$;

-- 8. Update create_challenge_assignment to select an unused question from pool
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
    p_difficulty text default 'medium'
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment_id uuid;
    v_question_id uuid;
    v_pool_question record;
begin
    if p_sender_id = p_receiver_id then
        raise exception 'Self-selection is not permitted.';
    end if;

    -- Insert assignment record first
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

    -- Look for an unused question in the game's pre-generated pool for this topic
    select * into v_pool_question
    from public.questions
    where game_id = p_game_id
      and (topic_id = p_topic_id or lower(trim(topic_category)) = lower(trim(p_topic_category)))
      and is_used = false
    order by random()
    limit 1
    for update skip locked;

    if found then
        -- Link and claim this pool question
        update public.questions
        set assignment_id = v_assignment_id,
            is_used = true
        where id = v_pool_question.id;
        v_question_id := v_pool_question.id;
    else
        -- Fallback: insert the passed question
        insert into public.questions (
            game_id,
            topic_id,
            assignment_id,
            topic_category,
            question_text,
            option_a,
            option_b,
            option_c,
            option_d,
            correct_option,
            explanation,
            difficulty,
            is_used
        ) values (
            p_game_id,
            p_topic_id,
            v_assignment_id,
            p_topic_category,
            p_question_text,
            p_option_a,
            p_option_b,
            p_option_c,
            p_option_d,
            p_correct_option,
            p_explanation,
            coalesce(p_difficulty, 'medium'),
            true
        ) returning id into v_question_id;
    end if;

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
            'question_id', v_question_id,
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
