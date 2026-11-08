import { expect, APIRequestContext, Page, BrowserContext } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const APP = 'http://127.0.0.1:4173';
export const EMU = 'http://127.0.0.1:54321';
export const ANON_KEY = 'sb_publishable_emulator_key_for_local_tests';
export const ADMIN_EMAIL = 'admin@test.local';
export const ADMIN_PASSWORD = 'Admin#QA-2026';

export const EVIDENCE_DIR = join(process.cwd(), 'docs', 'qa', 'evidence');
export function saveEvidence(name: string, data: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(data, null, 2));
}

/** Direct SQL against the emulator database (test setup / evidence only - never used to drive the app). */
export async function sql<T = any>(request: APIRequestContext, query: string, params: any[] = []): Promise<T[]> {
  const r = await request.post(`${EMU}/__qa/sql`, { data: { sql: query, params } });
  expect(r.ok(), `sql failed: ${await r.text()}`).toBeTruthy();
  return r.json();
}
export async function resetDb(request: APIRequestContext) {
  const r = await request.post(`${EMU}/__qa/reset`);
  expect(r.ok()).toBeTruthy();
}

export async function adminClient(): Promise<SupabaseClient> {
  const c = createClient(EMU, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw error;
  return c;
}
export const anonClient = () => createClient(EMU, ANON_KEY, { auth: { persistSession: false } });

export async function loginUi(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/admin/login');
  await page.getByPlaceholder('admin@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: /sign in to dashboard/i }).click();
}
export async function loginAdminUi(page: Page) {
  await loginUi(page);
  await expect(page.getByRole('heading', { name: 'Admin Command Center' })).toBeVisible();
}

/** Collects console errors / failed same-origin requests so tests can assert "no console errors". */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export const acceptDialogs = (page: Page) => page.on('dialog', (d) => d.accept());

export async function tab(page: Page, id: 'overview' | 'games' | 'participants' | 'monitoring' | 'leaderboard' | 'topics' | 'settings') {
  await page.getByTestId(`tab-${id}`).click();
}

export async function newPlayerContext(browser: import('@playwright/test').Browser, opts: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ baseURL: APP, ...opts });
  const page = await ctx.newPage();
  acceptDialogs(page);
  return { ctx, page };
}

export const TOPIC = { movies: 'Movies & Entertainment', cricket: 'Cricket & Sports', ai: 'AI & Technology' };

/** Seeds a game (with pool) through the same admin RPCs the UI uses, authenticated as the admin. */
export async function seedGame(
  admin: SupabaseClient,
  name: string,
  opts: { players?: Array<[string, string]>; topics?: string[]; start?: boolean; settings?: Record<string, number> } = {}
) {
  const topicNames = opts.topics ?? [TOPIC.movies, TOPIC.cricket, TOPIC.ai];
  const { data: topics } = await admin.from('topics').select('id,name').in('name', topicNames);
  const ids = topicNames.map((n) => topics!.find((t: any) => t.name === n)!.id);
  const c = await admin.rpc('admin_create_game', { p_name: name, p_description: 'e2e', p_settings: opts.settings ?? { min_participants: 3, max_participants: 10, points_correct: 10 }, p_topic_ids: ids, p_initial_status: 'registration_open' });
  if (c.error) throw new Error(c.error.message);
  const gameId: string = c.data.game_id;
  for (let i = 0; i < ids.length; i++) {
    const qs = bankLike(topicNames[i]);
    const r = await admin.rpc('admin_save_pool_questions', { p_game_id: gameId, p_topic_id: ids[i], p_questions: qs });
    if (r.error) throw new Error(r.error.message);
  }
  const players: Record<string, { id: string; token: string; url: string }> = {};
  for (const [pname, code] of opts.players ?? []) {
    const r = await admin.rpc('admin_add_participant', { p_game_id: gameId, p_display_name: pname, p_player_code: code });
    if (r.error) throw new Error(r.error.message);
    players[pname] = { id: r.data.participant_id, token: r.data.raw_token, url: `${APP}/join/${gameId}/${r.data.raw_token}` };
  }
  if (opts.start) {
    const r = await admin.rpc('admin_set_game_status', { p_game_id: gameId, p_action: 'start' });
    if (r.error) throw new Error(r.error.message);
  }
  return { gameId, topicIds: ids, players };
}

let n = 0;
function bankLike(topic: string) {
  const mk = (difficulty: string) => {
    n++;
    return {
      question_text: `${topic}: sample ${difficulty} question #${n} - pick the right option?`,
      option_a: `Option A of ${n}`, option_b: `Option B of ${n}`, option_c: `Option C of ${n}`, option_d: `Option D of ${n}`,
      correct_option: ['A', 'B', 'C', 'D'][n % 4], explanation: `Explanation ${n}`, difficulty,
    };
  };
  return [...Array(4).fill('easy'), ...Array(4).fill('medium'), ...Array(2).fill('hard')].map(mk);
}

/** Correct option letters for an assignment's questions, in order (read straight from the DB). */
export async function correctOptions(request: APIRequestContext, assignmentId: string): Promise<string[]> {
  const rows = await sql<{ correct_option: string }>(request, 'select correct_option from public.questions where assignment_id = $1 order by sequence_num', [assignmentId]);
  return rows.map((r) => r.correct_option);
}

/** Answers questions in the UI following picks: 'right' | 'wrong' for each question in order. */
export async function answerInUi(page: Page, correct: string[], picks: Array<'right' | 'wrong'>) {
  for (let i = 0; i < picks.length; i++) {
    await expect(page.getByTestId('question-counter')).toContainText(`Question ${i + 1} of 7`);
    const right = correct[i];
    const choice = picks[i] === 'right' ? right : ['A', 'B', 'C', 'D'].find((o) => o !== right)!;
    await page.getByTestId(`option-${choice}`).click();
    await page.getByTestId('submit-answer').click();
    if (i < picks.length - 1) {
      await expect(page.getByTestId('answer-saved')).toContainText(`Question ${i + 1}`);
      await page.getByTestId('next-question').click();
    }
  }
}

export async function openInviteInNewContext(browser: import('@playwright/test').Browser, url: string) {
  const { ctx, page } = await newPlayerContext(browser);
  await page.goto(url);
  return { ctx, page };
}

export type { BrowserContext };
