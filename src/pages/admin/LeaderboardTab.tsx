import React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { PlayerAvatar } from '../../components/PlayerAvatar';
import { AdminData } from './useAdminData';
import { EmptyState, ghostBtn } from './ui';

export function leaderboardCsv(rows: Array<{ rank: number; player_code: string; display_name: string; total_points: number; correct_answers: number; wrong_answers: number }>): string {
  // quote everything; neutralise spreadsheet formulas (=, +, -, @) so a player name can't execute in Excel/Sheets
  const esc = (v: string | number) => {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const header = ['Rank', 'Player Code', 'Player Name', 'Score', 'Correct', 'Wrong'];
  return [header.join(','), ...rows.map((r) => [r.rank, esc(r.player_code), esc(r.display_name), r.total_points, r.correct_answers, r.wrong_answers].join(','))].join('\n');
}

export const LeaderboardTab: React.FC<{ d: AdminData }> = ({ d }) => {
  const g = d.selectedGame;
  const rows = d.leaderboard?.rows ?? [];
  if (!g) return <EmptyState title="No game selected" />;

  const exportCsv = () => {
    const blob = new Blob([leaderboardCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${g.name.replace(/[^\w-]+/g, '_')}_leaderboard.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const top = rows.filter((r) => r.rank <= 3);
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
            Game Leaderboard
            <Badge variant={g.status === 'completed' ? 'purple' : 'cyan'} size="sm">{g.status === 'completed' ? 'FINAL' : 'LIVE'}</Badge>
          </h2>
          <p className="text-xs text-slate-400">
            Scores are calculated on the server from stored answers ({g.settings.points_correct} pts per correct answer, max {7 * g.settings.points_correct} per challenge). Ties share a rank.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => d.refresh()} className={ghostBtn} data-testid="leaderboard-refresh">
            <RefreshCw className={`w-4 h-4 ${d.loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={ghostBtn} data-testid="leaderboard-export">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No participants to rank yet" hint="Add participants to see them on the leaderboard." />
      ) : (
        <>
          {rows.length >= 3 && rows[0].total_points > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-4">
              {top.slice(0, 3).map((r) => (
                <div key={r.participant_id} className={`p-6 rounded-2xl text-center flex flex-col items-center border ${r.rank === 1 ? 'bg-gradient-to-b from-amber-500/20 via-background-card to-background-card border-2 border-amber-500/40' : 'bg-background-card border-slate-700'}`}>
                  <div className={`w-9 h-9 rounded-full font-extrabold text-sm flex items-center justify-center mb-3 ${r.rank === 1 ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black' : 'bg-slate-600 text-white'}`}>{r.rank}</div>
                  <PlayerAvatar displayName={r.display_name} playerCode={r.player_code} size="lg" />
                  <h4 className="mt-3 text-lg font-bold text-white">{r.display_name}</h4>
                  <div className={`mt-1 text-2xl font-extrabold ${r.rank === 1 ? 'text-amber-400' : 'text-slate-300'}`}>{r.total_points} pts</div>
                  <span className="text-xs text-slate-500">{r.correct_answers} correct</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-background-card border border-background-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300" data-testid="admin-leaderboard">
                <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Participant</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Correct</th>
                    <th className="py-3 px-4">Wrong</th>
                    <th className="py-3 px-4">Challenges done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-border">
                  {rows.map((r) => (
                    <tr key={r.participant_id} className="hover:bg-background-hover/50" data-testid={`lb-row-${r.display_name}`}>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-400">#{r.rank}</td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        <span className="inline-flex items-center gap-2"><PlayerAvatar displayName={r.display_name} playerCode={r.player_code} size="sm" /> {r.display_name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-indigo-400">{r.total_points} pts</td>
                      <td className="py-3.5 px-4 text-emerald-400 font-semibold">{r.correct_answers}</td>
                      <td className="py-3.5 px-4 text-rose-400 font-semibold">{r.wrong_answers}</td>
                      <td className="py-3.5 px-4 text-slate-300">{r.challenges_completed} / {r.challenges_received}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
