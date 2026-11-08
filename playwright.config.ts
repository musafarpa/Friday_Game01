import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs the PRODUCTION bundle (vite build -> vite preview) against the local Supabase-compatible
 * emulator (real migration SQL in PGlite, RLS enforced). The cloud project is never touched.
 *   npx playwright test
 * Cloud E2E (once migration 20260104 is applied) is a separate, explicit step - see docs/qa/DEPLOYMENT_CHECKLIST.md.
 */
export const APP = 'http://127.0.0.1:4173';
export const EMULATOR = 'http://127.0.0.1:54321';
const ANON_KEY = 'sb_publishable_emulator_key_for_local_tests';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'docs/qa/evidence/playwright-results.json' }], ['html', { open: 'never', outputFolder: 'docs/qa/evidence/playwright-report' }]],
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx scripts/qa/supabase-emulator.ts',
      url: `${EMULATOR}/__qa/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // build the real production bundle pointed at the emulator, then serve it with SPA fallback
      command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort',
      url: APP,
      reuseExistingServer: true,
      timeout: 240_000,
      env: { VITE_SUPABASE_URL: EMULATOR, VITE_SUPABASE_PUBLISHABLE_KEY: ANON_KEY, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    },
  ],
});
