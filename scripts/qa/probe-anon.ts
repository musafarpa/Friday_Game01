// READ-ONLY probe of the live Supabase project using the public (anon/publishable) key.
import { createClient } from '@supabase/supabase-js';
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const out: any = {};
(async () => {
  for (const tbl of ['admins','games','participants','topics','game_topics','game_rounds','assignments','questions','answers','scores','game_events']) {
    const r: any = await sb.from(tbl).select('*', { count: 'exact', head: true });
    out['select ' + tbl] = r.error ? `ERR ${r.error.code}: ${r.error.message}` : `ok count=${r.count}`;
  }
  const g = await sb.from('games').select('id,name,status,settings').limit(50);
  out.games = (g.data || []).map((x: any) => ({
    name: x.name, status: x.status,
    poolTopics: Object.keys(x.settings?.topics_question_pool || {}).length,
    poolLeaksCorrectAnswersToAnon: Object.values(x.settings?.topics_question_pool || {}).some((p: any) => p.questions?.some((q: any) => q.correct_option)),
  }));
  const p = await sb.from('participants').select('*').limit(1);
  out.participantColumnsVisibleToAnon = p.data?.[0] ? Object.keys(p.data[0]) : p.error?.message ?? 'none';
  const a = await sb.from('assignments').select('*').limit(1);
  out.assignmentColumnsVisibleToAnon = a.data?.[0] ? Object.keys(a.data[0]) : a.error?.message ?? 'none';
  const q = await sb.from('questions').select('id').limit(1);
  out.questionsVisibleToAnon = q.error?.message ?? q.data?.length;
  const isAdm = await sb.rpc('is_admin');
  out.is_admin_anon = isAdm.error?.message ?? isAdm.data;
  console.log(JSON.stringify(out, null, 2));
})();
