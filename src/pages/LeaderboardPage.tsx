import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Trophy,
  Download,
  Share2,
  ArrowLeft,
  Crown,
  Medal,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { gameService } from '../services/gameService';
import { Score, Game } from '../types';
import { triggerWinnerConfetti } from '../utils/confetti';

export const LeaderboardPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [leaderboard, setLeaderboard] = useState<Score[]>([]);

  useEffect(() => {
    if (!gameId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [g, scores] = await Promise.all([
          gameService.getGame(gameId),
          gameService.getLeaderboard(gameId),
        ]);
        setGame(g);
        setLeaderboard(scores);

        // Confetti if there's a winner
        if (scores.length > 0 && scores[0].total_points > 0) {
          triggerWinnerConfetti();
        }
      } catch (err) {
        console.error('Error loading leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [gameId]);

  const handleExportCSV = () => {
    if (!game) return;
    const headers = ['Rank', 'Player Code', 'Player Name', 'Score', 'Correct', 'Wrong'];
    const rows = leaderboard.map((s, idx) => [
      idx + 1,
      s.participant?.player_code || '',
      `"${s.participant?.display_name || ''}"`,
      s.total_points,
      s.correct_answers,
      s.wrong_answers,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${game.name}_leaderboard.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const champion = leaderboard.length > 0 ? leaderboard[0] : null;

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-background-border bg-background-card hover:bg-background-hover text-xs font-bold text-slate-200 transition-all min-h-[44px]"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Winner Hero Banner */}
        {champion && (
          <section className="mb-10 p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-amber-500/20 via-background-card to-background-card border-2 border-amber-500/40 text-center shadow-2xl relative overflow-hidden">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 font-extrabold text-xs uppercase tracking-wider mb-4 border border-amber-500/30">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>FRIDAY FUN CHAMPION 2026</span>
            </div>

            <div className="my-4 flex justify-center">
              <PlayerAvatar
                displayName={champion.participant?.display_name || ''}
                playerCode={champion.participant?.player_code}
                size="xl"
              />
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Congratulations, {champion.participant?.display_name}! 🏆
            </h1>

            <p className="text-amber-400 text-2xl sm:text-3xl font-black mt-2">
              {champion.total_points} Points
            </p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {champion.correct_answers} correct challenges completed
            </p>
          </section>
        )}

        {/* Podium View (Top 3) */}
        {leaderboard.length >= 3 && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 items-end">
            {/* 2nd Place */}
            <div className="order-2 sm:order-1 p-6 rounded-2xl bg-background-card border border-slate-700 text-center flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-slate-600 text-white font-extrabold text-sm flex items-center justify-center mb-3">
                🥈
              </div>
              <PlayerAvatar
                displayName={leaderboard[1]?.participant?.display_name || ''}
                playerCode={leaderboard[1]?.participant?.player_code}
                size="lg"
              />
              <h4 className="mt-3 text-lg font-bold text-white">
                {leaderboard[1]?.participant?.display_name}
              </h4>
              <div className="text-xl font-extrabold text-slate-300 mt-1">
                {leaderboard[1]?.total_points} pts
              </div>
            </div>

            {/* 1st Place */}
            <div className="order-1 sm:order-2 p-8 rounded-2xl bg-background-card border-2 border-amber-500/40 text-center flex flex-col items-center shadow-xl shadow-amber-500/10 sm:-translate-y-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-extrabold text-base flex items-center justify-center mb-3">
                🥇
              </div>
              <PlayerAvatar
                displayName={leaderboard[0]?.participant?.display_name || ''}
                playerCode={leaderboard[0]?.participant?.player_code}
                size="xl"
              />
              <h4 className="mt-3 text-xl font-black text-white">
                {leaderboard[0]?.participant?.display_name}
              </h4>
              <div className="text-3xl font-black text-amber-400 mt-1">
                {leaderboard[0]?.total_points} pts
              </div>
            </div>

            {/* 3rd Place */}
            <div className="order-3 p-6 rounded-2xl bg-background-card border border-slate-700 text-center flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-amber-800 text-white font-extrabold text-sm flex items-center justify-center mb-3">
                🥉
              </div>
              <PlayerAvatar
                displayName={leaderboard[2]?.participant?.display_name || ''}
                playerCode={leaderboard[2]?.participant?.player_code}
                size="lg"
              />
              <h4 className="mt-3 text-lg font-bold text-white">
                {leaderboard[2]?.participant?.display_name}
              </h4>
              <div className="text-xl font-extrabold text-slate-300 mt-1">
                {leaderboard[2]?.total_points} pts
              </div>
            </div>
          </section>
        )}

        {/* Detailed Leaderboard Table */}
        <section className="rounded-3xl bg-background-card border border-background-border overflow-hidden">
          <div className="p-6 border-b border-background-border">
            <h3 className="text-base font-bold text-white">All Participant Standings</h3>
          </div>

          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
              <tr>
                <th className="py-3.5 px-4 sm:px-6">Rank</th>
                <th className="py-3.5 px-4 sm:px-6">Player</th>
                <th className="py-3.5 px-4 sm:px-6">Total Score</th>
                <th className="py-3.5 px-4 sm:px-6 hidden sm:table-cell">Correct</th>
                <th className="py-3.5 px-4 sm:px-6 hidden sm:table-cell">Wrong</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-border">
              {leaderboard.map((s, idx) => (
                <tr key={s.id} className="hover:bg-background-hover/50 transition-colors">
                  <td className="py-4 px-4 sm:px-6 font-mono font-bold text-slate-400">
                    #{idx + 1}
                  </td>
                  <td className="py-4 px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar
                        displayName={s.participant?.display_name || ''}
                        playerCode={s.participant?.player_code}
                        size="sm"
                      />
                      <span className="font-bold text-white">{s.participant?.display_name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 sm:px-6 font-extrabold text-indigo-400 text-base">
                    {s.total_points} pts
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-emerald-400 font-bold hidden sm:table-cell">
                    {s.correct_answers}
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-rose-400 font-bold hidden sm:table-cell">
                    {s.wrong_answers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
};
