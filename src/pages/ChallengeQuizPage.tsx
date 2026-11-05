import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Gamepad2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Trophy,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { gameService } from '../services/gameService';
import { triggerWinnerConfetti } from '../utils/confetti';

export const ChallengeQuizPage: React.FC = () => {
  const { challengeToken } = useParams<{ challengeToken: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Challenge details
  const [challengeData, setChallengeData] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Load challenge by token
  const loadChallenge = async () => {
    if (!challengeToken) {
      setErrorMsg('No challenge token provided.');
      setLoading(false);
      return;
    }

    try {
      const data = await gameService.getChallengeByToken(challengeToken);
      if (!data || !data.question) {
        setErrorMsg('Invalid or expired challenge link.');
        setLoading(false);
        return;
      }

      setChallengeData(data);

      if (data.user_answer) {
        setSubmissionSuccess(true);
        setSelectedOption(data.user_answer.selected_option);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching challenge details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChallenge();
  }, [challengeToken]);

  // Realtime subscription / polling for Admin Reveal event
  useEffect(() => {
    if (!challengeData?.game?.id) return;
    const unsubscribe = gameService.subscribeToGameUpdates(challengeData.game.id, () => {
      loadChallenge();
    });
    return () => unsubscribe();
  }, [challengeData?.game?.id]);

  // Trigger celebration confetti when revealed and answer is correct
  useEffect(() => {
    if (challengeData?.round?.is_revealed && challengeData?.user_answer?.is_correct) {
      triggerWinnerConfetti();
    }
  }, [challengeData?.round?.is_revealed]);

  // Handle Answer Submission
  const handleSubmitAnswer = async () => {
    if (!selectedOption || !challengeToken) return;

    if (!confirm(`Confirm selection: Option ${selectedOption}? Once submitted, you cannot change it.`)) {
      return;
    }

    try {
      setSubmitting(true);
      const res = await gameService.submitAnswer(challengeToken, selectedOption);
      if (res.success) {
        setSubmissionSuccess(true);
        await loadChallenge();
      } else {
        alert(res.error || 'Failed to submit answer.');
      }
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 className="text-base font-bold text-white">Opening Your Friday Fun Challenge...</h3>
        <p className="text-xs text-slate-400 mt-1">Checking secure token</p>
      </div>
    );
  }

  if (errorMsg || !challengeData) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white">Invalid Challenge Link</h2>
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

  const { sender, receiver, topic, question, round, user_answer, game } = challengeData;
  const isRevealed = Boolean(round?.is_revealed);
  const hasAnswered = Boolean(user_answer || submissionSuccess);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Challenge Header Card */}
        <section className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/60 via-background-card to-background-card border border-purple-500/30 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <PlayerAvatar displayName={sender?.display_name || 'Sender'} playerCode={sender?.player_code} size="lg" />
              <div>
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                  Challenge Received
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  {sender?.display_name} challenged you!
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Assigned to <strong className="text-slate-200">{receiver?.display_name}</strong> (Player {receiver?.player_code})
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="purple" size="md">
                {topic?.name || question.topic_category}
              </Badge>
              <Badge
                variant={
                  question.difficulty === 'easy'
                    ? 'success'
                    : question.difficulty === 'hard'
                    ? 'danger'
                    : 'warning'
                }
                size="md"
              >
                {question.difficulty.toUpperCase()}
              </Badge>
            </div>
          </div>
        </section>

        {/* Question & Options Card */}
        <section className="p-6 sm:p-10 rounded-3xl bg-background-card border border-background-border shadow-2xl space-y-6">
          <div className="border-b border-background-border pb-4">
            <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
              Question
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1 leading-snug">
              {question.question_text}
            </h2>
          </div>

          {/* Options Grid (4 Large, Touch-Friendly Cards) */}
          <div className="space-y-3 pt-2">
            {[
              { id: 'A', text: question.option_a },
              { id: 'B', text: question.option_b },
              { id: 'C', text: question.option_c },
              { id: 'D', text: question.option_d },
            ].map((opt) => {
              const isSelected = (selectedOption === opt.id) || (user_answer?.selected_option === opt.id);
              const isCorrectOption = isRevealed && question.correct_option === opt.id;
              const isWrongSelection = isRevealed && isSelected && !user_answer?.is_correct;

              let cardStyle = 'bg-background-darker border-background-border hover:border-slate-700';

              if (isRevealed) {
                if (isCorrectOption) {
                  cardStyle = 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-400/50 text-emerald-200';
                } else if (isWrongSelection) {
                  cardStyle = 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-400/50 text-rose-200';
                } else {
                  cardStyle = 'bg-background-darker/60 border-background-border opacity-50';
                }
              } else if (isSelected) {
                cardStyle = 'bg-indigo-600/25 border-indigo-500 ring-2 ring-indigo-400/60 shadow-lg shadow-indigo-600/20';
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={hasAnswered}
                  onClick={() => setSelectedOption(opt.id as 'A' | 'B' | 'C' | 'D')}
                  className={`w-full p-4 sm:p-5 rounded-2xl border text-left transition-all flex items-start gap-4 min-h-[56px] ${cardStyle}`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl font-mono font-bold text-sm flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : isCorrectOption
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {opt.id}
                  </span>
                  <span className="text-sm sm:text-base font-semibold flex-1 pt-1">
                    {opt.text}
                  </span>

                  {isRevealed && isCorrectOption && (
                    <span className="text-xs font-bold text-emerald-400 pt-1 shrink-0">
                      ✓ Correct Answer
                    </span>
                  )}
                  {isRevealed && isWrongSelection && (
                    <span className="text-xs font-bold text-rose-400 pt-1 shrink-0">
                      ✗ Your Choice
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action or Status Section */}
          {!hasAnswered ? (
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-background-border">
              <span className="text-xs text-slate-400">
                {selectedOption
                  ? `Selected: Option ${selectedOption}. Ready to lock in.`
                  : 'Tap an option above to select your answer.'}
              </span>

              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={!selectedOption || submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:from-indigo-700 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all min-h-[44px] disabled:opacity-40"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <>
                    <span>Submit Answer</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          ) : !isRevealed ? (
            /* Waiting for Admin Reveal Screen */
            <div className="pt-6 border-t border-background-border text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Answer Submitted Successfully!</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1">
                  Your choice is locked in. Please wait while other participants finish and the Admin reveals the official scores!
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Live listening for Admin Reveal...</span>
              </div>
            </div>
          ) : (
            /* Reveal Screen */
            <div className="pt-6 border-t border-background-border space-y-5 animate-in fade-in-50">
              <div className="p-4 sm:p-5 rounded-2xl bg-background-darker border border-background-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-400 uppercase">Your Result:</span>
                    <Badge variant={user_answer?.is_correct ? 'success' : 'danger'} size="sm">
                      {user_answer?.is_correct ? 'CORRECT' : 'INCORRECT'}
                    </Badge>
                  </div>
                  <p className="text-base font-extrabold text-white">
                    {user_answer?.is_correct
                      ? '🎉 Fantastic! You scored +10 points!'
                      : 'Nice try! 0 points awarded for this challenge.'}
                  </p>
                </div>

                <Link
                  to={`/leaderboard/${game?.id || challengeData?.assignment?.game_id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 min-h-[44px]"
                >
                  <Trophy className="w-4 h-4" />
                  <span>View Leaderboard</span>
                </Link>
              </div>

              {question.explanation && (
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200">
                  <span className="font-bold text-indigo-300 block mb-0.5">Explanation:</span>
                  {question.explanation}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
