-- ==============================================================================
-- MIGRATION 20260106000000_leaderboard_average_ranking.sql
-- Fair ranking when players receive a different NUMBER of challenges.
--
-- Before: ranked by total points, so a player picked by 3 friends could score up to 210 while a
--         player picked once could score at most 70, and a player nobody picked could not score.
-- Now:    ranked by AVERAGE points per received challenge (total / challenges received).
--         Players who received no challenge are listed last (they share the last rank) and
--         average_points is null for them.
-- Totals, correct/wrong counts and the "live view counts finished challenges only" rule are unchanged.
-- SAFE TO RE-RUN. No data is changed.
-- ==============================================================================

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
        select *,
               correct * v_pc + wrong * v_pw as points,
               case when total > 0 then (correct * v_pc + wrong * v_pw)::numeric / total end as avg_exact
        from base
    ), ranked as (
        -- NULL averages (no challenge received) sort last and tie with each other
        select *, rank() over (order by avg_exact desc nulls last) as rnk from scored
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'participant_id', id, 'display_name', display_name, 'player_code', player_code,
        'total_points', points, 'correct_answers', correct, 'wrong_answers', wrong,
        'challenges_completed', done, 'challenges_received', total,
        'average_points', case when avg_exact is null then null else round(avg_exact, 1) end,
        'rank', rnk
    ) order by rnk, points desc, display_name), '[]'::jsonb) into v_rows from ranked;

    return jsonb_build_object(
        'game', jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status,
                                   'is_final', (g.status = 'completed'), 'ranking', 'average_per_challenge'),
        'rows', v_rows);
end;
$$;

grant execute on function public.get_leaderboard(uuid) to anon, authenticated;
