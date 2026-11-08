import React, { useState } from 'react';
import { Shield, Gamepad2, Users, Layers, HelpCircle, Eye, Trophy, Settings, Plus, RefreshCw } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAdminData } from './admin/useAdminData';
import { ConfirmDialog, StatusBadge } from './admin/ui';
import { OverviewTab } from './admin/OverviewTab';
import { GamesTab } from './admin/GamesTab';
import { ParticipantsTab } from './admin/ParticipantsTab';
import { MonitoringTab } from './admin/MonitoringTab';
import { LeaderboardTab } from './admin/LeaderboardTab';
import { TopicsTab } from './admin/TopicsTab';
import { RulesTab } from './admin/RulesTab';

type AdminTab = 'overview' | 'games' | 'participants' | 'topics' | 'monitoring' | 'leaderboard' | 'settings';

export const AdminDashboard: React.FC = () => {
  const d = useAdminData();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [createSignal, setCreateSignal] = useState(0);
  const [confirming, setConfirming] = useState(false);

  if (d.checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-white">Verifying Admin Access...</h3>
      </div>
    );
  }

  const answered = d.assignments.reduce((n, a) => n + (a.answers?.length || 0), 0);
  const expected = d.assignments.reduce((n, a) => n + (a.total_questions || 7), 0);

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'games', label: `Games (${d.games.length})`, icon: Gamepad2 },
    { id: 'participants', label: `Participants (${d.participants.length})`, icon: Users },
    { id: 'monitoring', label: `Answer Monitoring (${answered}/${expected})`, icon: Eye },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'topics', label: `Topics (${d.topics.length})`, icon: HelpCircle },
    { id: 'settings', label: 'Game Rules', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col overflow-x-hidden">
      <Navbar isAdmin={true} onAdminLogout={() => d.navigate('/')} />

      <section className="border-b border-background-border bg-background-card/50 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white">Admin Command Center</h1>
                {d.selectedGame && <StatusBadge status={d.selectedGame.status} />}
              </div>
              <p className="text-xs text-slate-400">Friday Fun 2026 • Live multiplayer management</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              aria-label="Select game"
              value={d.selectedGame?.id || ''}
              onChange={(e) => d.selectGame(e.target.value)}
              disabled={d.games.length === 0}
              className="bg-background-darker border border-background-border rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[44px] max-w-full flex-1 sm:flex-none sm:max-w-[320px]"
              data-testid="game-selector"
            >
              {d.games.length === 0 && <option value="">No games yet</option>}
              {d.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.status.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setTab('games');
                setCreateSignal((n) => n + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/20 min-h-[44px]"
              data-testid="header-create-game"
            >
              <Plus className="w-4 h-4" />
              <span>Create Game</span>
            </button>
            <button
              type="button"
              onClick={() => d.refresh()}
              className="p-2.5 rounded-xl border border-background-border bg-background-darker text-slate-300 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Refresh live data"
              aria-label="Refresh live data"
              data-testid="header-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${d.loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {d.banner && (
        <div
          role="status"
          data-testid="status-banner"
          className={`px-4 py-3 text-xs sm:text-sm text-center font-semibold border-b ${
            d.banner.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : d.banner.type === 'warning'
              ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}
        >
          {d.banner.message}
        </div>
      )}
      {d.loadError && (
        <div role="alert" className="px-4 py-3 text-xs sm:text-sm text-center font-semibold bg-rose-500/20 text-rose-300 border-b border-rose-500/30">
          {d.loadError}{' '}
          <button type="button" onClick={() => d.refresh()} className="underline ml-1">Retry</button>
        </div>
      )}

      <div className="border-b border-background-border bg-background-darker/60 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto py-2 no-scrollbar" role="tablist" aria-label="Admin sections">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap min-h-[44px] ${
                  active ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-background-hover'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {tab === 'overview' && <OverviewTab d={d} setTab={setTab} />}
        {tab === 'games' && <GamesTab d={d} setTab={setTab} createSignal={createSignal} />}
        {tab === 'participants' && <ParticipantsTab d={d} />}
        {tab === 'monitoring' && <MonitoringTab d={d} />}
        {tab === 'leaderboard' && <LeaderboardTab d={d} />}
        {tab === 'topics' && <TopicsTab d={d} />}
        {tab === 'settings' && <RulesTab d={d} />}
      </main>

      {d.confirm && (
        <ConfirmDialog
          title={d.confirm.title}
          body={d.confirm.body}
          confirmLabel={d.confirm.confirmLabel}
          tone={d.confirm.tone}
          busy={confirming}
          onCancel={() => d.setConfirm(null)}
          onConfirm={async () => {
            if (confirming) return; // double-click guard
            const req = d.confirm!;
            setConfirming(true);
            try {
              await req.onConfirm();
            } finally {
              setConfirming(false);
              d.setConfirm(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
