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
  ArrowLeft,
  ShieldAlert,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { gameService } from '../services/gameService';
import { triggerWinnerConfetti } from '../utils/confetti';
import { Question, Answer } from '../types';

export const ChallengeQuizPage: React.FC = () => {
  const { challengeToken } = useParams<{ challengeToken: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Challenge details & progression
  const [challengeData, setChallengeData] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justAnsweredFeedback, setJustAnsweredFeedback] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  // Load challenge by token
  const loadChallenge = async (maintainIndex = false) => {
    if (!challengeToken) {
      setErrorMsg('No challenge token provided.');
      setLoading(false);
      return;
    }

    try {
      const data = await gameService.getChallengeByToken(challengeToken);
      if (!data || (!data.questions?.length && !data.question)) {
        setErrorMsg('Invalid or expired challenge link.');
        setLoading(false);
        return;
      }

      setChallengeData(data);

      const qs: Question[] = data.questions && data.questions.length > 0 ? data.questions : [data.question];
      const ansList: Answer[] = data.answers || (data.user_answer ? [data.user_answer] : []);

      // Auto-seek logic on initial load or refresh:
      // Resume directly at the first unanswered question
      if (!maintainIndex) {
        const firstUnanswered = qs.findIndex(
          (q) => !ansList.some((a) => a.question_id === q.id)
        );
        if (firstUnanswered !== -1) {
          setCurrentQuestionIndex(firstUnanswered);
          setSelectedOption(null);
        } else {
          // All questions answered: go to last question or show completion screen
          setCurrentQuestionIndex(Math.max(0, qs.length - 1));
          const lastAns = ansList.find((a) => a.question_id === qs[qs.length - 1]?.id);
          setSelectedOption(lastAns ? lastAns.selected_option : null);
        }
      } else {
        // If maintaining current index, synchronize selected option
        const currentQ = qs[currentQuestionIndex];
        const existingAns = currentQ ? ansList.find((a) => a.question_id === currentQ.id) : null;
        if (existingAns) {
          setSelectedOption(existingAns.selected_option);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching challenge details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChallenge(false);
  }, [challengeToken]);

  // Realtime subscription for Admin Reveal or updates
  useEffect(() => {
    if (!challengeData?.game?.id) return;
    const unsubscribe = gameService.subscribeToGameUpdates(challengeData.game.id, () => {
      loadChallenge(true);
    });
    return () => unsubscribe();
  }, [challengeData?.game?.id, currentQuestionIndex]);

  // Extract questions and answers
  const questions: Question[] = challengeData?.questions && challengeData.questions.length > 0
    ? challengeData.questions
    : challengeData?.question
    ? [challengeData.question]
    : [];

  const answers: Answer[] = challengeData?.answers || (challengeData?.user_answer ? [challengeData.user_answer] : []);
  const totalQuestions = Math.max(questions.length, challengeData?.assignment?.total_questions || 7);
  const answeredCount = answers.length;
  const isChallengeCompleted = Boolean(
    challengeData?.assignment?.status === 'submitted' ||
    (questions.length > 0 && answeredCount >= questions.length)
  );

  const currentQuestion: Question | undefined = questions[currentQuestionIndex] || questions[0];
  const currentAnswer = currentQuestion ? answers.find((a) => a.question_id === currentQuestion.id) : undefined;
  const isCurrentAnswered = Boolean(currentAnswer);

  const { sender, receiver, topic, round, game } = challengeData || {};
  const isRevealed = Boolean(round?.is_revealed || game?.status === 'completed');

  // Sync selectedOption when navigating between questions
  useEffect(() => {
    if (currentQuestion) {
      const ans = answers.find((a) => a.question_id === currentQuestion.id);
      if (ans) {
        setSelectedOption(ans.selected_option);
      } else {
        setSelectedOption(null);
      }
      setJustAnsweredFeedback(false);
    }
  }, [currentQuestionIndex, answers.length]);

  // Trigger celebration confetti when revealed or challenge finished
  useEffect(() => {
    if (isRevealed && isChallengeCompleted) {
      triggerWinnerConfetti();
    }
  }, [isRevealed, isChallengeCompleted]);

  // Handle Answer Submission for the Current Question
  const handleSubmitAnswer = async () => {
    if (submitting || isCurrentAnswered) return;
    if (!selectedOption || !challengeToken || !currentQuestion) return;

    if (!confirm(`Confirm selection: Option ${selectedOption}? Once submitted, you cannot change this answer.`)) {
      return;
    }

    try {
      setSubmitting(true);
      const res = await gameService.submitAnswer(challengeToken, selectedOption, currentQuestion.id);
      if (res.success) {
        setJustAnsweredFeedback(true);
        // Refresh challenge data keeping current position
        await loadChallenge(true);
      } else {
        alert(res.error || 'Failed to submit answer.');
      }
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Move to Next Question
  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setJustAnsweredFeedback(false);
    }
  };

  // Move to Previous Question
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      setJustAnsweredFeedback(false);
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

  if (errorMsg || !challengeData || !currentQuestion) {
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

  // Calculate scores and progress
  const progressPercent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const wrongCount = answers.filter((a) => a.is_correct === false).length;
  const totalScore = challengeData?.assignment?.current_score || (correctCount * 10);

  // If entire challenge is completed and not in review mode, show completion summary screen
  if (isChallengeCompleted && !reviewMode) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col">
        <Navbar />

        <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <section className="p-8 sm:p-10 rounded-3xl bg-background-card border border-indigo-500/30 shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/20 text-amber-400 flex items-center justify-center mx-auto ring-4 ring-amber-400/20">
              <Trophy className="w-10 h-10" />
            </div>

            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                All 7 Questions Completed
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Challenge Complete! 🎉
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-2">
                Great job, <strong className="text-white">{receiver?.display_name}</strong>! You answered all {totalQuestions} questions for{' '}
                <strong className="text-purple-300">{topic?.name || currentQuestion.topic_category}</strong>.
              </p>
            </div>

            {/* Score Summary Box */}
            <div className="p-6 rounded-2xl bg-background-darker border border-background-border space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Your Challenge Score
              </span>

              {isRevealed ? (
                <>
                  <div className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                    {totalScore} / {totalQuestions * 10}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs font-semibold pt-1">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> {correctCount} Correct
                    </span>
                    <span className="text-rose-400 flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> {wrongCount} Incorrect
                    </span>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                    7 of 7 Answers Locked In ✓
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Official scores and answers will be published on the leaderboard once revealed by the Admin.
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Listening live for Admin Reveal...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={`/leaderboard/${game?.id || challengeData?.assignment?.game_id}`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-sm shadow-xl shadow-amber-500/20 min-h-[46px]"
              >
                <Trophy className="w-4 h-4" />
                <span>View Live Leaderboard</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setReviewMode(true);
                  setCurrentQuestionIndex(0);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs min-h-[46px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Review All 7 Questions</span>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        {/* Challenge Header Card */}
        <section className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/60 via-background-card to-background-card border border-purple-500/30 shadow-2xl relative overflow-hidden">
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
                {topic?.name || currentQuestion.topic_category}
              </Badge>
              <Badge
                variant={
                  currentQuestion.difficulty === 'easy'
                    ? 'success'
                    : currentQuestion.difficulty === 'hard'
                    ? 'danger'
                    : 'warning'
                }
                size="md"
              >
                {currentQuestion.difficulty.toUpperCase()}
              </Badge>
            </div>
          </div>
        </section>

        {/* 7-Question Progression Tracker & Progress Bar */}
        <section className="p-4 sm:p-5 rounded-2xl bg-background-card border border-background-border shadow-lg space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-indigo-400 uppercase tracking-wider">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </span>
            <span className="text-slate-400">
              {answeredCount} of {totalQuestions} Answered ({progressPercent}%)
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Question Step Pills */}
          <div className="pt-2 flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto pb-1">
            {questions.map((q, idx) => {
              const isAns = answers.some((a) => a.question_id === q.id);
              const isCurrent = idx === currentQuestionIndex;
              const canNavigate = isAns || idx <= answeredCount;

              let pillStyle = 'bg-slate-800/60 border-slate-700/60 text-slate-400 opacity-60';
              if (isCurrent) {
                pillStyle = 'bg-indigo-600/30 border-indigo-400 text-white ring-2 ring-indigo-400/50 shadow-md shadow-indigo-600/20';
              } else if (isAns) {
                pillStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
              }

              return (
                <button
                  key={q.id || idx}
                  type="button"
                  disabled={!canNavigate}
                  onClick={() => {
                    setCurrentQuestionIndex(idx);
                    const ans = answers.find((a) => a.question_id === q.id);
                    setSelectedOption(ans ? ans.selected_option : null);
                    setJustAnsweredFeedback(false);
                  }}
                  className={`flex-1 min-w-[36px] max-w-[48px] h-9 rounded-xl border font-mono font-bold text-xs flex items-center justify-center transition-all ${pillStyle} disabled:cursor-not-allowed`}
                  title={`Question ${idx + 1}`}
                >
                  {isAns ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                </button>
              );
            })}
          </div>
        </section>

        {/* Current Question & Options Card */}
        <section className="p-6 sm:p-10 rounded-3xl bg-background-card border border-background-border shadow-2xl space-y-6">
          <div className="border-b border-background-border pb-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1 leading-snug">
                {currentQuestion.question_text}
              </h2>
            </div>
            <Badge
              variant={
                currentQuestion.difficulty === 'easy'
                  ? 'success'
                  : currentQuestion.difficulty === 'hard'
                  ? 'danger'
                  : 'warning'
              }
              size="sm"
            >
              {currentQuestion.difficulty.toUpperCase()}
            </Badge>
          </div>

          {/* 4 Interactive Touch-Friendly Options */}
          <div className="space-y-3 pt-2">
            {[
              { id: 'A', text: currentQuestion.option_a },
              { id: 'B', text: currentQuestion.option_b },
              { id: 'C', text: currentQuestion.option_c },
              { id: 'D', text: currentQuestion.option_d },
            ].map((opt) => {
              const isSelected = selectedOption === opt.id || currentAnswer?.selected_option === opt.id;
              const isCorrectOption = isRevealed && currentQuestion.correct_option === opt.id;
              const isWrongSelection = isRevealed && isSelected && !currentAnswer?.is_correct;

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
                  disabled={isCurrentAnswered || submitting}
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
                  {!isRevealed && isSelected && isCurrentAnswered && (
                    <span className="text-xs font-bold text-indigo-300 pt-1 shrink-0">
                      ✓ Locked In
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action / Next Question Section */}
          <div className="pt-4 border-t border-background-border">
            {!isCurrentAnswered ? (
              // Unanswered: Show Submit Answer Button
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  {selectedOption
                    ? `Selected: Option ${selectedOption}. Ready to submit.`
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
            ) : (
              // Answered: Show Feedback & Next Question Navigation
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-background-darker border border-background-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        Answer Saved for Question {currentQuestionIndex + 1}!
                      </p>
                      <p className="text-xs text-slate-400">
                        {isRevealed
                          ? currentAnswer?.is_correct
                            ? '🎉 Correct! +10 Points awarded.'
                            : 'Incorrect answer. 0 points awarded.'
                          : 'Your response is locked in.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {currentQuestionIndex > 0 && (
                      <button
                        type="button"
                        onClick={handlePreviousQuestion}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs min-h-[44px]"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                    )}

                    {currentQuestionIndex < totalQuestions - 1 ? (
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 min-h-[44px]"
                      >
                        <span>Next Question ({currentQuestionIndex + 2} of {totalQuestions})</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReviewMode(false)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 min-h-[44px]"
                      >
                        <Trophy className="w-4 h-4" />
                        <span>View Final Results</span>
                      </button>
                    )}
                  </div>
                </div>

                {isRevealed && currentQuestion.explanation && (
                  <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200">
                    <span className="font-bold text-indigo-300 block mb-0.5">Explanation:</span>
                    {currentQuestion.explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
