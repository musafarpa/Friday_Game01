import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, ArrowLeft, Crown, RefreshCw, ShieldAlert } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { gameService, friendlyError } from '../services/gameService';
import { LeaderboardPayload } from '../types';
import { triggerWinnerConfetti } from '../utils/confetti';
import { leaderboardCsv } from './admin/LeaderboardTab';

export const LeaderboardPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const confetti = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!gameId) return;
      try {
        if (quiet) setRefreshing(true);
        const res = await gameService.getLeaderboard(gameId);
        if (!res) {
          setBoard(null);
          setError('This game could not be found. It may have been removed after its retention period.');
        } else {
          setBoard(res);
          setError('');
        }
      } catch (e: any) {
        if (!quiet) setError(friendlyError(e, 'Could not load the leaderboard.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gameId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!gameId) return;
    return gameService.subscribeToGameUpdates(gameId, () => void load(true), { mode: 'public' });
  }, [gameId, load]);

  const rows = board?.rows ?? [];
  const final = Boolean(board?.game.is_final);
  const champion = rows[0];

  useEffect(() => {
    if (final && champion && champion.total_points > 0 && !confetti.current) {
      confetti.current = true;
      triggerWinnerConfetti();
    }
  }, [final, champion?.participant_id]);

  const exportCsv = () => {
    if (!board) return;
    const blob = new Blob([leaderboardCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.game.name.replace(/[^\w-]+/g, '_')}_leaderboard.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-white">Loading leaderboard…</h3>
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center" role="alert" data-testid="leaderboard-error">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white">Leaderboard unavailable</h2>
          <p className="text-xs text-rose-300 mt-2">{error}</p>
          <Link to="/" className="mt-5 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white min-h-[44px]">Return to Homepage</Link>
        </div>
      </div>
    );
  }

  // ranking is by AVERAGE points per received challenge; players nobody challenged have no average
  const hasAvg = (r: { average_points?: number | null }) => r.average_points !== null && r.average_points !== undefined;
  const podium = rows.filter((r) => r.rank <= 3 && hasAvg(r));

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors min-h-[44px]">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-background-border bg-background-card hover:bg-background-hover text-xs font-bold text-slate-200 min-h-[44px]" data-testid="lb-refresh">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-background-border bg-background-card hover:bg-background-hover text-xs font-bold text-slate-200 min-h-[44px] disabled:opacity-50" data-testid="lb-export">
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-extrabold text-white">{board?.game.name}</h1>
          <Badge variant={final ? 'purple' : board?.game.status === 'cancelled' ? 'danger' : 'cyan'} size="sm">
            <span data-testid="lb-mode">{final ? 'FINAL RESULTS' : board?.game.status === 'cancelled' ? 'CANCELLED' : 'LIVE'}</span>
          </Badge>
        </div>
        <p className="text-xs text-slate-500 -mt-3 mb-4" data-testid="ranking-note">Ranked by <strong>average points per challenge</strong>, so players who were picked more (or less) often are compared fairly.</p>
        {!final && (
          <p className="text-xs text-slate-500 -mt-3 mb-6">Live standings count finished challenges only. Full results are published when the host completes the game.</p>
        )}

        {final && champion && hasAvg(champion) && (champion.average_points ?? 0) > 0 && (
          <section className="mb-10 p-6 sm:p-12 rounded-3xl bg-gradient-to-b from-amber-500/20 via-background-card to-background-card border-2 border-amber-500/40 text-center shadow-2xl" data-testid="champion">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 font-extrabold text-xs uppercase tracking-wider mb-4 border border-amber-500/30">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>{podium.filter((r) => r.rank === 1).length > 1 ? 'FRIDAY FUN CO-CHAMPIONS 2026' : 'FRIDAY FUN CHAMPION 2026'}</span>
            </div>
            <div className="my-4 flex justify-center">
              <PlayerAvatar displayName={champion.display_name} playerCode={champion.player_code} size="xl" />
            </div>
            <h2 className="text-2xl sm:text-5xl font-black text-white tracking-tight break-words">Congratulations, {podium.filter((r) => r.rank === 1).map((r) => r.display_name).join(' & ')}! 🏆</h2>
            <p className="text-amber-400 text-2xl sm:text-3xl font-black mt-2">{champion.average_points} avg per challenge</p>
            <p className="text-slate-400 text-xs mt-1">{champion.total_points} total points over {champion.challenges_received} challenge(s)</p>
          </section>
        )}

        {rows.length >= 3 && hasAvg(rows[0]) && (rows[0].average_points ?? 0) > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 items-end">
            {podium.slice(0, 3).map((r) => (
              <div key={r.participant_id} className={`p-6 rounded-2xl bg-background-card text-center flex flex-col items-center ${r.rank === 1 ? 'border-2 border-amber-500/40 shadow-xl shadow-amber-500/10' : 'border border-slate-700'}`}>
                <div className="text-2xl mb-2">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}</div>
                <PlayerAvatar displayName={r.display_name} playerCode={r.player_code} size="lg" />
                <h4 className="mt-3 text-lg font-bold text-white">{r.display_name}</h4>
                <div className={`text-xl font-extrabold mt-1 ${r.rank === 1 ? 'text-amber-400' : 'text-slate-300'}`}>{r.average_points} avg</div>
                <div className="text-[11px] text-slate-500">{r.total_points} pts · {r.challenges_received} challenge(s)</div>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-3xl bg-background-card border border-background-border overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-background-border">
            <h3 className="text-base font-bold text-white">All Participant Standings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300" data-testid="public-leaderboard">
              <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Rank</th>
                  <th className="py-3.5 px-4 sm:px-6">Player</th>
                  <th className="py-3.5 px-4 sm:px-6">Avg / challenge</th>
                  <th className="py-3.5 px-4 sm:px-6">Total</th>
                  <th className="py-3.5 px-4 sm:px-6 hidden sm:table-cell">Challenges</th>
                  <th className="py-3.5 px-4 sm:px-6 hidden sm:table-cell">Correct</th>
                  <th className="py-3.5 px-4 sm:px-6 hidden sm:table-cell">Wrong</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-border">
                {rows.map((r) => (
                  <tr key={r.participant_id} className="hover:bg-background-hover/50 transition-colors" data-testid={`lb-${r.display_name}`}>
                    <td className="py-4 px-4 sm:px-6 font-mono font-bold text-slate-400">#{r.rank}</td>
                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar displayName={r.display_name} playerCode={r.player_code} size="sm" />
                        <div>
                          <span className="font-bold text-white block">{r.display_name}</span>
                          {!hasAvg(r) && <span className="text-[11px] text-slate-500" data-testid={`no-challenge-${r.display_name}`}>no challenge received</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 sm:px-6 font-extrabold text-amber-300 text-base" data-testid={`avg-${r.display_name}`}>{hasAvg(r) ? r.average_points : '–'}</td>
                    <td className="py-4 px-4 sm:px-6 font-extrabold text-indigo-400 text-base">{r.total_points} pts</td>
                    <td className="py-4 px-4 sm:px-6 text-slate-300 hidden sm:table-cell">{r.challenges_completed} / {r.challenges_received}</td>
                    <td className="py-4 px-4 sm:px-6 text-emerald-400 font-bold hidden sm:table-cell">{r.correct_answers}</td>
                    <td className="py-4 px-4 sm:px-6 text-rose-400 font-bold hidden sm:table-cell">{r.wrong_answers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No participants yet.</p>}
        </section>
      </main>
    </div>
  );
};
