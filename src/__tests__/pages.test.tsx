import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  joinGame: vi.fn(),
  createChallenge: vi.fn(),
  getChallengeByToken: vi.fn(),
  submitAnswer: vi.fn(),
  getLeaderboard: vi.fn(),
  subscribeToGameUpdates: vi.fn(() => () => {}),
  checkIsAdmin: vi.fn(async () => false),
  loginAdmin: vi.fn(),
  resetAdminPassword: vi.fn(),
  logoutAdmin: vi.fn(),
}));
vi.mock('../services/gameService', () => ({
  gameService: svc,
  friendlyError: (e: any, f = 'error') => e?.message || f,
}));
vi.mock('../utils/confetti', () => ({ triggerWinnerConfetti: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabaseUrl: 'https://x.supabase.co', isLocalOrigin: () => false, supabase: {} }));

import { ParticipantJoinPage } from '../pages/ParticipantJoinPage';
import { ChallengeQuizPage } from '../pages/ChallengeQuizPage';
import { LeaderboardPage } from '../pages/LeaderboardPage';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { ConfirmDialog, statusLabel } from '../pages/admin/ui';
import { leaderboardCsv } from '../pages/admin/LeaderboardTab';

const GAME = '11111111-1111-1111-1111-111111111111';
const TOKEN = 'a'.repeat(64);

const peer = (id: string, name: string, code: string) => ({ id, display_name: name, player_code: code });

function joinPayload(over: any = {}) {
  return {
    participant: { id: 'p1', display_name: 'Arun', player_code: 'A', status: 'joined' },
    game: { id: GAME, name: 'Friday Fun QA Test', status: 'active', points_correct: 10 },
    round: { id: 'r1', round_number: 1, status: 'active' },
    roster: [peer('p2', 'Rahul', 'B'), peer('p3', 'Amal', 'C'), peer('p4', 'Nikhil', 'D')],
    topics: [
      { id: 't1', name: 'Movies & Entertainment', description: 'Cinema' },
      { id: 't2', name: 'Cricket & Sports', description: 'Cricket' },
    ],
    outgoing: [],
    incoming: [],
    can_create: true,
    ...over,
  };
}

const renderJoin = () =>
  render(
    <MemoryRouter initialEntries={[`/join/${GAME}/${TOKEN}`]}>
      <Routes>
        <Route path="/join/:gameId/:token" element={<ParticipantJoinPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(svc).forEach((f: any) => f.mockReset?.());
  svc.subscribeToGameUpdates.mockImplementation(() => () => {});
  svc.checkIsAdmin.mockResolvedValue(false);
});

describe('ParticipantJoinPage', () => {
  it('shows a useful error for an invalid / revoked invitation token', async () => {
    svc.joinGame.mockResolvedValue(null);
    renderJoin();
    expect(await screen.findByTestId('invite-error')).toHaveTextContent(/invalid, expired or has been replaced/i);
    expect(svc.joinGame).toHaveBeenCalledWith(GAME, TOKEN);
  });

  it('shows a connection error (not a blank page) when the backend is unreachable', async () => {
    svc.joinGame.mockRejectedValue(new Error('Cannot reach the database. Check your internet connection and try again.'));
    renderJoin();
    expect(await screen.findByTestId('invite-error')).toHaveTextContent(/Cannot reach the database/);
  });

  it('registration open: shows the waiting state and NO challenge-creation controls', async () => {
    svc.joinGame.mockResolvedValue(joinPayload({ game: { id: GAME, name: 'G', status: 'registration_open', points_correct: 10 }, can_create: false }));
    renderJoin();
    expect(await screen.findByTestId('state-waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('selection-flow')).toBeNull();
  });

  it('paused / cancelled / completed games show the matching notice and no selection flow', async () => {
    for (const [status, testId] of [['paused', 'state-paused'], ['cancelled', 'state-cancelled'], ['completed', 'state-completed']] as const) {
      svc.joinGame.mockResolvedValue(joinPayload({ game: { id: GAME, name: 'G', status, points_correct: 10 }, can_create: false }));
      const { unmount } = renderJoin();
      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      expect(screen.queryByTestId('selection-flow')).toBeNull();
      unmount();
    }
  });

  it('active game: select a participant + topic, then create the challenge with ONLY ids (no questions/answers)', async () => {
    svc.joinGame.mockResolvedValue(joinPayload());
    svc.createChallenge.mockResolvedValue({ assignment_id: 'a1', raw_token: 'tok' });
    renderJoin();
    await screen.findByTestId('selection-flow');

    const send = screen.getByTestId('send-challenge');
    expect(send).toBeDisabled();
    expect(screen.queryByTestId('pick-player-Arun')).toBeNull(); // cannot pick yourself
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByTestId('pick-topic-Movies & Entertainment'));
    expect(send).toBeEnabled();

    svc.joinGame.mockResolvedValue(
      joinPayload({ can_create: false, outgoing: [{ assignment_id: 'a1', status: 'pending', raw_token: 'tok', answered: 0, total: 7, receiver: peer('p3', 'Amal', 'C'), topic: { id: 't1', name: 'Movies & Entertainment' } }] })
    );
    fireEvent.click(send);
    await waitFor(() => expect(svc.createChallenge).toHaveBeenCalledWith({ gameId: GAME, token: TOKEN, receiverId: 'p3', topicId: 't1' }));
    const result = await screen.findByTestId('outgoing-result');
    expect(result).toHaveTextContent(/Your Challenge For Amal Is Ready/);
    expect(screen.getByRole('link', { name: /Send Challenge to Amal on WhatsApp/i }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=.*challenge%2Ftok/);
    expect(screen.queryByTestId('selection-flow')).toBeNull();
  });

  it('topics already used up for the chosen friend are disabled up-front (two players picking the same friend)', async () => {
    svc.joinGame.mockResolvedValue(joinPayload({ unavailable: [{ receiver_id: 'p3', topic_id: 't1' }] }));
    renderJoin();
    await screen.findByTestId('selection-flow');
    // nothing blocked until a friend is chosen
    expect(screen.getByTestId('pick-topic-Movies & Entertainment')).toBeEnabled();
    fireEvent.click(screen.getByTestId('pick-player-Amal')); // p3
    expect(screen.getByTestId('pick-topic-Movies & Entertainment')).toBeDisabled();
    expect(screen.getByTestId('topic-used-Movies & Entertainment')).toHaveTextContent('Already used for Amal');
    expect(screen.getByTestId('pick-topic-Cricket & Sports')).toBeEnabled();
    // a different friend can still get that topic
    fireEvent.click(screen.getByTestId('pick-player-Rahul')); // p2
    expect(screen.getByTestId('pick-topic-Movies & Entertainment')).toBeEnabled();
  });

  it('changing to a friend for whom the selected topic is used up clears that selection', async () => {
    svc.joinGame.mockResolvedValue(joinPayload({ unavailable: [{ receiver_id: 'p3', topic_id: 't1' }] }));
    renderJoin();
    await screen.findByTestId('selection-flow');
    fireEvent.click(screen.getByTestId('pick-player-Rahul'));
    fireEvent.click(screen.getByTestId('pick-topic-Movies & Entertainment'));
    expect(screen.getByTestId('send-challenge')).toBeEnabled();
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    expect(screen.getByTestId('send-challenge')).toBeDisabled(); // selection dropped, can't be sent
  });

  it('when every topic is used up for a friend, the player is told to pick another friend', async () => {
    svc.joinGame.mockResolvedValue(joinPayload({ unavailable: [{ receiver_id: 'p3', topic_id: 't1' }, { receiver_id: 'p3', topic_id: 't2' }] }));
    renderJoin();
    await screen.findByTestId('selection-flow');
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    expect(screen.getByTestId('all-topics-used')).toHaveTextContent('Amal has already received every available topic');
  });

  it('older servers without `unavailable` still work (nothing disabled)', async () => {
    svc.joinGame.mockResolvedValue(joinPayload());
    renderJoin();
    await screen.findByTestId('selection-flow');
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    expect(screen.getByTestId('pick-topic-Movies & Entertainment')).toBeEnabled();
  });

  it('double-clicking "Send" creates exactly one challenge', async () => {
    svc.joinGame.mockResolvedValue(joinPayload());
    let release!: () => void;
    svc.createChallenge.mockImplementation(() => new Promise((r) => { release = () => r({}); }));
    renderJoin();
    await screen.findByTestId('selection-flow');
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    fireEvent.click(screen.getByTestId('pick-topic-Cricket & Sports'));
    const send = screen.getByTestId('send-challenge');
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.click(send);
    release();
    await waitFor(() => expect(svc.createChallenge).toHaveBeenCalledTimes(1));
  });

  it('shows the server error when challenge creation is refused', async () => {
    svc.joinGame.mockResolvedValue(joinPayload());
    svc.createChallenge.mockRejectedValue(new Error('Not enough unseen easy questions left for Amal in "Movies & Entertainment". Please pick another topic or player.'));
    renderJoin();
    await screen.findByTestId('selection-flow');
    fireEvent.click(screen.getByTestId('pick-player-Amal'));
    fireEvent.click(screen.getByTestId('pick-topic-Movies & Entertainment'));
    fireEvent.click(screen.getByTestId('send-challenge'));
    expect(await screen.findByTestId('selection-error')).toHaveTextContent(/Not enough unseen easy questions/);
  });

  it('a participant who is the receiver of THREE challenges sees three separate links with their own progress', async () => {
    const inc = (id: string, from: string, code: string, topic: string, token: string, answered: number, status: string) => ({
      assignment_id: id, status, raw_token: token, answered, total: 7, sender: peer(`s-${id}`, from, code), topic: { id: topic, name: topic },
    });
    svc.joinGame.mockResolvedValue(
      joinPayload({
        participant: { id: 'p3', display_name: 'Amal', player_code: 'C', status: 'joined' },
        incoming: [
          inc('a1', 'Arun', 'A', 'Movies & Entertainment', 'tok-1', 7, 'submitted'),
          inc('a2', 'Rahul', 'B', 'Cricket & Sports', 'tok-2', 3, 'opened'),
          inc('a3', 'Nikhil', 'D', 'AI & Technology', 'tok-3', 0, 'pending'),
        ],
      })
    );
    renderJoin();
    const box = await screen.findByTestId('incoming-challenges');
    expect(box).toHaveTextContent('Challenges Received For You (3)');
    const hrefs = within(box).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/challenge/tok-1', '/challenge/tok-2', '/challenge/tok-3']);
    expect(within(screen.getByTestId('incoming-Arun')).getByText('Answered')).toBeInTheDocument();
    expect(within(screen.getByTestId('incoming-Rahul')).getByText('3/7')).toBeInTheDocument();
    expect(within(screen.getByTestId('incoming-Nikhil')).getByText('Pending')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------

const questions = (n = 7) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`, sequence_num: i + 1, topic_category: 'Movies & Entertainment', question_text: `Question text number ${i + 1}?`,
    option_a: 'Alpha', option_b: 'Bravo', option_c: 'Charlie', option_d: 'Delta',
    difficulty: i < 3 ? 'easy' : i < 6 ? 'medium' : 'hard', correct_option: null, explanation: null,
  }));

function challenge(over: any = {}) {
  const answered: number = over.answered ?? 0;
  const qs = over.questions ?? questions();
  return {
    assignment: { id: 'a1', status: answered >= 7 ? 'submitted' : 'opened', total_questions: 7, answered_questions: answered },
    game: { id: GAME, name: 'Friday Fun QA Test', status: 'active', points_correct: 10 },
    round: { id: 'r1', round_number: 1, status: 'active', is_revealed: false },
    sender: peer('p1', 'Arun', 'A'),
    receiver: peer('p3', 'Amal', 'C'),
    topic: { id: 't1', name: 'Movies & Entertainment' },
    questions: qs,
    answers: qs.slice(0, answered).map((q: any, i: number) => ({ question_id: q.id, question_num: i + 1, selected_option: 'A', is_correct: null })),
    is_open: true,
    closed_reason: null,
    progress: { total: 7, answered, is_completed: answered >= 7, current_score: null, max_score: 70 },
    ...over,
  };
}

const renderQuiz = () =>
  render(
    <MemoryRouter initialEntries={[`/challenge/${TOKEN}`]}>
      <Routes>
        <Route path="/challenge/:challengeToken" element={<ChallengeQuizPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ChallengeQuizPage (7-question sequence)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('starts at Question 1 of 7, 0 answered, submit disabled until an option is chosen', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge());
    renderQuiz();
    expect(await screen.findByTestId('question-counter')).toHaveTextContent('Question 1 of 7');
    expect(screen.getByText('0 of 7 Answered (0%)')).toBeInTheDocument();
    expect(screen.getByTestId('question-text')).toHaveTextContent('Question text number 1?');
    expect(screen.getByTestId('submit-answer')).toBeDisabled();
    fireEvent.click(screen.getByTestId('option-C'));
    expect(screen.getByTestId('submit-answer')).toBeEnabled();
  });

  it('never shows correct answers or scores before the reveal', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge({ answered: 3 }));
    renderQuiz();
    await screen.findByTestId('question-counter');
    expect(screen.queryByText(/✓ Correct/)).toBeNull();
    expect(screen.queryByText(/points/i)).toBeNull();
    expect(screen.queryByTestId('final-score')).toBeNull();
  });

  it('resumes at the first UNANSWERED question after a refresh (answered 3 -> Question 4 of 7)', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge({ answered: 3 }));
    renderQuiz();
    expect(await screen.findByTestId('question-counter')).toHaveTextContent('Question 4 of 7');
    expect(screen.getByText('3 of 7 Answered (43%)')).toBeInTheDocument();
    expect(screen.getByTestId('question-text')).toHaveTextContent('Question text number 4?');
  });

  it('submit sends token + selected option + question id, then shows "Answer saved" and Next Question', async () => {
    svc.getChallengeByToken.mockResolvedValueOnce(challenge());
    svc.submitAnswer.mockResolvedValue({ success: true, is_completed: false, answered_count: 1 });
    svc.getChallengeByToken.mockResolvedValue(challenge({ answered: 1 }));
    renderQuiz();
    await screen.findByTestId('question-counter');
    fireEvent.click(screen.getByTestId('option-B'));
    fireEvent.click(screen.getByTestId('submit-answer'));
    await waitFor(() => expect(svc.submitAnswer).toHaveBeenCalledWith(TOKEN, 'B', 'q1'));
    expect(await screen.findByTestId('answer-saved')).toHaveTextContent('Answer saved for Question 1!');
    fireEvent.click(screen.getByTestId('next-question'));
    expect(screen.getByTestId('question-counter')).toHaveTextContent('Question 2 of 7');
  });

  it('double-clicking Submit sends exactly one request', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge());
    let release!: () => void;
    svc.submitAnswer.mockImplementation(() => new Promise((r) => { release = () => r({ success: true }); }));
    renderQuiz();
    await screen.findByTestId('question-counter');
    fireEvent.click(screen.getByTestId('option-A'));
    const btn = screen.getByTestId('submit-answer');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    release();
    await waitFor(() => expect(svc.submitAnswer).toHaveBeenCalledTimes(1));
  });

  it('declining the confirmation sends nothing', async () => {
    (window.confirm as any).mockReturnValue(false);
    svc.getChallengeByToken.mockResolvedValue(challenge());
    renderQuiz();
    await screen.findByTestId('question-counter');
    fireEvent.click(screen.getByTestId('option-A'));
    fireEvent.click(screen.getByTestId('submit-answer'));
    expect(svc.submitAnswer).not.toHaveBeenCalled();
  });

  it('a server rejection (e.g. game paused) is shown to the participant', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge());
    svc.submitAnswer.mockResolvedValue({ success: false, error: 'The game is paused by the host. Please try again shortly.' });
    renderQuiz();
    await screen.findByTestId('question-counter');
    fireEvent.click(screen.getByTestId('option-A'));
    fireEvent.click(screen.getByTestId('submit-answer'));
    expect(await screen.findByTestId('submit-error')).toHaveTextContent(/paused by the host/);
  });

  it('after Question 7 the challenge is complete: shows 7 answers locked in, score hidden until reveal', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge({ answered: 7 }));
    renderQuiz();
    const summary = await screen.findByTestId('challenge-summary');
    expect(within(summary).getByTestId('locked-in')).toHaveTextContent('7 of 7 Answers Locked In');
    expect(screen.queryByTestId('final-score')).toBeNull();
    expect(screen.getByTestId('view-leaderboard').getAttribute('href')).toBe(`/leaderboard/${GAME}`);
  });

  it('after the reveal the score is shown out of the maximum (70) with correct/incorrect counts', async () => {
    const qs = questions().map((q) => ({ ...q, correct_option: 'A' }));
    const c = challenge({ answered: 7, questions: qs });
    c.game.status = 'completed';
    c.round.is_revealed = true;
    c.answers = qs.map((q, i) => ({ question_id: q.id, question_num: i + 1, selected_option: 'A', is_correct: i < 5 }));
    c.progress = { total: 7, answered: 7, is_completed: true, current_score: 50, max_score: 70 };
    svc.getChallengeByToken.mockResolvedValue(c);
    renderQuiz();
    expect(await screen.findByTestId('final-score')).toHaveTextContent('50 / 70');
    expect(screen.getByText(/5 Correct/)).toBeInTheDocument();
    expect(screen.getByText(/2 Incorrect/)).toBeInTheDocument();
  });

  it('cancelled game: old link shows cancelled and offers no questions', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge({ questions: [], closed_reason: 'cancelled', is_open: false, game: { id: GAME, name: 'G', status: 'cancelled', points_correct: 10 } }));
    renderQuiz();
    expect(await screen.findByTestId('challenge-cancelled')).toHaveTextContent(/cancelled/i);
    expect(screen.queryByTestId('submit-answer')).toBeNull();
  });

  it('paused game: banner shown and answering controls are hidden', async () => {
    svc.getChallengeByToken.mockResolvedValue(challenge({ closed_reason: 'paused', is_open: false }));
    renderQuiz();
    expect(await screen.findByTestId('challenge-paused')).toBeInTheDocument();
    expect(screen.queryByTestId('submit-answer')).toBeNull();
    expect(screen.getByTestId('option-A')).toBeDisabled();
  });

  it('invalid challenge token shows an error with retry', async () => {
    svc.getChallengeByToken.mockResolvedValue(null);
    renderQuiz();
    expect(await screen.findByTestId('challenge-error')).toHaveTextContent(/invalid, expired or the game was removed/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------

describe('LeaderboardPage', () => {
  const renderLb = () =>
    render(
      <MemoryRouter initialEntries={[`/leaderboard/${GAME}`]}>
        <Routes>
          <Route path="/leaderboard/:gameId" element={<LeaderboardPage />} />
        </Routes>
      </MemoryRouter>
    );
  const row = (id: string, name: string, pts: number, rank: number) => ({
    participant_id: id, display_name: name, player_code: name[0], total_points: pts, correct_answers: pts / 10, wrong_answers: 0, challenges_completed: 1, challenges_received: 1, average_points: pts, rank,
  });
  const noChallenge = (id: string, name: string, rank: number) => ({
    participant_id: id, display_name: name, player_code: name[0], total_points: 0, correct_answers: 0, wrong_answers: 0, challenges_completed: 0, challenges_received: 0, average_points: null, rank,
  });

  it('ranks by AVERAGE per challenge: shows avg + total + challenges, and marks players nobody challenged', async () => {
    svc.getLeaderboard.mockResolvedValue({
      game: { id: GAME, name: 'G', status: 'completed', is_final: true, ranking: 'average_per_challenge' },
      rows: [
        { ...row('1', 'Arun', 70, 1), average_points: 70 },                                   // 1 challenge, 70  -> avg 70
        { ...row('2', 'Amal', 120, 2), challenges_received: 2, average_points: 60 },           // 2 challenges, 120 -> avg 60
        noChallenge('3', 'Wade', 3),
      ],
    });
    renderLb();
    await screen.findByTestId('lb-mode');
    expect(screen.getByTestId('ranking-note')).toHaveTextContent('average points per challenge');
    expect(screen.getByTestId('avg-Arun')).toHaveTextContent('70');
    expect(screen.getByTestId('avg-Amal')).toHaveTextContent('60');
    expect(within(screen.getByTestId('lb-Arun')).getByText('#1')).toBeInTheDocument(); // fewer points in total, but higher average
    expect(within(screen.getByTestId('lb-Amal')).getByText('120 pts')).toBeInTheDocument();
    expect(screen.getByTestId('no-challenge-Wade')).toHaveTextContent('no challenge received');
    expect(screen.getByTestId('avg-Wade')).toHaveTextContent('–');
    expect(screen.getByTestId('champion')).toHaveTextContent('Arun');
    expect(screen.getByTestId('champion')).not.toHaveTextContent('Wade');
  });

  it('final board: ties share a rank, co-champions are announced', async () => {
    svc.getLeaderboard.mockResolvedValue({
      game: { id: GAME, name: 'G', status: 'completed', is_final: true },
      rows: [row('1', 'Amal', 120, 1), row('2', 'Arun', 120, 1), row('3', 'Rahul', 30, 3), row('4', 'Nikhil', 0, 4)],
    });
    renderLb();
    expect(await screen.findByTestId('lb-mode')).toHaveTextContent('FINAL RESULTS');
    expect(screen.getByTestId('champion')).toHaveTextContent(/CO-CHAMPIONS/);
    const t = screen.getByTestId('public-leaderboard');
    expect(within(within(t).getByTestId('lb-Amal')).getByText('#1')).toBeInTheDocument();
    expect(within(within(t).getByTestId('lb-Arun')).getByText('#1')).toBeInTheDocument();
    expect(within(within(t).getByTestId('lb-Rahul')).getByText('#3')).toBeInTheDocument();
    expect(within(within(t).getByTestId('lb-Nikhil')).getByText('#4')).toBeInTheDocument();
  });

  it('live board is labelled LIVE and explains it counts finished challenges only', async () => {
    svc.getLeaderboard.mockResolvedValue({ game: { id: GAME, name: 'G', status: 'active', is_final: false }, rows: [row('1', 'Amal', 70, 1)] });
    renderLb();
    expect(await screen.findByTestId('lb-mode')).toHaveTextContent('LIVE');
    expect(screen.getByText(/count finished challenges only/i)).toBeInTheDocument();
    expect(screen.queryByTestId('champion')).toBeNull();
  });

  it('unknown / removed game shows a clear message', async () => {
    svc.getLeaderboard.mockResolvedValue(null);
    renderLb();
    expect(await screen.findByTestId('leaderboard-error')).toHaveTextContent(/could not be found/i);
  });

  it('subscribes to live updates for this game only', async () => {
    svc.getLeaderboard.mockResolvedValue({ game: { id: GAME, name: 'G', status: 'active', is_final: false }, rows: [] });
    renderLb();
    await screen.findByTestId('lb-mode');
    expect(svc.subscribeToGameUpdates).toHaveBeenCalledWith(GAME, expect.any(Function), { mode: 'public' });
  });
});

// ---------------------------------------------------------------------------------------------

describe('AdminLoginPage', () => {
  const renderLogin = () => render(<MemoryRouter><AdminLoginPage /></MemoryRouter>);

  it('rejects wrong credentials with the server message and stays on the page', async () => {
    svc.loginAdmin.mockResolvedValue({ success: false, error: 'Invalid login credentials' });
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText('admin@example.com'), { target: { value: 'admin@x.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to dashboard/i }));
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    expect(svc.loginAdmin).toHaveBeenCalledWith('admin@x.com', 'wrong');
  });

  it('does not advertise a demo login or prefill an admin email', () => {
    renderLogin();
    expect(screen.queryByText(/any 6\+ char password/i)).toBeNull();
    expect(screen.queryByText(/Local Interactive Mode/i)).toBeNull();
    expect((screen.getByPlaceholderText('admin@example.com') as HTMLInputElement).value).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------

describe('admin helpers', () => {
  it('ConfirmDialog names what is being confirmed and wires both buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title='Delete "Friday Fun QA Test" permanently?' body={<p>Impact</p>} confirmLabel="Delete permanently" tone="danger" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete "Friday Fun QA Test" permanently?');
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-ok'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog disables both buttons while busy (no double confirm)', () => {
    render(<ConfirmDialog title="t" body="b" confirmLabel="Go" busy onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('confirm-ok')).toBeDisabled();
    expect(screen.getByTestId('confirm-cancel')).toBeDisabled();
  });

  it('status labels use the lifecycle names', () => {
    expect(statusLabel('active')).toBe('IN PROGRESS');
    expect(statusLabel('registration_open')).toBe('REGISTRATION OPEN');
    expect(statusLabel('paused')).toBe('PAUSED');
    expect(statusLabel('waiting_for_answers')).toBe('PAUSED');
  });

  it('leaderboard CSV escapes quotes/commas so names cannot corrupt (or inject into) the export', () => {
    const csv = leaderboardCsv([{ rank: 1, player_code: 'A', display_name: 'Arun "The Ace", Jr', total_points: 70, correct_answers: 7, wrong_answers: 0, challenges_received: 1, average_points: 70 }]);
    const [header, line] = csv.split('\n');
    expect(header).toBe('Rank,Player Code,Player Name,Score,Correct,Wrong,Challenges,Average');
    expect(line).toBe('1,"A","Arun ""The Ace"", Jr",70,7,0,1,70');
  });

  it('leaderboard CSV neutralises spreadsheet formula injection in names', () => {
    const csv = leaderboardCsv([{ rank: 1, player_code: 'X', display_name: '=HYPERLINK("http://evil","x")', total_points: 0, correct_answers: 0, wrong_answers: 0 }]);
    expect(csv.split('\n')[1]).toBe('1,"X","\'=HYPERLINK(""http://evil"",""x"")",0,0,0,,');
  });
});
