// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, ANON, ADMIN, SERVICE, Db, expectError, seedGame, addPlayers, TOPICS } from './harness';

type Pick = 'correct' | 'wrong' | 'skip';

/** Answers a challenge's questions in order following `picks` (stops at the first 'skip'). */
async function play(db: Db, token: string, assignmentId: string, picks: Pick[]) {
  const qs = await db.q(SERVICE, `select id, sequence_num, correct_option from public.questions where assignment_id = $1 order by sequence_num`, [assignmentId]);
  let last: any;
  for (let i = 0; i < picks.length; i++) {
    if (picks[i] === 'skip') break;
    const opt = picks[i] === 'correct' ? qs[i].correct_option : (['A', 'B', 'C', 'D'].find((o) => o !== qs[i].correct_option) as string);
    last = await db.rpc(ANON, 'submit_challenge_answer', { p_token: token, p_selected_option: opt, p_question_id: qs[i].id });
  }
  return last;
}
const rank = (lb: any, name: string) => lb.rows.find((r: any) => r.display_name === name);

describe('end-to-end gameplay on a real Postgres: Friday Fun QA Test (A,B,C,D x 3 topics)', () => {
  let db: Db;
  let gameId: string;
  let topics: Record<string, string>;
  let P: Awaited<ReturnType<typeof addPlayers>>;
  let ch: Record<string, { raw_token: string; assignment_id: string }>;

  beforeAll(async () => {
    db = await createDb();
    const g = await seedGame(db, 'Friday Fun QA Test', { settings: { min_participants: 3, max_participants: 10, points_correct: 10 } });
    gameId = g.gameId;
    topics = Object.fromEntries(g.topicNames.map((n, i) => [n, g.topicIds[i]]));
    P = await addPlayers(db, gameId, [['Arun', 'A'], ['Rahul', 'B'], ['Amal', 'C'], ['Nikhil', 'D']]);
  }, 180_000);

  it('1. every topic has >= 7 valid unique questions (3E/3M/1H) before the game can start', async () => {
    const pool = await db.rpc(ADMIN, 'admin_pool_status', { p_game_id: gameId });
    expect(pool.ready).toBe(true);
    expect(pool.topics).toHaveLength(3);
    for (const t of pool.topics) {
      expect(t.total).toBeGreaterThanOrEqual(7);
      expect(t.easy).toBeGreaterThanOrEqual(3); expect(t.medium).toBeGreaterThanOrEqual(3); expect(t.hard).toBeGreaterThanOrEqual(1);
    }
    const dup = await db.q(SERVICE, `select lower(btrim(question_text)) t, count(*) from public.questions where game_id = $1 and assignment_id is null group by 1 having count(*) > 1`, [gameId]);
    expect(dup).toHaveLength(0);
  });

  it('2. players cannot challenge before the game starts', async () => {
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: P.Arun.token, p_receiver_id: P.Amal.id, p_topic_id: topics[TOPICS.movies] }), /has not started yet/);
    const j = await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: P.Arun.token });
    expect(j.can_create).toBe(false);
  });

  it('3. all 4 invitation links are unique, open the right participant, and mark them joined', async () => {
    const tokens = Object.values(P).map((p) => p.token);
    expect(new Set(tokens).size).toBe(4);
    for (const [name, p] of Object.entries(P)) {
      const j = await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: p.token });
      expect(j.participant).toMatchObject({ id: p.id, display_name: name, player_code: p.code, status: 'joined' });
      expect(j.roster).toHaveLength(3);
      expect(j.roster.map((r: any) => r.id)).not.toContain(p.id);
      expect(j.topics).toHaveLength(3);
    }
  });

  it('4. admin starts the game (real status change)', async () => {
    const r = await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: gameId, p_action: 'start' });
    expect(r).toMatchObject({ previous_status: 'registration_open', status: 'active' });
  });

  it('5. A->C Movies, B->C Cricket, D->C AI, C->A Movies create 4 independent challenges of exactly 7 ordered questions', async () => {
    const mk = (from: string, to: string, topic: string) => db.rpc(ANON, 'participant_create_challenge', {
      p_game_id: gameId, p_token: P[from].token, p_receiver_id: P[to].id, p_topic_id: topics[topic] });
    ch = {
      AC: await mk('Arun', 'Amal', TOPICS.movies),
      BC: await mk('Rahul', 'Amal', TOPICS.cricket),
      DC: await mk('Nikhil', 'Amal', TOPICS.ai),
      CA: await mk('Amal', 'Arun', TOPICS.movies),
    };
    const tokens = Object.values(ch).map((c) => c.raw_token);
    expect(new Set(tokens).size).toBe(4);
    expect(new Set(Object.values(ch).map((c) => c.assignment_id)).size).toBe(4);

    const expected: Record<string, string> = { AC: TOPICS.movies, BC: TOPICS.cricket, DC: TOPICS.ai, CA: TOPICS.movies };
    for (const [k, c] of Object.entries(ch)) {
      const qs = await db.q(SERVICE, `select q.sequence_num, q.difficulty, q.topic_id, q.topic_category, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.source_question_id
                                       from public.questions q where q.assignment_id = $1 order by q.sequence_num`, [c.assignment_id]);
      expect(qs, k).toHaveLength(7);
      expect(qs.map((x: any) => x.sequence_num), k).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(qs.map((x: any) => x.difficulty), k).toEqual(['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard']);
      expect(new Set(qs.map((x: any) => x.question_text)).size, k).toBe(7);
      for (const q of qs) {
        expect(q.topic_id, `${k} topic`).toBe(topics[expected[k]]);
        expect(q.topic_category).toBe(expected[k]);
        expect(new Set([q.option_a, q.option_b, q.option_c, q.option_d]).size).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correct_option);
        expect(q.source_question_id).not.toBeNull();
      }
    }
  });

  it('6. Amal (C) receives three INDEPENDENT challenges with separate links; Arun receives one', async () => {
    const amal = await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: P.Amal.token });
    expect(amal.incoming).toHaveLength(3);
    expect(amal.incoming.map((c: any) => c.sender.display_name).sort()).toEqual(['Arun', 'Nikhil', 'Rahul']);
    expect(new Set(amal.incoming.map((c: any) => c.raw_token)).size).toBe(3);
    expect(amal.outgoing).toHaveLength(1);
    expect(amal.can_create).toBe(false);
    const arun = await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: P.Arun.token });
    expect(arun.incoming).toHaveLength(1);
    expect(arun.outgoing[0].receiver.display_name).toBe('Amal');
    // challenge pools for the three Amal challenges are disjoint from each other per topic
    const rows = await db.q(SERVICE, `select a.id, q.question_text from public.questions q join public.assignments a on a.id = q.assignment_id where a.receiver_id = $1`, [P.Amal.id]);
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r: any) => r.question_text)).size).toBe(21);
  });

  it('7. creation guards: one challenge per sender, no self, foreign receiver/topic rejected', async () => {
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: P.Arun.token, p_receiver_id: P.Rahul.id, p_topic_id: topics[TOPICS.ai] }), /already sent your challenge/);
    const other = await seedGame(db, 'Other Game', { pool: false, topics: [TOPICS.movies] });
    const op = await addPlayers(db, other.gameId, [['Out1', 'A']]);
    const fresh = await addPlayers(db, gameId, [['Late', 'E']]);
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: fresh.Late.token, p_receiver_id: fresh.Late.id, p_topic_id: topics[TOPICS.ai] }), /cannot challenge yourself/);
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: fresh.Late.token, p_receiver_id: op.Out1.id, p_topic_id: topics[TOPICS.ai] }), /not part of this game/);
    const notInGame = (await db.q(SERVICE, `select id from public.topics where name = 'Social Media'`))[0].id;
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: fresh.Late.token, p_receiver_id: P.Arun.id, p_topic_id: notInGame }), /not available in this game/);
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: gameId, p_token: 'a'.repeat(64), p_receiver_id: P.Arun.id, p_topic_id: topics[TOPICS.ai] }), /Invalid or expired invitation link/);
    await db.rpc(ADMIN, 'admin_remove_participant', { p_participant_id: fresh.Late.id });
  });

  it('8. answers must be given in order; duplicates and unknown questions are rejected; nothing is lost on refresh', async () => {
    const qs = await db.q(SERVICE, `select id, correct_option from public.questions where assignment_id = $1 order by sequence_num`, [ch.AC.assignment_id]);
    // out of order (question 3 first)
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: 'A', p_question_id: qs[2].id }), /answer the questions in order \(next is question 1\)/);
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: 'Z', p_question_id: qs[0].id }), /Invalid option/);
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: 'A', p_question_id: '00000000-0000-0000-0000-000000000000' }), /does not belong/);
    // Q1 ok, duplicate Q1 rejected (double click / replay)
    const r1 = await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: qs[0].correct_option, p_question_id: qs[0].id });
    expect(r1).toMatchObject({ question_num: 1, answered_count: 1, total_questions: 7, is_completed: false });
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: 'D', p_question_id: qs[0].id }), /ALREADY_ANSWERED/);
    // "refresh after Q3": reload state from the server and verify resume position
    await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: qs[1].correct_option, p_question_id: qs[1].id });
    await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: qs[2].correct_option, p_question_id: qs[2].id });
    const reloaded = await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.AC.raw_token });
    expect(reloaded.progress).toMatchObject({ answered: 3, total: 7, is_completed: false });
    expect(reloaded.answers.map((a: any) => a.question_num)).toEqual([1, 2, 3]);
    expect(reloaded.is_open).toBe(true);
    // only one point of truth: exactly 3 rows, not duplicated
    expect((await db.q(SERVICE, `select count(*)::int c from public.answers where assignment_id = $1`, [ch.AC.assignment_id]))[0].c).toBe(3);
  });

  it('9. scoring: 7 correct = 70, 7 wrong = 0, 5 correct = 50, unanswered = 0 (server-side)', async () => {
    // AC: Arun->Amal, Amal already answered Q1-3 correctly above; finish Q4-7 all correct => 7/7 = 70
    const acQs = await db.q(SERVICE, `select id, correct_option from public.questions where assignment_id = $1 order by sequence_num`, [ch.AC.assignment_id]);
    for (let i = 3; i < 7; i++) {
      const r = await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: acQs[i].correct_option, p_question_id: acQs[i].id });
      expect(r.is_completed).toBe(i === 6);
      expect(r.answered_count).toBe(i + 1);
    }
    await play(db, ch.BC.raw_token, ch.BC.assignment_id, Array(7).fill('wrong'));                                         // 0
    await play(db, ch.DC.raw_token, ch.DC.assignment_id, ['correct', 'correct', 'wrong', 'correct', 'wrong', 'correct', 'correct']); // 5 -> 50
    await play(db, ch.CA.raw_token, ch.CA.assignment_id, ['correct', 'correct', 'correct', 'skip']);                      // 3 correct, 4 unanswered
    const per = await db.q(SERVICE, `select id, status, answered_questions, current_score from public.assignments where game_id = $1`, [gameId]);
    const byId = Object.fromEntries(per.map((r: any) => [r.id, r]));
    expect(byId[ch.AC.assignment_id]).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 70 });
    expect(byId[ch.BC.assignment_id]).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 0 });
    expect(byId[ch.DC.assignment_id]).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 50 });
    expect(byId[ch.CA.assignment_id]).toMatchObject({ status: 'opened', answered_questions: 3, current_score: 30 });
  });

  it('10. a completed challenge accepts no more answers; challenge data does not expose score pre-reveal', async () => {
    const q = (await db.q(SERVICE, `select id from public.questions where assignment_id = $1 limit 1`, [ch.AC.assignment_id]))[0].id;
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.AC.raw_token, p_selected_option: 'A', p_question_id: q }), /already been completed/);
    const view = await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.AC.raw_token });
    expect(view.progress).toMatchObject({ is_completed: true, answered: 7, current_score: null });
    expect(view.round.is_revealed).toBe(false);
    expect(view.answers.every((a: any) => a.is_correct === null)).toBe(true);
  });

  it('11. Amal aggregates three independent challenges; participant statuses reflect real progress', async () => {
    const st = Object.fromEntries((await db.q(SERVICE, `select display_name, status from public.participants where game_id = $1`, [gameId])).map((r: any) => [r.display_name, r.status]));
    expect(st.Amal).toBe('completed');   // sent one + all 3 incoming submitted
    expect(st.Arun).toBe('selected');    // sent one, incoming (from Amal) only 3/7 answered
    expect(st.Rahul).toBe('selected');   // sent one, nobody sent to him
    expect(st.Nikhil).toBe('selected');
  });

  it('12. LIVE leaderboard counts only completed challenges (no per-answer leak); admin sees partial progress', async () => {
    const live = await db.rpc(ANON, 'get_leaderboard', { p_game_id: gameId });
    expect(live.game.is_final).toBe(false);
    expect(rank(live, 'Amal')).toMatchObject({ total_points: 120, correct_answers: 12, wrong_answers: 9, challenges_completed: 3, rank: 1 });
    expect(rank(live, 'Arun')).toMatchObject({ total_points: 0, challenges_completed: 0 }); // 3 correct answers hidden until finished
    const admin = await db.rpc(ADMIN, 'get_leaderboard', { p_game_id: gameId });
    expect(rank(admin, 'Arun')).toMatchObject({ total_points: 30, correct_answers: 3 });
  });

  it('13. correct answers stay hidden until the admin completes the game', async () => {
    const v = await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.CA.raw_token });
    expect(JSON.stringify(v.questions)).not.toMatch(/"correct_option": "[ABCD]"/);
    expect(v.round.is_revealed).toBe(false);
  });

  it('14. pause blocks new answers/challenges, resume restores them', async () => {
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: gameId, p_action: 'pause' });
    const q = (await db.q(SERVICE, `select id from public.questions where assignment_id = $1 and sequence_num = 4`, [ch.CA.assignment_id]))[0].id;
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.CA.raw_token, p_selected_option: 'A', p_question_id: q }), /paused by the host/);
    expect((await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.CA.raw_token })).closed_reason).toBe('paused');
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: gameId, p_action: 'resume' });
    const r = await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.CA.raw_token, p_selected_option: 'A', p_question_id: q });
    expect(r.answered_count).toBe(4);
  });

  it('15. Complete Game: finalizes scores, reveals answers, final leaderboard with ties, blocks new answers', async () => {
    const done = await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: gameId, p_action: 'complete' });
    expect(done.status).toBe('completed');

    const lb = await db.rpc(ANON, 'get_leaderboard', { p_game_id: gameId });
    expect(lb.game).toMatchObject({ status: 'completed', is_final: true });
    expect(rank(lb, 'Amal')).toMatchObject({ total_points: 120, rank: 1 });
    // Arun: CA challenge: Q1-3 correct, Q4 answered 'A' (maybe right/wrong), Q5-7 unanswered = 0 pts
    const arun = rank(lb, 'Arun');
    const q4 = (await db.q(SERVICE, `select correct_option from public.questions where assignment_id = $1 and sequence_num = 4`, [ch.CA.assignment_id]))[0].correct_option;
    expect(arun.total_points).toBe(30 + (q4 === 'A' ? 10 : 0));
    // ties: Rahul and Nikhil received nothing => 0 points, SAME rank (competition ranking)
    expect(rank(lb, 'Rahul')).toMatchObject({ total_points: 0 });
    expect(rank(lb, 'Rahul').rank).toBe(rank(lb, 'Nikhil').rank);
    expect(rank(lb, 'Rahul').rank).toBe(3);
    expect(lb.rows.map((r: any) => r.rank)).toEqual([1, 2, 3, 3]);

    // the scores table equals the leaderboard (server-side single source of truth)
    const scores = await db.q(SERVICE, `select p.display_name, s.total_points from public.scores s join public.participants p on p.id = s.participant_id where s.game_id = $1`, [gameId]);
    for (const s of scores) expect(s.total_points, s.display_name).toBe(rank(lb, s.display_name).total_points);

    // reveal: correct answers + per-answer correctness + score are now visible
    const v = await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.AC.raw_token });
    expect(v.round.is_revealed).toBe(true);
    expect(v.questions.every((q: any) => ['A', 'B', 'C', 'D'].includes(q.correct_option))).toBe(true);
    expect(v.progress.current_score).toBe(70);
    expect(v.progress.max_score).toBe(70);
    expect(v.answers.every((a: any) => a.is_correct === true)).toBe(true);
    const bc = await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.BC.raw_token });
    expect(bc.progress.current_score).toBe(0);

    // completed game: no more answers, no more challenges
    const q5 = (await db.q(SERVICE, `select id from public.questions where assignment_id = $1 and sequence_num = 5`, [ch.CA.assignment_id]))[0].id;
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.CA.raw_token, p_selected_option: 'A', p_question_id: q5 }), /game has finished/);
    // old links still open to show the results
    expect((await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: P.Rahul.token })).game.status).toBe('completed');
    // Completing is not deleting
    expect((await db.q(SERVICE, `select count(*)::int c from public.answers a join public.assignments x on x.id = a.assignment_id where x.game_id = $1`, [gameId]))[0].c).toBeGreaterThan(20);
  });

  it('16. cancelled game: old links show cancelled, hide questions, accept no answers or challenges', async () => {
    const g = await seedGame(db, 'Cancel Flow');
    const pl = await addPlayers(db, g.gameId, [['X1', 'A'], ['X2', 'B'], ['X3', 'C']]);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
    const c = await db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.X1.token, p_receiver_id: pl.X2.id, p_topic_id: g.topicIds[0] });
    const qid = (await db.q(SERVICE, `select id from public.questions where assignment_id = $1 and sequence_num = 1`, [c.assignment_id]))[0].id;
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'cancel' });
    const view = await db.rpc(ANON, 'get_challenge_by_token', { p_token: c.raw_token });
    expect(view.game.status).toBe('cancelled');
    expect(view.closed_reason).toBe('cancelled');
    expect(view.is_open).toBe(false);
    expect(view.questions).toEqual([]);
    await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: c.raw_token, p_selected_option: 'A', p_question_id: qid }), /cancelled by the host/);
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.X2.token, p_receiver_id: pl.X3.id, p_topic_id: g.topicIds[0] }), /cancelled by the host/);
    expect((await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: pl.X2.token })).game.status).toBe('cancelled');
    // records preserved
    expect((await db.q(SERVICE, `select count(*)::int c from public.assignments where game_id = $1`, [g.gameId]))[0].c).toBe(1);
  });

  it('17. question reuse policy: reuse across receivers is fine, but a receiver never sees the same question twice', async () => {
    const g = await seedGame(db, 'Reuse Policy', { topics: [TOPICS.movies] }); // pool: 10 questions (4E/4M/2H)
    const pl = await addPlayers(db, g.gameId, [['U1', 'A'], ['U2', 'B'], ['U3', 'C']]);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
    const t = g.topicIds[0];
    const first = await db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.U1.token, p_receiver_id: pl.U3.id, p_topic_id: t });
    // BEFORE sending, the invitation page is told which (friend, topic) pairs are used up
    const before = await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: pl.U2.token });
    expect(before.unavailable).toEqual([{ receiver_id: pl.U3.id, topic_id: t }]); // U3+Movies only; U1+Movies is still free
    expect(JSON.stringify(before.unavailable)).not.toContain(pl.U1.id);
    // nothing sensitive leaks through it (no sender, no questions, no answers)
    expect(Object.keys(before.unavailable[0]).sort()).toEqual(['receiver_id', 'topic_id']);
    // U2 -> U3 same topic: only 3 unseen questions remain for U3 (1E/1M/1H) -> refuse with a useful message
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.U2.token, p_receiver_id: pl.U3.id, p_topic_id: t }), /Not enough unseen easy questions left for U3 in "Movies & Entertainment"/);
    // U2 -> U1 (different receiver) reuses pool questions successfully
    const second = await db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.U2.token, p_receiver_id: pl.U1.id, p_topic_id: t });
    expect(second.assignment_id).not.toBe(first.assignment_id);
    const used = await db.q(SERVICE, `select count(*)::int c from public.questions where game_id = $1 and assignment_id is not null`, [g.gameId]);
    expect(used[0].c).toBe(14);
    // failed attempt left no partial rows behind (atomic)
    expect((await db.q(SERVICE, `select count(*)::int c from public.assignments where game_id = $1`, [g.gameId]))[0].c).toBe(2);
  });

  it('18. disabled topics cannot be picked in an existing game', async () => {
    const g = await seedGame(db, 'Disable Mid', { topics: [TOPICS.movies, TOPICS.ai] });
    const pl = await addPlayers(db, g.gameId, [['V1', 'A'], ['V2', 'B'], ['V3', 'C']]);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
    await db.q(ADMIN, `update public.topics set is_active = false where id = $1`, [g.topicIds[1]]);
    await expectError(db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.V1.token, p_receiver_id: pl.V2.id, p_topic_id: g.topicIds[1] }), /currently disabled/);
    const j = await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: pl.V1.token });
    expect(j.topics.map((x: any) => x.name)).toEqual(['Movies & Entertainment']);
    await db.q(ADMIN, `update public.topics set is_active = true where id = $1`, [g.topicIds[1]]);
  });

  it('19. custom points setting is honoured (20 per correct, -5 per wrong)', async () => {
    const g = await seedGame(db, 'Custom Points', { topics: [TOPICS.movies], settings: { min_participants: 2, max_participants: 5, points_correct: 20, points_wrong: -5 } });
    const pl = await addPlayers(db, g.gameId, [['W1', 'A'], ['W2', 'B']]);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
    const c = await db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.W1.token, p_receiver_id: pl.W2.id, p_topic_id: g.topicIds[0] });
    await play(db, c.raw_token, c.assignment_id, ['correct', 'correct', 'correct', 'correct', 'wrong', 'wrong', 'wrong']);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: g.gameId, p_action: 'complete' });
    const lb = await db.rpc(ANON, 'get_leaderboard', { p_game_id: g.gameId });
    expect(rank(lb, 'W2')).toMatchObject({ total_points: 4 * 20 - 3 * 5, correct_answers: 4, wrong_answers: 3 });
    const v = await db.rpc(ANON, 'get_challenge_by_token', { p_token: c.raw_token });
    expect(v.game.points_correct).toBe(20);
    expect(v.progress.max_score).toBe(140);
  });
});
