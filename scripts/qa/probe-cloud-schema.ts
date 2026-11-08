// READ-ONLY: which migrations are applied on the live project? Uses only side-effect-free calls
// (selects, is_admin, and token lookups that cannot match anything).
import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const NIL = '00000000-0000-0000-0000-000000000000';
const out: Record<string, string> = {};
const code = (r: any) => (r.error ? `${r.error.code ?? ''} ${String(r.error.message).slice(0, 90)}` : 'ok');
(async () => {
  out['migration2: questions.game_id/is_used columns'] = code(await sb.from('questions').select('game_id,is_used,topic_id').limit(1));
  out['migration3: questions.sequence_num column'] = code(await sb.from('questions').select('sequence_num').limit(1));
  out['migration3: assignments.answered_questions column'] = code(await sb.from('assignments').select('answered_questions').limit(1));
  out['migration4: table participant_secrets'] = code(await sb.from('participant_secrets').select('participant_id').limit(1));
  out['migration4: table app_settings'] = code(await sb.from('app_settings').select('key').limit(1));
  out['migration4: rpc participant_join'] = code(await sb.rpc('participant_join', { p_game_id: NIL, p_token: 'x'.repeat(32) }));
  out['migration4: rpc get_leaderboard'] = code(await sb.rpc('get_leaderboard', { p_game_id: NIL }));
  out['legacy rpc get_participant_by_token (exploitable)'] = code(await sb.rpc('get_participant_by_token', { p_token_hash: 'nope' }));
  out['legacy rpc check_game_ready_to_start'] = code(await sb.rpc('check_game_ready_to_start', { p_game_id: NIL }));
  console.log(JSON.stringify(out, null, 2));
})();
