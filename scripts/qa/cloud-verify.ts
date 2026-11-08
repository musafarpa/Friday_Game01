/**
 * CLOUD VERIFICATION (run by the project owner AFTER applying migration 20260104000000 and deploying).
 *
 *   QA_ADMIN_EMAIL=you@example.com QA_ADMIN_PASSWORD='...' CONFIRM_CLOUD_TEST=yes \
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa/cloud-verify.ts
 *
 * Guard rails
 *   - refuses to run without CONFIRM_CLOUD_TEST=yes and valid admin credentials
 *   - refuses to run if migration 20260104 is not applied (so it can never exercise the legacy RPCs)
 *   - creates ONLY games named "QA-DISPOSABLE-<timestamp>-..." and deletes ONLY those (by id) in `finally`
 *   - never lists, edits or deletes any other game/participant/topic
 *   - uses the publishable key + the admin's normal sign-in; no service-role key anywhere
 * It exercises the real cloud: auth, RLS, RPCs, server-side scoring and REAL Supabase Realtime.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getBankQuestionsForTopic } from '../../src/data/questionBank';

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const EMAIL = process.env.QA_ADMIN_EMAIL;
const PASSWORD = process.env.QA_ADMIN_PASSWORD;

const results: Array<{ name: string; status: 'PASS' | 'FAIL'; detail?: string }> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const created: string[] = [];

async function main() {
  if (process.env.CONFIRM_CLOUD_TEST !== 'yes') throw new Error('Set CONFIRM_CLOUD_TEST=yes to run against the cloud project.');
  if (!EMAIL || !PASSWORD) throw new Error('Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD.');
  if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing.');
  console.log(`Target: ${URL}`);

  const anon = mk();
  const probe = await anon.rpc('participant_join', { p_game_id: '00000000-0000-0000-0000-000000000000', p_token: 'x'.repeat(32) });
  if (probe.error?.code === 'PGRST202') throw new Error('Migration 20260104000000 is NOT applied on this project. Apply it first.');
  check('migration 20260104 present (participant_join callable)', !probe.error);

  // ---- public-key exposure (read-only)
  for (const t of ['participants', 'assignments', 'questions', 'answers', 'scores', 'participant_secrets', 'assignment_secrets', 'game_events', 'app_settings']) {
    const r = await anon.from(t).select('*').limit(5);
    check(`anon sees no rows in ${t}`, !r.error && (r.data ?? []).length === 0, r.error?.message ?? '');
  }
  const games = await anon.from('games').select('settings').limit(200);
  check('no public games.settings contains a question pool / correct answers', !JSON.stringify(games.data ?? []).match(/correct_option|topics_question_pool/));
  for (const fn of ['get_participant_by_token', 'create_challenge_assignment', 'delete_game_room', 'reveal_round_answers']) {
    const r = await anon.rpc(fn, {});
    check(`legacy RPC ${fn} is gone`, r.error?.code === 'PGRST202', r.error?.message ?? 'still callable!');
  }

  // ---- admin
  const admin = mk();
  const login = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (login.error) throw new Error(`Admin sign-in failed: ${login.error.message}`);
  check('admin sign-in + is_admin()', (await admin.rpc('is_admin')).data === true);
  check('anon is_admin() is false', (await anon.rpc('is_admin')).data === false);
  const denied = await anon.rpc('admin_topic_stats');
  check('anon denied admin RPC', !!denied.error, denied.error?.message ?? '');

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const topicNames = ['Movies & Entertainment', 'Cricket & Sports', 'AI & Technology'];
  const { data: topicRows } = await admin.from('topics').select('id,name').in('name', topicNames);
  const topicIds = topicNames.map((n) => topicRows!.find((t: any) => t.name === n)!.id);

  async function makeGame(suffix: string) {
    const name = `QA-DISPOSABLE-${stamp}-${suffix}`;
    const c = await admin.rpc('admin_create_game', { p_name: name, p_description: 'disposable QA game - safe to delete', p_settings: { min_participants: 3, max_participants: 10, points_correct: 10 }, p_topic_ids: topicIds, p_initial_status: 'registration_open' });
    if (c.error) throw new Error(c.error.message);
    created.push(c.data.game_id);
    for (let i = 0; i < topicIds.length; i++) {
      const qs = getBankQuestionsForTopic(topicNames[i], 10, { easy: 4, medium: 4, hard: 2 }).map((q) => ({ question_text: q.question, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, correct_option: q.correct_option, explanation: q.explanation, difficulty: q.difficulty }));
      const r = await admin.rpc('admin_save_pool_questions', { p_game_id: c.data.game_id, p_topic_id: topicIds[i], p_questions: qs });
      if (r.error) throw new Error(r.error.message);
    }
    return { id: c.data.game_id as string, name };
  }
  async function addPlayer(gameId: string, n: string, code: string) {
    const r = await admin.rpc('admin_add_participant', { p_game_id: gameId, p_display_name: n, p_player_code: code });
    if (r.error) throw new Error(r.error.message);
    return { id: r.data.participant_id as string, token: r.data.raw_token as string };
  }
  const answer = async (assignmentId: string, token: string, picks: Array<'right' | 'wrong'>) => {
    const { data: qs } = await admin.from('questions').select('id,correct_option,sequence_num').eq('assignment_id', assignmentId).order('sequence_num');
    for (let i = 0; i < picks.length; i++) {
      const right = qs![i].correct_option;
      const opt = picks[i] === 'right' ? right : ['A', 'B', 'C', 'D'].find((o) => o !== right)!;
      const r = await mk().rpc('submit_challenge_answer', { p_token: token, p_selected_option: opt, p_question_id: qs![i].id });
      if (r.error) throw new Error(r.error.message);
    }
  };

  // ---- A-to-Z scenario on a disposable game
  const g = await makeGame('MAIN');
  const poolStatus = (await admin.rpc('admin_pool_status', { p_game_id: g.id })).data;
  check('pool: every topic has >=7 valid questions (3E/3M/1H)', poolStatus.ready === true, JSON.stringify(poolStatus.topics.map((t: any) => `${t.topic_name}:${t.total}`)));
  const A = await addPlayer(g.id, 'Arun', 'A');
  const B = await addPlayer(g.id, 'Rahul', 'B');
  const startEarly = await admin.rpc('admin_set_game_status', { p_game_id: g.id, p_action: 'start' });
  check('start refused below minimum participants', /At least 3 participants/.test(startEarly.error?.message ?? ''), startEarly.error?.message ?? '');
  const C = await addPlayer(g.id, 'Amal', 'C');
  const D = await addPlayer(g.id, 'Nikhil', 'D');
  check('invite tokens unique', new Set([A.token, B.token, C.token, D.token]).size === 4);

  // REAL Supabase Realtime: admin listens to answers/assignments, anon listens to games
  const adminEvents: string[] = [];
  const anonEvents: string[] = [];
  let subscribed = 0;
  const ch = admin.channel(`qa-${stamp}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `game_id=eq.${g.id}` }, (p) => adminEvents.push(`assignments:${p.eventType}`))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, (p) => adminEvents.push(`answers:${p.eventType}`));
  ch.subscribe((s) => { if (s === 'SUBSCRIBED') subscribed++; });
  const ach = anon.channel(`qa-anon-${stamp}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${g.id}` }, (p) => anonEvents.push(`games:${p.eventType}`))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, (p) => anonEvents.push(`answers:${p.eventType}`));
  ach.subscribe((s) => { if (s === 'SUBSCRIBED') subscribed++; });
  await sleep(2500);
  check('Realtime channels SUBSCRIBED (admin + anon)', subscribed === 2, `subscribed=${subscribed}`);

  const start = await admin.rpc('admin_set_game_status', { p_game_id: g.id, p_action: 'start' });
  check('start succeeds with min players + valid pools', !start.error, start.error?.message ?? '');

  const create = (from: { token: string }, to: { id: string }, topic: string) =>
    mk().rpc('participant_create_challenge', { p_game_id: g.id, p_token: from.token, p_receiver_id: to.id, p_topic_id: topic });
  const c1 = await create(A, C, topicIds[0]);
  const c2 = await create(B, C, topicIds[1]);
  const c3 = await create(D, C, topicIds[2]);
  const c4 = await create(C, A, topicIds[0]);
  check('4 challenges created', [c1, c2, c3, c4].every((c) => !c.error), [c1, c2, c3, c4].map((c) => c.error?.message).filter(Boolean).join('; '));
  for (const [i, c] of [c1, c2, c3, c4].entries()) {
    const { data: qs } = await admin.from('questions').select('sequence_num,difficulty,topic_id').eq('assignment_id', c.data.assignment_id).order('sequence_num');
    check(`challenge ${i + 1}: 7 ordered questions, 3E/3M/1H, correct topic`, qs!.length === 7 && qs!.map((q: any) => q.difficulty).join() === 'easy,easy,easy,medium,medium,medium,hard' && qs!.every((q: any) => q.topic_id === [topicIds[0], topicIds[1], topicIds[2], topicIds[0]][i]));
  }
  const dupe = await create(A, B, topicIds[2]);
  check('second challenge from the same sender refused', /already sent/.test(dupe.error?.message ?? ''), dupe.error?.message ?? '');

  await answer(c1.data.assignment_id, c1.data.raw_token, Array(7).fill('right'));
  await answer(c2.data.assignment_id, c2.data.raw_token, Array(7).fill('wrong'));
  await answer(c3.data.assignment_id, c3.data.raw_token, ['right', 'right', 'wrong', 'right', 'wrong', 'right', 'right']);
  await answer(c4.data.assignment_id, c4.data.raw_token, ['right', 'right', 'right']);
  const view = (await mk().rpc('get_challenge_by_token', { p_token: c1.data.raw_token })).data;
  check('answers/score hidden before completion', view.questions.every((q: any) => q.correct_option === null) && view.progress.current_score === null);
  const live = (await mk().rpc('get_leaderboard', { p_game_id: g.id })).data;
  const row = (lb: any, n: string) => lb.rows.find((r: any) => r.display_name === n);
  check('live leaderboard: Amal 120 (3 finished challenges), Arun 0 (in progress)', row(live, 'Amal').total_points === 120 && row(live, 'Arun').total_points === 0, JSON.stringify(live.rows.map((r: any) => `${r.display_name}:${r.total_points}`)));
  await sleep(2500);
  check('REAL Realtime delivered answer/assignment events to the admin', adminEvents.some((e) => e.startsWith('answers:')) && adminEvents.some((e) => e.startsWith('assignments:')), `${adminEvents.length} events`);
  check('REAL Realtime delivered games events to anon but NO answers events (RLS)', anonEvents.some((e) => e.startsWith('games:')) && !anonEvents.some((e) => e.startsWith('answers:')), anonEvents.join(','));

  const done = await admin.rpc('admin_set_game_status', { p_game_id: g.id, p_action: 'complete' });
  check('complete game', !done.error, done.error?.message ?? '');
  const fin = (await mk().rpc('get_leaderboard', { p_game_id: g.id })).data;
  check('final leaderboard: Amal 120 #1; Arun 30-40; Rahul & Nikhil tie at 0 (rank 3)', row(fin, 'Amal').total_points === 120 && row(fin, 'Amal').rank === 1 && row(fin, 'Rahul').rank === row(fin, 'Nikhil').rank && row(fin, 'Rahul').rank === 3, JSON.stringify(fin.rows.map((r: any) => `${r.rank}.${r.display_name}:${r.total_points}`)));
  const late = await mk().rpc('submit_challenge_answer', { p_token: c4.data.raw_token, p_selected_option: 'A', p_question_id: (await admin.from('questions').select('id').eq('assignment_id', c4.data.assignment_id).eq('sequence_num', 5).single()).data!.id });
  check('completed game rejects new answers', /finished/.test(late.error?.message ?? ''), late.error?.message ?? '');

  // ---- cancel + delete on a second disposable game
  const g2 = await makeGame('CANCEL');
  const P = [await addPlayer(g2.id, 'P1', 'A'), await addPlayer(g2.id, 'P2', 'B'), await addPlayer(g2.id, 'P3', 'C')];
  await admin.rpc('admin_set_game_status', { p_game_id: g2.id, p_action: 'start' });
  const cc = await mk().rpc('participant_create_challenge', { p_game_id: g2.id, p_token: P[0].token, p_receiver_id: P[1].id, p_topic_id: topicIds[0] });
  const delActive = await admin.rpc('admin_delete_game', { p_game_id: g2.id });
  check('delete of an in-progress game is refused', /in progress/.test(delActive.error?.message ?? ''), delActive.error?.message ?? '');
  await admin.rpc('admin_set_game_status', { p_game_id: g2.id, p_action: 'cancel' });
  const cv = (await mk().rpc('get_challenge_by_token', { p_token: cc.data.raw_token })).data;
  check('cancelled game: link shows cancelled, no questions', cv.closed_reason === 'cancelled' && cv.questions.length === 0);
  const restart = await admin.rpc('admin_set_game_status', { p_game_id: g2.id, p_action: 'start' });
  check('cancelled game cannot be restarted', !!restart.error, restart.error?.message ?? '');
}

main()
  .catch((e) => {
    check('script ran to completion', false, e.message);
  })
  .finally(async () => {
    // cleanup: ONLY the disposable games this run created, by id
    const admin = mk();
    if (EMAIL && PASSWORD && created.length) {
      await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      for (const id of created) {
        let r = await admin.rpc('admin_delete_game', { p_game_id: id });
        if (r.error && /in progress/.test(r.error.message)) {
          await admin.rpc('admin_set_game_status', { p_game_id: id, p_action: 'cancel' });
          r = await admin.rpc('admin_delete_game', { p_game_id: id });
        }
        console.log(`cleanup disposable game ${id}: ${r.error ? 'FAILED ' + r.error.message : 'deleted'}`);
      }
    }
    mkdirSync(join('docs', 'qa', 'evidence'), { recursive: true });
    const file = join('docs', 'qa', 'evidence', `cloud-verify-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ target: URL, ran_at: new Date().toISOString(), results }, null, 2));
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`\n${results.length - failed} passed, ${failed} failed. Evidence: ${file}`);
    process.exit(failed ? 1 : 0);
  });
