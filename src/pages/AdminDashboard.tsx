import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Gamepad2,
  Users,
  Layers,
  HelpCircle,
  Eye,
  Trophy,
  Settings,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Trash2,
  Download,
  AlertTriangle,
  Play,
  Share2,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { CopyButton } from '../components/CopyButton';
import { gameService } from '../services/gameService';
import {
  Game,
  Participant,
  Topic,
  Assignment,
  Score,
  GameRound,
} from '../types';
import {
  buildInvitationUrl,
  generateInvitationWhatsAppUrl,
  buildChallengeUrl,
} from '../utils/sharing';
import { triggerWinnerConfetti } from '../utils/confetti';

type AdminTab =
  | 'overview'
  | 'games'
  | 'participants'
  | 'topics'
  | 'monitoring'
  | 'leaderboard'
  | 'settings';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);

  // Data states
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [leaderboard, setLeaderboard] = useState<Score[]>([]);
  const [activeRound, setActiveRound] = useState<GameRound | null>(null);

  // Participant Form state
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerCode, setNewPlayerCode] = useState('');
  const [newPlayerContact, setNewPlayerContact] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantFormError, setParticipantFormError] = useState('');

  // Game Creation Form state
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameDesc, setNewGameDesc] = useState('');
  const [newGameMin, setNewGameMin] = useState(3);
  const [newGameMax, setNewGameMax] = useState(30);
  const [newGamePoints, setNewGamePoints] = useState(10);

  // New Topic Form state
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  // Action status message
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Data
  const refreshAllData = async () => {
    try {
      setLoading(true);
      const allGames = await gameService.getGames();
      setGames(allGames);

      let current = selectedGame;
      if (!current && allGames.length > 0) {
        current = allGames[0];
        setSelectedGame(current);
      }

      if (current) {
        const [parts, round, topList, assigns, lboard] = await Promise.all([
          gameService.getParticipants(current.id),
          gameService.getActiveRound(current.id),
          gameService.getAllTopics(),
          gameService.getLiveAssignments(current.id),
          gameService.getLeaderboard(current.id),
        ]);
        setParticipants(parts);
        setActiveRound(round);
        setTopics(topList);
        setAssignments(assigns);
        setLeaderboard(lboard);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Subscribe to live Realtime updates for selected game
  useEffect(() => {
    if (!selectedGame) return;
    const unsubscribe = gameService.subscribeToGameUpdates(selectedGame.id, () => {
      // Reload live assignments and leaderboard silently on changes
      gameService.getLiveAssignments(selectedGame.id).then(setAssignments);
      gameService.getLeaderboard(selectedGame.id).then(setLeaderboard);
      gameService.getParticipants(selectedGame.id).then(setParticipants);
    });
    return () => unsubscribe();
  }, [selectedGame?.id]);

  // Next suggested player code (A, B, C, D...)
  const getNextPlayerCode = (): string => {
    const existingCodes = participants.map((p) => p.player_code.toUpperCase());
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let char of alphabet) {
      if (!existingCodes.includes(char)) return char;
    }
    return `P${participants.length + 1}`;
  };

  // Add Participant Handler
  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setParticipantFormError('');

    if (!selectedGame) {
      setParticipantFormError('No game selected');
      return;
    }

    if (!newPlayerName.trim()) {
      setParticipantFormError('Please enter participant name');
      return;
    }

    const code = newPlayerCode.trim() || getNextPlayerCode();

    // Check duplicate code or name
    if (participants.some((p) => p.player_code.toUpperCase() === code.toUpperCase())) {
      setParticipantFormError(`Player code "${code}" is already assigned in this game.`);
      return;
    }
    if (participants.some((p) => p.display_name.toLowerCase() === newPlayerName.trim().toLowerCase())) {
      setParticipantFormError(`A player named "${newPlayerName}" already exists.`);
      return;
    }

    try {
      const { participant } = await gameService.addParticipant(
        selectedGame.id,
        newPlayerName.trim(),
        code,
        newPlayerContact.trim() || undefined
      );

      setParticipants((prev) => [...prev, participant]);
      setNewPlayerName('');
      setNewPlayerCode('');
      setNewPlayerContact('');
      setShowAddParticipant(false);
      setStatusBanner({
        type: 'success',
        message: `Participant ${participant.display_name} (Code: ${participant.player_code}) added with unique invitation link!`,
      });
      setTimeout(() => setStatusBanner(null), 4000);
    } catch (err: any) {
      setParticipantFormError(err.message || 'Failed to add participant');
    }
  };

  // Remove Participant Handler
  const handleRemoveParticipant = async (id: string, name: string) => {
    if (confirm(`Remove ${name} from this game?`)) {
      await gameService.removeParticipant(id);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      setStatusBanner({ type: 'success', message: `${name} has been removed.` });
      setTimeout(() => setStatusBanner(null), 3000);
    }
  };

  // Create Game Handler
  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    try {
      const game = await gameService.createGame(newGameName.trim(), newGameDesc.trim(), {
        min_participants: newGameMin,
        max_participants: newGameMax,
        points_correct: newGamePoints,
      });
      setGames((prev) => [game, ...prev]);
      setSelectedGame(game);
      setShowCreateGame(false);
      setNewGameName('');
      setNewGameDesc('');
      setStatusBanner({ type: 'success', message: `Game "${game.name}" created successfully!` });
      refreshAllData();
    } catch (err: any) {
      alert(`Error creating game: ${err.message}`);
    }
  };

  // Reveal Answers Handler
  const handleRevealAll = async () => {
    if (!selectedGame || !activeRound) return;
    if (
      confirm(
        'Reveal all answers to participants? This will calculate final scores and publish results on leaderboard.'
      )
    ) {
      try {
        await gameService.revealRound(activeRound.id, selectedGame.id);
        triggerWinnerConfetti();
        setStatusBanner({
          type: 'success',
          message: 'Answers revealed! Leaderboard updated and results unlocked for participants.',
        });
        refreshAllData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  // Topic Toggle Handler
  const handleToggleTopic = async (topicId: string, current: boolean) => {
    await gameService.toggleTopic(topicId, !current);
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, is_active: !current } : t))
    );
  };

  // Add Custom Topic Handler
  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    const t = await gameService.addTopic(newTopicName.trim(), newTopicDesc.trim());
    setTopics((prev) => [...prev, t]);
    setNewTopicName('');
    setNewTopicDesc('');
    setShowAddTopic(false);
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!selectedGame) return;
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
    link.setAttribute('download', `${selectedGame.name}_leaderboard.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Derived metrics
  const joinedCount = participants.filter((p) => p.status !== 'pending').length;
  const pendingParticipantsCount = participants.filter((p) => p.status === 'pending').length;
  const questionsCount = assignments.length;
  const submittedAnswersCount = assignments.filter((a) => a.status === 'submitted').length;
  const pendingAnswersCount = assignments.filter((a) => a.status !== 'submitted').length;

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar isAdmin={true} />

      {/* Top Admin Controls & Game Selector */}
      <section className="border-b border-background-border bg-background-card/50 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">Admin Command Center</h1>
                {selectedGame && (
                  <Badge
                    variant={
                      selectedGame.status === 'active'
                        ? 'success'
                        : selectedGame.status === 'completed'
                        ? 'purple'
                        : 'warning'
                    }
                    size="sm"
                  >
                    {selectedGame.status.toUpperCase()}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Friday Fun 2026 • Live multiplayer management
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Game Selector Dropdown */}
            <select
              value={selectedGame?.id || ''}
              onChange={(e) => {
                const g = games.find((item) => item.id === e.target.value);
                if (g) {
                  setSelectedGame(g);
                  refreshAllData();
                }
              }}
              className="bg-background-darker border border-background-border rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.status})
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowCreateGame(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/20 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Game</span>
            </button>

            <button
              onClick={refreshAllData}
              className="p-2.5 rounded-xl border border-background-border bg-background-darker text-slate-300 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Refresh live data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Global Status Banner Alert */}
      {statusBanner && (
        <div
          className={`px-4 py-3 text-xs sm:text-sm text-center font-semibold transition-all ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border-b border-rose-500/30'
          }`}
        >
          {statusBanner.message}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-background-border bg-background-darker/60 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto py-2 no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: Layers },
            { id: 'participants', label: `Participants (${participants.length})`, icon: Users },
            { id: 'monitoring', label: `Answer Monitoring (${submittedAnswersCount}/${questionsCount})`, icon: Eye },
            { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
            { id: 'topics', label: `Topics (${topics.length})`, icon: HelpCircle },
            { id: 'settings', label: 'Game Rules', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap min-h-[44px] ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-background-hover'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* =========================================================================
            TAB 1: OVERVIEW METRICS
        ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in-50">
            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="p-5 rounded-2xl bg-background-card border border-background-border">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase">Total Participants</span>
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">
                  {participants.length}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="text-emerald-400 font-bold">{joinedCount} Joined</span> •{' '}
                  <span className="text-amber-400 font-bold">{pendingParticipantsCount} Pending</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-background-card border border-background-border">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase">Questions Created</span>
                  <HelpCircle className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">
                  {questionsCount}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  AI generated & bank assigned
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-background-card border border-background-border">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase">Answers Submitted</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                  {submittedAnswersCount}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  {questionsCount > 0
                    ? `${Math.round((submittedAnswersCount / questionsCount) * 100)}% completion`
                    : 'Awaiting challenges'}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-background-card border border-background-border">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase">Pending Answers</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-400">
                  {pendingAnswersCount}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  Players yet to answer
                </div>
              </div>
            </div>

            {/* Quick Actions & Round Status Bar */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-background-card to-background-card border border-indigo-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-indigo-400 font-bold uppercase">
                    ROUND {activeRound?.round_number || 1} STATUS
                  </span>
                  <Badge
                    variant={activeRound?.status === 'revealed' ? 'purple' : 'success'}
                    size="sm"
                  >
                    {activeRound?.status === 'revealed' ? 'REVEALED / CLOSED' : 'ACTIVE ROUND'}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-white">
                  {activeRound?.status === 'revealed'
                    ? 'Round complete! All scores calculated.'
                    : submittedAnswersCount === questionsCount && questionsCount > 0
                    ? '🎉 All participants have completed their submissions!'
                    : `${submittedAnswersCount} out of ${questionsCount} answers submitted.`}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {activeRound?.status !== 'revealed' && (
                  <button
                    onClick={handleRevealAll}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition-all min-h-[44px]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>REVEAL ALL ANSWERS</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('monitoring')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-background-border bg-background-darker hover:bg-background-hover text-slate-200 text-sm font-semibold min-h-[44px]"
                >
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span>Live Monitor</span>
                </button>
              </div>
            </div>

            {/* Participant Quick Table */}
            <div className="rounded-2xl bg-background-card border border-background-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">Quick Roster Overview</h3>
                <button
                  onClick={() => setActiveTab('participants')}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  View All & Manage →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {participants.slice(0, 6).map((p) => {
                  const inviteUrl = buildInvitationUrl(selectedGame?.id || '', p.raw_invitation_token || p.invitation_token_hash);
                  const waUrl = generateInvitationWhatsAppUrl(p.display_name, inviteUrl);
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-background-darker border border-background-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <PlayerAvatar displayName={p.display_name} playerCode={p.player_code} size="sm" />
                        <div>
                          <p className="text-sm font-bold text-white leading-none">
                            {p.display_name}
                          </p>
                          <span className="text-[11px] text-slate-500">
                            Status: <span className="capitalize text-slate-300">{p.status}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CopyButton textToCopy={inviteUrl} size="sm" variant="ghost" label="" copiedLabel="" />
                        <WhatsAppButton url={waUrl} size="sm" label="" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: PARTICIPANTS MANAGEMENT
        ========================================================================= */}
        {activeTab === 'participants' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Participant Roster</h2>
                <p className="text-xs text-slate-400">
                  Each participant receives a cryptographically unique invitation link with pre-formatted WhatsApp invites.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="Search participant..."
                    className="w-full bg-background-card border border-background-border rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none min-h-[44px]"
                  />
                </div>

                <button
                  onClick={() => {
                    setNewPlayerCode(getNextPlayerCode());
                    setShowAddParticipant(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Participant</span>
                </button>
              </div>
            </div>

            {/* Participants Grid / List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {participants
                .filter((p) =>
                  p.display_name.toLowerCase().includes(participantSearch.toLowerCase()) ||
                  p.player_code.toLowerCase().includes(participantSearch.toLowerCase())
                )
                .map((p) => {
                  const inviteUrl = buildInvitationUrl(selectedGame?.id || '', p.raw_invitation_token || p.invitation_token_hash);
                  const waUrl = generateInvitationWhatsAppUrl(p.display_name, inviteUrl);

                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-2xl bg-background-card border border-background-border flex flex-col justify-between hover:border-slate-700 transition-all group"
                    >
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3.5">
                            <PlayerAvatar displayName={p.display_name} playerCode={p.player_code} size="md" />
                            <div>
                              <h4 className="text-base font-extrabold text-white leading-tight">
                                {p.display_name}
                              </h4>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">
                                Player Code: <strong className="text-indigo-400">{p.player_code}</strong>
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemoveParticipant(p.id, p.display_name)}
                            className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded-lg"
                            title="Remove participant"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mb-4">
                          <Badge
                            variant={
                              p.status === 'completed'
                                ? 'success'
                                : p.status === 'selected'
                                ? 'purple'
                                : p.status === 'joined'
                                ? 'cyan'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {p.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      {/* WhatsApp and Copy Buttons */}
                      <div className="space-y-2 pt-3 border-t border-background-border">
                        <WhatsAppButton url={waUrl} label="Share on WhatsApp" fullWidth={true} size="sm" />
                        <CopyButton textToCopy={inviteUrl} label="Copy Invite Link" fullWidth={true} size="sm" />
                      </div>
                    </div>
                  );
                })}
            </div>

            {participants.length === 0 && (
              <div className="text-center py-12 rounded-2xl bg-background-card border border-background-border">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-300 font-semibold text-base">No participants yet</p>
                <p className="text-slate-500 text-xs mt-1">Add players like A - Arun, B - Rahul to start inviting them!</p>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 3: ANSWER MONITORING (LIVE REALTIME)
        ========================================================================= */}
        {activeTab === 'monitoring' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Live Answer Monitoring</h2>
                <p className="text-xs text-slate-400">
                  Track question delivery, opens, and submissions in real-time without refreshing.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {activeRound?.status !== 'revealed' && (
                  <button
                    onClick={handleRevealAll}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition-all min-h-[44px]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>REVEAL ALL ANSWERS</span>
                  </button>
                )}
              </div>
            </div>

            {/* Assignments Monitoring Table */}
            <div className="rounded-2xl bg-background-card border border-background-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
                    <tr>
                      <th className="py-3.5 px-4">Challenger (Sender)</th>
                      <th className="py-3.5 px-4">Target (Receiver)</th>
                      <th className="py-3.5 px-4">Topic</th>
                      <th className="py-3.5 px-4">Challenge Status</th>
                      <th className="py-3.5 px-4">Selected Answer</th>
                      <th className="py-3.5 px-4">Challenge Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-background-border font-medium">
                    {assignments.map((a) => {
                      const challengeUrl = buildChallengeUrl(a.raw_challenge_token || a.challenge_token_hash);
                      return (
                        <tr key={a.id} className="hover:bg-background-hover/50 transition-colors">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar displayName={a.sender?.display_name || ''} playerCode={a.sender?.player_code} size="sm" />
                              <span className="font-bold text-white">{a.sender?.display_name || 'Sender'}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar displayName={a.receiver?.display_name || ''} playerCode={a.receiver?.player_code} size="sm" />
                              <span className="font-bold text-white">{a.receiver?.display_name || 'Receiver'}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <Badge variant="purple" size="sm">
                              {a.topic?.name || 'Topic'}
                            </Badge>
                          </td>

                          <td className="py-4 px-4">
                            <Badge
                              variant={
                                a.status === 'submitted'
                                  ? 'success'
                                  : a.status === 'opened'
                                  ? 'cyan'
                                  : 'warning'
                              }
                              size="sm"
                            >
                              {a.status === 'submitted'
                                ? 'Submitted'
                                : a.status === 'opened'
                                ? 'Opened'
                                : 'Pending'}
                            </Badge>
                          </td>

                          <td className="py-4 px-4">
                            {a.answer ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30">
                                  Option {a.answer.selected_option}
                                </span>
                                {activeRound?.status === 'revealed' && (
                                  <Badge
                                    variant={a.answer.is_correct ? 'success' : 'danger'}
                                    size="sm"
                                  >
                                    {a.answer.is_correct ? 'Correct (+10)' : 'Incorrect (0)'}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-xs">Waiting for answer</span>
                            )}
                          </td>

                          <td className="py-4 px-4">
                            <CopyButton textToCopy={challengeUrl} size="sm" label="Copy Link" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {assignments.length === 0 && (
                <div className="text-center py-12">
                  <Clock className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-300 font-semibold">No challenges submitted yet</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Participants need to open their invitation link and pick a friend & topic.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: LEADERBOARD
        ========================================================================= */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-8 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Game Leaderboard</h2>
                <p className="text-xs text-slate-400">
                  Scores calculated server-side based on verified correct answers.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-background-border bg-background-card hover:bg-background-hover text-slate-200 text-sm font-semibold transition-all min-h-[44px]"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Podium (Top 3) */}
            {leaderboard.length >= 3 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-6">
                {/* 2nd Place */}
                <div className="order-2 sm:order-1 p-6 rounded-2xl bg-background-card border border-slate-700 text-center flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-slate-600 text-white font-extrabold text-sm flex items-center justify-center mb-3">
                    2
                  </div>
                  <PlayerAvatar displayName={leaderboard[1]?.participant?.display_name || ''} playerCode={leaderboard[1]?.participant?.player_code} size="lg" />
                  <h4 className="mt-3 text-lg font-bold text-white">
                    {leaderboard[1]?.participant?.display_name}
                  </h4>
                  <div className="mt-2 text-2xl font-extrabold text-slate-300">
                    {leaderboard[1]?.total_points} pts
                  </div>
                  <span className="text-xs text-slate-500 mt-1">
                    {leaderboard[1]?.correct_answers} Correct
                  </span>
                </div>

                {/* 1st Place Champion */}
                <div className="order-1 sm:order-2 p-7 rounded-2xl bg-gradient-to-b from-amber-500/20 via-background-card to-background-card border-2 border-amber-500/40 text-center flex flex-col items-center shadow-xl shadow-amber-500/10 sm:-translate-y-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-extrabold text-base flex items-center justify-center mb-3 shadow-lg">
                    👑
                  </div>
                  <PlayerAvatar displayName={leaderboard[0]?.participant?.display_name || ''} playerCode={leaderboard[0]?.participant?.player_code} size="xl" />
                  <h4 className="mt-3 text-xl font-extrabold text-white">
                    {leaderboard[0]?.participant?.display_name}
                  </h4>
                  <div className="mt-2 text-3xl font-black text-amber-400">
                    {leaderboard[0]?.total_points} pts
                  </div>
                  <span className="text-xs text-amber-300/80 font-bold mt-1">
                    🏆 FRIDAY FUN CHAMPION
                  </span>
                </div>

                {/* 3rd Place */}
                <div className="order-3 p-6 rounded-2xl bg-background-card border border-slate-700 text-center flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-amber-800 text-white font-extrabold text-sm flex items-center justify-center mb-3">
                    3
                  </div>
                  <PlayerAvatar displayName={leaderboard[2]?.participant?.display_name || ''} playerCode={leaderboard[2]?.participant?.player_code} size="lg" />
                  <h4 className="mt-3 text-lg font-bold text-white">
                    {leaderboard[2]?.participant?.display_name}
                  </h4>
                  <div className="mt-2 text-2xl font-extrabold text-slate-300">
                    {leaderboard[2]?.total_points} pts
                  </div>
                  <span className="text-xs text-slate-500 mt-1">
                    {leaderboard[2]?.correct_answers} Correct
                  </span>
                </div>
              </div>
            )}

            {/* Full Rankings Table */}
            <div className="rounded-2xl bg-background-card border border-background-border overflow-hidden">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-background-darker text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-background-border">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Participant</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Correct</th>
                    <th className="py-3 px-4">Wrong</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-border">
                  {leaderboard.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-background-hover/50">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <PlayerAvatar displayName={s.participant?.display_name || ''} playerCode={s.participant?.player_code} size="sm" />
                        <span>{s.participant?.display_name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-indigo-400">
                        {s.total_points} pts
                      </td>
                      <td className="py-3.5 px-4 text-emerald-400 font-semibold">
                        {s.correct_answers}
                      </td>
                      <td className="py-3.5 px-4 text-rose-400 font-semibold">
                        {s.wrong_answers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 5: TOPICS MANAGEMENT
        ========================================================================= */}
        {activeTab === 'topics' && (
          <div className="space-y-6 animate-in fade-in-50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Topic Categories</h2>
                <p className="text-xs text-slate-400">
                  Control which topic categories participants can pick from during gameplay.
                </p>
              </div>

              <button
                onClick={() => setShowAddTopic(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Topic</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((t) => (
                <div
                  key={t.id}
                  className="p-5 rounded-2xl bg-background-card border border-background-border flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-bold text-white">{t.name}</h4>
                      <Badge variant={t.is_active ? 'success' : 'neutral'} size="sm">
                        {t.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t.description || 'No description provided.'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleTopic(t.id, t.is_active)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[44px] ${
                      t.is_active
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    {t.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 6: SETTINGS & RULES
        ========================================================================= */}
        {activeTab === 'settings' && selectedGame && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in-50">
            <div>
              <h2 className="text-xl font-bold text-white">Game Rules & Settings</h2>
              <p className="text-xs text-slate-400">
                Configure scoring, player limits, and difficulty distribution for {selectedGame.name}.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-background-card border border-background-border space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Min Participants
                  </label>
                  <input
                    type="number"
                    disabled
                    value={selectedGame.settings.min_participants}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3 py-2 text-sm text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Max Participants
                  </label>
                  <input
                    type="number"
                    disabled
                    value={selectedGame.settings.max_participants}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3 py-2 text-sm text-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Points Per Correct Answer
                  </label>
                  <input
                    type="number"
                    disabled
                    value={selectedGame.settings.points_correct}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3 py-2 text-sm text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Points Per Wrong Answer
                  </label>
                  <input
                    type="number"
                    disabled
                    value={selectedGame.settings.points_wrong}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3 py-2 text-sm text-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Difficulty Distribution
                </label>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div className="p-3 rounded-xl bg-background-darker border border-background-border">
                    <span className="text-emerald-400 font-bold">Easy</span>
                    <p className="text-base font-extrabold text-white mt-1">40%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-background-darker border border-background-border">
                    <span className="text-amber-400 font-bold">Medium</span>
                    <p className="text-base font-extrabold text-white mt-1">40%</p>
                  </div>
                  <div className="p-3 rounded-xl bg-background-darker border border-background-border">
                    <span className="text-rose-400 font-bold">Hard</span>
                    <p className="text-base font-extrabold text-white mt-1">20%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          MODAL: ADD PARTICIPANT
      ========================================================================= */}
      {showAddParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="bg-background-card border border-background-border w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Add Participant</h3>
            <p className="text-xs text-slate-400 mb-5">
              An unguessable invitation token will be cryptographically generated.
            </p>

            {participantFormError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {participantFormError}
              </div>
            )}

            <form onSubmit={handleAddParticipant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Participant Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="e.g. Amal or Sarah"
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Player Code / ID (e.g. A, B, C...)
                </label>
                <input
                  type="text"
                  value={newPlayerCode}
                  onChange={(e) => setNewPlayerCode(e.target.value)}
                  placeholder={getNextPlayerCode()}
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Phone / WhatsApp (Optional)
                </label>
                <input
                  type="text"
                  value={newPlayerContact}
                  onChange={(e) => setNewPlayerContact(e.target.value)}
                  placeholder="Optional contact details"
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddParticipant(false)}
                  className="px-4 py-2.5 rounded-xl border border-background-border text-slate-400 hover:text-white text-xs font-semibold min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 min-h-[44px]"
                >
                  Create Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE GAME
      ========================================================================= */}
      {showCreateGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="bg-background-card border border-background-border w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Create New Game</h3>
            <p className="text-xs text-slate-400 mb-5">
              Launch a new Friday Fun challenge room with customized settings.
            </p>

            <form onSubmit={handleCreateGame} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Game Name *
                </label>
                <input
                  type="text"
                  required
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  placeholder="e.g. Friday Fun 2026 - Sprint Celebration"
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newGameDesc}
                  onChange={(e) => setNewGameDesc(e.target.value)}
                  placeholder="e.g. Fun quiz challenge for our Friday social!"
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Min Players
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={newGameMin}
                    onChange={(e) => setNewGameMin(parseInt(e.target.value))}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Points Per Answer
                  </label>
                  <input
                    type="number"
                    value={newGamePoints}
                    onChange={(e) => setNewGamePoints(parseInt(e.target.value))}
                    className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateGame(false)}
                  className="px-4 py-2.5 rounded-xl border border-background-border text-slate-400 hover:text-white text-xs font-semibold min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 min-h-[44px]"
                >
                  Start Game
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD TOPIC
      ========================================================================= */}
      {showAddTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="bg-background-card border border-background-border w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Add Custom Category</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a new theme category for participants to challenge each other.
            </p>

            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="e.g. Anime & Gaming"
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  value={newTopicDesc}
                  onChange={(e) => setNewTopicDesc(e.target.value)}
                  placeholder="Brief explanation of the topics covered"
                  rows={2}
                  className="w-full bg-background-darker border border-background-border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTopic(false)}
                  className="px-4 py-2.5 rounded-xl border border-background-border text-slate-400 hover:text-white text-xs font-semibold min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 min-h-[44px]"
                >
                  Add Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
