// Node.js environment polyfills for headless script runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] || null,
    get length() {
      return store.size;
    },
  } as any;
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: { origin: 'http://localhost:3000' },
    crypto: globalThis.crypto,
  };
}

import { runRealMultiplayerVerification } from './verify-multiplayer';
import { runSecurityVerification } from './verify-security';
import { runAIQuestionVerification } from './verify-ai-questions';
import { runPlaywrightVerification } from './verify-responsive-playwright';

async function main() {
  console.log('\n################################################################');
  console.log('   FRIDAY FUN 2026 - COMPLETE PRODUCTION VERIFICATION SUITE    ');
  console.log('################################################################\n');

  try {
    // 1. Real Multiplayer Test
    await runRealMultiplayerVerification();

    // 2. Security & RLS Verification
    await runSecurityVerification();

    // 3. AI Question & Bank Verification (23 questions)
    await runAIQuestionVerification();

    // 4. Playwright Real Browser Responsive & Screenshot Capture
    await runPlaywrightVerification();

    console.log('\n################################################################');
    console.log('   🎉 ALL REAL-WORLD PRODUCTION CHECKS VERIFIED SUCCESSFULLY!   ');
    console.log('################################################################\n');
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILURE:', err);
    process.exit(1);
  }
}

main();
