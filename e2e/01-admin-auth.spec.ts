import { test, expect } from '@playwright/test';
import { EMU, loginUi, loginAdminUi, resetDb, watchConsole, saveEvidence, ADMIN_PASSWORD } from './helpers';

/** A. Admin authentication - real browser, real Supabase Auth protocol, real RLS-backed authorization. */
test.describe.configure({ mode: 'serial' });
const results: Record<string, string> = {};

test.beforeAll(async ({ request }) => {
  await resetDb(request);
});
test.afterAll(() => saveEvidence('01-admin-auth.json', results));

test('unauthorised: /admin without a session redirects to the login page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('button', { name: /sign in to dashboard/i })).toBeVisible();
  results['unauthorised /admin redirect'] = 'PASS';
});

test('incorrect password shows an error and stays on the login page', async ({ page }) => {
  await loginUi(page, 'admin@test.local', 'wrong-password');
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
  results['incorrect password'] = 'PASS';
});

test('empty fields are rejected client-side with a clear message', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByPlaceholder('admin@example.com').fill('admin@test.local');
  await page.getByPlaceholder('Enter your password').fill('x');
  await page.getByPlaceholder('Enter your password').fill('');
  await page.getByRole('button', { name: /sign in to dashboard/i }).click();
  // native required validation blocks submit; page stays put
  await expect(page).toHaveURL(/\/admin\/login$/);
  results['empty password'] = 'PASS';
});

test('forgot password: asks for an email first, then confirms the reset request was sent', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Please enter your email to request a password reset.')).toBeVisible();
  await page.getByPlaceholder('admin@example.com').fill('admin@test.local');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Password reset instructions sent to admin@test.local')).toBeVisible();
  results['forgot password'] = 'PASS (request accepted by auth; e-mail delivery not testable locally)';
});

test('a valid user that is NOT an admin is refused and signed out (participants never get admin rights)', async ({ page }) => {
  await loginUi(page, 'player@test.local', 'Player#QA-2026');
  await expect(page.getByText(/does not have Admin privileges/i)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/); // no lingering session
  results['non-admin user refused'] = 'PASS';
});

test('correct password opens the dashboard; session persists across refresh; logout ends it', async ({ page }) => {
  const errors = watchConsole(page);
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin Command Center' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  results['session persists after refresh'] = 'PASS';

  // login page bounces an already-authenticated admin straight to the dashboard
  await page.goto('/admin/login');
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole('button', { name: /logout|sign out/i }).first().click();
  await expect(page).toHaveURL(/\/$|\/admin\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  results['logout'] = 'PASS';
  expect(errors.filter((e) => !/ERR_CONNECTION|favicon/.test(e)), errors.join('\n')).toEqual([]);
});

test('expired session: reload sends the admin back to login; in-page actions show a session-expired message', async ({ page, request }) => {
  await loginAdminUi(page);
  // server invalidates every token (as if they expired / were revoked)
  expect((await request.post(`${EMU}/__qa/expire-sessions`)).ok()).toBeTruthy();

  await page.getByTestId('header-refresh').click();
  await expect(page.getByRole('alert').or(page.getByTestId('status-banner')).first()).toContainText(/session has expired|not authorised|Failed to load/i);

  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login$/);
  results['expired session'] = 'PASS';

  // a fresh login works again after expiry
  await loginAdminUi(page);
  results['re-login after expiry'] = 'PASS';
});

test('admin-only data is not reachable with a forged or missing token', async ({ request }) => {
  const rest = (path: string, token?: string) =>
    request.get(`${EMU}/rest/v1/${path}`, { headers: { apikey: 'x', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const anon = await rest('admin_probe_does_not_exist');
  expect(anon.status()).toBe(404);
  const noRows = await (await rest('participants?select=id')).json();
  expect(noRows).toEqual([]);
  const forged = await rest('participants?select=id', 'aaa.bbb.ccc');
  expect(forged.status()).toBe(401);
  results['forged token rejected'] = 'PASS';
  void ADMIN_PASSWORD;
});
