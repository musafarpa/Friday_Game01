import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import {
  APP, EMU, resetDb, loginAdminUi, tab, sql, saveEvidence, correctOptions, answerInUi, newPlayerContext, watchConsole, acceptDialogs,
} from './helpers';

/**
 * A-to-Z scenario from the brief: "Friday Fun QA Test" with Arun(A) Rahul(B) Amal(C) Nikhil(D) on
 * Movies & Entertainment / Cricket & Sports / AI & Technology. Admin + 4 players each run in their own
 * browser context (separate storage/sessions). Everything is driven through the UI; SQL is used only to
 * read correct answers (to choose right/wrong picks) and to capture evidence.
 */
test.describe.configure({ mode: 'serial' });

const GAME = 'Friday Fun QA Test';
const T = { movies: 'Movies & Entertainment', cricket: 'Cricket & Sports', ai: 'AI & Technology' };
const evidence: Record<string, any> = {};
const note = (k: string, v: any) => { evidence[k] = v; };

let admin: Page;
let adminCtx: BrowserContext;
let gameId = '';
const inviteUrls: Record<string, string> = {};
const players: Record<string, { ctx: BrowserContext; page: Page; bodies: string[] }> = {};
const challenge: Record<string, { token: string; assignmentId: string }> = {};
let adminErrors: string[] = [];

/** Record every backend response body a player's browser receives (to prove answers never leak early). */
function recordBodies(page: Page, sink: string[]) {
  page.on('response', async (r) => {
    if (!r.url().startsWith(EMU)) return;
    try { sink.push(await r.text()); } catch { /* streaming / redirect */ }
  });
}

test.beforeAll(async ({ browser, request }) => {
  await resetDb(request);
  adminCtx = await browser.newContext({ baseURL: APP, permissions: ['clipboard-read', 'clipboard-write'] });
  admin = await adminCtx.newPage();
  acceptDialogs(admin);
  adminErrors = watchConsole(admin);
  // WhatsApp is external: never hit the real site from tests, just prove the browser tried to open it
  await adminCtx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>wa.me stub</h1>' }));
});

test.afterAll(async () => {
  saveEvidence('02-full-game.json', evidence);
  await adminCtx?.close();
  for (const p of Object.values(players)) await p.ctx.close();
});

test('1. admin creates the game: 3 topics => 21-question minimum, pools generated, game created in the database', async ({ request }) => {
  await loginAdminUi(admin);
  await tab(admin, 'games');
  await admin.getByTestId('games-create').click();
  const modal = admin.getByTestId('create-game-modal');

  // validation: empty name / no topics / min>max are all blocked with clear messages
  await modal.getByRole('button', { name: 'Clear' }).click();
  await modal.getByLabel('Game Name *').fill('   ');
  await modal.getByTestId('create-game-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Game name cannot be empty');
  await modal.getByLabel('Game Name *').fill(GAME);
  await modal.getByTestId('create-game-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Select at least 1 topic');

  for (const t of Object.values(T)) await modal.getByRole('checkbox', { name: t }).check();
  await expect(modal.getByTestId('min-questions-calc')).toHaveText('3 topics × 7 = 21 questions');
  await modal.getByLabel('Min Players').fill('5');
  await modal.getByLabel('Max Players').fill('3');
  await modal.getByTestId('create-game-submit').click();
  await expect(modal.getByRole('alert')).toContainText('Maximum participants cannot be less than minimum');
  await modal.getByLabel('Min Players').fill('3');
  await modal.getByLabel('Max Players').fill('10');

  await modal.getByTestId('create-game-submit').click();
  await expect(admin.getByTestId('status-banner')).toContainText(/created with a complete question pool for 3 topic/, { timeout: 90_000 });
  await expect(modal).toBeHidden();

  const g = await sql(request, `select id, status, settings from public.games where name = $1`, [GAME]);
  expect(g).toHaveLength(1);
  gameId = g[0].id;
  expect(g[0].status).toBe('registration_open');
  expect(JSON.stringify(g[0].settings)).not.toContain('correct_option');

  const pool = await sql(request, `select t.name, count(*)::int total, count(*) filter (where q.difficulty='easy')::int easy, count(*) filter (where q.difficulty='medium')::int medium, count(*) filter (where q.difficulty='hard')::int hard
    from public.questions q join public.topics t on t.id = q.topic_id where q.game_id = $1 and q.assignment_id is null group by t.name order by t.name`, [gameId]);
  note('pool_per_topic', pool);
  expect(pool).toHaveLength(3);
  for (const p of pool) { expect(p.total).toBeGreaterThanOrEqual(7); expect(p.easy).toBeGreaterThanOrEqual(3); expect(p.medium).toBeGreaterThanOrEqual(3); expect(p.hard).toBeGreaterThanOrEqual(1); }
  const dupes = await sql(request, `select 1 from public.questions where game_id = $1 and assignment_id is null group by lower(btrim(question_text)) having count(*) > 1`, [gameId]);
  expect(dupes).toHaveLength(0);

  // every pooled question really belongs to its topic (bank questions carry their topic name)
  const wrongTopic = await sql(request, `select 1 from public.questions q join public.topics t on t.id = q.topic_id where q.game_id = $1 and q.topic_category <> t.name`, [gameId]);
  expect(wrongTopic).toHaveLength(0);

  await tab(admin, 'overview');
  await expect(admin.getByText('ALL TOPICS READY')).toBeVisible();
  for (const t of Object.values(T)) await expect(admin.getByTestId(`pool-${t}`)).toContainText('COMPLETE');
});

test('2. participants: add, duplicate/invalid rejected, unique links, Copy Invite Link and WhatsApp work', async ({ request }) => {
  await tab(admin, 'participants');
  const add = async (name: string, code?: string) => {
    await admin.getByTestId('add-participant').click();
    const m = admin.getByTestId('add-participant-modal');
    await m.getByLabel('Participant Name *').fill(name);
    if (code !== undefined) await m.getByLabel(/Player Code/).fill(code);
    await m.getByTestId('add-participant-submit').click();
    return m;
  };

  await add('Arun', 'A');
  await expect(admin.getByTestId('status-banner')).toContainText('Participant Arun (code A) added');
  // duplicate name (case-insensitive) and duplicate code are refused with the server's message; modal stays open
  let m = await add('arun', 'Z');
  await expect(m.getByRole('alert')).toContainText('already exists');
  await m.getByLabel('Participant Name *').fill('Newbie');
  await m.getByLabel(/Player Code/).fill('a');
  await m.getByTestId('add-participant-submit').click();
  await expect(m.getByRole('alert')).toContainText('already taken');
  await m.getByLabel(/Player Code/).fill('A-1');
  await m.getByTestId('add-participant-submit').click();
  await expect(m.getByRole('alert')).toContainText('1-4 letters or digits');
  await m.getByRole('button', { name: 'Cancel' }).click();

  // double-click on "Create Invitation" creates exactly one participant
  await admin.getByTestId('add-participant').click();
  m = admin.getByTestId('add-participant-modal');
  await m.getByLabel('Participant Name *').fill('Rahul');
  await m.getByLabel(/Player Code/).fill('B');
  await m.getByTestId('add-participant-submit').dblclick();
  await expect(admin.getByTestId('status-banner')).toContainText('Participant Rahul');
  expect((await sql(request, `select count(*)::int c from public.participants where game_id = $1 and display_name = 'Rahul'`, [gameId]))[0].c).toBe(1);

  // start must fail with 2 participants (min 3): explicit message, status unchanged
  await tab(admin, 'games');
  await admin.getByTestId(`start-${GAME}`).click();
  await expect(admin.getByTestId('status-banner')).toContainText('At least 3 participants are required but only 2 added');
  expect((await sql(request, `select status from public.games where id = $1`, [gameId]))[0].status).toBe('registration_open');
  note('start_gate_message', await admin.getByTestId('status-banner').innerText());

  await tab(admin, 'participants');
  await add('Amal', 'C');
  await expect(admin.getByTestId('status-banner')).toContainText('Participant Amal');
  await add('Nikhil', 'D');
  await expect(admin.getByTestId('status-banner')).toContainText('Participant Nikhil');

  for (const n of ['Arun', 'Rahul', 'Amal', 'Nikhil']) {
    inviteUrls[n] = (await admin.getByTestId(`invite-url-${n}`).innerText()).trim();
    expect(inviteUrls[n]).toMatch(new RegExp(`^${APP}/join/${gameId}/[0-9a-f]{64}$`)); // real host, never localhost:3000 / placeholder
  }
  expect(new Set(Object.values(inviteUrls)).size).toBe(4);
  note('invite_urls_unique', true);

  // Copy Invite Link copies THIS participant's link (check all four, in different order)
  for (const n of ['Nikhil', 'Arun', 'Amal', 'Rahul']) {
    const card = admin.getByTestId(`participant-${n}`);
    await card.getByRole('button', { name: 'Copy Invite Link' }).click();
    await expect(card.getByText('Copied!')).toBeVisible();
    const clip = await admin.evaluate(() => navigator.clipboard.readText());
    expect(clip, `clipboard for ${n}`).toBe(inviteUrls[n]);
  }
  note('copy_invite_link', 'clipboard matched each participant link');

  // WhatsApp: opens wa.me with the participant's own link in the message
  const card = admin.getByTestId('participant-Amal');
  const wa = card.getByRole('link', { name: 'Share on WhatsApp' });
  const href = (await wa.getAttribute('href'))!;
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  const text = decodeURIComponent(href.split('text=')[1]);
  expect(text).toContain('Hello Amal! Welcome to Friday Fun 2026!');
  expect(text).toContain(inviteUrls.Amal);
  for (const other of ['Arun', 'Rahul', 'Nikhil']) expect(text).not.toContain(inviteUrls[other]);
  expect(await wa.getAttribute('target')).toBe('_blank');
  const [popup] = await Promise.all([adminCtx.waitForEvent('page'), wa.click()]);
  await popup.waitForLoadState();
  expect(popup.url().startsWith('https://wa.me/')).toBe(true);
  await popup.close();
  note('whatsapp_href_sample', href.slice(0, 120));
});

test('3. Participants edit / regenerate (old link revoked) / remove are safe', async ({ request, browser }) => {
  // edit: change contact only, link unchanged
  const card = admin.getByTestId('participant-Nikhil');
  await card.getByRole('button', { name: 'Edit Nikhil' }).click();
  const m = admin.getByTestId('edit-participant-modal');
  await m.getByLabel('Phone / WhatsApp').fill('+971500000001');
  await m.getByTestId('edit-participant-save').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Participant updated');
  expect(await admin.getByTestId('invite-url-Nikhil').innerText()).toBe(inviteUrls.Nikhil);

  // regenerate a throw-away participant's link: old one dies, new one lives
  await admin.getByTestId('add-participant').click();
  const a = admin.getByTestId('add-participant-modal');
  await a.getByLabel('Participant Name *').fill('Temp');
  await a.getByLabel(/Player Code/).fill('T');
  await a.getByTestId('add-participant-submit').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Participant Temp');
  const tempUrl = (await admin.getByTestId('invite-url-Temp').innerText()).trim();
  await admin.getByTestId('participant-Temp').getByRole('button', { name: /Regenerate link/ }).click();
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('New invitation link issued for Temp');
  const newUrl = (await admin.getByTestId('invite-url-Temp').innerText()).trim();
  expect(newUrl).not.toBe(tempUrl);
  const probe = await newPlayerContext(browser);
  await probe.page.goto(tempUrl);
  await expect(probe.page.getByTestId('invite-error')).toContainText(/invalid, expired or has been replaced/i);
  await probe.page.goto(newUrl);
  await expect(probe.page.getByTestId('welcome-heading')).toContainText('Welcome, Temp!');
  await probe.ctx.close();

  // remove: confirmation names the participant; only that participant disappears
  const before = (await sql(request, `select count(*)::int c from public.participants where game_id = $1`, [gameId]))[0].c;
  await admin.getByTestId('participant-Temp').getByRole('button', { name: 'Remove Temp' }).click();
  await expect(admin.getByTestId('confirm-dialog')).toContainText('Temp');
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('Temp was removed');
  expect((await sql(request, `select count(*)::int c from public.participants where game_id = $1`, [gameId]))[0].c).toBe(before - 1);
  await expect(admin.getByTestId('participant-Temp')).toHaveCount(0);
  for (const n of ['Arun', 'Rahul', 'Amal', 'Nikhil']) await expect(admin.getByTestId(`participant-${n}`)).toBeVisible();
});

test('4. admin starts the game (confirmed in the database); invalid invitation tokens are rejected', async ({ request, browser }) => {
  await tab(admin, 'games');
  await admin.getByTestId(`start-${GAME}`).click();
  await expect(admin.getByTestId('status-banner')).toContainText('is now IN PROGRESS');
  await expect(admin.getByTestId(`game-card-${GAME}`)).toContainText('IN PROGRESS');
  expect((await sql(request, `select status from public.games where id = $1`, [gameId]))[0].status).toBe('active');

  const bad = await newPlayerContext(browser);
  await bad.page.goto(`/join/${gameId}/${'0'.repeat(64)}`);
  await expect(bad.page.getByTestId('invite-error')).toBeVisible();
  await bad.page.goto(`/join/not-a-uuid/${'0'.repeat(64)}`);
  await expect(bad.page.getByTestId('invite-error')).toBeVisible();
  // a valid token under ANOTHER game id must not work either
  await bad.page.goto(`/join/${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}/${inviteUrls.Arun.split('/').pop()}`);
  await expect(bad.page.getByTestId('invite-error')).toBeVisible();
  await bad.ctx.close();
});

test('5. four players join from four separate browser sessions', async ({ browser, request }) => {
  for (const n of ['Arun', 'Rahul', 'Amal', 'Nikhil']) {
    const { ctx, page } = await newPlayerContext(browser);
    const bodies: string[] = [];
    recordBodies(page, bodies);
    players[n] = { ctx, page, bodies };
    await page.goto(inviteUrls[n]);
    await expect(page.getByTestId('welcome-heading')).toContainText(`Welcome, ${n}!`);
    await expect(page.getByTestId('game-status-badge')).toHaveText('IN PROGRESS');
    await expect(page.getByTestId('selection-flow')).toBeVisible();
    await expect(page.getByTestId(`pick-player-${n}`)).toHaveCount(0); // cannot pick yourself
    // refresh keeps working
    await page.reload();
    await expect(page.getByTestId('welcome-heading')).toContainText(`Welcome, ${n}!`);
  }
  const st = await sql(request, `select display_name, status from public.participants where game_id = $1 order by player_code`, [gameId]);
  expect(st.map((r: any) => r.status)).toEqual(['joined', 'joined', 'joined', 'joined']);
  note('statuses_after_join', st);
});

test('6. challenges: A->C Movies, B->C Cricket, D->C AI, C->A Movies (each with exactly 7 ordered questions)', async ({ request }) => {
  const send = async (from: string, to: string, topic: string) => {
    const p = players[from].page;
    await p.getByTestId(`pick-player-${to}`).click();
    await p.getByTestId(`pick-topic-${topic}`).click();
    await p.getByTestId('send-challenge').click();
    await expect(p.getByTestId('outgoing-result')).toContainText(`Your Challenge For ${to} Is Ready`);
    await expect(p.getByRole('link', { name: new RegExp(`Send Challenge to ${to} on WhatsApp`) })).toBeVisible();
    await expect(p.getByTestId('selection-flow')).toHaveCount(0); // one challenge per sender
  };
  await send('Arun', 'Amal', T.movies);
  await send('Rahul', 'Amal', T.cricket);
  await send('Nikhil', 'Amal', T.ai);
  await send('Amal', 'Arun', T.movies);

  const rows = await sql(request, `select a.id, s.display_name sender, r.display_name receiver, t.name topic, sec.raw_token token,
      (select count(*)::int from public.questions q where q.assignment_id = a.id) qcount,
      (select array_agg(q.difficulty order by q.sequence_num) from public.questions q where q.assignment_id = a.id) diffs,
      (select count(*)::int from public.questions q where q.assignment_id = a.id and q.topic_id <> a.topic_id) wrong_topic
    from public.assignments a join public.participants s on s.id=a.sender_id join public.participants r on r.id=a.receiver_id
    join public.topics t on t.id=a.topic_id join public.assignment_secrets sec on sec.assignment_id=a.id where a.game_id = $1`, [gameId]);
  expect(rows).toHaveLength(4);
  for (const r of rows) {
    expect(r.qcount).toBe(7);
    expect(r.diffs).toEqual(['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard']);
    expect(r.wrong_topic).toBe(0);
    challenge[`${r.sender}->${r.receiver}`] = { token: r.token, assignmentId: r.id };
  }
  expect(new Set(rows.map((r: any) => r.token)).size).toBe(4);
  note('challenges', rows.map((r: any) => ({ from: r.sender, to: r.receiver, topic: r.topic, questions: r.qcount, difficulties: r.diffs })));
});

test('7. Amal receives THREE independent challenges (3 links); the others see one', async () => {
  const p = players.Amal.page;
  await p.reload();
  const incoming = p.getByTestId('incoming-challenges');
  await expect(incoming).toContainText('Challenges Received For You (3)');
  const hrefs = await incoming.getByRole('link').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));
  expect(new Set(hrefs).size).toBe(3);
  expect(hrefs.sort()).toEqual([challenge['Arun->Amal'], challenge['Rahul->Amal'], challenge['Nikhil->Amal']].map((c) => `/challenge/${c.token}`).sort());

  await players.Arun.page.reload();
  await expect(players.Arun.page.getByTestId('incoming-challenges')).toContainText('Challenges Received For You (1)');
  await players.Rahul.page.reload();
  await expect(players.Rahul.page.getByTestId('incoming-challenges')).toHaveCount(0);
});

test('8. Amal answers the 3 challenges: 7 correct, 7 wrong (with a mid-quiz refresh), 5 correct; Arun answers 3 of 7', async ({ request }) => {
  const amal = players.Amal.page;

  // ---- Arun -> Amal (Movies): all 7 correct
  await amal.goto(`/challenge/${challenge['Arun->Amal'].token}`);
  await expect(amal.getByTestId('question-counter')).toContainText('Question 1 of 7');
  await expect(amal.getByTestId('submit-answer')).toBeDisabled();
  await answerInUi(amal, await correctOptions(request, challenge['Arun->Amal'].assignmentId), Array(7).fill('right'));
  await expect(amal.getByTestId('locked-in')).toContainText('7 of 7 Answers Locked In');
  await expect(amal.getByTestId('final-score')).toHaveCount(0); // no score before reveal

  // ---- Rahul -> Amal (Cricket): 3 wrong, REFRESH, resumes at Q4, 4 more wrong => 0
  await amal.goto(`/challenge/${challenge['Rahul->Amal'].token}`);
  const cricket = await correctOptions(request, challenge['Rahul->Amal'].assignmentId);
  await answerInUi(amal, cricket, Array(3).fill('wrong'));
  await expect(amal.getByTestId('answer-saved')).toContainText('Question 3');
  await amal.reload();
  await expect(amal.getByTestId('question-counter')).toContainText('Question 4 of 7');
  await expect(amal.getByText('3 of 7 Answered (43%)')).toBeVisible();
  // step pills + Prev: answered questions are navigable, future ones are locked
  await expect(amal.getByLabel('Go to question 6')).toBeDisabled();
  await amal.getByLabel('Go to question 2').click();
  await expect(amal.getByTestId('question-counter')).toContainText('Question 2 of 7');
  await amal.getByRole('button', { name: 'Prev' }).click();
  await expect(amal.getByTestId('question-counter')).toContainText('Question 1 of 7');
  await amal.getByLabel('Go to question 4').click();
  await expect(amal.getByTestId('question-counter')).toContainText('Question 4 of 7');
  // browser close/reopen: brand-new context with the same link also resumes at Q4
  const reopened = await newPlayerContext(amal.context().browser()!);
  await reopened.page.goto(`/challenge/${challenge['Rahul->Amal'].token}`);
  await expect(reopened.page.getByTestId('question-counter')).toContainText('Question 4 of 7');
  // second tab on the same challenge also resumes at Q4 (open in new page of the same context)
  const tab2 = await amal.context().newPage();
  acceptDialogs(tab2);
  await tab2.goto(`/challenge/${challenge['Rahul->Amal'].token}`);
  await expect(tab2.getByTestId('question-counter')).toContainText('Question 4 of 7');
  // answer Q4 from tab2, then try to answer the SAME question again from the original tab (stale) => no double points
  const q4 = cricket[3];
  const wrong4 = ['A', 'B', 'C', 'D'].find((o) => o !== q4)!;
  await tab2.getByTestId(`option-${wrong4}`).click();
  await tab2.getByTestId('submit-answer').click();
  await expect(tab2.getByTestId('answer-saved')).toContainText('Question 4');
  await amal.getByTestId(`option-${wrong4}`).click();
  await amal.getByTestId('submit-answer').click();
  await expect(amal.getByTestId('answer-saved')).toContainText('Question 4'); // server said ALREADY_ANSWERED; UI reconciles silently
  expect((await sql(request, `select count(*)::int c from public.answers where assignment_id = $1`, [challenge['Rahul->Amal'].assignmentId]))[0].c).toBe(4);
  await tab2.close();
  await reopened.ctx.close();
  // continue Q5-Q7 wrong in the original tab
  await amal.getByTestId('next-question').click();
  for (let i = 4; i < 7; i++) {
    await expect(amal.getByTestId('question-counter')).toContainText(`Question ${i + 1} of 7`);
    await amal.getByTestId(`option-${['A', 'B', 'C', 'D'].find((o) => o !== cricket[i])!}`).click();
    await amal.getByTestId('submit-answer').click();
    if (i < 6) { await expect(amal.getByTestId('answer-saved')).toContainText(`Question ${i + 1}`); await amal.getByTestId('next-question').click(); }
  }
  await expect(amal.getByTestId('locked-in')).toContainText('7 of 7');

  // ---- Nikhil -> Amal (AI): R R W R W R R => 5 correct
  await amal.goto(`/challenge/${challenge['Nikhil->Amal'].token}`);
  await answerInUi(amal, await correctOptions(request, challenge['Nikhil->Amal'].assignmentId), ['right', 'right', 'wrong', 'right', 'wrong', 'right', 'right']);
  await expect(amal.getByTestId('locked-in')).toContainText('7 of 7');

  // ---- Amal -> Arun (Movies): Arun answers only 3 (all correct) and stops
  const arun = players.Arun.page;
  await arun.goto(`/challenge/${challenge['Amal->Arun'].token}`);
  await answerInUi(arun, await correctOptions(request, challenge['Amal->Arun'].assignmentId), ['right', 'right', 'right']);
  await expect(arun.getByTestId('answer-saved')).toContainText('Question 3');

  const per = await sql(request, `select s.display_name sender, r.display_name receiver, a.status, a.answered_questions, a.current_score from public.assignments a
    join public.participants s on s.id=a.sender_id join public.participants r on r.id=a.receiver_id where a.game_id = $1 order by 1`, [gameId]);
  note('scores_per_challenge_before_complete', per);
  const by = Object.fromEntries(per.map((r: any) => [`${r.sender}->${r.receiver}`, r]));
  expect(by['Arun->Amal']).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 70 });
  expect(by['Rahul->Amal']).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 0 });
  expect(by['Nikhil->Amal']).toMatchObject({ status: 'submitted', answered_questions: 7, current_score: 50 });
  expect(by['Amal->Arun']).toMatchObject({ status: 'opened', answered_questions: 3, current_score: 30 });
});

test('9. admin monitoring reflects all of it live (no manual refresh) with separate progress per challenge', async () => {
  await tab(admin, 'monitoring');
  const row = (a: string, b: string) => admin.getByTestId(`challenge-row-${a}-${b}`);
  await expect(row('Arun', 'Amal')).toContainText('7 / 7 answered');
  await expect(row('Rahul', 'Amal')).toContainText('7 / 7 answered');
  await expect(row('Nikhil', 'Amal')).toContainText('7 / 7 answered');
  await expect(row('Amal', 'Arun')).toContainText('3 / 7 answered');
  await expect(row('Amal', 'Arun')).toContainText('In progress');
  // answers are hidden from the dashboard too until the game is completed
  await expect(row('Arun', 'Amal')).toContainText('hidden');
  const stats = admin.getByTestId('monitor-stats');
  await expect(stats).toContainText('Challenges');
  await expect(admin.getByTestId('monitor-table').locator('tbody tr')).toHaveCount(4);

  // live: Arun answers Q4 now; the admin screen updates without reload
  const arun = players.Arun.page;
  await arun.getByTestId('next-question').click();
  await expect(arun.getByTestId('question-counter')).toContainText('Question 4 of 7');
  await arun.getByTestId('option-A').click();
  await arun.getByTestId('submit-answer').click();
  await expect(admin.getByTestId('challenge-row-Amal-Arun')).toContainText('4 / 7 answered', { timeout: 20_000 });

  // filter + search
  await admin.getByLabel('Filter challenges').selectOption('submitted');
  await expect(admin.getByTestId('monitor-table').locator('tbody tr')).toHaveCount(3);
  await admin.getByLabel('Filter challenges').selectOption('all');
  await admin.getByLabel('Search challenges').fill('Cricket');
  await expect(admin.getByTestId('monitor-table').locator('tbody tr')).toHaveCount(1);
  await admin.getByLabel('Search challenges').fill('');
});

test('10. correct answers never reached any player browser before completion', async () => {
  const leaks: string[] = [];
  for (const [name, p] of Object.entries(players)) {
    for (const b of p.bodies) {
      if (/"correct_option"\s*:\s*"[ABCD]"/.test(b) || /"is_correct"\s*:\s*(true|false)/.test(b) || /"explanation"\s*:\s*"[^"]/.test(b)) leaks.push(`${name}: ${b.slice(0, 160)}`);
    }
  }
  note('network_bodies_inspected', Object.fromEntries(Object.entries(players).map(([n, p]) => [n, p.bodies.length])));
  expect(leaks, leaks.join('\n')).toEqual([]);
});

test('11. live leaderboard (public page, anonymous browser) counts finished challenges only', async ({ browser }) => {
  const { ctx, page } = await newPlayerContext(browser);
  await page.goto(`/leaderboard/${gameId}`);
  await expect(page.getByTestId('lb-mode')).toHaveText('LIVE');
  await expect(page.getByTestId('lb-Amal')).toContainText('120 pts');
  await expect(page.getByTestId('lb-Arun')).toContainText('0 pts'); // 4 answers in progress are not revealed
  await expect(page.getByTestId('lb-Amal')).toContainText('#1');
  await ctx.close();
});

test('12. admin completes the game (confirmation, real DB change); answers are revealed and scores finalised', async ({ request }) => {
  await tab(admin, 'games');
  await admin.getByTestId(`complete-${GAME}`).click();
  const dlg = admin.getByTestId('confirm-dialog');
  await expect(dlg).toContainText('Complete "Friday Fun QA Test"?');
  await expect(dlg).toContainText('reveals the correct answers');
  await expect(dlg).toContainText('3 of 4 challenges are finished');
  await admin.getByTestId('confirm-ok').click();
  await expect(admin.getByTestId('status-banner')).toContainText('completed');
  await expect(admin.getByTestId(`game-card-${GAME}`)).toContainText('COMPLETED');
  expect((await sql(request, `select status from public.games where id = $1`, [gameId]))[0].status).toBe('completed');
  expect((await sql(request, `select status from public.game_rounds where game_id = $1`, [gameId]))[0].status).toBe('revealed');

  // completed game: no restart / pause / complete / cancel buttons; delete is allowed
  const card = admin.getByTestId(`game-card-${GAME}`);
  for (const label of ['Start Game', 'Pause', 'Resume', 'Complete', 'Cancel']) await expect(card.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await expect(card.getByTestId(`delete-${GAME}`)).toBeVisible();
});

test('13. participants see revealed results: scores out of 70, correct answers, final leaderboard with ties', async ({ browser, request }) => {
  const amal = players.Amal.page;
  const check = async (token: string, score: string, correct: number, wrong: number) => {
    await amal.goto(`/challenge/${token}`);
    await expect(amal.getByTestId('final-score')).toHaveText(score);
    await expect(amal.getByText(`${correct} Correct`)).toBeVisible();
    await expect(amal.getByText(`${wrong} Incorrect`)).toBeVisible();
  };
  await check(challenge['Arun->Amal'].token, '70 / 70', 7, 0);
  await check(challenge['Rahul->Amal'].token, '0 / 70', 0, 7);
  await check(challenge['Nikhil->Amal'].token, '50 / 70', 5, 2);

  // positive control for test 10: after completion the SAME browser does receive answers (so the leak detector can fire)
  expect(players.Amal.bodies.some((b) => /"correct_option"\s*:\s*"[ABCD]"/.test(b)), 'detector sanity: reveal data must now be present').toBe(true);

  // review shows the correct answer highlighted
  await amal.getByTestId('review-questions').click();
  await expect(amal.getByText('✓ Correct').first()).toBeVisible();

  // Arun (answered 4 of 7 in the CA challenge): unanswered = 0, still shows his result
  const arun = players.Arun.page;
  await arun.goto(`/challenge/${challenge['Amal->Arun'].token}`);
  await expect(arun.getByTestId('challenge-summary')).toContainText('Game finished');
  await expect(arun.getByTestId('final-score')).toBeVisible();

  const { ctx, page } = await newPlayerContext(browser);
  await page.goto(`/leaderboard/${gameId}`);
  await expect(page.getByTestId('lb-mode')).toHaveText('FINAL RESULTS');
  await expect(page.getByTestId('champion')).toContainText('Amal');
  await expect(page.getByTestId('lb-Amal')).toContainText('#1');
  await expect(page.getByTestId('lb-Amal')).toContainText('120 pts');
  const rank = async (n: string) => (await page.getByTestId(`lb-${n}`).locator('td').first().innerText()).trim();
  expect(await rank('Rahul')).toBe(await rank('Nikhil')); // tie handling
  expect(await rank('Rahul')).toBe('#3');
  const lb = await sql(request, `select p.display_name, s.total_points, s.correct_answers, s.wrong_answers from public.scores s join public.participants p on p.id = s.participant_id where s.game_id = $1 order by s.total_points desc, p.display_name`, [gameId]);
  note('final_scores_table', lb);
  const arunPts = lb.find((r: any) => r.display_name === 'Arun');
  expect(arunPts.total_points).toBeGreaterThanOrEqual(30); // 3 correct + Q4 'A' (may be right) = 30 or 40
  expect(lb.find((r: any) => r.display_name === 'Amal').total_points).toBe(120);
  await ctx.close();

  // old participant page now shows completed state
  await players.Rahul.page.reload();
  await expect(players.Rahul.page.getByTestId('state-completed')).toBeVisible();
});

test('14. admin leaderboard tab: ranking, refresh, CSV export', async () => {
  await tab(admin, 'leaderboard');
  await expect(admin.getByText('FINAL', { exact: true })).toBeVisible();
  const rows = admin.getByTestId('admin-leaderboard').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(admin.getByTestId('lb-row-Amal')).toContainText('#1');
  await expect(admin.getByTestId('lb-row-Amal')).toContainText('120 pts');
  await admin.getByTestId('leaderboard-refresh').click();
  const [download] = await Promise.all([admin.waitForEvent('download'), admin.getByTestId('leaderboard-export').click()]);
  expect(download.suggestedFilename()).toMatch(/Friday_Fun_QA_Test_leaderboard\.csv$/);
  const path = await download.path();
  const csv = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(csv.split('\n')[0]).toBe('Rank,Player Code,Player Name,Score,Correct,Wrong');
  expect(csv).toContain('"Amal",120');
});

test('15. a completed game accepts no new answers or challenges (server-side), even via direct API calls', async ({ request }) => {
  const q = (await sql(request, `select id from public.questions where assignment_id = $1 and sequence_num = 5`, [challenge['Amal->Arun'].assignmentId]))[0].id;
  const r = await request.post(`${EMU}/rest/v1/rpc/submit_challenge_answer`, {
    headers: { apikey: 'x' }, data: { p_token: challenge['Amal->Arun'].token, p_selected_option: 'A', p_question_id: q },
  });
  expect(r.status()).toBe(400);
  expect((await r.json()).message).toMatch(/game has finished/);
  const c = await request.post(`${EMU}/rest/v1/rpc/participant_create_challenge`, {
    headers: { apikey: 'x' }, data: { p_game_id: gameId, p_token: inviteUrls.Rahul.split('/').pop(), p_receiver_id: challenge['Amal->Arun'].assignmentId, p_topic_id: challenge['Amal->Arun'].assignmentId },
  });
  expect(c.status()).toBe(400);
  note('direct_api_after_completion', { submit: (await r.json()).message, create: (await c.json()).message });
  expect(adminErrors.filter((e) => !/ERR_CONNECTION|favicon|Failed to load resource: .*40[0-9]/.test(e)), adminErrors.join('\n')).toEqual([]);
});
