import { test, expect, Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP, EVIDENCE_DIR, resetDb, adminClient, seedGame, saveEvidence, loginAdminUi, tab, sql, watchConsole, acceptDialogs } from './helpers';

/**
 * Responsive audit at 320/360/390/430/768/1024/1366/1440/1920 px on a populated dataset.
 * Per page: no horizontal page overflow, no control clipped outside the viewport, no console errors,
 * and the smallest touch target is recorded (hard floor 38px; design target 44px).
 */
// widths are independent: one width failing must not hide the others

const WIDTHS = (process.env.E2E_WIDTHS ? process.env.E2E_WIDTHS.split(',').map(Number) : [320, 360, 390, 430, 768, 1024, 1366, 1440, 1920]);
const SHOT_DIR = join(process.cwd(), 'docs', 'qa', 'screenshots');
const report: Record<string, any> = {};
const urls: Record<string, string> = {};

test.beforeAll(async ({ request }) => {
  await resetDb(request);
  const api = await adminClient();

  // Finished game (for final leaderboard / revealed result screens) - created FIRST so the live game is the default selection
  const done = await seedGame(api, 'Resp Done', { players: [['Arun', 'A'], ['Rahul', 'B'], ['Amal', 'C'], ['Nikhil', 'D']], start: true });
  const d1 = await api.rpc('participant_create_challenge', { p_game_id: done.gameId, p_token: done.players.Arun.token, p_receiver_id: done.players.Amal.id, p_topic_id: done.topicIds[0] });
  const d2 = await api.rpc('participant_create_challenge', { p_game_id: done.gameId, p_token: done.players.Rahul.token, p_receiver_id: done.players.Amal.id, p_topic_id: done.topicIds[1] });
  for (const c of [d1.data, d2.data]) {
    const qs = await sql(request, `select id, correct_option from public.questions where assignment_id = $1 order by sequence_num`, [c.assignment_id]);
    for (const [i, q] of qs.entries()) await api.rpc('submit_challenge_answer', { p_token: c.raw_token, p_selected_option: i % 3 === 0 ? 'A' : q.correct_option, p_question_id: q.id });
  }
  await api.rpc('admin_set_game_status', { p_game_id: done.gameId, p_action: 'complete' });
  urls.leaderboardFinal = `/leaderboard/${done.gameId}`;
  urls.quizFinal = `/challenge/${d1.data.raw_token}`;

  // a registration-open game for the waiting screen (created before the live game so the live game is the default selection)
  const reg = await seedGame(api, 'Resp Waiting', { players: [['Zed', 'A'], ['Yan', 'B'], ['Xia', 'C']] });
  urls.joinWaiting = `/join/${reg.gameId}/${reg.players.Zed.token}`;

  const live = await seedGame(api, 'Resp Live', { players: [['Arun', 'A'], ['Rahul', 'B'], ['Amal', 'C'], ['Nikhil', 'D']], start: true });
  const l1 = await api.rpc('participant_create_challenge', { p_game_id: live.gameId, p_token: live.players.Arun.token, p_receiver_id: live.players.Amal.id, p_topic_id: live.topicIds[0] });
  await api.rpc('participant_create_challenge', { p_game_id: live.gameId, p_token: live.players.Rahul.token, p_receiver_id: live.players.Amal.id, p_topic_id: live.topicIds[1] });
  const qs = await sql(request, `select id, correct_option from public.questions where assignment_id = $1 order by sequence_num limit 3`, [l1.data.assignment_id]);
  for (const q of qs) await api.rpc('submit_challenge_answer', { p_token: l1.data.raw_token, p_selected_option: q.correct_option, p_question_id: q.id });
  urls.quiz = `/challenge/${l1.data.raw_token}`;
  urls.joinPick = `/join/${live.gameId}/${live.players.Nikhil.token}`;
  urls.joinSent = `/join/${live.gameId}/${live.players.Arun.token}`;
  urls.joinReceiver = `/join/${live.gameId}/${live.players.Amal.token}`;
  urls.leaderboardLive = `/leaderboard/${live.gameId}`;
});
test.afterAll(() => saveEvidence('05-responsive.json', report));

async function audit(page: Page, width: number, name: string, errors: string[]) {
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = window.innerWidth;
    const overflowX = Math.max(doc.scrollWidth, document.body.scrollWidth) - vw;
    const inScroller = (el: Element) => !!el.closest('.overflow-x-auto, .overflow-auto, [role="tablist"]');
    const clipped: string[] = [];
    let smallest = { size: 999, label: '' };
    const interactive = Array.from(document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]'));
    for (const el of interactive) {
      // a native checkbox/radio is tapped through its <label>, so measure the label's hit area
      const hit = ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio') ? (el.closest('label') ?? el) : el;
      const r = (hit as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el as HTMLElement);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const label = ((el as HTMLElement).innerText || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.tagName).trim().slice(0, 40);
      if (!inScroller(el) && (r.right > vw + 1 || r.left < -1)) clipped.push(`${label} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      const isInlineLink = el.tagName === 'A' && !(el as HTMLElement).className.includes('rounded') && cs.display === 'inline';
      if (!isInlineLink) {
        const size = Math.min(r.width, r.height);
        if (size < smallest.size) smallest = { size: Math.round(size), label };
      }
    }
    return { overflowX, clipped, smallest, scrollW: doc.scrollWidth, vw };
  });
  const key = `${width}/${name}`;
  report[key] = { overflowPx: Math.max(0, m.overflowX), clipped: m.clipped, smallestTarget: m.smallest, consoleErrors: errors.length };
  const shotDir = join(SHOT_DIR, String(width));
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true });
  expect.soft(m.overflowX, `${key}: horizontal overflow ${m.overflowX}px (scrollWidth ${m.scrollW} > viewport ${m.vw})`).toBeLessThanOrEqual(1);
  expect.soft(m.clipped, `${key}: controls clipped outside the viewport`).toEqual([]);
  expect.soft(m.smallest.size, `${key}: smallest touch target is ${m.smallest.size}px ("${m.smallest.label}")`).toBeGreaterThanOrEqual(38);
}

for (const width of WIDTHS) {
  test(`responsive ${width}px - admin, participant, quiz, result and leaderboard screens`, async ({ browser }) => {
    const height = width < 500 ? 800 : width < 1100 ? 900 : 1000;
    const ctx = await browser.newContext({ baseURL: APP, viewport: { width, height }, isMobile: width < 500, hasTouch: width < 800, deviceScaleFactor: 1 });
    // Google Fonts is an external CDN: stub it so the audit is deterministic (a slow/blocked CDN made
    // screenshots wait on font loading and logged ERR_* console errors). The app degrades to system fonts.
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
    const page = await ctx.newPage();
    acceptDialogs(page);
    const errors = watchConsole(page);
    const visit = async (name: string, path: string, ready: (p: Page) => Promise<void>) => {
      errors.length = 0;
      await page.goto(path);
      await ready(page);
      await audit(page, width, name, errors);
      expect.soft(errors, `${width}/${name}: console errors`).toEqual([]);
    };

    // ---- public pages
    await visit('home', '/', async (p) => { await expect(p.getByRole('heading').first()).toBeVisible(); });
    await visit('admin-login', '/admin/login', async (p) => { await expect(p.getByRole('button', { name: /sign in to dashboard/i })).toBeVisible(); });
    await visit('join-waiting', urls.joinWaiting, async (p) => { await expect(p.getByTestId('state-waiting')).toBeVisible(); });
    await visit('join-select-challenge', urls.joinPick, async (p) => { await expect(p.getByTestId('selection-flow')).toBeVisible(); });
    await visit('join-challenge-sent', urls.joinSent, async (p) => { await expect(p.getByTestId('outgoing-result')).toBeVisible(); });
    await visit('join-incoming-challenges', urls.joinReceiver, async (p) => { await expect(p.getByTestId('incoming-challenges')).toBeVisible(); });
    await visit('quiz-question', urls.quiz, async (p) => { await expect(p.getByTestId('question-counter')).toContainText('Question 4 of 7'); });
    await visit('quiz-final-result', urls.quizFinal, async (p) => { await expect(p.getByTestId('final-score')).toBeVisible(); });
    await visit('leaderboard-live', urls.leaderboardLive, async (p) => { await expect(p.getByTestId('lb-mode')).toHaveText('LIVE'); });
    await visit('leaderboard-final', urls.leaderboardFinal, async (p) => { await expect(p.getByTestId('lb-mode')).toHaveText('FINAL RESULTS'); });

    // ---- admin
    errors.length = 0;
    await loginAdminUi(page);
    await expect(page.getByTestId('game-selector')).toHaveValue(/.+/);
    for (const [id, ready] of [
      ['overview', 'stat-total-games'], ['games', 'game-card-Resp Live'], ['participants', 'participant-Arun'], ['monitoring', 'monitor-table'],
      ['leaderboard', 'admin-leaderboard'], ['topics', 'topic-Cricket & Sports'], ['settings', 'default-rules-save'],
    ] as const) {
      await tab(page, id);
      await expect(page.getByTestId(ready)).toBeVisible();
      await audit(page, width, `admin-${id}`, errors);
    }
    await tab(page, 'games');
    await page.getByTestId('games-create').click();
    await expect(page.getByTestId('create-game-modal')).toBeVisible();
    await audit(page, width, 'admin-create-game-modal', errors);
    // the modal's submit button must be reachable on small screens
    await page.getByTestId('create-game-submit').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('create-game-submit')).toBeInViewport();
    await page.getByTestId('create-game-modal').getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('cancel-Resp Live').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await audit(page, width, 'admin-confirm-dialog', errors);
    await page.getByTestId('confirm-cancel').click();
    expect.soft(errors.filter((e) => !/ERR_CONNECTION|favicon/.test(e)), `${width}/admin console errors`).toEqual([]);
    await ctx.close();
  });
}
