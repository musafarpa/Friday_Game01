import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Gamepad2,
  Users,
  Target,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Zap,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { CopyButton } from '../components/CopyButton';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { gameService } from '../services/gameService';
import { Participant, Game, Topic, Assignment, GameRound } from '../types';
import {
  buildChallengeUrl,
  generateChallengeWhatsAppUrl,
} from '../utils/sharing';

export const ParticipantJoinPage: React.FC = () => {
  const { gameId, token } = useParams<{ gameId: string; token: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Verified Participant & Game info
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [activeRound, setActiveRound] = useState<GameRound | null>(null);

  // Selection state
  const [otherPlayers, setOtherPlayers] = useState<Participant[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Resulting Challenge state
  const [challengeResult, setChallengeResult] = useState<{
    assignment: Assignment;
    challengeUrl: string;
    targetName: string;
    waUrl: string;
  } | null>(null);

  // Load and verify invitation token
  useEffect(() => {
    if (!gameId || !token) {
      setErrorMsg('Invalid invitation link. Please check your URL.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        setLoading(true);
        const data = await gameService.getParticipantByInvitationToken(gameId, token);

        if (!data || !data.participant) {
          setErrorMsg(
            'Invalid or expired invitation link. Please ask your game host for a valid link.'
          );
          setLoading(false);
          return;
        }

        setParticipant(data.participant);
        setGame(data.game);

        // Fetch round & other players for selection
        const [allPlayers, activeTopList, round] = await Promise.all([
          gameService.getParticipants(gameId),
          gameService.getTopics(),
          gameService.getActiveRound(gameId),
        ]);

        setActiveRound(round);
        setTopics(activeTopList);

        // Exclude self from selection candidates
        const peers = allPlayers.filter((p) => p.id !== data.participant.id);
        setOtherPlayers(peers);

        // If participant has already made their selection, hydrate challenge result
        if (data.hasSelected && data.existingAssignment) {
          const assign = data.existingAssignment;
          const target = allPlayers.find((p) => p.id === assign.receiver_id);
          const rawTok = assign.raw_challenge_token || assign.challenge_token_hash;
          const cUrl = buildChallengeUrl(rawTok);
          const tName = target?.display_name || 'Friend';
          setChallengeResult({
            assignment: assign,
            challengeUrl: cUrl,
            targetName: tName,
            waUrl: generateChallengeWhatsAppUrl(tName, cUrl),
          });
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Error verifying invitation link');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [gameId, token]);

  // Handle Target & Topic Submission
  const handleSubmitChallenge = async () => {
    if (!participant || !game || !activeRound) return;
    if (!selectedReceiverId) {
      alert('Please choose which participant you want to challenge.');
      return;
    }
    if (!selectedTopicId) {
      alert('Please choose a topic category.');
      return;
    }

    const targetPlayer = otherPlayers.find((p) => p.id === selectedReceiverId);
    const chosenTopic = topics.find((t) => t.id === selectedTopicId);

    if (!targetPlayer || !chosenTopic) return;

    try {
      setSubmitting(true);
      const { assignment, rawChallengeToken } = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: activeRound.id,
        senderId: participant.id,
        receiverId: targetPlayer.id,
        topicId: chosenTopic.id,
        topicName: chosenTopic.name,
      });

      const cUrl = buildChallengeUrl(rawChallengeToken);
      const waUrl = generateChallengeWhatsAppUrl(targetPlayer.display_name, cUrl);

      setChallengeResult({
        assignment,
        challengeUrl: cUrl,
        targetName: targetPlayer.display_name,
        waUrl,
      });

      setParticipant((prev) => (prev ? { ...prev, status: 'selected' } : null));
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-white">Verifying Personal Invitation...</h3>
        <p className="text-xs text-slate-400 mt-1">Friday Fun 2026</p>
      </div>
    );
  }

  // Error Screen
  if (errorMsg || !participant || !game) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white">Access Link Issue</h2>
          <p className="text-xs text-rose-300 mt-2 leading-relaxed">{errorMsg}</p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white min-h-[44px]"
            >
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Welcome Card */}
        <section className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-background-card to-background-card border border-indigo-500/30 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <PlayerAvatar displayName={participant.display_name} playerCode={participant.player_code} size="lg" />
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Player Invitation Confirmed
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  Welcome, {participant.display_name}!
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Game: <strong className="text-slate-200">{game.name}</strong> • Player ID:{' '}
                  <strong className="text-indigo-400 font-mono">{participant.player_code}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={
                  game.status === 'active'
                    ? 'success'
                    : game.status === 'completed'
                    ? 'purple'
                    : 'warning'
                }
                size="md"
              >
                {game.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </section>

        {/* =====================================================================
            STATE A: CHALLENGE ALREADY SUBMITTED
        ===================================================================== */}
        {challengeResult ? (
          <section className="p-6 sm:p-10 rounded-3xl bg-background-card border border-emerald-500/30 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Challenge Created & Question Generated
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Your Challenge For {challengeResult.targetName} Is Ready! 🔥
              </h2>
              <p className="text-sm text-slate-400 max-w-lg mx-auto mt-2">
                Send this private challenge link to {challengeResult.targetName}. They will answer the question generated specifically for them.
              </p>
            </div>

            {/* Sharing Action Area */}
            <div className="max-w-md mx-auto space-y-3 pt-4">
              <WhatsAppButton
                url={challengeResult.waUrl}
                label={`Send Challenge to ${challengeResult.targetName} on WhatsApp`}
                fullWidth={true}
                size="lg"
              />
              <CopyButton
                textToCopy={challengeResult.challengeUrl}
                label="Copy Challenge Link"
                fullWidth={true}
                size="md"
              />
            </div>

            <div className="pt-6 border-t border-background-border text-xs text-slate-500">
              <p>
                Once {challengeResult.targetName} submits their answer, the Admin will reveal the scores on the live leaderboard!
              </p>
            </div>
          </section>
        ) : (
          /* =====================================================================
              STATE B: STEP-BY-STEP SELECTION FLOW
          ===================================================================== */
          <div className="space-y-8 animate-in fade-in-50">
            {/* Step 1: Select Player */}
            <section className="p-6 sm:p-8 rounded-3xl bg-background-card border border-background-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Who Do You Want to Challenge?</h3>
                  <p className="text-xs text-slate-400">
                    Pick a fellow player to challenge (you cannot challenge yourself).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                {otherPlayers.map((p) => {
                  const isSelected = selectedReceiverId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedReceiverId(p.id)}
                      className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2.5 min-h-[44px] ${
                        isSelected
                          ? 'bg-indigo-600/25 border-indigo-500 ring-2 ring-indigo-400/50 shadow-lg shadow-indigo-600/20'
                          : 'bg-background-darker border-background-border hover:border-slate-700'
                      }`}
                    >
                      <PlayerAvatar
                        displayName={p.display_name}
                        playerCode={p.player_code}
                        size="md"
                        selected={isSelected}
                      />
                      <span className="font-bold text-sm text-white truncate max-w-full">
                        {p.display_name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {otherPlayers.length === 0 && (
                <p className="text-xs text-amber-400 italic">
                  Waiting for other participants to be added to this game room...
                </p>
              )}
            </section>

            {/* Step 2: Select Topic */}
            <section className="p-6 sm:p-8 rounded-3xl bg-background-card border border-background-border space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600 text-white font-bold text-sm flex items-center justify-center">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Pick a Topic Category</h3>
                  <p className="text-xs text-slate-400">
                    AI will automatically generate a multiple-choice question in this topic.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {topics.map((t) => {
                  const isSelected = selectedTopicId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTopicId(t.id)}
                      className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between min-h-[44px] ${
                        isSelected
                          ? 'bg-purple-600/20 border-purple-500 ring-2 ring-purple-400/40 shadow-lg shadow-purple-600/15'
                          : 'bg-background-darker border-background-border hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white">{t.name}</span>
                        {isSelected && (
                          <span className="text-xs font-bold text-purple-400">Selected ✓</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 3: Launch Challenge Button */}
            <section className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-background-card to-background-card border border-indigo-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-bold text-white">Ready to Fire Your Challenge?</h4>
                <p className="text-xs text-slate-400">
                  {selectedReceiverId && selectedTopicId
                    ? 'Target & Topic selected. Click below to generate question.'
                    : 'Select both a participant and a topic above to proceed.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubmitChallenge}
                disabled={!selectedReceiverId || !selectedTopicId || submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 active:from-indigo-700 text-white font-extrabold text-sm shadow-xl shadow-indigo-600/30 transition-all min-h-[44px] disabled:opacity-40"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    AI Crafting Question...
                  </span>
                ) : (
                  <>
                    <span>Generate & Send Challenge</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
