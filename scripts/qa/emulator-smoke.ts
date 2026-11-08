// Smoke test: drives the emulator with the REAL supabase-js client (same library the app bundles).
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EMULATOR_URL || 'http://127.0.0.1:54321';
const KEY = 'sb_publishable_emulator_key_for_local_tests';
let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
  if (!ok) failures++;
};

(async () => {
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });
  const admin = createClient(URL, KEY, { auth: { persistSession: false } });

  check('anon cannot read participants (RLS)', ((await anon.from('participants').select('id')).data ?? []).length === 0);
  const topics = await anon.from('topics').select('*').order('name');
  check('anon can read 10 topics', (topics.data ?? []).length === 10, String(topics.error?.message ?? ''));

  const bad = await admin.auth.signInWithPassword({ email: 'admin@test.local', password: 'nope' });
  check('wrong password rejected', !!bad.error, bad.error?.message);
  const ok = await admin.auth.signInWithPassword({ email: 'admin@test.local', password: 'Admin#QA-2026' });
  check('admin login ok', !ok.error && !!ok.data.session);
  const isAdmin = await admin.rpc('is_admin');
  check('is_admin() true for admin, false for anon', isAdmin.data === true && (await anon.rpc('is_admin')).data === false);
  const denied = await anon.rpc('admin_topic_stats');
  check('anon denied admin RPC', !!denied.error, denied.error?.message);

  const tids = (topics.data ?? []).slice(0, 2).map((t: any) => t.id);
  const created = await admin.rpc('admin_create_game', { p_name: 'Emu Smoke', p_description: 'x', p_settings: { points_correct: 10 }, p_topic_ids: tids, p_initial_status: 'registration_open' });
  check('admin_create_game via RPC (jsonb + uuid[] args)', !created.error && !!created.data?.game_id, created.error?.message);
  const gameId = created.data.game_id;

  const add = await admin.rpc('admin_add_participant', { p_game_id: gameId, p_display_name: 'Smoke', p_player_code: 'S' });
  check('admin_add_participant', !add.error && add.data?.raw_token?.length === 64, add.error?.message);
  const parts = await admin.from('participants').select('id, display_name, status, participant_secrets(raw_token)').eq('game_id', gameId);
  check('participants + embedded secret (admin)', parts.data?.[0]?.participant_secrets?.raw_token === add.data.raw_token, JSON.stringify(parts.error));
  check('anon sees no participant secrets', ((await anon.from('participant_secrets').select('raw_token')).data ?? []).length === 0);

  const single = await admin.from('games').select('*').eq('id', gameId).maybeSingle();
  check('maybeSingle() game', single.data?.id === gameId);
  const head = await admin.from('participants').select('id', { count: 'exact', head: true });
  check('count=exact head', head.count === 1, String(head.count));

  // realtime: subscribe as admin to participants, then mutate from another client
  const events: string[] = [];
  let subscribed = false;
  const ch = admin.channel('smoke').on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, (p) => events.push(p.eventType));
  ch.subscribe((s) => { if (s === 'SUBSCRIBED') subscribed = true; });
  const anonEvents: string[] = [];
  const ach = anon.channel('smoke-anon').on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, (p) => anonEvents.push(p.eventType)).on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (p) => anonEvents.push('games:' + p.eventType));
  ach.subscribe();
  await new Promise((r) => setTimeout(r, 800));
  check('realtime SUBSCRIBED', subscribed);
  await admin.rpc('admin_add_participant', { p_game_id: gameId, p_display_name: 'Smoke2', p_player_code: 'T' });
  await admin.rpc('admin_update_game', { p_game_id: gameId, p_name: 'Emu Smoke 2', p_description: '', p_settings: {} });
  await new Promise((r) => setTimeout(r, 800));
  check('admin receives participants INSERT event', events.includes('INSERT'), events.join(','));
  check('anon receives games UPDATE but NOT participants events', anonEvents.some((e) => e.startsWith('games:')) && !anonEvents.includes('INSERT'), anonEvents.join(','));

  const left = await admin.rpc('admin_delete_game', { p_game_id: gameId });
  check('admin_delete_game', !left.error, left.error?.message);

  await admin.removeAllChannels();
  await anon.removeAllChannels();
  console.log(failures === 0 ? '\nALL EMULATOR SMOKE CHECKS PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
