import { test, expect, Page, BrowserContext } from '@playwright/test';
import { APP, EMU, resetDb, loginAdminUi, tab, sql, saveEvidence, adminClient, seedGame, newPlayerContext, acceptDialogs, TOPIC, correctOptions } from './helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lifecycle, cancel/delete/cleanup, topics, rules, multi-tab conflicts and failure modes.
 * Every destructive action runs against DISPOSABLE games created inside this spec.
 */
test.describe.configure({ mode: 'serial' });

const evidence: Record<string, any> = {};
let admin: Page;
let ctx: BrowserContext;
let api: SupabaseClient;
const P3: Array<[string, string]> = [['P1', 'A'], ['P2', 'B'], ['P3', 'C']];

test.beforeAll(async ({ browser, request }) => {
  await resetDb(request);
  api = await adminClient();
  ctx = await browser.newContext({ baseURL: APP, permissions: ['clipboard-read', 'clipboard-write'] });
  admin = await ctx.newPage();
  acceptDialogs(admin);
  await loginAdminUi(admin);
});
test.afterAll(async () => {
  saveEvidence('03-lifecycle.json', evidence);
  await ctx.close();
});

const card = (name: string) => admin.getByTestId(`game-card-${name}`);
const reload = async () => { await admin.reload(); await expect(admin.getByRole('heading', { name: 'Admin Command Center' })).toBeVisible(); };
const selectGame = async (label: RegExp | string) => {
  const sel = admin.getByTestId('game-selector');
  const opt = await sel.locator('option').filter({ hasText: label }).first().getAttribute('value');
  await sel.selectOption(opt!);
};

test('1. regression: switching games loads THAT game (roster, links, pools) - never the previous game', async () => {
  const g1 = await seedGame(api, 'Switch One', { players: [['Alice', 'A'], ['Bob', 'B'], ['Cleo', 'C']] });
  const g2 = await seedGame(api, 'Switch Two', { players: [['Xena', 'A'], ['Yuri', 'B'], ['Zack', 'C'], ['Wade', 'D']] });
  await reload();
  await tab(admin, 'participants');

  await selectGame(/Switch One/);
  await expect(admin.getByTestId('participant-Alice')).toBeVisible();
  await expect(admin.getByTestId('participant-Xena')).toHaveCount(0);
  await selectGame(/Switch Two/);
  await expect(admin.getByTestId('participant-Xena')).toBeVisible();
  await expect(admin.getByTestId('participant-Alice')).toHaveCount(0);
  expect(await admin.getByTestId('invite-url-Xena').innerText()).toContain(g2.gameId);
  await admin.getByTestId('participant-Xena').getByRole('button', { name: 'Copy Invite Link' }).click();
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toBe(g2.players.Xena.url);

  await selectGame(/Switch One/);
  await expect(admin.getByTestId('participant-Alice')).toBeVisible();
  expect(await admin.getByTestId('invite-url-Alice').innerText()).toContain(g1.gameId);
  await tab(admin, 'overview');
  await expect(admin.getByTestId('stat-participants')).toContainText('3');
  await selectGame(/Switch Two/);
  await expect(admin.getByTestId('stat-participants')).toContainText('4');
  evidence.game_switch = 'roster/links always belong to the selected game';
});

test('2. create-game validation in the UI: duplicate open name, invalid min/max, disabled topics not offered', async ({ request }) => {
  await tab(admin, 'games');
  await admin.getByTestId('games-create').click();
  const m = admin.getByTestId('create-game-modal');
  await m.getByLabel('Game Name *').fill('Switch One');
  await m.getByTestId('create-game-submit').click();
  await expect(m.getByRole('alert')).toContainText('An open game named "Switch One" already exists');
  await m.getByRole('button', { name: 'Cancel' }).click();

  // disabled topic is not selectable for new games
  await tab(admin, 'topics');
  await admin.getByTestId('toggle-Funny & Random').click();
  await expect(admin.getByTestId('topic-Funny & Random')).toContainText('Disabled');
  await tab(admin, 'games');
  await admin.getByTestId('games-create').click();
  await expect(admin.getByTestId('create-game-modal').getByRole('checkbox', { name: 'Funny & Random' })).toHaveCount(0);
  await expect(admin.getByTestId('create-game-modal').getByRole('checkbox', { name: 'Cricket & Sports' })).toHaveCount(1);
  await admin.getByTestId('create-game-modal').getByRole('button', { name: 'Cancel' }).click();
  await tab(admin, 'topics');
  await admin.getByTestId('toggle-Funny & Random').click();
  await expect(admin.getByTestId('topic-Funny & Random')).toContainText('Active');
  expect((await sql(request, `select is_active from public.topics where name = 'Funny & Random'`))[0].is_active).toBe(true);
});

test('2b. Edit Game modal + Games-tab Refresh: validation, save, and the change is real', async ({ request }) => {
  await tab(admin, 'games');
  await admin.getByTestId('games-refresh').click();
  await expect(card('Switch One')).toBeVisible();
  await admin.getByRole('button', { name: 'Edit Switch One' }).click();
  const m = admin.getByTestId('edit-game-modal');
  await m.getByLabel('Game Name *').fill('   ');
  await m.getByTestId('edit-game-save').click();
  await expect(m.getByRole('alert')).toContainText('Game name cannot be empty');
  await m.getByLabel('Game Name *').fill('Switch One Renamed');
  await m.getByLabel('Min Players').fill('9');
  await m.getByLabel('Max Players').fill('4');
  await m.getByTestId('edit-game-save').click();
  await expect(m.getByRole('alert')).toContainText('Maximum participants cannot be less than minimum');
  await m.getByLabel('Min Players').fill('3');
  await m.getByLabel('Max Players').fill('2');
  await m.getByTestId('edit-game-save').click();
  await expect(m.getByRole('alert')).toContainText('cannot be less than minimum');
  await m.getByLabel('Max Players').fill('3'); // exactly the 3 players already added
  await m.getByLabel('Points ✓').fill('15');
  await m.getByLabel('Description').fill('edited by e2e');
  await m.getByTestId('edit-game-save').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Game updated');
  const row = (await sql(request, `select name, description, settings from public.games where name = 'Switch One Renamed'`))[0];
  expect(row.description).toBe('edited by e2e');
  expect([row.settings.min_participants, row.settings.max_participants, row.settings.points_correct]).toEqual([3, 3, 15]);
  await expect(card('Switch One Renamed')).toBeVisible();
  evidence.edit_game = 'validated + saved';
});

test('3. start -> pause -> resume from the UI; players see the pause live and cannot answer meanwhile', async ({ browser, request }) => {
  const g = await seedGame(api, 'Pause Flow', { players: P3 });
  await reload();
  await selectGame(/Pause Flow/);
  await tab(admin, 'games');
  await card('Pause Flow').getByTestId('start-Pause Flow').click();
  await expect(card('Pause Flow')).toContainText('IN PROGRESS');

  const { ctx: pc, page } = await newPlayerContext(browser);
  await page.goto(g.players.P1.url);
  await page.getByTestId('pick-player-P2').click();
  await page.getByTestId('pick-topic-Movies & Entertainment').click();
  await page.getByTestId('send-challenge').click();
  await expect(page.getByTestId('outgoing-result')).toBeVisible();
  const ch = (await sql(request, `select a.id, s.raw_token from public.assignments a join public.assignment_secrets s on s.assignment_id = a.id where a.game_id = $1`, [g.gameId]))[0];
  const { ctx: rc, page: rp } = await newPlayerContext(browser);
  await rp.goto(`${APP}/challenge/${ch.raw_token}`);
  await expect(rp.getByTestId('question-counter')).toContainText('Question 1 of 7');

  await card('Pause Flow').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(card('Pause Flow')).toContainText('PAUSED');
  await expect(rp.getByTestId('challenge-paused')).toBeVisible(); // pushed live, no reload
  await expect(rp.getByTestId('submit-answer')).toHaveCount(0);
  await expect(page.getByTestId('state-paused')).toBeVisible();
  // server refuses direct answer attempts while paused
  const qid = (await sql(request, `select id from public.questions where assignment_id = $1 and sequence_num = 1`, [ch.id]))[0].id;
  const r = await request.post(`${EMU}/rest/v1/rpc/submit_challenge_answer`, { headers: { apikey: 'x' }, data: { p_token: ch.raw_token, p_selected_option: 'A', p_question_id: qid } });
  expect((await r.json()).message).toMatch(/paused by the host/);

  await card('Pause Flow').getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(card('Pause Flow')).toContainText('IN PROGRESS');
  await expect(rp.getByTestId('submit-answer')).toBeVisible();
  await rp.getByTestId('option-A').click();
  await rp.getByTestId('submit-answer').click();
  await expect(rp.getByTestId('answer-saved')).toContainText('Question 1');
  await pc.close(); await rc.close();
  evidence.pause_resume = 'players updated live; answers blocked while paused';
});

test('4. cancel: confirmation, CANCELLED status, old links show cancelled, records preserved, no restart', async ({ browser, request }) => {
  const g = await seedGame(api, 'Cancel Flow', { players: P3, start: true });
  const c = await api.rpc('participant_create_challenge', { p_game_id: g.gameId, p_token: g.players.P1.token, p_receiver_id: g.players.P2.id, p_topic_id: g.topicIds[0] });
  const challengeToken = c.data.raw_token;
  await reload();
  await tab(admin, 'games');
  await card('Cancel Flow').getByTestId('cancel-Cancel Flow').click();
  const dlg = admin.getByTestId('confirm-dialog');
  await expect(dlg).toContainText('Cancel "Cancel Flow"?');
  await expect(dlg).toContainText('does not delete anything');
  await admin.getByTestId('confirm-cancel').click(); // "Keep as is"
  expect((await sql(request, `select status from public.games where id = $1`, [g.gameId]))[0].status).toBe('active');
  await card('Cancel Flow').getByTestId('cancel-Cancel Flow').click();
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('"Cancel Flow" was cancelled');
  await expect(card('Cancel Flow')).toContainText('CANCELLED');
  for (const label of ['Start Game', 'Pause', 'Resume', 'Complete', 'Cancel']) await expect(card('Cancel Flow').getByRole('button', { name: label, exact: true })).toHaveCount(0);
  expect((await sql(request, `select count(*)::int c from public.assignments where game_id = $1`, [g.gameId]))[0].c).toBe(1); // kept
  expect((await sql(request, `select count(*)::int c from public.games where id = $1`, [g.gameId]))[0].c).toBe(1);        // not deleted

  const { ctx: pc, page } = await newPlayerContext(browser);
  await page.goto(`${APP}/challenge/${challengeToken}`);
  await expect(page.getByTestId('challenge-cancelled')).toContainText('cancelled');
  await expect(page.getByTestId('submit-answer')).toHaveCount(0);
  await page.goto(g.players.P2.url);
  await expect(page.getByTestId('state-cancelled')).toBeVisible();
  await expect(page.getByTestId('selection-flow')).toHaveCount(0);
  await pc.close();
  evidence.cancel = { status: 'cancelled', assignments_kept: 1 };
});

test('5. delete: in-progress games are locked; confirmation names the game and impact; other games untouched; old links die', async ({ browser, request }) => {
  const live = await seedGame(api, 'Live Keep', { players: P3, start: true });
  const doomed = await seedGame(api, 'Doomed Game', { players: P3 });
  const keepPoolBefore = (await sql(request, `select count(*)::int c from public.questions where game_id = $1`, [live.gameId]))[0].c;
  await reload();
  await tab(admin, 'games');

  // active game: no delete button at all (locked), and the server also refuses
  await expect(card('Live Keep').getByTestId('delete-Live Keep')).toHaveCount(0);
  await expect(card('Live Keep')).toContainText('locked while in progress');
  expect((await api.rpc('admin_delete_game', { p_game_id: live.gameId })).error?.message).toMatch(/in progress/);

  await card('Doomed Game').getByTestId('delete-Doomed Game').click();
  const dlg = admin.getByTestId('confirm-dialog');
  await expect(dlg).toContainText('Delete "Doomed Game" permanently?');
  await expect(dlg).toContainText('Other games are not affected');
  await admin.getByTestId('confirm-cancel').click();
  expect((await sql(request, `select count(*)::int c from public.games where id = $1`, [doomed.gameId]))[0].c).toBe(1);

  await card('Doomed Game').getByTestId('delete-Doomed Game').click();
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Game "Doomed Game" deleted');
  await expect(card('Doomed Game')).toHaveCount(0);
  for (const t of ['participants', 'game_topics', 'game_rounds', 'questions', 'game_events']) {
    expect((await sql(request, `select count(*)::int c from public.${t} where game_id = $1`, [doomed.gameId]))[0].c, t).toBe(0);
  }
  expect((await sql(request, `select count(*)::int c from public.participant_secrets s where s.participant_id = $1`, [doomed.players.P1.id]))[0].c).toBe(0);
  // other game completely untouched
  expect((await sql(request, `select count(*)::int c from public.questions where game_id = $1`, [live.gameId]))[0].c).toBe(keepPoolBefore);
  expect((await sql(request, `select count(*)::int c from public.participants where game_id = $1`, [live.gameId]))[0].c).toBe(3);

  const { ctx: pc, page } = await newPlayerContext(browser);
  await page.goto(doomed.players.P1.url);
  await expect(page.getByTestId('invite-error')).toBeVisible();
  await pc.close();
  evidence.delete = { in_progress_locked: true, impact_dialog: true, orphans: 0, other_game_intact: true };
});

test('6. retention cleanup removes ONLY old completed/cancelled games; active/paused/registration are never touched', async ({ request }) => {
  const mk = async (name: string, final: 'complete' | 'cancel' | 'active' | 'paused' | 'registration', hours: number) => {
    const g = await seedGame(api, name, { players: P3 });
    if (final !== 'registration' && final !== 'cancel') await api.rpc('admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
    if (final === 'complete') await api.rpc('admin_set_game_status', { p_game_id: g.gameId, p_action: 'complete' });
    if (final === 'paused') await api.rpc('admin_set_game_status', { p_game_id: g.gameId, p_action: 'pause' });
    if (final === 'cancel') await api.rpc('admin_set_game_status', { p_game_id: g.gameId, p_action: 'cancel' });
    await sql(request, `alter table public.games disable trigger trg_guard_game_status`);
    await sql(request, `update public.games set updated_at = now() - make_interval(hours => $2) where id = $1`, [g.gameId, hours]);
    await sql(request, `alter table public.games enable trigger trg_guard_game_status`);
    return g.gameId;
  };
  const ids = {
    oldDone: await mk('CL Old Completed', 'complete', 72),
    oldCancel: await mk('CL Old Cancelled', 'cancel', 72),
    newDone: await mk('CL New Completed', 'complete', 2),
    oldActive: await mk('CL Old Active', 'active', 900),
    oldPaused: await mk('CL Old Paused', 'paused', 900),
    oldReg: await mk('CL Old Registration', 'registration', 900),
  };
  await reload();
  await tab(admin, 'games');
  await admin.getByTestId('games-cleanup').click();
  await expect(admin.getByTestId('confirm-dialog')).toContainText('never touched');
  await admin.getByTestId('confirm-ok').click();
  const banner = admin.getByTestId('status-banner');
  await expect(banner).toContainText('Cleanup removed 2 game(s)');
  await expect(banner).toContainText('CL Old Completed');
  await expect(banner).toContainText('CL Old Cancelled');
  const exists = async (id: string) => (await sql(request, `select count(*)::int c from public.games where id = $1`, [id]))[0].c;
  expect([await exists(ids.oldDone), await exists(ids.oldCancel)]).toEqual([0, 0]);
  expect([await exists(ids.newDone), await exists(ids.oldActive), await exists(ids.oldPaused), await exists(ids.oldReg)]).toEqual([1, 1, 1, 1]);
  expect((await sql(request, `select count(*)::int c from public.participants where game_id = $1`, [ids.oldActive]))[0].c).toBe(3);
  evidence.cleanup = 'removed 2 old finished games; 4 other games untouched';
  // nothing left to clean
  await admin.getByTestId('games-cleanup').click();
  await admin.getByTestId('confirm-ok').click();
  await expect(banner).toContainText('nothing to remove');
});

test('7. topics: add, duplicate refused, edit, disable/enable, safe delete, search & filter, usage counts', async ({ request }) => {
  await tab(admin, 'topics');
  await admin.getByTestId('add-topic').click();
  let m = admin.getByTestId('topic-modal');
  await m.getByLabel('Category Name *').fill('Science');
  await m.getByLabel('Description').fill('Physics, chemistry and space');
  await m.getByTestId('topic-save').click();
  await expect(admin.getByTestId('topic-Science')).toBeVisible();
  await expect(admin.getByTestId('topic-stats-Science')).toContainText('0 game(s)');

  await admin.getByTestId('add-topic').click();
  m = admin.getByTestId('topic-modal');
  await m.getByLabel('Category Name *').fill('science');
  await m.getByTestId('topic-save').click();
  await expect(m.getByRole('alert')).toContainText('already exists');
  await m.getByLabel('Category Name *').fill('');
  await m.getByTestId('topic-save').click();
  await expect(m.getByRole('alert')).toContainText('cannot be empty');
  await m.getByRole('button', { name: 'Cancel' }).click();

  await admin.getByRole('button', { name: 'Edit Science' }).click();
  m = admin.getByTestId('topic-modal');
  await m.getByLabel('Category Name *').fill('Science & Space');
  await m.getByTestId('topic-save').click();
  await expect(admin.getByTestId('topic-Science & Space')).toBeVisible();

  // used topic cannot be deleted (history preserved); message says to disable instead
  await admin.getByRole('button', { name: 'Delete Movies & Entertainment' }).click();
  await expect(admin.getByTestId('confirm-dialog')).toContainText('so the server will refuse');
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Disable it instead');
  expect((await sql(request, `select count(*)::int c from public.topics where name = 'Movies & Entertainment'`))[0].c).toBe(1);

  // unused custom topic deletes cleanly
  await admin.getByRole('button', { name: 'Delete Science & Space' }).click();
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('deleted');
  await expect(admin.getByTestId('topic-Science & Space')).toHaveCount(0);

  // disable keeps history; filter + search
  await admin.getByTestId('toggle-Social Media').click();
  await expect(admin.getByTestId('topic-Social Media')).toContainText('Disabled');
  await admin.getByLabel('Filter topics').selectOption('disabled');
  await expect(admin.locator('[data-testid^="topic-"]:not([data-testid^="topic-stats"]):not([data-testid="topic-modal"])')).toHaveCount(1);
  await admin.getByLabel('Filter topics').selectOption('all');
  await admin.getByLabel('Search topics').fill('cricket');
  await expect(admin.getByTestId('topic-Cricket & Sports')).toBeVisible();
  await expect(admin.getByTestId('topic-Social Media')).toHaveCount(0);
  await admin.getByLabel('Search topics').fill('');
  await admin.getByTestId('toggle-Social Media').click();
  await expect(admin.getByTestId('topic-Social Media')).toContainText('Active');
  expect(await admin.getByTestId('topic-stats-Movies & Entertainment').innerText()).toMatch(/\d+ game\(s\)/);
});

test('8. game rules: edit & save per game, locked after start, defaults apply to NEW games only', async ({ request }) => {
  const g = await seedGame(api, 'Rules Game', { players: P3 });
  const other = await seedGame(api, 'Rules Untouched', { players: P3 });
  await reload();
  await selectGame(/Rules Game/);
  await tab(admin, 'settings');
  const sect = admin.getByLabel('Selected game rules');
  await sect.getByLabel('Max Participants').fill('12');
  await sect.getByLabel('Points per Correct Answer').fill('25');
  await sect.getByTestId('game-rules-save').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Rules saved for “Rules Game”');
  let s = (await sql(request, `select settings from public.games where id = $1`, [g.gameId]))[0].settings;
  expect([s.max_participants, s.points_correct]).toEqual([12, 25]);
  expect((await sql(request, `select settings->>'points_correct' p from public.games where id = $1`, [other.gameId]))[0].p).toBe('10');

  // client validation
  await sect.getByLabel('Min Participants').fill('20');
  await sect.getByTestId('game-rules-save').click();
  await expect(sect.getByRole('alert')).toContainText('Maximum participants cannot be less than minimum');
  await sect.getByLabel('Min Participants').fill('3');

  // defaults for NEW games
  const defaults = admin.getByLabel('Default rules');
  await defaults.getByLabel('Min Participants').fill('4');
  await defaults.getByLabel('Points per Correct Answer').fill('15');
  await defaults.getByTestId('default-rules-save').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Default rules saved');
  await tab(admin, 'games');
  await admin.getByTestId('games-create').click();
  const m = admin.getByTestId('create-game-modal');
  await expect(m.getByLabel('Min Players')).toHaveValue('4');
  await expect(m.getByLabel('Points / Correct')).toHaveValue('15');
  await m.getByRole('button', { name: 'Cancel' }).click();
  expect((await sql(request, `select settings->>'points_correct' p from public.games where id = $1`, [g.gameId]))[0].p).toBe('25'); // existing game not silently changed
  expect((await sql(request, `select settings->>'points_correct' p from public.games where id = $1`, [other.gameId]))[0].p).toBe('10');

  // restore defaults, start game => rules lock
  await tab(admin, 'settings');
  await defaults.getByLabel('Min Participants').fill('3');
  await defaults.getByLabel('Points per Correct Answer').fill('10');
  await defaults.getByTestId('default-rules-save').click();
  await api.rpc('admin_set_game_status', { p_game_id: g.gameId, p_action: 'start' });
  await reload();
  await selectGame(/Rules Game/);
  await tab(admin, 'settings');
  await expect(admin.getByText('Rules are locked once a game has started.')).toBeVisible();
  await expect(admin.getByLabel('Selected game rules').getByLabel('Min Participants')).toBeDisabled();
});

test('9. maximum participants enforced in the UI; two admin tabs: stale tab gets a clear server error, not silent success', async ({ browser, request }) => {
  const g = await seedGame(api, 'Two Tabs', { players: P3, settings: { min_participants: 3, max_participants: 3, points_correct: 10 } });
  await reload();
  await selectGame(/Two Tabs/);
  await tab(admin, 'participants');
  await admin.getByTestId('add-participant').click();
  const m = admin.getByTestId('add-participant-modal');
  await m.getByLabel('Participant Name *').fill('Fourth');
  await m.getByTestId('add-participant-submit').click();
  await expect(m.getByRole('alert')).toContainText('maximum of 3 participants');
  await m.getByRole('button', { name: 'Cancel' }).click();

  // second admin tab with realtime blocked, so it stays stale
  const tabB = await ctx.newPage();
  acceptDialogs(tabB);
  await tabB.routeWebSocket(/realtime/, (ws) => ws.close());
  await tabB.goto('/admin');
  await expect(tabB.getByRole('heading', { name: 'Admin Command Center' })).toBeVisible();
  await tabB.getByTestId('game-selector').selectOption({ label: 'Two Tabs (registration open)' });
  await tabB.getByTestId('tab-games').click();
  await expect(tabB.getByTestId('game-card-Two Tabs')).toContainText('REGISTRATION OPEN');

  // tab A starts the game
  await tab(admin, 'games');
  await admin.getByTestId('start-Two Tabs').click();
  await expect(admin.getByTestId('game-card-Two Tabs')).toContainText('IN PROGRESS');

  // stale tab B still shows "Start Game": clicking it must fail loudly
  await expect(tabB.getByTestId('start-Two Tabs')).toBeVisible();
  await tabB.getByTestId('start-Two Tabs').click();
  await expect(tabB.getByTestId('status-banner')).toContainText('This game is already in progress');
  expect((await sql(request, `select status from public.games where id = $1`, [g.gameId]))[0].status).toBe('active');
  // stale tab B tries to edit rules of the started game
  await tabB.getByRole('button', { name: 'Edit Two Tabs' }).click();
  const em = tabB.getByTestId('edit-game-modal');
  await em.getByLabel('Points ✓').fill('99').catch(() => undefined);
  await em.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
  const direct = await api.rpc('admin_update_game', { p_game_id: g.gameId, p_name: 'Two Tabs', p_description: '', p_settings: { points_correct: 99 } });
  expect(direct.error?.message).toMatch(/Rules are locked/);
  await tabB.close();
  evidence.two_tabs = 'stale tab got server error: This game is already in progress.';
});

test('10. network interruption: admin and participant get clear errors and recover when back online', async ({ browser, request }) => {
  await tab(admin, 'overview');
  await ctx.setOffline(true);
  await admin.getByTestId('header-refresh').click();
  await expect(admin.getByRole('alert').or(admin.getByTestId('status-banner')).first()).toContainText(/Cannot reach the database|Failed to load/i);
  await ctx.setOffline(false);
  await admin.getByTestId('header-refresh').click();
  await expect(admin.getByTestId('stat-total-games')).toBeVisible();
  await expect(admin.getByRole('alert')).toHaveCount(0);

  // participant answering while offline: error shown, nothing saved; works after reconnect
  const g = await seedGame(api, 'Offline Flow', { players: P3, start: true });
  const c = await api.rpc('participant_create_challenge', { p_game_id: g.gameId, p_token: g.players.P1.token, p_receiver_id: g.players.P2.id, p_topic_id: g.topicIds[1] });
  const { ctx: pc, page } = await newPlayerContext(browser);
  await page.goto(`${APP}/challenge/${c.data.raw_token}`);
  await expect(page.getByTestId('question-counter')).toContainText('Question 1 of 7');
  await page.getByTestId('option-B').click();
  await pc.setOffline(true);
  await page.getByTestId('submit-answer').click();
  await expect(page.getByTestId('submit-error')).toContainText(/Cannot reach the database/);
  expect((await sql(request, `select count(*)::int c from public.answers where assignment_id = $1`, [c.data.assignment_id]))[0].c).toBe(0);
  await pc.setOffline(false);
  await page.getByTestId('submit-answer').click();
  await expect(page.getByTestId('answer-saved')).toContainText('Question 1');
  expect((await sql(request, `select count(*)::int c from public.answers where assignment_id = $1`, [c.data.assignment_id]))[0].c).toBe(1);
  await pc.close();
  evidence.network_interruption = 'clear errors, no partial data, recovered';
});

test('11. AI unavailable + custom topic with no questions: game is created but cannot start; message names the topic', async ({ request }) => {
  await ctx.route('**/api/generate-question', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"upstream down"}' }));
  await tab(admin, 'topics');
  await admin.getByTestId('add-topic').click();
  await admin.getByTestId('topic-modal').getByLabel('Category Name *').fill('Underwater Basket Weaving');
  await admin.getByTestId('topic-save').click();
  await expect(admin.getByTestId('topic-Underwater Basket Weaving')).toBeVisible();

  await tab(admin, 'games');
  await admin.getByTestId('games-create').click();
  const m = admin.getByTestId('create-game-modal');
  await m.getByRole('button', { name: 'Clear' }).click();
  await m.getByLabel('Game Name *').fill('AI Down Game');
  await m.getByRole('checkbox', { name: 'Underwater Basket Weaving' }).check();
  await m.getByRole('checkbox', { name: 'Cricket & Sports' }).check();
  await m.getByTestId('create-game-submit').click();
  await expect(admin.getByTestId('status-banner')).toContainText(/created, but some topics need more questions/, { timeout: 60_000 });
  await expect(admin.getByTestId('status-banner')).toContainText(/Only 0 of 10 requested questions|HTTP 503/);
  await ctx.unroute('**/api/generate-question');

  // cricket got a full, correctly-topiced pool from the bank; the custom topic got NOTHING (never other topics' questions)
  const pool = await sql(request, `select t.name, count(*)::int n from public.questions q join public.topics t on t.id = q.topic_id where q.game_id = (select id from public.games where name = 'AI Down Game') and q.assignment_id is null group by 1 order by 1`);
  expect(pool).toEqual([{ name: 'Cricket & Sports', n: 10 }]);

  // add 3 players and try to start: refused, naming the incomplete topic
  const gid = (await sql(request, `select id from public.games where name = 'AI Down Game'`))[0].id;
  for (const [n, c] of P3) await api.rpc('admin_add_participant', { p_game_id: gid, p_display_name: n, p_player_code: c });
  await reload();
  await selectGame(/AI Down Game/);
  await tab(admin, 'overview');
  await expect(admin.getByTestId('pool-Underwater Basket Weaving')).toContainText('0/7');
  await expect(admin.getByText('1/2 TOPICS READY')).toBeVisible();
  await tab(admin, 'games');
  await expect(admin.getByTestId('game-card-AI Down Game')).toContainText('1 / 2 topics have');
  await admin.getByTestId('start-AI Down Game').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Every topic needs at least 7 valid questions');
  await expect(admin.getByTestId('status-banner')).toContainText('Underwater Basket Weaving (0 questions');
  await expect((await sql(request, `select status from public.games where id = $1`, [gid]))[0].status).toBe('registration_open');
  evidence.ai_down = 'game blocked from starting; incomplete topic named';
});

test('12. overview statistics come from real records and match the database', async ({ request }) => {
  await tab(admin, 'overview');
  const db = (await sql(request, `select count(*)::int total,
      count(*) filter (where status in ('draft','registration_open','ready'))::int reg,
      count(*) filter (where status in ('active','paused'))::int act,
      count(*) filter (where status = 'completed')::int done,
      count(*) filter (where status = 'cancelled')::int canc from public.games`))[0];
  const num = async (id: string) => Number((await admin.getByTestId(id).locator('div.text-2xl, div.text-3xl').first().innerText()).trim());
  expect(await num('stat-total-games')).toBe(db.total);
  expect(await num('stat-registration')).toBe(db.reg);
  expect(await num('stat-active')).toBe(db.act);
  expect(await num('stat-completed')).toBe(db.done);
  expect(await num('stat-cancelled')).toBe(db.canc);
  evidence.overview_counts = db;

  // statistics update after a change made elsewhere WITHOUT a manual refresh (poll interval is 15s)
  await seedGame(api, 'Stats Live', { players: P3 });
  await expect(admin.getByTestId('stat-total-games')).toContainText(String(db.total + 1), { timeout: 30_000 });
  await expect(admin.getByTestId('stat-registration')).toContainText(String(db.reg + 1));
  evidence.overview_updates_without_manual_refresh = true;
});

test('13. overview buttons: Test Connection, Live Monitor, View all & manage, Select & view', async () => {
  await tab(admin, 'overview');
  await admin.getByRole('button', { name: 'Test Connection' }).click();
  await expect(admin.getByText(/Connected \(\d+ms\)/)).toBeVisible();
  await admin.getByRole('button', { name: 'Live Monitor' }).click();
  await expect(admin.getByTestId('monitor-table')).toBeVisible();
  await tab(admin, 'overview');
  await admin.getByRole('button', { name: /View all & manage/ }).click();
  await expect(admin.getByTestId('add-participant')).toBeVisible();
  await tab(admin, 'games');
  await admin.getByTestId('view-Stats Live').click();
  await expect(admin.getByTestId('stat-total-games')).toBeVisible();
  await expect(admin.getByTestId('game-selector').locator('option:checked')).toContainText('Stats Live');
  evidence.overview_buttons = 'Test Connection / Live Monitor / View all / Select & view verified';
});

test('14. two players pick the SAME friend: the 2nd sees the used topic disabled up-front and can still send a different topic', async ({ browser, request }) => {
  const g = await seedGame(api, 'Same Friend', { players: P3, start: true });
  // P1 already challenged P3 on Movies
  const first = await api.rpc('participant_create_challenge', { p_game_id: g.gameId, p_token: g.players.P1.token, p_receiver_id: g.players.P3.id, p_topic_id: g.topicIds[0] });
  expect(first.error).toBeNull();

  const { ctx: c2, page } = await newPlayerContext(browser);
  await page.goto(g.players.P2.url);
  await expect(page.getByTestId('selection-flow')).toBeVisible();
  await page.getByTestId('pick-player-P3').click();
  await expect(page.getByTestId('pick-topic-Movies & Entertainment')).toBeDisabled();
  await expect(page.getByTestId('topic-used-Movies & Entertainment')).toContainText('Already used for P3');
  await expect(page.getByTestId('pick-topic-Cricket & Sports')).toBeEnabled();
  // a different friend is still free to take Movies
  await page.getByTestId('pick-player-P1').click();
  await expect(page.getByTestId('pick-topic-Movies & Entertainment')).toBeEnabled();

  // P2 -> P3 on Cricket works and P3 now has TWO independent challenges
  await page.getByTestId('pick-player-P3').click();
  await page.getByTestId('pick-topic-Cricket & Sports').click();
  await page.getByTestId('send-challenge').click();
  await expect(page.getByTestId('outgoing-result')).toContainText('Your Challenge For P3 Is Ready');
  const rows = await sql(request, `select t.name, count(*)::int n from public.assignments a join public.topics t on t.id = a.topic_id where a.receiver_id = $1 group by t.name order by t.name`, [g.players.P3.id]);
  expect(rows).toEqual([{ name: 'Cricket & Sports', n: 1 }, { name: 'Movies & Entertainment', n: 1 }]);
  await c2.close();
  evidence.same_friend = 'used topic disabled before sending; different topic accepted; receiver has 2 independent challenges';
});
