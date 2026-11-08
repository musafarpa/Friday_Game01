-- ==============================================================================
-- MIGRATION: 20260103000000_seven_questions_per_challenge.sql
-- Friday Fun Game 2026: 7-Question Sequential Gameplay & Progression Architecture
-- Resolves single-question premature completion bug and ensures full multi-question support
-- ==============================================================================

-- 1. Ensure admins table compatibility (prevents is_superadmin missing column errors)
alter table public.admins add column if not exists is_superadmin boolean default true;

-- 2. Add sequence_num to public.questions for deterministic 1..7 ordering
alter table public.questions add column if not exists sequence_num int not null default 1;
create index if not exists idx_questions_assignment_seq on public.questions(assignment_id, sequence_num);

-- 3. Relax answers table constraint: drop unique(assignment_id), add unique(assignment_id, question_id)
-- This allows up to 7 distinct answers per challenge assignment while preventing duplicate submissions per question
alter table public.answers drop constraint if exists answers_assignment_id_key;
alter table public.answers drop constraint if exists answers_assignment_id_unique;
alter table public.answers drop constraint if exists unique_assignment_question;
alter table public.answers add constraint unique_assignment_question unique (assignment_id, question_id);
alter table public.answers add column if not exists question_num int not null default 1;

-- 4. Add multi-question progress tracking columns to public.assignments
alter table public.assignments add column if not exists total_questions int not null default 7;
alter table public.assignments add column if not exists answered_questions int not null default 0;
alter table public.assignments add column if not exists current_score int not null default 0;

-- 5. Drop existing create_challenge_assignment signatures to cleanly recreate
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb);

-- 6. RPC: Atomic create challenge assignment allocating 7 questions (from pool or payload)
create or replace function public.create_challenge_assignment(
    p_game_id uuid,
    p_round_id uuid,
    p_sender_id uuid,
    p_receiver_id uuid,
    p_topic_id uuid,
    p_challenge_token_hash text,
    p_topic_category text,
    p_question_text text default null,
    p_option_a text default null,
    p_option_b text default null,
    p_option_c text default null,
    p_option_d text default null,
    p_correct_option text default null,
    p_explanation text default null,
    p_difficulty text default 'medium',
    p_questions_json jsonb default null
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment_id uuid;
    v_assigned_count int := 0;
    v_q record;
    v_elem jsonb;
    v_seq int := 1;
begin
    if p_sender_id = p_receiver_id then
        raise exception 'Self-selection is not permitted.';
    end if;

    -- Insert assignment record
    insert into public.assignments (
        game_id,
        round_id,
        sender_id,
        receiver_id,
        topic_id,
        challenge_token_hash,
        status,
        total_questions,
        answered_questions,
        current_score
    ) values (
        p_game_id,
        p_round_id,
        p_sender_id,
        p_receiver_id,
        p_topic_id,
        p_challenge_token_hash,
        'pending',
        7,
        0,
        0
    ) returning id into v_assignment_id;

    -- Allocate 7 questions
    -- Method A: If questions payload provided (array of 7 questions)
    if p_questions_json is not null and jsonb_typeof(p_questions_json) = 'array' and jsonb_array_length(p_questions_json) > 0 then
        for v_elem in select * from jsonb_array_elements(p_questions_json)
        loop
            insert into public.questions (
                game_id,
                topic_id,
                assignment_id,
                sequence_num,
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
                v_seq,
                coalesce(p_topic_category, v_elem->>'topic', 'General'),
                v_elem->>'question',
                v_elem->>'option_a',
                v_elem->>'option_b',
                v_elem->>'option_c',
                v_elem->>'option_d',
                coalesce(v_elem->>'correct_option', 'A'),
                v_elem->>'explanation',
                coalesce(v_elem->>'difficulty', 'medium'),
                true
            );
            v_seq := v_seq + 1;
        end loop;
        v_assigned_count := v_seq - 1;
    else
        -- Method B: Claim up to 7 unused pool questions for this topic
        for v_q in (
            select id
            from public.questions
            where game_id = p_game_id
              and (topic_id = p_topic_id or lower(trim(topic_category)) = lower(trim(p_topic_category)))
              and (assignment_id is null or is_used = false)
            order by
              case difficulty when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end,
              random()
            limit 7
            for update skip locked
        )
        loop
            update public.questions
            set assignment_id = v_assignment_id,
                is_used = true,
                sequence_num = v_seq
            where id = v_q.id;
            v_seq := v_seq + 1;
        end loop;
        v_assigned_count := v_seq - 1;

        -- If pool had fewer than 7 questions, insert single question passed as fallback
        if v_assigned_count < 7 and p_question_text is not null then
            insert into public.questions (
                game_id,
                topic_id,
                assignment_id,
                sequence_num,
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
                v_seq,
                p_topic_category,
                p_question_text,
                p_option_a,
                p_option_b,
                p_option_c,
                p_option_d,
                coalesce(p_correct_option, 'A'),
                p_explanation,
                coalesce(p_difficulty, 'medium'),
                true
            );
            v_seq := v_seq + 1;
            v_assigned_count := v_seq - 1;
        end if;
    end if;

    -- Ensure assignment tracks the exact number of allocated questions
    update public.assignments
    set total_questions = greatest(v_assigned_count, 1)
    where id = v_assignment_id;

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
            'topic_id', p_topic_id,
            'total_questions', greatest(v_assigned_count, 1)
        )
    );

    return jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'total_questions', greatest(v_assigned_count, 1)
    );
end;
$$;

-- 7. Drop existing get_challenge_by_token signature
drop function if exists public.get_challenge_by_token(text);

-- 8. RPC: Get complete challenge payload with all 7 questions, submitted answers, and zero-leak protection
create or replace function public.get_challenge_by_token(p_token_hash text)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment record;
    v_game record;
    v_round record;
    v_sender record;
    v_receiver record;
    v_topic record;
    v_questions jsonb := '[]'::jsonb;
    v_answers jsonb := '[]'::jsonb;
    v_is_revealed boolean := false;
    v_total int := 0;
    v_answered int := 0;
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

    if v_round.status in ('revealed', 'closed') or v_game.status = 'completed' then
        v_is_revealed := true;
    end if;

    -- Fetch all questions for this assignment ordered by sequence_num
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'sequence_num', coalesce(q.sequence_num, 1),
            'topic_category', q.topic_category,
            'question_text', q.question_text,
            'option_a', q.option_a,
            'option_b', q.option_b,
            'option_c', q.option_c,
            'option_d', q.option_d,
            'difficulty', q.difficulty,
            -- STRICT ZERO-LEAK SECURITY: never reveal correct_option or explanation before round reveal
            'correct_option', case when v_is_revealed then q.correct_option else null end,
            'explanation', case when v_is_revealed then q.explanation else null end
        ) order by coalesce(q.sequence_num, 1) asc, q.created_at asc
    ), '[]'::jsonb) into v_questions
    from public.questions q
    where q.assignment_id = v_assignment.id;

    -- Fetch all submitted answers for this assignment
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'question_id', a.question_id,
            'question_num', coalesce(a.question_num, 1),
            'selected_option', a.selected_option,
            'is_correct', case when v_is_revealed then a.is_correct else null end,
            'submitted_at', a.submitted_at
        ) order by coalesce(a.question_num, 1) asc, a.submitted_at asc
    ), '[]'::jsonb) into v_answers
    from public.answers a
    where a.assignment_id = v_assignment.id;

    v_total := coalesce(jsonb_array_length(v_questions), 0);
    v_answered := coalesce(jsonb_array_length(v_answers), 0);

    return jsonb_build_object(
        'assignment', jsonb_build_object(
            'id', v_assignment.id,
            'game_id', v_assignment.game_id,
            'round_id', v_assignment.round_id,
            'sender_id', v_assignment.sender_id,
            'receiver_id', v_assignment.receiver_id,
            'topic_id', v_assignment.topic_id,
            'status', v_assignment.status,
            'total_questions', coalesce(v_assignment.total_questions, v_total, 7),
            'answered_questions', v_answered,
            'current_score', coalesce(v_assignment.current_score, 0),
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
        'questions', v_questions,
        'question', case when v_total > 0 then v_questions->0 else null end,
        'answers', v_answers,
        'user_answer', case when v_answered > 0 then v_answers->0 else null end,
        'progress', jsonb_build_object(
            'total', coalesce(v_assignment.total_questions, v_total, 7),
            'answered', v_answered,
            'is_completed', (v_assignment.status = 'submitted' or (v_total > 0 and v_answered >= v_total)),
            'current_score', coalesce(v_assignment.current_score, 0)
        )
    );
end;
$$;

-- 9. Drop existing submit_challenge_answer signatures
drop function if exists public.submit_challenge_answer(text, text);
drop function if exists public.submit_challenge_answer(text, text, uuid);

-- 10. RPC: Submit answer for a specific question, accumulating score and marking complete only at Question 7
create or replace function public.submit_challenge_answer(
    p_token_hash text,
    p_selected_option text,
    p_question_id uuid default null
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
    v_current_answered int := 0;
    v_total_questions int := 0;
    v_next_num int := 1;
    v_is_completed boolean := false;
    v_target_q_id uuid := p_question_id;
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

    -- 4. Check if whole challenge is already completed
    if v_assignment.status = 'submitted' then
        raise exception 'This challenge has already been completed.';
    end if;

    -- 5. Determine which question is being answered
    if v_target_q_id is not null then
        select * into v_question from public.questions where id = v_target_q_id and assignment_id = v_assignment.id;
        if not found then
            raise exception 'Question does not belong to this challenge.';
        end if;

        -- Check if this specific question has already been answered
        select * into v_existing_answer from public.answers where assignment_id = v_assignment.id and question_id = v_target_q_id;
        if found then
            raise exception 'An answer has already been submitted for this question.';
        end if;
    else
        -- Legacy mode: if no question_id passed, answer first unanswered question in order
        select q.* into v_question
        from public.questions q
        left join public.answers a on a.question_id = q.id and a.assignment_id = v_assignment.id
        where q.assignment_id = v_assignment.id and a.id is null
        order by coalesce(q.sequence_num, 1) asc, q.created_at asc
        limit 1;

        if not found then
            raise exception 'An answer has already been submitted for this challenge.';
        end if;
        v_target_q_id := v_question.id;
    end if;

    -- 6. Verify correctness
    v_is_correct := (v_question.correct_option = p_selected_option);

    -- 7. Game settings for points
    select * into v_game from public.games where id = v_assignment.game_id;
    v_points_correct := coalesce((v_game.settings->>'points_correct')::int, 10);
    v_points_wrong := coalesce((v_game.settings->>'points_wrong')::int, 0);
    v_points_to_award := case when v_is_correct then v_points_correct else v_points_wrong end;

    -- 8. Calculate question number & insert answer
    select count(*) into v_current_answered from public.answers where assignment_id = v_assignment.id;
    v_next_num := coalesce(v_question.sequence_num, v_current_answered + 1);

    insert into public.answers (
        assignment_id,
        question_id,
        participant_id,
        selected_option,
        is_correct,
        question_num,
        submitted_at
    ) values (
        v_assignment.id,
        v_target_q_id,
        v_assignment.receiver_id,
        p_selected_option,
        v_is_correct,
        v_next_num,
        now()
    );

    -- 9. Check progress against total questions
    select count(*) into v_total_questions from public.questions where assignment_id = v_assignment.id;
    if v_total_questions = 0 then
        v_total_questions := coalesce(v_assignment.total_questions, 7);
    end if;

    v_current_answered := v_current_answered + 1;
    v_is_completed := (v_current_answered >= v_total_questions);

    -- 10. Update assignment progress and score
    update public.assignments
    set answered_questions = v_current_answered,
        total_questions = v_total_questions,
        current_score = coalesce(current_score, 0) + v_points_to_award,
        status = case when v_is_completed then 'submitted' else 'opened' end
    where id = v_assignment.id;

    -- 11. Update scores table for this participant in this round
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

    -- 12. If challenge completed, check if all assignments in round submitted
    if v_is_completed then
        if not exists (
            select 1 from public.assignments
            where round_id = v_assignment.round_id and status != 'submitted'
        ) then
            insert into public.game_events (game_id, event_type, metadata)
            values (
                v_assignment.game_id,
                'all_answers_submitted',
                jsonb_build_object('round_id', v_assignment.round_id)
            );
        end if;
    end if;

    return jsonb_build_object(
        'success', true,
        'question_id', v_target_q_id,
        'question_num', v_next_num,
        'total_questions', v_total_questions,
        'answered_count', v_current_answered,
        'is_completed', v_is_completed,
        'current_score', coalesce(v_assignment.current_score, 0) + v_points_to_award
    );
end;
$$;

