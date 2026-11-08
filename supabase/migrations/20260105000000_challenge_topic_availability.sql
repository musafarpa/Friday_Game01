-- ==============================================================================
-- MIGRATION 20260105000000_challenge_topic_availability.sql
-- Small, additive follow-up to 20260104: tell the invitation page which (friend, topic) pairs can
-- NOT be challenged any more, so players see it BEFORE sending instead of after an error.
--
-- A friend never receives the same question twice. With a pool of 10 questions per topic, once one
-- player has challenged a friend on a topic, the next player must pick a different topic for that
-- friend (or a different friend). participant_join now returns `unavailable`:
--   [{ "receiver_id": uuid, "topic_id": uuid }, ...]   (only pairs that really cannot be served)
-- It reveals no sender identity, no questions and no answers.
-- SAFE TO RE-RUN. No data is changed.
-- ==============================================================================

-- Unseen pool questions of one difficulty for (game, topic, receiver)
create or replace function public._unseen_count(p_game_id uuid, p_topic_id uuid, p_receiver_id uuid, p_diff text)
returns int language sql stable security definer set search_path = public as $$
    select count(*)::int
      from public.questions pq
     where pq.game_id = p_game_id and pq.topic_id = p_topic_id and pq.assignment_id is null
       and pq.difficulty = p_diff
       and not exists (
            select 1 from public.questions seen
              join public.assignments sa on sa.id = seen.assignment_id
             where sa.receiver_id = p_receiver_id and sa.game_id = p_game_id
               and lower(btrim(seen.question_text)) = lower(btrim(pq.question_text)));
$$;
revoke execute on function public._unseen_count(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.participant_join(p_game_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.participants;
    g public.games;
    v_round public.game_rounds;
    v_roster jsonb; v_topics jsonb; v_out jsonb; v_in jsonb; v_unavail jsonb;
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

    -- (friend, topic) pairs that cannot be served any more (not enough UNSEEN 3E/3M/1H questions left)
    select coalesce(jsonb_agg(jsonb_build_object('receiver_id', x.rid, 'topic_id', x.tid)), '[]'::jsonb) into v_unavail
      from (
        select r.id as rid, t.id as tid
          from public.participants r
          cross join (select t2.id from public.game_topics gt join public.topics t2 on t2.id = gt.topic_id
                       where gt.game_id = g.id and t2.is_active) t
         where r.game_id = g.id and r.id <> p.id
           and (   public._unseen_count(g.id, t.id, r.id, 'easy')   < 3
                or public._unseen_count(g.id, t.id, r.id, 'medium') < 3
                or public._unseen_count(g.id, t.id, r.id, 'hard')   < 1)
      ) x;

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
        'unavailable', v_unavail,
        'can_create', (g.status = 'active' and jsonb_array_length(v_out) = 0)
    );
end;
$$;

grant execute on function public.participant_join(uuid, text) to anon, authenticated;
