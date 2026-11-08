import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ArrowRight, ShieldAlert, Flame, Clock, Pause, Trophy, XCircle } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { CopyButton } from '../components/CopyButton';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { gameService, friendlyError } from '../services/gameService';
import { JoinPayload } from '../types';
import { buildChallengeUrl, generateChallengeWhatsAppUrl } from '../utils/sharing';

export const ParticipantJoinPage: React.FC = () => {
  const { gameId, token } = useParams<{ gameId: string; token: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<JoinPayload | null>(null);

  const [receiverId, setReceiverId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const submittingRef = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!gameId || !token) {
        setErrorMsg('Invalid invitation link. Please check your URL.');
        setLoading(false);
        return;
      }
      try {
        if (!quiet) setLoading(true);
        const res = await gameService.joinGame(gameId, token);
        if (!res) {
          setData(null);
          setErrorMsg('This invitation link is invalid, expired or has been replaced. Please ask your game host for a new link.');
        } else {
          setData(res);
          setErrorMsg('');
        }
      } catch (err: any) {
        // keep showing the last good data on a transient error during a background refresh
        if (!quiet) setErrorMsg(friendlyError(err, 'Could not verify your invitation. Please refresh.'));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [gameId, token]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // if someone else just used up the selected (friend, topic) pair, drop the selection instead of failing on send
  useEffect(() => {
    if (!data || !receiverId || !topicId) return;
    if ((data.unavailable ?? []).some((u) => u.receiver_id === receiverId && u.topic_id === topicId)) setTopicId('');
  }, [data, receiverId, topicId]);

  // live: game started / paused / completed / cancelled flips this page without a manual refresh
  useEffect(() => {
    if (!gameId || !data) return;
    return gameService.subscribeToGameUpdates(gameId, () => void load(true), { mode: 'public' });
  }, [gameId, data?.participant.id, load]);

  const handleSubmitChallenge = async () => {
    setSelectionError('');
    if (!data || !gameId || !token) return;
    if (!receiverId) return setSelectionError('Please choose which participant you want to challenge.');
    if (receiverId === data.participant.id) return setSelectionError('You cannot select yourself. Please pick another friend.');
    if (!topicId) return setSelectionError('Please choose a topic category.');
    if (submittingRef.current) return; // double-click guard
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await gameService.createChallenge({ gameId, token, receiverId, topicId });
      await load(true);
    } catch (err: any) {
      setSelectionError(err.message || 'Submission failed');
      await load(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-white">Verifying Personal Invitation...</h3>
        <p className="text-xs text-slate-400 mt-1">Friday Fun 2026</p>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl" role="alert" data-testid="invite-error">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white">Access Link Issue</h2>
          <p className="text-xs text-rose-300 mt-2 leading-relaxed">{errorMsg}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => void load(false)} className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white min-h-[44px]">
              Try again
            </button>
            <Link to="/" className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white min-h-[44px]">
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { participant, game, roster, topics, outgoing, incoming } = data;
  const status = game.status;
  const sent = outgoing[0];
  const sentUrl = sent?.raw_token ? buildChallengeUrl(sent.raw_token) : null;
  const canPick = data.can_create && status === 'active';
  // topics already used up for the friend currently selected (server-computed; tolerant of older payloads)
  const blockedForReceiver = new Set(
    (data.unavailable ?? []).filter((u) => u.receiver_id === receiverId).map((u) => u.topic_id)
  );
  const receiverName = roster.find((r) => r.id === receiverId)?.display_name;
  const allBlocked = Boolean(receiverId) && topics.length > 0 && topics.every((t) => blockedForReceiver.has(t.id));

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Welcome */}
        <section className="mb-6 p-5 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-background-card to-background-card border border-indigo-500/30 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0">
              <PlayerAvatar displayName={participant.display_name} playerCode={participant.player_code} size="lg" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Player Invitation Confirmed</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white break-words" data-testid="welcome-heading">Welcome, {participant.display_name}!</h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Game: <strong className="text-slate-200">{game.name}</strong> • Player ID: <strong className="text-indigo-400 font-mono">{participant.player_code}</strong>
                </p>
              </div>
            </div>
            <Badge variant={status === 'active' ? 'success' : status === 'completed' ? 'purple' : status === 'cancelled' ? 'danger' : 'warning'} size="md">
              <span data-testid="game-status-badge">{status === 'active' ? 'IN PROGRESS' : status.replace(/_/g, ' ').toUpperCase()}</span>
            </Badge>
          </div>
        </section>

        {/* Game state notices */}
        {(status === 'draft' || status === 'registration_open' || status === 'ready') && (
          <div className="mb-6 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-100 text-sm flex items-start gap-3" data-testid="state-waiting" role="status">
            <Clock className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong>You're in! Waiting for the host to start the game.</strong>
              <p className="text-xs text-cyan-200/80 mt-1">This page updates automatically – you can leave it open.</p>
            </div>
          </div>
        )}
        {(status === 'paused' || status === 'waiting_for_answers') && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-sm flex items-start gap-3" data-testid="state-paused" role="status">
            <Pause className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong>The game is paused by the host.</strong>
              <p className="text-xs text-amber-200/80 mt-1">Challenges and answers are on hold. This page updates when the game resumes.</p>
            </div>
          </div>
        )}
        {status === 'cancelled' && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-100 text-sm flex items-start gap-3" data-testid="state-cancelled" role="alert">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong>This game was cancelled by the host.</strong>
              <p className="text-xs text-rose-200/80 mt-1">New challenges and answers are no longer accepted.</p>
            </div>
          </div>
        )}
        {status === 'completed' && (
          <div className="mb-6 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-100 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="state-completed" role="status">
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <strong>The game is over – final results are in!</strong>
                <p className="text-xs text-purple-200/80 mt-1">Open your received challenges to review the answers.</p>
              </div>
            </div>
            <Link to={`/leaderboard/${game.id}`} className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold min-h-[44px]">
              View Final Leaderboard
            </Link>
          </div>
        )}

        {/* Incoming challenges */}
        {incoming.length > 0 && (
          <section className="mb-8 p-5 sm:p-6 rounded-3xl bg-background-card border border-indigo-500/30 shadow-xl space-y-4" aria-label="Challenges received" data-testid="incoming-challenges">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">Challenges Received For You ({incoming.length})</h3>
            </div>
            <p className="text-xs text-slate-400">Friends picked these topics for you. Each challenge has 7 questions – open and answer each one.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {incoming.map((ic) => {
                const done = ic.status === 'submitted';
                const href = ic.raw_token ? `/challenge/${ic.raw_token}` : null;
                return (
                  <div key={ic.assignment_id} className="p-4 rounded-2xl bg-background-darker border border-background-border flex flex-col justify-between gap-3" data-testid={`incoming-${ic.sender?.display_name}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar displayName={ic.sender?.display_name || 'Friend'} playerCode={ic.sender?.player_code} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">From {ic.sender?.display_name}</p>
                          <span className="text-[11px] text-purple-400 font-semibold">{ic.topic.name}</span>
                        </div>
                      </div>
                      <Badge variant={done ? 'success' : ic.answered > 0 ? 'cyan' : 'warning'} size="sm">
                        {done ? 'Answered' : ic.answered > 0 ? `${ic.answered}/${ic.total}` : 'Pending'}
                      </Badge>
                    </div>
                    {href ? (
                      <Link to={href} className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] ${done ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'}`}>
                        <span>{done ? 'View Challenge' : ic.answered > 0 ? 'Continue Challenge' : 'Answer This Challenge'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <p className="text-[11px] text-amber-300">Link unavailable – ask the host.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Outgoing result */}
        {sent && (
          <section className="p-6 sm:p-10 rounded-3xl bg-background-card border border-emerald-500/30 shadow-2xl text-center space-y-6" data-testid="outgoing-result">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Challenge created · 7 questions · {sent.topic.name}</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Your Challenge For {sent.receiver?.display_name} Is Ready! 🔥</h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto mt-2">
                Send this private link to {sent.receiver?.display_name}. {sent.status === 'submitted' ? 'They have finished it.' : sent.answered > 0 ? `They have answered ${sent.answered} of ${sent.total}.` : 'They have not started yet.'}
              </p>
            </div>
            {sentUrl && status !== 'cancelled' && status !== 'completed' && (
              <div className="max-w-md mx-auto space-y-3 pt-2">
                <WhatsAppButton url={generateChallengeWhatsAppUrl(sent.receiver?.display_name || 'Friend', sentUrl)} label={`Send Challenge to ${sent.receiver?.display_name} on WhatsApp`} fullWidth size="lg" />
                <CopyButton textToCopy={sentUrl} label="Copy Challenge Link" fullWidth size="md" />
              </div>
            )}
            <div className="pt-4 border-t border-background-border text-xs text-slate-500">
              Answers and scores are revealed on the leaderboard when the host completes the game.
            </div>
          </section>
        )}

        {/* Selection flow */}
        {canPick && (
          <div className="space-y-8" data-testid="selection-flow">
            {selectionError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2" role="alert" data-testid="selection-error">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{selectionError}</span>
              </div>
            )}

            <section className="p-5 sm:p-8 rounded-3xl bg-background-card border border-background-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">1</div>
                <div>
                  <h3 className="text-lg font-bold text-white">Who Do You Want to Challenge?</h3>
                  <p className="text-xs text-slate-400">Pick a fellow player (you cannot challenge yourself).</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                {roster.map((p) => {
                  const on = receiverId === p.id;
                  return (
                    <button key={p.id} type="button" data-testid={`pick-player-${p.display_name}`} aria-pressed={on} onClick={() => {
                      setReceiverId(p.id);
                      setSelectionError('');
                      // a topic already used up for the newly chosen friend can't stay selected
                      const taken = (data.unavailable ?? []).some((u) => u.receiver_id === p.id && u.topic_id === topicId);
                      if (taken) setTopicId('');
                    }} className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2.5 min-h-[44px] ${on ? 'bg-indigo-600/25 border-indigo-500 ring-2 ring-indigo-400/50 shadow-lg shadow-indigo-600/20' : 'bg-background-darker border-background-border hover:border-slate-700'}`}>
                      <PlayerAvatar displayName={p.display_name} playerCode={p.player_code} size="md" selected={on} />
                      <span className="font-bold text-sm text-white truncate max-w-full">{p.display_name}</span>
                    </button>
                  );
                })}
              </div>
              {roster.length === 0 && <p className="text-xs text-amber-400 italic">Waiting for other participants to be added to this game…</p>}
            </section>

            <section className="p-5 sm:p-8 rounded-3xl bg-background-card border border-background-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600 text-white font-bold text-sm flex items-center justify-center">2</div>
                <div>
                  <h3 className="text-lg font-bold text-white">Pick a Topic Category</h3>
                  <p className="text-xs text-slate-400">They'll get 7 questions (3 easy, 3 medium, 1 hard). A friend never sees the same question twice, so they can receive each topic only once.</p>
                </div>
              </div>
              {allBlocked && (
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5" role="status" data-testid="all-topics-used">
                  {receiverName} has already received every available topic. Please pick another friend.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {topics.map((t) => {
                  const on = topicId === t.id;
                  const blocked = blockedForReceiver.has(t.id);
                  return (
                    <button key={t.id} type="button" disabled={blocked} data-testid={`pick-topic-${t.name}`} aria-pressed={on} onClick={() => { setTopicId(t.id); setSelectionError(''); }} className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-purple-600/20 border-purple-500 ring-2 ring-purple-400/40 shadow-lg shadow-purple-600/15' : 'bg-background-darker border-background-border hover:border-slate-700'}`}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="font-bold text-sm text-white">{t.name}</span>
                        {on && <span className="text-xs font-bold text-purple-400">Selected ✓</span>}
                        {blocked && <span className="text-[11px] font-bold text-amber-300" data-testid={`topic-used-${t.name}`}>Already used for {receiverName}</span>}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-background-card to-background-card border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-bold text-white">Ready to Fire Your Challenge?</h4>
                <p className="text-xs text-slate-400">{receiverId && topicId ? 'Target & topic selected. Click to create the challenge.' : 'Select both a participant and a topic above.'}</p>
              </div>
              <button type="button" onClick={handleSubmitChallenge} disabled={!receiverId || !topicId || submitting} data-testid="send-challenge" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-indigo-600/30 transition-all min-h-[44px] disabled:opacity-40">
                {submitting ? (
                  <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating challenge…</span>
                ) : (
                  <><span>Generate & Send Challenge</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
