-- ==============================================================================
-- MIGRATION 20260104000000_security_lifecycle_hardening.sql
-- Friday Fun Game 2026 - Security, lifecycle and gameplay hardening
--
-- WHAT THIS CHANGES (see docs/qa/00_BUG_LIST_AND_ROOT_CAUSES.md for the why):
--   * Correct answers no longer live in games.settings (publicly readable) - the
--     pool is moved to public.questions (admin-only) and scrubbed from settings.
--   * participants / assignments / questions / answers / scores / game_events are
--     admin-only tables. Participants talk to the database ONLY through token
--     RPCs. Tokens are verified server-side (raw token -> sha256) so a hash read
--     from a table is useless.
--   * Challenges are created server-side: server picks 3 easy + 3 medium + 1 hard
--     questions from the game's pool, generates the token, and enforces game state.
--   * Scores are recomputed server-side from answers (never client supplied).
--   * Game lifecycle RPCs enforce valid transitions (+ a trigger as a 2nd guard).
--   * Delete/cleanup protect active games; topic/participant deletes can no longer
--     cascade into live game data.
--
-- SAFE TO RE-RUN: statements are idempotent where possible.
-- NOTE: the old hash-based RPCs are DROPPED on purpose (they are the exploit).
--       Deploy the matching frontend build right after applying this migration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- A. SCHEMA CHANGES
-- ------------------------------------------------------------------------------

-- A1. Game statuses: add 'paused' (waiting_for_answers kept only for legacy rows)
do $$
declare c record;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'public.games'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%status%'
    loop
        execute format('alter table public.games drop constraint %I', c.conname);
    end loop;
end $$;

update public.games set status = 'paused' where status = 'waiting_for_answers';

alter table public.games add constraint games_status_check check (
    status in ('draft','registration_open','ready','active','paused','waiting_for_answers','completed','cancelled')
);

-- A2. Questions: per-challenge copies reference their pool template
alter table public.questions
    add column if not exists source_question_id uuid references public.questions(id) on delete set null;
create index if not exists idx_questions_source on public.questions(source_question_id);

-- The old index forbade the same text twice per game (pool AND copies). Scope it to pool rows.
drop index if exists public.unique_game_question_text;
create unique index if not exists unique_game_pool_question_text
    on public.questions (game_id, lower(btrim(question_text))) where assignment_id is null;
create unique index if not exists unique_assignment_question_text
    on public.questions (assignment_id, lower(btrim(question_text))) where assignment_id is not null;
create unique index if not exists unique_assignment_sequence
    on public.questions (assignment_id, sequence_num) where assignment_id is not null;

-- Valid-question guard for NEW rows (existing rows are not re-validated)
alter table public.questions drop constraint if exists questions_options_distinct;
alter table public.questions add constraint questions_options_distinct check (
    lower(btrim(option_a)) <> lower(btrim(option_b)) and
    lower(btrim(option_a)) <> lower(btrim(option_c)) and
    lower(btrim(option_a)) <> lower(btrim(option_d)) and
    lower(btrim(option_b)) <> lower(btrim(option_c)) and
    lower(btrim(option_b)) <> lower(btrim(option_d)) and
    lower(btrim(option_c)) <> lower(btrim(option_d))
) not valid;

-- A3. Move the question pool out of games.settings (it contained correct answers)
do $$
declare
    g record;
    entry record;
    q jsonb;
begin
    for g in select id, settings from public.games
             where jsonb_typeof(settings -> 'topics_question_pool') = 'object'
    loop
        for entry in select key, value from jsonb_each(g.settings -> 'topics_question_pool')
        loop
            if entry.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and exists (select 1 from public.topics t where t.id = entry.key::uuid) then
                for q in select * from jsonb_array_elements(coalesce(entry.value -> 'questions', '[]'::jsonb))
                loop
                    begin
                        insert into public.questions (
                            game_id, topic_id, topic_category, question_text,
                            option_a, option_b, option_c, option_d,
                            correct_option, explanation, difficulty, is_used
                        ) values (
                            g.id, entry.key::uuid,
                            coalesce(q ->> 'topic_category', entry.value ->> 'topic_name', 'General'),
                            q ->> 'question_text',
                            q ->> 'option_a', q ->> 'option_b', q ->> 'option_c', q ->> 'option_d',
                            q ->> 'correct_option', q ->> 'explanation',
                            coalesce(q ->> 'difficulty', 'medium'), false
                        ) on conflict do nothing;
                    exception when others then
                        null; -- skip malformed legacy rows
                    end;
                end loop;
            end if;
        end loop;
        update public.games set settings = settings - 'topics_question_pool' where id = g.id;
    end loop;
end $$;

-- A4. Topic references must never cascade into live game data
alter table public.assignments drop constraint if exists assignments_topic_id_fkey;
alter table public.assignments add constraint assignments_topic_id_fkey
    foreign key (topic_id) references public.topics(id) on delete restrict;
alter table public.game_topics drop constraint if exists game_topics_topic_id_fkey;
alter table public.game_topics add constraint game_topics_topic_id_fkey
    foreign key (topic_id) references public.topics(id) on delete restrict;
alter table public.questions drop constraint if exists questions_topic_id_fkey;
alter table public.questions add constraint questions_topic_id_fkey
    foreign key (topic_id) references public.topics(id) on delete restrict;

-- A5. One outgoing challenge per sender per round; case-insensitive uniqueness
create unique index if not exists unique_sender_per_round on public.assignments (round_id, sender_id);
create unique index if not exists unique_participant_name_ci on public.participants (game_id, lower(btrim(display_name)));
create unique index if not exists unique_participant_code_ci on public.participants (game_id, upper(btrim(player_code)));

-- A6. Admin-only secret stores so the admin can always re-copy working links.
create table if not exists public.participant_secrets (
    participant_id uuid primary key references public.participants(id) on delete cascade,
    raw_token text not null,
    created_at timestamptz not null default now()
);
create table if not exists public.assignment_secrets (
    assignment_id uuid primary key references public.assignments(id) on delete cascade,
    raw_token text not null,
    created_at timestamptz not null default now()
);

-- A7. Global default game rules (applied to NEW games only)
create table if not exists public.app_settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid
);
insert into public.app_settings (key, value)
values ('default_game_rules', '{"min_participants":3,"max_participants":30,"points_correct":10,"points_wrong":0}'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------------------------------------
-- B. INTERNAL HELPERS (not callable by API roles)
-- ------------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public._assert_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
    if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
        raise exception 'Unauthorized: administrator access required.' using errcode = '42501';
    end if;
end;
$$;

create or replace function public._hash_token(p_token text)
returns text language sql immutable set search_path = public as $$
    select encode(sha256(convert_to(btrim(coalesce(p_token, '')), 'UTF8')), 'hex');
$$;

create or replace function public._new_token()
returns text language sql volatile set search_path = public as $$
    select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public._log_event(p_game_id uuid, p_actor uuid, p_type text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
    insert into public.game_events (game_id, actor_id, event_type, metadata)
    values (p_game_id, p_actor, p_type, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function public._touch_game(p_game_id uuid)
returns void language sql security definer set search_path = public as $$
    update public.games set updated_at = now() where id = p_game_id;
$$;

-- Normalises + validates the editable rule set. Raises friendly errors.
create or replace function public._validate_rules(p_in jsonb, p_base jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
    v jsonb := coalesce(p_base, '{}'::jsonb) || coalesce(p_in, '{}'::jsonb);
    v_min int; v_max int; v_pc int; v_pw int;
begin
    begin v_min := coalesce((v ->> 'min_participants')::int, 3);
    exception when others then raise exception 'Minimum participants must be a whole number.'; end;
    begin v_max := coalesce((v ->> 'max_participants')::int, 30);
    exception when others then raise exception 'Maximum participants must be a whole number.'; end;
    begin v_pc := coalesce((v ->> 'points_correct')::int, 10);
    exception when others then raise exception 'Points per correct answer must be a whole number.'; end;
    begin v_pw := coalesce((v ->> 'points_wrong')::int, 0);
    exception when others then raise exception 'Points per wrong answer must be a whole number.'; end;

    if v_min < 2 or v_min > 100 then raise exception 'Minimum participants must be between 2 and 100.'; end if;
    if v_max < v_min then raise exception 'Maximum participants cannot be less than minimum participants.'; end if;
    if v_max > 100 then raise exception 'Maximum participants cannot exceed 100.'; end if;
    if v_pc < 1 or v_pc > 100 then raise exception 'Points per correct answer must be between 1 and 100.'; end if;
    if v_pw > 0 or v_pw < -100 then raise exception 'Points per wrong answer must be between -100 and 0.'; end if;

    return coalesce(p_base, '{}'::jsonb) || jsonb_build_object(
        'min_participants', v_min,
        'max_participants', v_max,
        'points_correct', v_pc,
        'points_wrong', v_pw,
        'questions_per_challenge', 7,
        'min_questions_per_topic', 7,
        'difficulty_mix', jsonb_build_object('easy', 3, 'medium', 3, 'hard', 1),
        'reveal_mode', 'on_game_complete',
        'allow_multiple_incoming', true
    );
end;
$$;

-- Pool readiness per topic. Valid set = >=7 questions with >=3 easy, >=3 medium, >=1 hard.
create or replace function public._pool_status(p_game_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    with t as (
        select gt.topic_id, tp.name as topic_name,
               count(q.id) as total,
               count(q.id) filter (where q.difficulty = 'easy') as easy,
               count(q.id) filter (where q.difficulty = 'medium') as medium,
               count(q.id) filter (where q.difficulty = 'hard') as hard
        from public.game_topics gt
        join public.topics tp on tp.id = gt.topic_id
        left join public.questions q
               on q.game_id = gt.game_id and q.topic_id = gt.topic_id and q.assignment_id is null
        where gt.game_id = p_game_id
        group by gt.topic_id, tp.name
    )
    select jsonb_build_object(
        'required_per_topic', 7,
        'ready', coalesce(bool_and(total >= 7 and easy >= 3 and medium >= 3 and hard >= 1), false),
        'topics', coalesce(jsonb_agg(jsonb_build_object(
            'topic_id', topic_id, 'topic_name', topic_name,
            'total', total, 'easy', easy, 'medium', medium, 'hard', hard,
            'is_complete', (total >= 7 and easy >= 3 and medium >= 3 and hard >= 1)
        ) order by topic_name), '[]'::jsonb)
    ) from t;
$$;

-- Rebuilds the scores table for a game from the answers (source of truth).
create or replace function public._recompute_scores(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_round uuid;
    v_pc int; v_pw int;
begin
    perform pg_advisory_xact_lock(hashtext('scores:' || p_game_id::text));
    select * into g from public.games where id = p_game_id;
    if not found then return; end if;
    select id into v_round from public.game_rounds where game_id = p_game_id order by round_number desc limit 1;
    if v_round is null then return; end if;
    v_pc := coalesce((g.settings ->> 'points_correct')::int, 10);
    v_pw := coalesce((g.settings ->> 'points_wrong')::int, 0);

    insert into public.scores (game_id, round_id, participant_id, correct_answers, wrong_answers, total_points, updated_at)
    select p_game_id, v_round, p.id,
           count(ans.id) filter (where ans.is_correct),
           count(ans.id) filter (where ans.is_correct = false),
           coalesce(count(ans.id) filter (where ans.is_correct), 0) * v_pc
             + coalesce(count(ans.id) filter (where ans.is_correct = false), 0) * v_pw,
           now()
    from public.participants p
    left join public.assignments a on a.receiver_id = p.id and a.game_id = p_game_id
    left join public.answers ans on ans.assignment_id = a.id
    where p.game_id = p_game_id
    group by p.id
    on conflict (game_id, round_id, participant_id) do update
        set correct_answers = excluded.correct_answers,
            wrong_answers = excluded.wrong_answers,
            total_points = excluded.total_points,
            updated_at = now();
end;
$$;

-- joined -> selected -> completed (selected AND has incoming AND all incoming submitted)
create or replace function public._refresh_participant_status(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    v_out int; v_in int; v_in_done int;
    v_new text;
begin
    select * into p from public.participants where id = p_id;
    if not found then return; end if;
    select count(*) into v_out from public.assignments where sender_id = p_id;
    select count(*), count(*) filter (where status = 'submitted') into v_in, v_in_done
        from public.assignments where receiver_id = p_id;
    if v_out > 0 and v_in > 0 and v_in = v_in_done then v_new := 'completed';
    elsif v_out > 0 then v_new := 'selected';
    elsif p.status = 'pending' then v_new := 'pending';
    else v_new := 'joined';
    end if;
    if v_new is distinct from p.status then
        update public.participants set status = v_new where id = p_id;
    end if;
end;
$$;

-- ------------------------------------------------------------------------------
-- C. GAME LIFECYCLE GUARD (second line of defence for direct table updates)
-- ------------------------------------------------------------------------------
create or replace function public._guard_game_status()
returns trigger language plpgsql set search_path = public as $$
begin
    new.updated_at := now();
    if new.status is distinct from old.status then
        if not (
            (old.status = 'draft'               and new.status in ('registration_open','ready','active','cancelled')) or
            (old.status = 'registration_open'   and new.status in ('ready','active','cancelled')) or
            (old.status = 'ready'               and new.status in ('active','cancelled')) or
            (old.status = 'active'              and new.status in ('paused','completed','cancelled')) or
            (old.status = 'paused'              and new.status in ('active','completed','cancelled')) or
            (old.status = 'waiting_for_answers' and new.status in ('active','paused','completed','cancelled'))
        ) then
            raise exception 'Invalid game status change: % -> %.', old.status, new.status;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_guard_game_status on public.games;
create trigger trg_guard_game_status before update on public.games
    for each row execute function public._guard_game_status();

-- ------------------------------------------------------------------------------
-- D. ADMIN RPCs
-- ------------------------------------------------------------------------------

create or replace function public.admin_create_game(
    p_name text,
    p_description text,
    p_settings jsonb,
    p_topic_ids uuid[],
    p_initial_status text default 'registration_open'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_name text := btrim(coalesce(p_name, ''));
    v_defaults jsonb;
    v_settings jsonb;
    v_game_id uuid;
    v_topics uuid[];
    v_bad int;
begin
    perform public._assert_admin();
    if char_length(v_name) < 1 then raise exception 'Game name cannot be empty.'; end if;
    if char_length(v_name) > 80 then raise exception 'Game name must be 80 characters or fewer.'; end if;
    if p_initial_status not in ('draft', 'registration_open') then
        raise exception 'A new game can only start as Draft or Registration Open. Use "Start Game" to begin play.';
    end if;
    if exists (select 1 from public.games
               where lower(btrim(name)) = lower(v_name) and status not in ('completed','cancelled')) then
        raise exception 'An open game named "%" already exists.', v_name;
    end if;

    select array(select distinct x from unnest(coalesce(p_topic_ids, '{}'::uuid[])) x) into v_topics;
    if coalesce(array_length(v_topics, 1), 0) = 0 then
        raise exception 'Select at least 1 topic for this game.';
    end if;
    select count(*) into v_bad from unnest(v_topics) tid
        where not exists (select 1 from public.topics t where t.id = tid and t.is_active);
    if v_bad > 0 then raise exception 'One or more selected topics do not exist or are disabled.'; end if;

    select coalesce((select value from public.app_settings where key = 'default_game_rules'), '{}'::jsonb) into v_defaults;
    v_settings := public._validate_rules(coalesce(p_settings, '{}'::jsonb), v_defaults);

    insert into public.games (name, description, game_date, status, settings, created_by)
    values (v_name, left(btrim(coalesce(p_description, '')), 300), current_date, p_initial_status, v_settings, auth.uid())
    returning id into v_game_id;

    insert into public.game_topics (game_id, topic_id) select v_game_id, unnest(v_topics);
    insert into public.game_rounds (game_id, round_number, status) values (v_game_id, 1, 'active');
    perform public._log_event(v_game_id, auth.uid(), 'game_created', jsonb_build_object('topics', v_topics));

    return jsonb_build_object('game_id', v_game_id, 'status', p_initial_status);
end;
$$;

create or replace function public.admin_update_game(
    p_game_id uuid, p_name text, p_description text, p_settings jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_name text := btrim(coalesce(p_name, ''));
    v_new jsonb;
    v_count int;
begin
    perform public._assert_admin();
    select * into g from public.games where id = p_game_id for update;
    if not found then raise exception 'Game not found.'; end if;
    if g.status in ('completed', 'cancelled') then
        raise exception 'A % game can no longer be edited.', g.status;
    end if;
    if char_length(v_name) < 1 then raise exception 'Game name cannot be empty.'; end if;
    if char_length(v_name) > 80 then raise exception 'Game name must be 80 characters or fewer.'; end if;
    if exists (select 1 from public.games where id <> p_game_id and lower(btrim(name)) = lower(v_name)
               and status not in ('completed','cancelled')) then
        raise exception 'Another open game is already named "%".', v_name;
    end if;

    v_new := g.settings;
    if p_settings is not null and p_settings <> '{}'::jsonb then
        if g.status in ('active', 'paused') then
            raise exception 'Rules are locked once the game has started. Only the name and description can be edited.';
        end if;
        v_new := public._validate_rules(p_settings, g.settings);
        select count(*) into v_count from public.participants where game_id = p_game_id;
        if (v_new ->> 'max_participants')::int < v_count then
            raise exception 'Maximum participants (%) is lower than the % participants already added.',
                (v_new ->> 'max_participants')::int, v_count;
        end if;
    end if;

    update public.games
       set name = v_name, description = left(btrim(coalesce(p_description, '')), 300), settings = v_new
     where id = p_game_id;
    perform public._log_event(p_game_id, auth.uid(), 'game_updated', '{}'::jsonb);
    return jsonb_build_object('game_id', p_game_id);
end;
$$;

create or replace function public.admin_set_game_status(p_game_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_new text;
    v_count int;
    v_min int; v_max int;
    v_errors text[] := '{}';
    v_pool jsonb;
    v_bad text;
begin
    perform public._assert_admin();
    select * into g from public.games where id = p_game_id for update;
    if not found then raise exception 'Game not found.'; end if;

    if p_action = 'open_registration' then
        if g.status <> 'draft' then
            raise exception 'Only a draft game can open registration (current status: %).', g.status;
        end if;
        v_new := 'registration_open';

    elsif p_action = 'start' then
        if g.status not in ('draft', 'registration_open', 'ready') then
            raise exception '%', case g.status
                when 'active' then 'This game is already in progress.'
                when 'paused' then 'This game is paused. Use Resume to continue it.'
                when 'waiting_for_answers' then 'This game is paused. Use Resume to continue it.'
                else format('A %s game cannot be restarted.', g.status) end;
        end if;
        v_min := greatest(coalesce((g.settings ->> 'min_participants')::int, 2), 2);
        v_max := coalesce((g.settings ->> 'max_participants')::int, 100);
        select count(*) into v_count from public.participants where game_id = p_game_id;
        if v_count < v_min then
            v_errors := v_errors || format('At least %s participants are required but only %s added.', v_min, v_count);
        end if;
        if v_count > v_max then
            v_errors := v_errors || format('There are %s participants but the maximum is %s.', v_count, v_max);
        end if;
        if not exists (select 1 from public.game_topics where game_id = p_game_id) then
            v_errors := v_errors || 'No topics are selected for this game.';
        else
            v_pool := public._pool_status(p_game_id);
            select string_agg(format('%s (%s questions: %s easy / %s medium / %s hard)',
                       t ->> 'topic_name', t ->> 'total', t ->> 'easy', t ->> 'medium', t ->> 'hard'), '; ')
              into v_bad
              from jsonb_array_elements(v_pool -> 'topics') t
             where not (t ->> 'is_complete')::boolean;
            if v_bad is not null then
                v_errors := v_errors || ('Every topic needs at least 7 valid questions (3 easy, 3 medium, 1 hard). Incomplete: ' || v_bad || '.');
            end if;
        end if;
        if array_length(v_errors, 1) > 0 then
            raise exception 'Cannot start game: %', array_to_string(v_errors, ' ');
        end if;
        v_new := 'active';

    elsif p_action = 'pause' then
        if g.status <> 'active' then raise exception 'Only an active game can be paused (current status: %).', g.status; end if;
        v_new := 'paused';

    elsif p_action = 'resume' then
        if g.status <> 'paused' then raise exception 'Only a paused game can be resumed (current status: %).', g.status; end if;
        v_new := 'active';

    elsif p_action = 'complete' then
        if g.status not in ('active', 'paused', 'waiting_for_answers') then
            raise exception 'Only a game that is in progress can be completed (current status: %).', replace(g.status, '_', ' ');
        end if;
        v_new := 'completed';

    elsif p_action = 'cancel' then
        if g.status in ('completed', 'cancelled') then
            raise exception 'This game is already %.', g.status;
        end if;
        v_new := 'cancelled';

    else
        raise exception 'Unknown game action "%".', p_action;
    end if;

    update public.games set status = v_new where id = p_game_id;

    if v_new = 'completed' then
        update public.game_rounds set status = 'revealed', reveal_at = now() where game_id = p_game_id;
        perform public._recompute_scores(p_game_id);
        update public.participants p set status = 'completed'
         where p.game_id = p_game_id
           and exists (select 1 from public.assignments a where a.receiver_id = p.id and a.status = 'submitted');
    elsif v_new = 'cancelled' then
        update public.game_rounds set status = 'closed' where game_id = p_game_id and status = 'active';
    end if;

    perform public._log_event(p_game_id, auth.uid(), 'game_' || p_action,
        jsonb_build_object('from', g.status, 'to', v_new));
    return jsonb_build_object('game_id', p_game_id, 'previous_status', g.status, 'status', v_new);
end;
$$;

create or replace function public.admin_delete_game(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_parts int; v_assign int; v_answers int;
begin
    perform public._assert_admin();
    select * into g from public.games where id = p_game_id for update;
    if not found then raise exception 'Game not found.'; end if;
    if g.status in ('active', 'paused', 'waiting_for_answers') then
        raise exception 'Game "%" is in progress. Cancel or complete it before deleting.', g.name;
    end if;
    select count(*) into v_parts from public.participants where game_id = p_game_id;
    select count(*) into v_assign from public.assignments where game_id = p_game_id;
    select count(*) into v_answers from public.answers an join public.assignments a on a.id = an.assignment_id
        where a.game_id = p_game_id;
    delete from public.games where id = p_game_id;
    return jsonb_build_object('deleted_game_id', p_game_id, 'name', g.name, 'status', g.status,
        'participants_removed', v_parts, 'challenges_removed', v_assign, 'answers_removed', v_answers);
end;
$$;

-- Retention cleanup: only COMPLETED or CANCELLED games older than the retention window.
drop function if exists public.cleanup_completed_games();
create or replace function public.cleanup_completed_games(p_retention_hours int default 24)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_names jsonb;
    v_count int;
begin
    perform public._assert_admin();
    if p_retention_hours is null or p_retention_hours < 1 then
        raise exception 'Retention must be at least 1 hour.';
    end if;
    with deleted as (
        delete from public.games
         where status in ('completed', 'cancelled')
           and updated_at < now() - make_interval(hours => p_retention_hours)
        returning name, status
    )
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'status', status)), '[]'::jsonb), count(*)
      into v_names, v_count from deleted;
    return jsonb_build_object('cleaned_count', v_count, 'games', v_names, 'retention_hours', p_retention_hours);
end;
$$;

-- Participants -----------------------------------------------------------------
create or replace function public.admin_add_participant(
    p_game_id uuid, p_display_name text, p_player_code text, p_contact text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_name text := btrim(coalesce(p_display_name, ''));
    v_code text := upper(btrim(coalesce(p_player_code, '')));
    v_max int; v_count int;
    v_token text; v_id uuid;
begin
    perform public._assert_admin();
    select * into g from public.games where id = p_game_id for update;
    if not found then raise exception 'Game not found.'; end if;
    if g.status in ('completed', 'cancelled') then
        raise exception 'Cannot add participants to a % game.', g.status;
    end if;
    if char_length(v_name) < 1 then raise exception 'Participant name cannot be empty.'; end if;
    if char_length(v_name) > 40 then raise exception 'Participant name must be 40 characters or fewer.'; end if;
    if v_name ~ '[[:cntrl:]]' then raise exception 'Participant name contains invalid characters.'; end if;
    if v_code !~ '^[A-Z0-9]{1,4}$' then
        raise exception 'Player code must be 1-4 letters or digits (e.g. A, B, C or P12).';
    end if;
    v_max := coalesce((g.settings ->> 'max_participants')::int, 30);
    select count(*) into v_count from public.participants where game_id = p_game_id;
    if v_count >= v_max then
        raise exception 'This game already has the maximum of % participants.', v_max;
    end if;
    if exists (select 1 from public.participants where game_id = p_game_id and lower(btrim(display_name)) = lower(v_name)) then
        raise exception 'A participant named "%" already exists in this game.', v_name;
    end if;
    if exists (select 1 from public.participants where game_id = p_game_id and upper(btrim(player_code)) = v_code) then
        raise exception 'Player code "%" is already taken in this game.', v_code;
    end if;

    v_token := public._new_token();
    insert into public.participants (game_id, display_name, player_code, email_or_contact, invitation_token_hash, status)
    values (p_game_id, v_name, v_code, nullif(left(btrim(coalesce(p_contact, '')), 100), ''), public._hash_token(v_token), 'pending')
    returning id into v_id;
    insert into public.participant_secrets (participant_id, raw_token) values (v_id, v_token);
    perform public._log_event(p_game_id, auth.uid(), 'participant_added', jsonb_build_object('participant_id', v_id));

    return jsonb_build_object('participant_id', v_id, 'display_name', v_name, 'player_code', v_code, 'raw_token', v_token);
end;
$$;

create or replace function public.admin_update_participant(
    p_participant_id uuid, p_display_name text, p_player_code text, p_contact text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    g public.games;
    v_name text := btrim(coalesce(p_display_name, ''));
    v_code text := upper(btrim(coalesce(p_player_code, '')));
begin
    perform public._assert_admin();
    select * into p from public.participants where id = p_participant_id for update;
    if not found then raise exception 'Participant not found.'; end if;
    select * into g from public.games where id = p.game_id;
    if g.status in ('completed', 'cancelled') then
        raise exception 'Participants of a % game can no longer be edited.', g.status;
    end if;
    if char_length(v_name) < 1 then raise exception 'Participant name cannot be empty.'; end if;
    if char_length(v_name) > 40 then raise exception 'Participant name must be 40 characters or fewer.'; end if;
    if v_name ~ '[[:cntrl:]]' then raise exception 'Participant name contains invalid characters.'; end if;
    if v_code !~ '^[A-Z0-9]{1,4}$' then
        raise exception 'Player code must be 1-4 letters or digits (e.g. A, B, C or P12).';
    end if;
    if exists (select 1 from public.participants where game_id = p.game_id and id <> p.id and lower(btrim(display_name)) = lower(v_name)) then
        raise exception 'A participant named "%" already exists in this game.', v_name;
    end if;
    if exists (select 1 from public.participants where game_id = p.game_id and id <> p.id and upper(btrim(player_code)) = v_code) then
        raise exception 'Player code "%" is already taken in this game.', v_code;
    end if;
    update public.participants
       set display_name = v_name, player_code = v_code,
           email_or_contact = nullif(left(btrim(coalesce(p_contact, '')), 100), '')
     where id = p.id;
    return jsonb_build_object('participant_id', p.id, 'display_name', v_name, 'player_code', v_code);
end;
$$;

create or replace function public.admin_remove_participant(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    v_n int;
begin
    perform public._assert_admin();
    select * into p from public.participants where id = p_participant_id for update;
    if not found then raise exception 'Participant not found.'; end if;
    select count(*) into v_n from public.assignments where sender_id = p.id or receiver_id = p.id;
    if v_n > 0 then
        raise exception '% is part of % challenge(s). Removing them would delete other players'' challenges, answers and scores. Cancel the game instead.',
            p.display_name, v_n;
    end if;
    delete from public.participants where id = p.id;
    perform public._log_event(p.game_id, auth.uid(), 'participant_removed', jsonb_build_object('display_name', p.display_name));
    return jsonb_build_object('removed_id', p.id, 'display_name', p.display_name);
end;
$$;

-- Issues a fresh invitation token and permanently revokes the previous one.
create or replace function public.admin_regenerate_invitation(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    g public.games;
    v_token text;
begin
    perform public._assert_admin();
    select * into p from public.participants where id = p_participant_id for update;
    if not found then raise exception 'Participant not found.'; end if;
    select * into g from public.games where id = p.game_id;
    if g.status in ('completed', 'cancelled') then
        raise exception 'Invitations of a % game cannot be regenerated.', g.status;
    end if;
    v_token := public._new_token();
    update public.participants set invitation_token_hash = public._hash_token(v_token) where id = p.id;
    insert into public.participant_secrets (participant_id, raw_token) values (p.id, v_token)
        on conflict (participant_id) do update set raw_token = excluded.raw_token, created_at = now();
    perform public._log_event(p.game_id, auth.uid(), 'invitation_regenerated', jsonb_build_object('participant_id', p.id));
    return jsonb_build_object('participant_id', p.id, 'raw_token', v_token);
end;
$$;

-- Question pool ----------------------------------------------------------------
create or replace function public.admin_pool_status(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public._assert_admin();
    return public._pool_status(p_game_id);
end;
$$;

create or replace function public.admin_save_pool_questions(p_game_id uuid, p_topic_id uuid, p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    g public.games;
    v_topic public.topics;
    q jsonb;
    v_text text; v_a text; v_b text; v_c text; v_d text; v_correct text; v_diff text;
    v_inserted int := 0; v_dups int := 0;
    v_rejected jsonb := '[]'::jsonb;
    v_reason text;
begin
    perform public._assert_admin();
    select * into g from public.games where id = p_game_id for update;
    if not found then raise exception 'Game not found.'; end if;
    if g.status in ('completed', 'cancelled') then raise exception 'Cannot change questions of a % game.', g.status; end if;
    select * into v_topic from public.topics where id = p_topic_id;
    if not found then raise exception 'Topic not found.'; end if;
    if not exists (select 1 from public.game_topics where game_id = p_game_id and topic_id = p_topic_id) then
        raise exception 'Topic "%" is not part of this game.', v_topic.name;
    end if;
    if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
        raise exception 'Questions must be a JSON array.';
    end if;

    for q in select * from jsonb_array_elements(p_questions)
    loop
        v_text := btrim(coalesce(q ->> 'question_text', ''));
        v_a := btrim(coalesce(q ->> 'option_a', ''));
        v_b := btrim(coalesce(q ->> 'option_b', ''));
        v_c := btrim(coalesce(q ->> 'option_c', ''));
        v_d := btrim(coalesce(q ->> 'option_d', ''));
        v_correct := upper(coalesce(q ->> 'correct_option', ''));
        v_diff := lower(coalesce(q ->> 'difficulty', 'medium'));
        v_reason := null;

        if char_length(v_text) < 10 or char_length(v_text) > 500 then v_reason := 'question text must be 10-500 characters';
        elsif least(char_length(v_a), char_length(v_b), char_length(v_c), char_length(v_d)) < 1
              or greatest(char_length(v_a), char_length(v_b), char_length(v_c), char_length(v_d)) > 200
            then v_reason := 'all four options are required (max 200 characters)';
        elsif lower(v_a) in (lower(v_b), lower(v_c), lower(v_d)) or lower(v_b) in (lower(v_c), lower(v_d)) or lower(v_c) = lower(v_d)
            then v_reason := 'options must be four distinct answers';
        elsif v_correct not in ('A', 'B', 'C', 'D') then v_reason := 'correct_option must be A, B, C or D';
        elsif v_diff not in ('easy', 'medium', 'hard') then v_reason := 'difficulty must be easy, medium or hard';
        end if;

        if v_reason is not null then
            v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('question', left(v_text, 80), 'reason', v_reason));
            continue;
        end if;

        begin
            insert into public.questions (
                game_id, topic_id, topic_category, question_text,
                option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, is_used
            ) values (
                p_game_id, p_topic_id, v_topic.name, v_text, v_a, v_b, v_c, v_d, v_correct,
                nullif(btrim(coalesce(q ->> 'explanation', '')), ''), v_diff, false
            );
            v_inserted := v_inserted + 1;
        exception when unique_violation then
            v_dups := v_dups + 1;
        end;
    end loop;

    return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dups, 'rejected', v_rejected,
                              'pool', public._pool_status(p_game_id));
end;
$$;

-- Topics -----------------------------------------------------------------------
create or replace function public.admin_delete_topic(p_topic_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    t public.topics;
    v_games int; v_q int; v_a int;
begin
    perform public._assert_admin();
    select * into t from public.topics where id = p_topic_id;
    if not found then raise exception 'Topic not found.'; end if;
    select count(*) into v_games from public.game_topics where topic_id = p_topic_id;
    select count(*) into v_q from public.questions where topic_id = p_topic_id;
    select count(*) into v_a from public.assignments where topic_id = p_topic_id;
    if v_games > 0 or v_q > 0 or v_a > 0 then
        raise exception 'Topic "%" is used by % game(s) and % challenge(s). Disable it instead so history is preserved.',
            t.name, v_games, v_a;
    end if;
    delete from public.topics where id = p_topic_id;
    return jsonb_build_object('deleted_topic_id', p_topic_id, 'name', t.name);
end;
$$;

create or replace function public.admin_topic_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public._assert_admin();
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'topic_id', t.id,
            'games_using', (select count(*) from public.game_topics gt where gt.topic_id = t.id),
            'pool_questions', (select count(*) from public.questions q where q.topic_id = t.id and q.assignment_id is null),
            'challenges', (select count(*) from public.assignments a where a.topic_id = t.id)
        )) from public.topics t
    ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_default_rules(p_rules jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
    perform public._assert_admin();
    v := public._validate_rules(p_rules, '{}'::jsonb);
    v := jsonb_build_object('min_participants', v -> 'min_participants', 'max_participants', v -> 'max_participants',
                            'points_correct', v -> 'points_correct', 'points_wrong', v -> 'points_wrong');
    insert into public.app_settings (key, value, updated_by) values ('default_game_rules', v, auth.uid())
        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
    return v;
end;
$$;

-- ------------------------------------------------------------------------------
-- E. PARTICIPANT RPCs (token based - callable by anon)
-- ------------------------------------------------------------------------------

create or replace function public._participant_by_token(p_game_id uuid, p_token text)
returns public.participants language sql stable security definer set search_path = public as $$
    select * from public.participants
     where game_id = p_game_id
       and char_length(btrim(coalesce(p_token, ''))) >= 16
       and invitation_token_hash = public._hash_token(p_token)
     limit 1;
$$;

-- Everything the invitation page needs, in one call. Returns NULL for an invalid link.
create or replace function public.participant_join(p_game_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    g public.games;
    v_round public.game_rounds;
    v_roster jsonb; v_topics jsonb; v_out jsonb; v_in jsonb;
begin
    p := public._participant_by_token(p_game_id, p_token);
    if p.id is null then return null; end if;
    select * into g from public.games where id = p.game_id for update;

    -- Completed games are not bumped so the retention clock stays honest.
    if p.status = 'pending' and g.status not in ('cancelled', 'completed') then
        update public.participants set status = 'joined', joined_at = now() where id = p.id;
        p.status := 'joined'; p.joined_at := now();
        update public.games set updated_at = now() where id = g.id;
    end if;

    select * into v_round from public.game_rounds where game_id = g.id order by round_number desc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'display_name', o.display_name, 'player_code', o.player_code)
                              order by o.player_code), '[]'::jsonb)
      into v_roster from public.participants o where o.game_id = g.id and o.id <> p.id;

    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description, 'icon', t.icon)
                              order by t.name), '[]'::jsonb)
      into v_topics from public.game_topics gt join public.topics t on t.id = gt.topic_id
     where gt.game_id = g.id and t.is_active;

    select coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', a.id, 'status', a.status, 'raw_token', s.raw_token,
        'answered', a.answered_questions, 'total', a.total_questions,
        'receiver', jsonb_build_object('id', r.id, 'display_name', r.display_name, 'player_code', r.player_code),
        'topic', jsonb_build_object('id', t.id, 'name', t.name)
    ) order by a.created_at), '[]'::jsonb) into v_out
      from public.assignments a
      join public.participants r on r.id = a.receiver_id
      join public.topics t on t.id = a.topic_id
      left join public.assignment_secrets s on s.assignment_id = a.id
     where a.sender_id = p.id;

    select coalesce(jsonb_agg(jsonb_build_object(
        'assignment_id', a.id, 'status', a.status, 'raw_token', s.raw_token,
        'answered', a.answered_questions, 'total', a.total_questions,
        'sender', jsonb_build_object('id', sn.id, 'display_name', sn.display_name, 'player_code', sn.player_code),
        'topic', jsonb_build_object('id', t.id, 'name', t.name)
    ) order by a.created_at), '[]'::jsonb) into v_in
      from public.assignments a
      join public.participants sn on sn.id = a.sender_id
      join public.topics t on t.id = a.topic_id
      left join public.assignment_secrets s on s.assignment_id = a.id
     where a.receiver_id = p.id;

    return jsonb_build_object(
        'participant', jsonb_build_object('id', p.id, 'display_name', p.display_name,
                                          'player_code', p.player_code, 'status', p.status),
        'game', jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description, 'status', g.status,
                                   'points_correct', coalesce((g.settings ->> 'points_correct')::int, 10)),
        'round', case when v_round.id is null then null
                      else jsonb_build_object('id', v_round.id, 'round_number', v_round.round_number, 'status', v_round.status) end,
        'roster', v_roster,
        'topics', v_topics,
        'outgoing', v_out,
        'incoming', v_in,
        'can_create', (g.status = 'active' and jsonb_array_length(v_out) = 0)
    );
end;
$$;

-- Creates the challenge: validates state, picks 3E/3M/1H unseen questions, issues the token.
create or replace function public.participant_create_challenge(
    p_game_id uuid, p_token text, p_receiver_id uuid, p_topic_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    g public.games;
    v_receiver public.participants;
    v_topic public.topics;
    v_round public.game_rounds;
    v_slot record;
    v_ids uuid[];
    v_all uuid[] := '{}';
    v_assignment uuid;
    v_token text;
    v_seq int := 0;
    v_id uuid;
begin
    p := public._participant_by_token(p_game_id, p_token);
    if p.id is null then raise exception 'Invalid or expired invitation link.'; end if;
    perform pg_advisory_xact_lock(hashtext('create_challenge:' || p.id::text));

    -- Lock order everywhere: assignment -> game (exclusive) -> advisory -> participants.
    select * into g from public.games where id = p.game_id for update;
    if g.status in ('draft', 'registration_open', 'ready') then raise exception 'The game has not started yet. Please wait for the host to start it.'; end if;
    if g.status in ('paused', 'waiting_for_answers') then raise exception 'The game is paused by the host. Please try again shortly.'; end if;
    if g.status = 'completed' then raise exception 'This game has finished.'; end if;
    if g.status = 'cancelled' then raise exception 'This game was cancelled by the host.'; end if;

    select * into v_round from public.game_rounds where game_id = g.id and status = 'active' order by round_number desc limit 1;
    if v_round.id is null then raise exception 'This round is closed.'; end if;

    if exists (select 1 from public.assignments where round_id = v_round.id and sender_id = p.id) then
        raise exception 'You have already sent your challenge.';
    end if;
    if p_receiver_id = p.id then raise exception 'You cannot challenge yourself. Please pick another player.'; end if;
    select * into v_receiver from public.participants where id = p_receiver_id and game_id = g.id;
    if v_receiver.id is null then raise exception 'That player is not part of this game.'; end if;

    select t.* into v_topic from public.topics t
      join public.game_topics gt on gt.topic_id = t.id and gt.game_id = g.id
     where t.id = p_topic_id;
    if v_topic.id is null then raise exception 'That topic is not available in this game.'; end if;
    if not v_topic.is_active then raise exception 'That topic is currently disabled.'; end if;

    -- Pick 3 easy, 3 medium, 1 hard: never a question this receiver has already been given,
    -- preferring the least-used questions in the pool.
    for v_slot in select * from (values ('easy', 3), ('medium', 3), ('hard', 1)) as s(diff, n) loop
        select coalesce(array_agg(x.id), '{}') into v_ids from (
            select pq.id
              from public.questions pq
             where pq.game_id = g.id and pq.topic_id = p_topic_id and pq.assignment_id is null
               and pq.difficulty = v_slot.diff
               and not exists (
                    select 1 from public.questions seen
                      join public.assignments sa on sa.id = seen.assignment_id
                     where sa.receiver_id = p_receiver_id and sa.game_id = g.id
                       and lower(btrim(seen.question_text)) = lower(btrim(pq.question_text)))
             order by (select count(*) from public.questions u where u.source_question_id = pq.id) asc, random()
             limit v_slot.n
        ) x;
        if coalesce(array_length(v_ids, 1), 0) < v_slot.n then
            raise exception 'Not enough unseen % questions left for % in "%". Please pick another topic or player.',
                v_slot.diff, v_receiver.display_name, v_topic.name;
        end if;
        v_all := v_all || v_ids;
    end loop;

    v_token := public._new_token();
    insert into public.assignments (game_id, round_id, sender_id, receiver_id, topic_id, challenge_token_hash,
                                    status, total_questions, answered_questions, current_score)
    values (g.id, v_round.id, p.id, p_receiver_id, p_topic_id, public._hash_token(v_token), 'pending', 7, 0, 0)
    returning id into v_assignment;
    insert into public.assignment_secrets (assignment_id, raw_token) values (v_assignment, v_token);

    foreach v_id in array v_all loop
        v_seq := v_seq + 1;
        insert into public.questions (game_id, topic_id, assignment_id, sequence_num, topic_category, question_text,
            option_a, option_b, option_c, option_d, correct_option, explanation, difficulty, is_used, source_question_id)
        select g.id, p_topic_id, v_assignment, v_seq, pq.topic_category, pq.question_text,
               pq.option_a, pq.option_b, pq.option_c, pq.option_d, pq.correct_option, pq.explanation,
               pq.difficulty, true, pq.id
          from public.questions pq where pq.id = v_id;
    end loop;

    perform public._refresh_participant_status(p.id);
    perform public._refresh_participant_status(p_receiver_id);
    perform public._log_event(g.id, p.id, 'challenge_created', jsonb_build_object(
        'assignment_id', v_assignment, 'receiver_id', p_receiver_id, 'topic_id', p_topic_id, 'total_questions', 7));
    update public.games set updated_at = now() where id = g.id;

    return jsonb_build_object('assignment_id', v_assignment, 'raw_token', v_token, 'total_questions', 7,
        'receiver', jsonb_build_object('id', v_receiver.id, 'display_name', v_receiver.display_name),
        'topic', jsonb_build_object('id', v_topic.id, 'name', v_topic.name));
end;
$$;

drop function if exists public.get_challenge_by_token(text);
create or replace function public.get_challenge_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    a public.assignments;
    g public.games;
    v_round public.game_rounds;
    v_sender record; v_receiver record; v_topic record;
    v_questions jsonb := '[]'::jsonb;
    v_answers jsonb := '[]'::jsonb;
    v_revealed boolean;
    v_answered int; v_total int;
    v_reason text;
    v_correct int; v_pc int; v_pw int;
begin
    if char_length(btrim(coalesce(p_token, ''))) < 16 then return null; end if;
    select * into a from public.assignments where challenge_token_hash = public._hash_token(p_token);
    if not found then return null; end if;

    select * into g from public.games where id = a.game_id;
    select * into v_round from public.game_rounds where id = a.round_id;
    select id, display_name, player_code into v_sender from public.participants where id = a.sender_id;
    select id, display_name, player_code into v_receiver from public.participants where id = a.receiver_id;
    select id, name, icon into v_topic from public.topics where id = a.topic_id;

    v_revealed := (g.status = 'completed');
    v_reason := case g.status
        when 'cancelled' then 'cancelled'
        when 'completed' then 'completed'
        when 'paused' then 'paused'
        when 'waiting_for_answers' then 'paused'
        when 'active' then null
        else 'not_started' end;

    if a.status = 'pending' and g.status = 'active' then
        update public.assignments set status = 'opened' where id = a.id;
        a.status := 'opened';
    end if;

    if g.status <> 'cancelled' then
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'sequence_num', q.sequence_num, 'topic_category', q.topic_category,
            'question_text', q.question_text,
            'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
            'difficulty', q.difficulty,
            'correct_option', case when v_revealed then q.correct_option else null end,
            'explanation', case when v_revealed then q.explanation else null end
        ) order by q.sequence_num), '[]'::jsonb) into v_questions
          from public.questions q where q.assignment_id = a.id;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', an.question_id, 'question_num', an.question_num, 'selected_option', an.selected_option,
        'is_correct', case when v_revealed then an.is_correct else null end, 'submitted_at', an.submitted_at
    ) order by an.question_num), '[]'::jsonb) into v_answers
      from public.answers an where an.assignment_id = a.id;

    v_answered := jsonb_array_length(v_answers);
    v_total := a.total_questions;
    v_pc := coalesce((g.settings ->> 'points_correct')::int, 10);
    v_pw := coalesce((g.settings ->> 'points_wrong')::int, 0);
    select count(*) filter (where is_correct) into v_correct from public.answers where assignment_id = a.id;

    return jsonb_build_object(
        'assignment', jsonb_build_object('id', a.id, 'status', a.status, 'total_questions', v_total,
                                         'answered_questions', v_answered),
        'game', jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status, 'points_correct', v_pc),
        'round', jsonb_build_object('id', v_round.id, 'round_number', v_round.round_number,
                                    'status', v_round.status, 'is_revealed', v_revealed),
        'sender', jsonb_build_object('id', v_sender.id, 'display_name', v_sender.display_name, 'player_code', v_sender.player_code),
        'receiver', jsonb_build_object('id', v_receiver.id, 'display_name', v_receiver.display_name, 'player_code', v_receiver.player_code),
        'topic', jsonb_build_object('id', v_topic.id, 'name', v_topic.name, 'icon', v_topic.icon),
        'questions', v_questions,
        'answers', v_answers,
        'is_open', (g.status = 'active' and a.status <> 'submitted'),
        'closed_reason', v_reason,
        'progress', jsonb_build_object(
            'total', v_total, 'answered', v_answered, 'is_completed', (a.status = 'submitted'),
            'current_score', case when v_revealed then v_correct * v_pc + (v_answered - v_correct) * v_pw else null end,
            'max_score', v_total * v_pc)
    );
end;
$$;

drop function if exists public.submit_challenge_answer(text, text, uuid);
create or replace function public.submit_challenge_answer(
    p_token text, p_selected_option text, p_question_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    a public.assignments;
    g public.games;
    v_q public.questions;
    v_next int;
    v_answered int;
    v_total int;
    v_correct boolean;
    v_done boolean;
    v_pc int; v_pw int;
begin
    if p_selected_option is null or p_selected_option not in ('A', 'B', 'C', 'D') then
        raise exception 'Invalid option selected. Must be A, B, C, or D.';
    end if;
    if p_question_id is null then raise exception 'A question is required.'; end if;
    if char_length(btrim(coalesce(p_token, ''))) < 16 then raise exception 'Challenge not found or invalid link.'; end if;

    select * into a from public.assignments where challenge_token_hash = public._hash_token(p_token) for update;
    if not found then raise exception 'Challenge not found or invalid link.'; end if;
    select * into g from public.games where id = a.game_id for update;

    if g.status = 'cancelled' then raise exception 'This game was cancelled by the host. Answers are no longer accepted.'; end if;
    if g.status = 'completed' then raise exception 'This game has finished. Answers are no longer accepted.'; end if;
    if g.status in ('paused', 'waiting_for_answers') then raise exception 'The game is paused by the host. Please try again shortly.'; end if;
    if g.status <> 'active' then raise exception 'The game has not started yet.'; end if;
    if a.status = 'submitted' then raise exception 'This challenge has already been completed.'; end if;

    select * into v_q from public.questions where id = p_question_id and assignment_id = a.id;
    if not found then raise exception 'Question does not belong to this challenge.'; end if;
    if exists (select 1 from public.answers where assignment_id = a.id and question_id = p_question_id) then
        raise exception 'ALREADY_ANSWERED: an answer has already been submitted for this question.';
    end if;

    select min(q.sequence_num) into v_next from public.questions q
     where q.assignment_id = a.id
       and not exists (select 1 from public.answers an where an.assignment_id = a.id and an.question_id = q.id);
    if v_q.sequence_num <> v_next then
        raise exception 'Please answer the questions in order (next is question %).', v_next;
    end if;

    v_correct := (v_q.correct_option = p_selected_option);
    insert into public.answers (assignment_id, question_id, participant_id, selected_option, is_correct, question_num, submitted_at)
    values (a.id, v_q.id, a.receiver_id, p_selected_option, v_correct, v_q.sequence_num, now());

    select count(*) into v_answered from public.answers where assignment_id = a.id;
    select count(*) into v_total from public.questions where assignment_id = a.id;
    v_done := (v_answered >= v_total);
    v_pc := coalesce((g.settings ->> 'points_correct')::int, 10);
    v_pw := coalesce((g.settings ->> 'points_wrong')::int, 0);

    update public.assignments
       set answered_questions = v_answered, total_questions = v_total,
           current_score = (select count(*) filter (where is_correct) * v_pc + count(*) filter (where not is_correct) * v_pw
                              from public.answers where assignment_id = a.id),
           status = case when v_done then 'submitted' else 'opened' end
     where id = a.id;

    perform public._recompute_scores(a.game_id);
    perform public._refresh_participant_status(a.receiver_id);
    if v_done then
        perform public._log_event(a.game_id, a.receiver_id, 'challenge_completed', jsonb_build_object('assignment_id', a.id));
        if not exists (select 1 from public.assignments where game_id = a.game_id and status <> 'submitted') then
            perform public._log_event(a.game_id, null, 'all_answers_submitted', jsonb_build_object('round_id', a.round_id));
        end if;
    end if;
    update public.games set updated_at = now() where id = a.game_id;

    -- Deliberately does NOT return correctness or score (hidden until the game is completed).
    return jsonb_build_object('success', true, 'question_id', v_q.id, 'question_num', v_q.sequence_num,
                              'total_questions', v_total, 'answered_count', v_answered, 'is_completed', v_done);
end;
$$;

-- Public leaderboard. Live view counts only fully completed challenges (so a score tick never
-- reveals the correctness of a single answer); after completion (or for admins) everything counts.
create or replace function public.get_leaderboard(p_game_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    g public.games;
    v_final boolean;
    v_pc int; v_pw int;
    v_rows jsonb;
begin
    select * into g from public.games where id = p_game_id;
    if not found then return null; end if;
    v_final := (g.status = 'completed') or public.is_admin();
    v_pc := coalesce((g.settings ->> 'points_correct')::int, 10);
    v_pw := coalesce((g.settings ->> 'points_wrong')::int, 0);

    with base as (
        select p.id, p.display_name, p.player_code,
               count(ans.id) filter (where ans.is_correct) as correct,
               count(ans.id) filter (where ans.is_correct = false) as wrong,
               count(distinct a.id) filter (where a.status = 'submitted') as done,
               count(distinct a.id) as total
        from public.participants p
        left join public.assignments a on a.receiver_id = p.id and a.game_id = p.game_id
             and (v_final or a.status = 'submitted')
        left join public.answers ans on ans.assignment_id = a.id
        where p.game_id = p_game_id
        group by p.id, p.display_name, p.player_code
    ), scored as (
        select *, correct * v_pc + wrong * v_pw as points from base
    ), ranked as (
        select *, rank() over (order by points desc) as rnk from scored
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'participant_id', id, 'display_name', display_name, 'player_code', player_code,
        'total_points', points, 'correct_answers', correct, 'wrong_answers', wrong,
        'challenges_completed', done, 'challenges_received', total, 'rank', rnk
    ) order by rnk, correct desc, display_name), '[]'::jsonb) into v_rows from ranked;

    return jsonb_build_object(
        'game', jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status, 'is_final', (g.status = 'completed')),
        'rows', v_rows);
end;
$$;

-- ------------------------------------------------------------------------------
-- F. DROP THE OLD, EXPLOITABLE RPCs
-- ------------------------------------------------------------------------------
drop function if exists public.get_participant_by_token(text);
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb);
drop function if exists public.reveal_round_answers(uuid);
drop function if exists public.delete_game_room(uuid);
drop function if exists public.save_game_question(uuid, uuid, text, text, text, text, text, text, text, text, text);
drop function if exists public.check_game_ready_to_start(uuid);
drop function if exists public.is_admin_or_service();

-- ------------------------------------------------------------------------------
-- G. ROW LEVEL SECURITY: admin-only tables; participants use RPCs only
-- ------------------------------------------------------------------------------
do $$
declare r record;
begin
    for r in select policyname, tablename from pg_policies
             where schemaname = 'public'
               and tablename in ('admins','games','participants','topics','game_topics','game_rounds','assignments',
                                 'questions','answers','scores','game_events','participant_secrets',
                                 'assignment_secrets','app_settings')
    loop
        execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    end loop;
end $$;

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
alter table public.participant_secrets enable row level security;
alter table public.assignment_secrets enable row level security;
alter table public.app_settings enable row level security;

create policy "admins read own row" on public.admins for select using (user_id = auth.uid());
create policy "admins list admins" on public.admins for select using (public.is_admin());

-- Public, non-sensitive reads (settings no longer contain answers). Realtime for games relies on this.
create policy "public read games" on public.games for select using (true);
create policy "public read topics" on public.topics for select using (true);
create policy "public read game_topics" on public.game_topics for select using (true);
create policy "public read game_rounds" on public.game_rounds for select using (true);

create policy "admin all games" on public.games for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all topics" on public.topics for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all game_topics" on public.game_topics for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all game_rounds" on public.game_rounds for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all participants" on public.participants for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all assignments" on public.assignments for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all questions" on public.questions for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all answers" on public.answers for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all scores" on public.scores for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all game_events" on public.game_events for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all participant_secrets" on public.participant_secrets for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all assignment_secrets" on public.assignment_secrets for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all app_settings" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------------------
-- H. FUNCTION PRIVILEGES (Supabase grants EXECUTE to anon/authenticated by default)
-- ------------------------------------------------------------------------------
revoke execute on function
    public._assert_admin(), public._hash_token(text), public._new_token(),
    public._log_event(uuid, uuid, text, jsonb), public._touch_game(uuid),
    public._validate_rules(jsonb, jsonb), public._pool_status(uuid), public._recompute_scores(uuid),
    public._refresh_participant_status(uuid), public._participant_by_token(uuid, text),
    public._guard_game_status()
    from public, anon, authenticated;

revoke execute on function
    public.admin_create_game(text, text, jsonb, uuid[], text),
    public.admin_update_game(uuid, text, text, jsonb),
    public.admin_set_game_status(uuid, text),
    public.admin_delete_game(uuid),
    public.cleanup_completed_games(int),
    public.admin_add_participant(uuid, text, text, text),
    public.admin_update_participant(uuid, text, text, text),
    public.admin_remove_participant(uuid),
    public.admin_regenerate_invitation(uuid),
    public.admin_pool_status(uuid),
    public.admin_save_pool_questions(uuid, uuid, jsonb),
    public.admin_delete_topic(uuid),
    public.admin_topic_stats(),
    public.admin_set_default_rules(jsonb)
    from public, anon;
grant execute on function
    public.admin_create_game(text, text, jsonb, uuid[], text),
    public.admin_update_game(uuid, text, text, jsonb),
    public.admin_set_game_status(uuid, text),
    public.admin_delete_game(uuid),
    public.cleanup_completed_games(int),
    public.admin_add_participant(uuid, text, text, text),
    public.admin_update_participant(uuid, text, text, text),
    public.admin_remove_participant(uuid),
    public.admin_regenerate_invitation(uuid),
    public.admin_pool_status(uuid),
    public.admin_save_pool_questions(uuid, uuid, jsonb),
    public.admin_delete_topic(uuid),
    public.admin_topic_stats(),
    public.admin_set_default_rules(jsonb)
    to authenticated;

grant execute on function
    public.participant_join(uuid, text),
    public.participant_create_challenge(uuid, text, uuid, uuid),
    public.get_challenge_by_token(text),
    public.submit_challenge_answer(text, text, uuid),
    public.get_leaderboard(uuid),
    public.is_admin()
    to anon, authenticated;

-- Realtime: games drives live refresh for participants (updated_at is touched on every play event)
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
            alter publication supabase_realtime add table public.games;
        end if;
    end if;
end $$;
