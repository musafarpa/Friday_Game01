import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, Trophy, ArrowRight, ArrowLeft, ShieldAlert, RotateCcw, Check, Pause } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Badge } from '../components/Badge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { gameService, friendlyError } from '../services/gameService';
import { triggerWinnerConfetti } from '../utils/confetti';
import { ChallengeData } from '../types';

type Opt = 'A' | 'B' | 'C' | 'D';

export const ChallengeQuizPage: React.FC = () => {
  const { challengeToken } = useParams<{ challengeToken: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<ChallengeData | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Opt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [reviewMode, setReviewMode] = useState(false);
  const idxRef = useRef(0);
  const submittingRef = useRef(false);
  const confettiFired = useRef(false);

  const setIndex = (n: number) => {
    idxRef.current = n;
    setIdx(n);
  };

  const load = useCallback(
    async (opts: { resume?: boolean; quiet?: boolean } = {}) => {
      if (!challengeToken) {
        setErrorMsg('No challenge token provided.');
        setLoading(false);
        return;
      }
      try {
        const res = await gameService.getChallengeByToken(challengeToken);
        if (!res) {
          setData(null);
          setErrorMsg('This challenge link is invalid, expired or the game was removed.');
          return;
        }
        setData(res);
        setErrorMsg('');
        if (opts.resume) {
          // resume at the first unanswered question (refresh / reopen safe)
          const first = res.questions.findIndex((q) => !res.answers.some((a) => a.question_id === q.id));
          setIndex(first === -1 ? Math.max(0, res.questions.length - 1) : first);
          setSelected(null);
        }
      } catch (err: any) {
        if (!opts.quiet) setErrorMsg(friendlyError(err, 'Error fetching challenge details'));
      } finally {
        setLoading(false);
      }
    },
    [challengeToken]
  );

  useEffect(() => {
    void load({ resume: true });
  }, [load]);

  // live: pause / resume / complete / cancel from the host reflect immediately
  useEffect(() => {
    const gid = data?.game.id;
    if (!gid) return;
    return gameService.subscribeToGameUpdates(gid, () => void load({ quiet: true }), { mode: 'public' });
  }, [data?.game.id, load]);

  const questions = data?.questions ?? [];
  const answers = data?.answers ?? [];
  const total = data?.progress.total ?? 7;
  const answeredCount = answers.length;
  const q = questions[idx];
  const currentAnswer = q ? answers.find((a) => a.question_id === q.id) : undefined;
  const isCurrentAnswered = Boolean(currentAnswer);
  const revealed = Boolean(data?.round.is_revealed);
  const completed = Boolean(data?.progress.is_completed);
  const reason = data?.closed_reason ?? null;
  const open = Boolean(data?.is_open);
  const pts = data?.game.points_correct ?? 10;

  useEffect(() => {
    if (!q) return;
    const a = answers.find((x) => x.question_id === q.id);
    setSelected(a ? a.selected_option : null);
  }, [idx, answeredCount, q?.id]);

  useEffect(() => {
    if (revealed && completed && !confettiFired.current) {
      confettiFired.current = true;
      triggerWinnerConfetti();
    }
  }, [revealed, completed]);

  const submit = async () => {
    if (submittingRef.current || isCurrentAnswered || !selected || !challengeToken || !q || !open) return;
    if (!window.confirm(`Confirm selection: Option ${selected}? Once submitted, you cannot change this answer.`)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await gameService.submitAnswer(challengeToken, selected, q.id);
      if (!res.success && !res.alreadyAnswered) setSubmitError(res.error || 'Failed to submit answer.');
      await load({ quiet: true });
    } catch (err: any) {
      setSubmitError(friendlyError(err));
    } finally {
      submittingRef.current = false;
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

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-background-card border border-rose-500/30 rounded-2xl p-6 text-center shadow-2xl" role="alert" data-testid="challenge-error">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white">Invalid Challenge Link</h2>
          <p className="text-xs text-rose-300 mt-2 leading-relaxed">{errorMsg}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => { setLoading(true); void load({ resume: true }); }} className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white min-h-[44px]">Try again</button>
            <Link to="/" className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white min-h-[44px]">Return to Homepage</Link>
          </div>
        </div>
      </div>
    );
  }

  const { sender, receiver, topic, game } = data;

  // Cancelled: nothing playable
  if (reason === 'cancelled') {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16">
          <section className="p-8 rounded-3xl bg-background-card border border-rose-500/30 text-center space-y-4" role="alert" data-testid="challenge-cancelled">
            <XCircle className="w-14 h-14 text-rose-400 mx-auto" />
            <h1 className="text-2xl font-extrabold text-white">This game was cancelled</h1>
            <p className="text-sm text-slate-400">The host cancelled “{game.name}”. Answers are no longer accepted.</p>
            <Link to="/" className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold min-h-[44px]">Back to Home</Link>
          </section>
        </main>
      </div>
    );
  }

  const showSummary = (completed || reason === 'completed') && !reviewMode;
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const wrongCount = answers.filter((a) => a.is_correct === false).length;

  if (showSummary) {
    const score = data.progress.current_score;
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col overflow-x-hidden">
        <Navbar />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <section className="p-6 sm:p-10 rounded-3xl bg-background-card border border-indigo-500/30 shadow-2xl text-center space-y-6" data-testid="challenge-summary">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/20 text-amber-400 flex items-center justify-center mx-auto ring-4 ring-amber-400/20">
              <Trophy className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                {completed ? `All ${total} Questions Completed` : `Game finished · ${answeredCount} of ${total} answered`}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{completed ? 'Challenge Complete! 🎉' : 'Game Over'}</h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-2">
                {receiver.display_name}, your challenge from <strong className="text-white">{sender.display_name}</strong> on <strong className="text-purple-300">{topic.name}</strong>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-background-darker border border-background-border space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Challenge Score</span>
              {revealed && score !== null ? (
                <>
                  <div className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300" data-testid="final-score">
                    {score} / {data.progress.max_score}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs font-semibold pt-1">
                    <span className="text-emerald-400 flex items-center gap-1"><Check className="w-4 h-4" /> {correctCount} Correct</span>
                    <span className="text-rose-400 flex items-center gap-1"><XCircle className="w-4 h-4" /> {wrongCount} Incorrect</span>
                    {total - answeredCount > 0 && <span className="text-slate-400">{total - answeredCount} Unanswered</span>}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400" data-testid="locked-in">{answeredCount} of {total} Answers Locked In ✓</div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Answers and scores are published when the host completes the game.</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Listening live for the reveal…</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={`/leaderboard/${game.id}`} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-sm shadow-xl shadow-amber-500/20 min-h-[46px]" data-testid="view-leaderboard">
                <Trophy className="w-4 h-4" />
                <span>View Leaderboard</span>
              </Link>
              <button type="button" onClick={() => { setReviewMode(true); setIndex(0); }} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs min-h-[46px]" data-testid="review-questions">
                <RotateCcw className="w-4 h-4" />
                <span>Review Questions</span>
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="min-h-screen bg-background text-slate-100 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16">
          <section className="p-8 rounded-3xl bg-background-card border border-cyan-500/30 text-center space-y-3" data-testid="challenge-not-ready">
            <Clock className="w-12 h-12 text-cyan-300 mx-auto" />
            <h1 className="text-xl font-extrabold text-white">Waiting for the game to start</h1>
            <p className="text-sm text-slate-400">Your questions will appear here as soon as the host starts the game.</p>
          </section>
        </main>
      </div>
    );
  }

  const progressPercent = Math.min(100, Math.round((answeredCount / total) * 100));
  const readOnly = !open || reviewMode;

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        {reason === 'paused' && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-sm flex items-start gap-3" role="status" data-testid="challenge-paused">
            <Pause className="w-5 h-5 shrink-0 mt-0.5" />
            <div><strong>The game is paused by the host.</strong><p className="text-xs text-amber-200/80 mt-1">You can keep this page open – answering resumes automatically.</p></div>
          </div>
        )}
        {reason === 'not_started' && (
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-100 text-sm" role="status">The host has not started the game yet.</div>
        )}

        <section className="p-5 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/60 via-background-card to-background-card border border-purple-500/30 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0">
              <PlayerAvatar displayName={sender.display_name} playerCode={sender.player_code} size="lg" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Challenge Received</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white break-words">{sender.display_name} challenged you!</h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Assigned to <strong className="text-slate-200">{receiver.display_name}</strong> (Player {receiver.player_code})</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="purple" size="md">{topic.name}</Badge>
              <Badge variant={q.difficulty === 'easy' ? 'success' : q.difficulty === 'hard' ? 'danger' : 'warning'} size="md">{q.difficulty.toUpperCase()}</Badge>
            </div>
          </div>
        </section>

        <section className="p-4 sm:p-5 rounded-2xl bg-background-card border border-background-border shadow-lg space-y-3" aria-label="Progress">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-indigo-400 uppercase tracking-wider" data-testid="question-counter">Question {idx + 1} of {total}</span>
            <span className="text-slate-400">{answeredCount} of {total} Answered ({progressPercent}%)</span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="pt-2 flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto pb-1">
            {questions.map((qq, i) => {
              const ans = answers.some((a) => a.question_id === qq.id);
              const current = i === idx;
              const canNav = ans || i <= answeredCount || revealed;
              let style = 'bg-slate-800/60 border-slate-700/60 text-slate-400 opacity-60';
              if (current) style = 'bg-indigo-600/30 border-indigo-400 text-white ring-2 ring-indigo-400/50';
              else if (ans) style = 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
              return (
                <button key={qq.id} type="button" disabled={!canNav} onClick={() => setIndex(i)} className={`flex-1 min-w-[40px] max-w-[48px] h-10 rounded-xl border font-mono font-bold text-xs flex items-center justify-center transition-all ${style} disabled:cursor-not-allowed`} title={`Question ${i + 1}`} aria-label={`Go to question ${i + 1}`}>
                  {ans ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </button>
              );
            })}
          </div>
        </section>

        <section className="p-5 sm:p-10 rounded-3xl bg-background-card border border-background-border shadow-2xl space-y-6">
          <div className="border-b border-background-border pb-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">Question {idx + 1} of {total}</span>
              <h2 className="text-lg sm:text-2xl font-extrabold text-white mt-1 leading-snug break-words" data-testid="question-text">{q.question_text}</h2>
            </div>
            <Badge variant={q.difficulty === 'easy' ? 'success' : q.difficulty === 'hard' ? 'danger' : 'warning'} size="sm">{q.difficulty.toUpperCase()}</Badge>
          </div>

          {submitError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs" role="alert" data-testid="submit-error">{submitError}</div>
          )}

          <div className="space-y-3 pt-2">
            {([['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]] as Array<[Opt, string]>).map(([id, text]) => {
              const isSel = selected === id || currentAnswer?.selected_option === id;
              const isCorrect = revealed && q.correct_option === id;
              const isWrong = revealed && isSel && currentAnswer?.is_correct === false;
              let style = 'bg-background-darker border-background-border hover:border-slate-700';
              if (revealed) {
                style = isCorrect ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-400/50 text-emerald-200' : isWrong ? 'bg-rose-500/20 border-rose-500 ring-2 ring-rose-400/50 text-rose-200' : 'bg-background-darker/60 border-background-border opacity-60';
              } else if (isSel) {
                style = 'bg-indigo-600/25 border-indigo-500 ring-2 ring-indigo-400/60 shadow-lg shadow-indigo-600/20';
              }
              return (
                <button key={id} type="button" data-testid={`option-${id}`} aria-pressed={isSel} disabled={isCurrentAnswered || submitting || readOnly} onClick={() => setSelected(id)} className={`w-full p-4 sm:p-5 rounded-2xl border text-left transition-all flex items-start gap-4 min-h-[56px] ${style}`}>
                  <span className={`w-8 h-8 rounded-xl font-mono font-bold text-sm flex items-center justify-center shrink-0 ${isSel ? 'bg-indigo-600 text-white' : isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{id}</span>
                  <span className="text-sm sm:text-base font-semibold flex-1 pt-1 break-words min-w-0">{text}</span>
                  {revealed && isCorrect && <span className="text-xs font-bold text-emerald-400 pt-1 shrink-0">✓ Correct</span>}
                  {revealed && isWrong && <span className="text-xs font-bold text-rose-400 pt-1 shrink-0">✗ Your choice</span>}
                  {!revealed && isSel && isCurrentAnswered && <span className="text-xs font-bold text-indigo-300 pt-1 shrink-0">✓ Locked in</span>}
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-background-border">
            {!isCurrentAnswered ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  {readOnly ? (revealed ? 'You did not answer this question.' : 'Answering is currently closed.') : selected ? `Selected: Option ${selected}. Ready to submit.` : 'Tap an option to select your answer.'}
                </span>
                {!readOnly && (
                  <button type="button" onClick={submit} disabled={!selected || submitting} data-testid="submit-answer" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all min-h-[44px] disabled:opacity-40">
                    {submitting ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</span> : <><span>Submit Answer</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-background-darker border border-background-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5" /></div>
                    <div>
                      <p className="text-sm font-bold text-white" data-testid="answer-saved">Answer saved for Question {idx + 1}!</p>
                      <p className="text-xs text-slate-400">
                        {revealed ? (currentAnswer?.is_correct ? `🎉 Correct! +${pts} points.` : 'Incorrect answer. 0 points.') : 'Your response is locked in.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {idx > 0 && (
                      <button type="button" onClick={() => setIndex(idx - 1)} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs min-h-[44px]">
                        <ArrowLeft className="w-3.5 h-3.5" /><span>Prev</span>
                      </button>
                    )}
                    {idx < total - 1 ? (
                      <button type="button" onClick={() => setIndex(idx + 1)} data-testid="next-question" className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 min-h-[44px]">
                        <span>Next Question ({idx + 2} of {total})</span><ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => setReviewMode(false)} data-testid="view-final-results" className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 min-h-[44px]">
                        <Trophy className="w-4 h-4" /><span>View Final Results</span>
                      </button>
                    )}
                  </div>
                </div>
                {revealed && q.explanation && (
                  <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200">
                    <span className="font-bold text-indigo-300 block mb-0.5">Explanation:</span>
                    {q.explanation}
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
