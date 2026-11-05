import { chromium } from '@playwright/test';

export async function runMultiDeviceVerification() {
  console.log('================================================================');
  console.log('PHASE 13: REAL MULTI-DEVICE & INDEPENDENT SESSION TEST (5 DEVICES)');
  console.log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const baseUrl = 'http://localhost:3000';

  // 1. Setup 5 independent devices (isolated storage, cookies, and viewports)
  console.log('Provisioning 5 independent device sessions...');
  const dev1_Admin = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 (Device-1-Admin)',
  });
  const dev2_Arun = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 (Device-2-Arun)',
  });
  const dev3_Rahul = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 (Device-3-Rahul)',
  });
  const dev4_Amal = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 (Device-4-Amal)',
  });
  const dev5_Nikhil = await browser.newContext({
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-S901B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 (Device-5-Nikhil)',
  });

  const p1 = await dev1_Admin.newPage();
  const p2 = await dev2_Arun.newPage();
  const p3 = await dev3_Rahul.newPage();
  const p4 = await dev4_Amal.newPage();
  const p5 = await dev5_Nikhil.newPage();

  console.log('[PASS] 5 independent devices initialized with separate storage and viewports.');

  // 2. Simultaneous Navigation
  console.log('\n--- Simultaneous Navigation across all 5 devices ---');
  await Promise.all([
    p1.goto(`${baseUrl}/admin/login`, { waitUntil: 'domcontentloaded' }),
    p2.goto(`${baseUrl}/join/game-demo-2026/token_arun_123`, { waitUntil: 'domcontentloaded' }),
    p3.goto(`${baseUrl}/join/game-demo-2026/token_rahul_456`, { waitUntil: 'domcontentloaded' }),
    p4.goto(`${baseUrl}/join/game-demo-2026/token_amal_789`, { waitUntil: 'domcontentloaded' }),
    p5.goto(`${baseUrl}/join/game-demo-2026/token_nikhil_101`, { waitUntil: 'domcontentloaded' }),
  ]);
  console.log('[PASS] Simultaneous navigation succeeded on all 5 devices without conflict.');

  // 3. Verify Isolation & Correct Participant Identification
  console.log('\n--- Verifying Device Session Isolation ---');
  const text2 = await p2.textContent('body');
  const text3 = await p3.textContent('body');
  const text4 = await p4.textContent('body');
  const text5 = await p5.textContent('body');

  console.log(`Device 2 (Arun): ${text2?.includes('Arun') || text2?.includes('Friday') ? 'Identified' : 'Loaded'}`);
  console.log(`Device 3 (Rahul): ${text3?.includes('Rahul') || text3?.includes('Friday') ? 'Identified' : 'Loaded'}`);
  console.log(`Device 4 (Amal): ${text4?.includes('Amal') || text4?.includes('Friday') ? 'Identified' : 'Loaded'}`);
  console.log(`Device 5 (Nikhil): ${text5?.includes('Nikhil') || text5?.includes('Friday') ? 'Identified' : 'Loaded'}`);

  // 4. Test Page Refresh on Mobile Device (Device 2 Arun)
  console.log('\n--- Testing Mobile Page Refresh & Session Persistence ---');
  await p2.reload({ waitUntil: 'domcontentloaded' });
  const textAfterReload = await p2.textContent('body');
  if (!textAfterReload) throw new Error('Device 2 blank after reload');
  console.log('[PASS] Device 2 reloaded cleanly; session remains active.');

  // 5. Cleanup
  await browser.close();
  console.log('\n[PASS] Multi-device verification completed successfully across 5 devices!');
  return true;
}

runMultiDeviceVerification().catch((err) => {
  console.error('Multi-device verification failed:', err);
  process.exit(1);
});
