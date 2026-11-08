import React, { useState } from 'react';
import { Users, HelpCircle, CheckCircle2, Clock, Database, RefreshCw, Sparkles, AlertCircle, Eye, Gamepad2, Trophy, Play } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { WhatsAppButton } from '../../components/WhatsAppButton';
import { CopyButton } from '../../components/CopyButton';
import { gameService } from '../../services/gameService';
import { verifySupabaseConnection, supabaseUrl } from '../../lib/supabase';
import { buildInvitationUrl, generateInvitationWhatsAppUrl } from '../../utils/sharing';
import { AdminData } from './useAdminData';
import { StatCard, StatusBadge, ghostBtn } from './ui';
import { useGameActions } from './actions';

export const OverviewTab: React.FC<{ d: AdminData; setTab: (t: any) => void }> = ({ d, setTab }) => {
  const g = d.selectedGame;
  const actions = useGameActions(d);
  const [db, setDb] = useState<{ testing: boolean; result?: { connected: boolean; latencyMs?: number; error?: string } }>({ testing: false });

  const count = (s: string[]) => d.games.filter((x) => s.includes(x.status)).length;
  const pCount = (s: string) => d.participants.filter((p) => p.status === s).length;
  const challengesTotal = d.assignments.length;
  const challengesDone = d.assignments.filter((a) => a.status === 'submitted').length;
  const challengesStarted = d.assignments.filter((a) => a.status === 'opened').length;
  const answersSubmitted = d.assignments.reduce((n, a) => n + (a.answers?.length || 0), 0);
  const answersExpected = d.assignments.reduce((n, a) => n + (a.total_questions || 7), 0);
  const leader = d.leaderboard?.rows?.[0];
  const poolReady = d.pool.length > 0 && d.pool.every((t) => t.status === 'complete');

  const testDb = async () => {
    setDb({ testing: true });
    const result = await verifySupabaseConnection();
    setDb({ testing: false, result });
  };

  const regenerate = () =>
    g &&
    d.run(
      `pool:${g.id}`,
      async () => {
        const res = await gameService.generateQuestionPoolForGame(g.id, undefined, d.setPool);
        await d.refresh({ quiet: true });
        return res;
      },
      (r) => (r.success ? 'All topics have a complete question pool.' : 'Some topics are still incomplete – see the cards below.')
    ).then((r) => r && r.warnings.length > 0 && d.flash('warning', r.warnings.slice(0, 2).join(' ')));

  return (
    <div className="space-y-8">
      {/* Backend status */}
      <div className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-950/20 border-emerald-500/30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-white">Supabase Cloud Backend</span>
              <Badge variant="success" size="sm">CONFIGURED</Badge>
              <Badge variant={d.realtime === 'SUBSCRIBED' ? 'success' : 'warning'} size="sm">
                REALTIME: {d.realtime === 'SUBSCRIBED' ? 'LIVE' : String(d.realtime).toUpperCase()}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">Target project: {supabaseUrl}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {db.result && (
            <span className={`text-xs font-semibold ${db.result.connected ? 'text-emerald-400' : 'text-rose-400'}`}>
              {db.result.connected ? `Connected (${db.result.latencyMs}ms)` : `Error: ${db.result.error}`}
            </span>
          )}
          <button type="button" onClick={testDb} disabled={db.testing} className={ghostBtn}>
            <RefreshCw className={`w-3.5 h-3.5 ${db.testing ? 'animate-spin' : ''}`} />
            <span>{db.testing ? 'Testing…' : 'Test Connection'}</span>
          </button>
        </div>
      </div>

      {/* Games */}
      <section aria-label="Game statistics">
        <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">All games</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard testId="stat-total-games" label="Total Games" value={d.games.length} icon={<Gamepad2 className="w-4 h-4 text-indigo-400" />} />
          <StatCard testId="stat-registration" label="Registration Open" value={count(['registration_open', 'draft', 'ready'])} tone="text-cyan-300" />
          <StatCard testId="stat-active" label="In Progress" value={count(['active', 'paused', 'waiting_for_answers'])} tone="text-emerald-400" />
          <StatCard testId="stat-completed" label="Completed" value={count(['completed'])} tone="text-purple-300" />
          <StatCard testId="stat-cancelled" label="Cancelled" value={count(['cancelled'])} tone="text-rose-300" />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          {d.totals.participantsAll} participant(s) and {d.totals.challengesAll} challenge(s) across all games.
        </p>
      </section>

      {/* Selected game */}
      {g ? (
        <section aria-label="Selected game statistics">
          <h3 className="text-xs font-bold uppercase text-slate-400 mb-3 flex items-center gap-2">
            Selected game: <span className="text-white normal-case">{g.name}</span> <StatusBadge status={g.status} />
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <StatCard
              testId="stat-participants"
              label="Participants"
              value={d.participants.length}
              icon={<Users className="w-4 h-4 text-indigo-400" />}
              sub={
                <>
                  <span className="text-amber-400 font-bold">{pCount('pending')} pending</span> ·{' '}
                  <span className="text-emerald-400 font-bold">{d.participants.length - pCount('pending')} joined</span> ·{' '}
                  {pCount('selected') + pCount('completed')} sent challenge
                </>
              }
            />
            <StatCard
              testId="stat-challenges"
              label="Challenges"
              value={challengesTotal}
              icon={<HelpCircle className="w-4 h-4 text-purple-400" />}
              sub={`${challengesDone} completed · ${challengesStarted} in progress · ${challengesTotal - challengesDone - challengesStarted} not opened`}
            />
            <StatCard
              testId="stat-answers"
              label="Answers Submitted"
              value={`${answersSubmitted}/${answersExpected}`}
              tone="text-emerald-400"
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              sub={answersExpected > 0 ? `${Math.round((answersSubmitted / answersExpected) * 100)}% of ${challengesTotal * 7} questions` : 'Awaiting challenges'}
            />
            <StatCard
              testId="stat-pending"
              label="Pending Answers"
              value={answersExpected - answersSubmitted}
              tone="text-amber-400"
              icon={<Clock className="w-4 h-4 text-amber-400" />}
              sub="Questions not yet answered"
            />
          </div>

          {/* Status bar */}
          <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-background-card to-background-card border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-indigo-400 font-bold uppercase">Round {d.round?.round_number || 1}</span>
                <Badge variant={d.round?.status === 'revealed' ? 'purple' : d.round?.status === 'closed' ? 'danger' : 'success'} size="sm">
                  {d.round?.status === 'revealed' ? 'REVEALED' : d.round?.status === 'closed' ? 'CLOSED' : 'ACTIVE'}
                </Badge>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {g.status === 'completed'
                  ? 'Game complete. Final scores are published.'
                  : g.status === 'cancelled'
                  ? 'This game was cancelled.'
                  : challengesTotal > 0 && challengesDone === challengesTotal
                  ? 'All participants have finished their challenges!'
                  : `${challengesDone} of ${challengesTotal} challenges finished.`}
              </h3>
              {leader && leader.total_points > 0 && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Leading: <strong className="text-white">{leader.display_name}</strong> with {leader.total_points} pts
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(g.status === 'active' || g.status === 'paused') && (
                <button
                  type="button"
                  onClick={() => actions.complete(g)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 min-h-[44px]"
                  data-testid="overview-complete"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Complete & Reveal Answers</span>
                </button>
              )}
              <button type="button" onClick={() => setTab('monitoring')} className={ghostBtn}>
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Live Monitor</span>
              </button>
            </div>
          </div>

          {/* Pools */}
          <div className="mt-6 rounded-2xl bg-background-card border border-background-border p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-background-border">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-5 h-5 text-indigo-400" /> Topic Question Pools
                  <Badge variant={poolReady ? 'success' : 'warning'} size="sm">
                    {poolReady ? 'ALL TOPICS READY' : `${d.pool.filter((t) => t.status === 'complete').length}/${d.pool.length} TOPICS READY`}
                  </Badge>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Each topic needs at least 7 valid questions: 3 easy, 3 medium, 1 hard (4 distinct options, 1 correct). The pool is topped up to 10 per topic.
                </p>
              </div>
              {(g.status === 'draft' || g.status === 'registration_open' || g.status === 'ready' || g.status === 'active' || g.status === 'paused') && (
                <button type="button" onClick={regenerate} disabled={d.busy.has(`pool:${g.id}`)} className={ghostBtn} data-testid="pool-topup">
                  <RefreshCw className={`w-3.5 h-3.5 ${d.busy.has(`pool:${g.id}`) ? 'animate-spin' : ''}`} />
                  <span>{d.busy.has(`pool:${g.id}`) ? 'Generating…' : 'Top Up All Topics'}</span>
                </button>
              )}
            </div>
            {d.pool.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-sm">No topics configured for this game.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {d.pool.map((tp) => {
                  const ok = tp.status === 'complete';
                  const pct = Math.min(100, Math.round((tp.current_count / Math.max(10, tp.required_count)) * 100));
                  return (
                    <div key={tp.topic_id} data-testid={`pool-${tp.topic_name}`} className={`p-4 rounded-xl border ${ok ? 'bg-emerald-950/10 border-emerald-500/25' : 'bg-amber-950/10 border-amber-500/25'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-white truncate">{tp.topic_name}</span>
                        <Badge variant={ok ? 'success' : tp.status === 'failed' ? 'danger' : 'warning'} size="sm">
                          {ok ? 'COMPLETE' : tp.status === 'generating' ? 'GENERATING…' : `${tp.current_count}/${tp.required_count}`}
                        </Badge>
                      </div>
                      <div className="w-full bg-background-darker rounded-full h-2 mb-2.5 overflow-hidden border border-background-border">
                        <div className={`h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Easy {tp.difficulty_counts.easy} (min 3)</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Med {tp.difficulty_counts.medium} (min 3)</span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">Hard {tp.difficulty_counts.hard} (min 1)</span>
                      </div>
                      {!ok && (
                        <p className="mt-2 text-[11px] text-amber-300 flex items-start gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                          <span>{tp.error || 'Incomplete – use “Top Up All Topics”.'}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick roster */}
          <div className="mt-6 rounded-2xl bg-background-card border border-background-border p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Quick Roster</h3>
              <button type="button" onClick={() => setTab('participants')} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 min-h-[44px] px-2 -mr-2 inline-flex items-center">
                View all & manage →
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {d.participants.length === 0 ? (
                <div className="col-span-full py-8 text-center text-slate-400 text-sm">No participants yet. Add players from the Participants tab.</div>
              ) : (
                d.participants.slice(0, 6).map((p) => {
                  const url = p.raw_invitation_token ? buildInvitationUrl(p.game_id, p.raw_invitation_token) : null;
                  return (
                    <div key={p.id} className="p-3.5 rounded-xl bg-background-darker border border-background-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar displayName={p.display_name} playerCode={p.player_code} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white leading-none truncate">{p.display_name}</p>
                          <span className="text-[11px] text-slate-500 capitalize">{p.status}</span>
                        </div>
                      </div>
                      {url ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <CopyButton textToCopy={url} size="sm" variant="ghost" label="" copiedLabel="" />
                          <WhatsAppButton url={generateInvitationWhatsAppUrl(p.display_name, url)} size="sm" label="" />
                        </div>
                      ) : (
                        <button type="button" onClick={() => setTab('participants')} className="text-[11px] text-amber-400 font-semibold shrink-0 min-h-[44px] px-2 inline-flex items-center">Link needs regenerating</button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : (
        !d.loading && (
          <div className="p-10 text-center rounded-2xl bg-background-card border border-background-border">
            <Gamepad2 className="w-12 h-12 text-indigo-400/50 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No games yet</h3>
            <p className="text-xs text-slate-400">Create your first game from the Games tab.</p>
          </div>
        )
      )}
    </div>
  );
};
