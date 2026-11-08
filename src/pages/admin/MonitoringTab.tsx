import React, { useMemo, useState } from 'react';
import { Clock, RefreshCw, Search, Play } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { CopyButton } from '../../components/CopyButton';
import { buildChallengeUrl } from '../../utils/sharing';
import { AdminData } from './useAdminData';
import { EmptyState, StatCard, ghostBtn } from './ui';
import { useGameActions } from './actions';

export const MonitoringTab: React.FC<{ d: AdminData }> = ({ d }) => {
  const g = d.selectedGame;
  const actions = useGameActions(d);
  const [filter, setFilter] = useState<'all' | 'pending' | 'opened' | 'submitted'>('all');
  const [search, setSearch] = useState('');

  const revealed = g?.status === 'completed';
  const total = d.assignments.length;
  const done = d.assignments.filter((a) => a.status === 'submitted').length;
  const answered = d.assignments.reduce((n, a) => n + (a.answers?.length || 0), 0);
  const expected = d.assignments.reduce((n, a) => n + (a.total_questions || 7), 0);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return d.assignments
      .filter((a) => filter === 'all' || a.status === filter)
      .filter((a) => !q || [a.sender?.display_name, a.receiver?.display_name, a.topic?.name].some((x) => (x || '').toLowerCase().includes(q)))
      // group by receiver so several challenges to the same person sit together, each with its own progress
      .sort((x, y) => (x.receiver?.display_name || '').localeCompare(y.receiver?.display_name || '') || x.created_at.localeCompare(y.created_at));
  }, [d.assignments, filter, search]);

  if (!g) return <EmptyState title="No game selected" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Live Answer Monitoring</h2>
          <p className="text-xs text-slate-400">{g.name} · updates in real time. Correctness is shown only after the game is completed.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => d.refresh()} className={ghostBtn} data-testid="monitor-refresh">
            <RefreshCw className={`w-4 h-4 ${d.loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {(g.status === 'active' || g.status === 'paused') && (
            <button type="button" onClick={() => actions.complete(g)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-purple-600/30 min-h-[44px]">
              <Play className="w-4 h-4 fill-current" />
              <span>Complete & Reveal</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-testid="monitor-stats">
        <StatCard label="Participants" value={d.participants.length} />
        <StatCard label="Challenges" value={total} />
        <StatCard label="Assigned Qs" value={expected} />
        <StatCard label="Answers In" value={answered} tone="text-emerald-400" />
        <StatCard label="Pending Answers" value={expected - answered} tone="text-amber-400" />
        <StatCard label="Completed" value={`${done}/${total}`} tone="text-purple-300" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" aria-label="Search challenges" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sender, receiver or topic…" className="w-full bg-background-card border border-background-border rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none min-h-[44px]" />
        </div>
        <select aria-label="Filter challenges" value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-background-card border border-background-border rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[44px]">
          <option value="all">All challenges</option>
          <option value="pending">Not opened</option>
          <option value="opened">In progress</option>
          <option value="submitted">Completed</option>
        </select>
      </div>

      <div className="rounded-2xl bg-background-card border border-background-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300" data-testid="monitor-table">
            <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
              <tr>
                <th className="py-3.5 px-4">Challenger</th>
                <th className="py-3.5 px-4">Receiver</th>
                <th className="py-3.5 px-4">Topic</th>
                <th className="py-3.5 px-4">Progress</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">{revealed ? 'Result' : 'Result (after reveal)'}</th>
                <th className="py-3.5 px-4">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-border font-medium">
              {rows.map((a) => {
                const n = a.answers?.length || 0;
                const t = a.total_questions || 7;
                const correct = (a.answers || []).filter((x) => x.is_correct).length;
                const url = a.raw_challenge_token ? buildChallengeUrl(a.raw_challenge_token) : null;
                return (
                  <tr key={a.id} className="hover:bg-background-hover/50 transition-colors" data-testid={`challenge-row-${a.sender?.display_name}-${a.receiver?.display_name}`}>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar displayName={a.sender?.display_name || ''} playerCode={a.sender?.player_code} size="sm" />
                        <span className="font-bold text-white">{a.sender?.display_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar displayName={a.receiver?.display_name || ''} playerCode={a.receiver?.player_code} size="sm" />
                        <span className="font-bold text-white">{a.receiver?.display_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4"><Badge variant="purple" size="sm">{a.topic?.name}</Badge></td>
                    <td className="py-4 px-4 min-w-[130px]">
                      <div className="text-xs font-mono text-slate-300 mb-1">{n} / {t} answered</div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${Math.round((n / t) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={a.status === 'submitted' ? 'success' : a.status === 'opened' ? 'cyan' : 'warning'} size="sm">
                        {a.status === 'submitted' ? 'Completed' : a.status === 'opened' ? 'In progress' : 'Not opened'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-xs">
                      {revealed ? (
                        <span className="font-mono"><span className="text-emerald-400 font-bold">{correct} ✓</span> · <span className="text-rose-400 font-bold">{n - correct} ✗</span> · <strong className="text-white">{a.current_score} pts</strong></span>
                      ) : (
                        <span className="text-slate-500 italic">hidden</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {url ? <CopyButton textToCopy={url} size="sm" label="Copy Link" /> : <span className="text-[11px] text-slate-500">n/a</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="text-center py-12">
            <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-300 font-semibold">{total === 0 ? 'No challenges yet' : 'No challenges match your filter'}</p>
            {total === 0 && <p className="text-slate-500 text-xs mt-1">Participants open their invitation link, pick a friend and a topic.</p>}
          </div>
        )}
      </div>
    </div>
  );
};
