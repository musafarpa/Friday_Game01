import { test, expect } from '@playwright/test';
import { EMU, ANON_KEY, resetDb, sql, adminClient, anonClient, seedGame, saveEvidence, newPlayerContext, APP } from './helpers';

/**
 * Security tests through the same HTTP surface a malicious visitor would use (PostgREST + RPC),
 * with the public key only. An HTTP 200 proves nothing here - row visibility and error codes do.
 */
test.describe.configure({ mode: 'serial' });
const ev: Record<string, any> = {};
let g: Awaited<ReturnType<typeof seedGame>>;
let challenge: { raw_token: string; assignment_id: string };

test.beforeAll(async ({ request }) => {
  await resetDb(request);
  const api = await adminClient();
  g = await seedGame(api, 'Security Game', { players: [['Arun', 'A'], ['Rahul', 'B'], ['Amal', 'C']], start: true });
  const c = await api.rpc('participant_create_challenge', { p_game_id: g.gameId, p_token: g.players.Arun.token, p_receiver_id: g.players.Amal.id, p_topic_id: g.topicIds[0] });
  challenge = c.data;
});
test.afterAll(() => saveEvidence('04-security.json', ev));

const rest = (request: any, path: string, init: any = {}) => request.get(`${EMU}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, ...(init.headers || {}) } });

test('1. public key cannot read any sensitive table (participants, assignments, questions, answers, scores, secrets, events, settings)', async ({ request }) => {
  const out: Record<string, number> = {};
  for (const t of ['participants', 'assignments', 'questions', 'answers', 'scores', 'game_events', 'participant_secrets', 'assignment_secrets', 'app_settings', 'admins']) {
    const r = await rest(request, `${t}?select=*`);
    expect(r.status(), t).toBe(200);
    const rows = await r.json();
    out[t] = rows.length;
    expect(rows, `${t} must expose zero rows to the public key`).toEqual([]);
  }
  ev.anon_row_counts = out;
});

test('2. games.settings (publicly readable) holds no question pool / correct answers; no hashes or tokens are public', async ({ request }) => {
  const games = await (await rest(request, 'games?select=*')).json();
  expect(games.length).toBeGreaterThan(0);
  const blob = JSON.stringify(games);
  expect(blob).not.toContain('correct_option');
  expect(blob).not.toContain('topics_question_pool');
  expect(blob).not.toContain(g.players.Arun.token);
  const rounds = JSON.stringify(await (await rest(request, 'game_rounds?select=*')).json());
  expect(rounds).not.toContain('token');
  ev.games_settings_clean = true;
});

test('3. the exploit chain is closed: reading tables to obtain a "token hash" then using it as a credential', async ({ request }) => {
  const hash = (await sql(request, `select invitation_token_hash h from public.participants where id = $1`, [g.players.Arun.id]))[0].h;
  const stolen = await anonClient().rpc('participant_join', { p_game_id: g.gameId, p_token: hash });
  expect(stolen.data).toBeNull();
  const chHash = (await sql(request, `select challenge_token_hash h from public.assignments where id = $1`, [challenge.assignment_id]))[0].h;
  expect((await anonClient().rpc('get_challenge_by_token', { p_token: chHash })).data).toBeNull();
  // legacy functions are gone
  for (const fn of ['get_participant_by_token', 'create_challenge_assignment', 'reveal_round_answers', 'delete_game_room', 'save_game_question']) {
    const r = await request.post(`${EMU}/rest/v1/rpc/${fn}`, { headers: { apikey: ANON_KEY }, data: {} });
    expect(r.status(), fn).toBe(404);
  }
  ev.exploit_chain_closed = true;
});

test('4. every admin RPC rejects the public key and a signed-in NON-admin user', async ({ request }) => {
  const nil = '00000000-0000-0000-0000-000000000000';
  const calls: Array<[string, any]> = [
    ['admin_create_game', { p_name: 'x', p_description: '', p_settings: {}, p_topic_ids: [], p_initial_status: 'draft' }],
    ['admin_set_game_status', { p_game_id: nil, p_action: 'cancel' }],
    ['admin_delete_game', { p_game_id: nil }],
    ['cleanup_completed_games', { p_retention_hours: 1 }],
    ['admin_add_participant', { p_game_id: nil, p_display_name: 'x', p_player_code: 'X' }],
    ['admin_remove_participant', { p_participant_id: nil }],
    ['admin_regenerate_invitation', { p_participant_id: nil }],
    ['admin_save_pool_questions', { p_game_id: nil, p_topic_id: nil, p_questions: [] }],
    ['admin_delete_topic', { p_topic_id: nil }],
    ['admin_set_default_rules', { p_rules: {} }],
  ];
  const player = anonClient();
  const si = await player.auth.signInWithPassword({ email: 'player@test.local', password: 'Player#QA-2026' });
  expect(si.error).toBeNull();
  const results: Record<string, string> = {};
  for (const [fn, args] of calls) {
    const a = await anonClient().rpc(fn, args);
    expect(a.error?.message, `${fn} as anon`).toMatch(/permission denied/i);
    const n = await player.rpc(fn, args);
    expect(n.error?.message, `${fn} as non-admin`).toMatch(/Unauthorized|permission denied/i);
    results[fn] = 'anon + non-admin denied';
  }
  ev.admin_rpc_authorization = results;
});

test('5. participant data is isolated: a player only ever receives their own challenge links', async ({ browser }) => {
  const { ctx, page } = await newPlayerContext(browser);
  const bodies: string[] = [];
  page.on('response', async (r) => { if (r.url().startsWith(EMU)) try { bodies.push(await r.text()); } catch { /* */ } });
  await page.goto(g.players.Rahul.url); // Rahul has neither sent nor received anything
  await expect(page.getByTestId('welcome-heading')).toContainText('Rahul');
  const all = bodies.join('\n');
  expect(all).not.toContain(challenge.raw_token);          // Arun->Amal challenge token never sent to Rahul
  expect(all).not.toContain(g.players.Arun.token);
  expect(all).not.toContain(g.players.Amal.token);
  expect(all).not.toContain('invitation_token_hash');
  expect(all).not.toContain('email_or_contact');
  // Rahul holding Arun's challenge link can only reach THAT challenge: no extra data about others
  await page.goto(`${APP}/challenge/${challenge.raw_token}`);
  await expect(page.getByTestId('question-counter')).toBeVisible();
  const q = bodies.join('\n');
  expect(q).not.toMatch(/"correct_option"\s*:\s*"[ABCD]"/);
  await ctx.close();
  ev.participant_isolation = 'verified over real browser traffic';
});

test('6. invalid / malformed / hostile tokens and ids are rejected cleanly (no 500s)', async ({ request }) => {
  const hostile = ["' or '1'='1", '"; drop table games; --', '%00', 'A'.repeat(5000), '../../etc/passwd', '<script>alert(1)</script>'];
  for (const t of hostile) {
    const r = await request.post(`${EMU}/rest/v1/rpc/get_challenge_by_token`, { headers: { apikey: ANON_KEY }, data: { p_token: t } });
    expect(r.status(), t.slice(0, 20)).toBeLessThan(500);
    expect(await r.json()).toBeNull();
  }
  const r2 = await request.post(`${EMU}/rest/v1/rpc/participant_join`, { headers: { apikey: ANON_KEY }, data: { p_game_id: 'not-a-uuid', p_token: 'x'.repeat(40) } });
  expect(r2.status()).toBe(400);
  expect((await sql(request, `select count(*)::int c from public.games`))[0].c).toBeGreaterThan(0); // nothing dropped
  ev.hostile_inputs = hostile.length;
});

test('7. forged client scores are impossible: no write path exists for answers/scores from the browser', async ({ request }) => {
  // fully VALID rows, so that Row Level Security is the only thing that can stop them
  const round = (await sql(request, `select id from public.game_rounds where game_id = $1`, [g.gameId]))[0].id;
  const qid = (await sql(request, `select id from public.questions where assignment_id = $1 limit 1`, [challenge.assignment_id]))[0].id;
  const forged: Record<string, any> = {
    scores: { game_id: g.gameId, round_id: round, participant_id: g.players.Rahul.id, total_points: 9999, correct_answers: 99, wrong_answers: 0 },
    answers: { assignment_id: challenge.assignment_id, question_id: qid, participant_id: g.players.Amal.id, selected_option: 'A', is_correct: true, question_num: 1 },
    assignments: { game_id: g.gameId, round_id: round, sender_id: g.players.Rahul.id, receiver_id: g.players.Arun.id, topic_id: g.topicIds[0], challenge_token_hash: 'forged-hash', status: 'pending' },
    questions: { game_id: g.gameId, topic_id: g.topicIds[0], topic_category: 'x', question_text: 'Forged question text here', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_option: 'A' },
    participants: { game_id: g.gameId, display_name: 'Mallory', player_code: 'M', invitation_token_hash: 'forged' },
  };
  const statuses: Record<string, number> = {};
  for (const [t, row] of Object.entries(forged)) {
    const r = await request.post(`${EMU}/rest/v1/${t}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' }, data: row });
    statuses[t] = r.status();
    expect([401, 403], `${t}: ${await r.text()}`).toContain(r.status());
    expect(await r.text()).toMatch(/row-level security|permission denied/i);
  }
  ev.forged_insert_statuses = statuses;
  expect((await sql(request, `select count(*)::int c from public.participants where display_name = 'Mallory'`))[0].c).toBe(0);
  expect((await sql(request, `select count(*)::int c from public.assignments where challenge_token_hash = 'forged-hash'`))[0].c).toBe(0);
  const patch = await request.patch(`${EMU}/rest/v1/assignments?id=eq.${challenge.assignment_id}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' }, data: { current_score: 9999, status: 'submitted' } });
  expect(patch.status()).toBeLessThan(500);
  const row = (await sql(request, `select current_score, status from public.assignments where id = $1`, [challenge.assignment_id]))[0];
  expect(row.current_score).toBe(0);
  expect(row.status).not.toBe('submitted');
  const gp = await request.patch(`${EMU}/rest/v1/games?id=eq.${g.gameId}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' }, data: { status: 'completed' } });
  expect(gp.status()).toBeLessThan(500);
  expect((await sql(request, `select status from public.games where id = $1`, [g.gameId]))[0].status).toBe('active');
  ev.forged_writes_blocked = true;
});

test('8. AI endpoint source: admin-only, no wildcard CORS, key never in a URL (static check of the deployed handler)', async () => {
  const src = (await import('node:fs')).readFileSync('api/generate-question.ts', 'utf8');
  expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  expect(src).toMatch(/is_admin/);
  expect(src).toMatch(/Authentication required/);
  expect(src).not.toMatch(/\?key=/);
  expect(src).toMatch(/x-goog-api-key/);
  ev.ai_endpoint_hardened = true;
});

test('9. no service-role / secret keys in the shipped bundle or in VITE_ variables', async () => {
  const fs = await import('node:fs');
  const dir = 'dist-e2e/assets/';
  const bundle = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(dir + f, 'utf8')).join('\n');
  for (const needle of ['service_role', 'SUPABASE_SERVICE_ROLE']) expect(bundle, needle).not.toContain(needle);
  // the supabase-js library itself contains the *prefix* "sb_secret_" (key-type detection); a key VALUE would be long
  expect(bundle).not.toMatch(/sb_secret_[A-Za-z0-9_-]{16,}/);
  // any JWT embedded in the bundle must not be a service_role token
  for (const m of bundle.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    expect(JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString()).role).not.toBe('service_role');
  }
  expect(bundle).not.toMatch(/AIzaSy[0-9A-Za-z_-]{20,}/);
  expect(bundle).not.toMatch(/sk-[A-Za-z0-9]{32,}/);
  const envs = fs.readFileSync('.env.example', 'utf8') + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
  expect(envs).not.toMatch(/^VITE_[A-Z_]*SERVICE[A-Z_]*=/m);
  ev.bundle_secret_scan = 'clean';
});
