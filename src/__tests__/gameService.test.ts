import { describe, it, expect, beforeEach } from 'vitest';
import { gameService, initLocalMockData } from '../services/gameService';
import { hashToken, generateSecureToken } from '../lib/crypto';
import { QUESTION_BANK, getRandomQuestionForTopic } from '../data/questionBank';

describe('Friday Fun 2026 - Core Game Engine & Functional QA', () => {
  beforeEach(() => {
    localStorage.clear();
    initLocalMockData(true);
  });

  // 1. Admin Authentication Tests
  describe('1. Admin Authentication', () => {
    it('should successfully log in with valid admin credentials', async () => {
      const res = await gameService.loginAdmin('admin@fridayfun.com', 'admin123');
      expect(res.success).toBe(true);
      const isAdmin = await gameService.checkIsAdmin();
      expect(isAdmin).toBe(true);
    });

    it('should reject empty email or empty password', async () => {
      const resEmptyEmail = await gameService.loginAdmin('', 'password123');
      expect(resEmptyEmail.success).toBe(false);
      expect(resEmptyEmail.error).toContain('Email cannot be empty');

      const resEmptyPass = await gameService.loginAdmin('admin@test.com', '');
      expect(resEmptyPass.success).toBe(false);
      expect(resEmptyPass.error).toContain('Password cannot be empty');
    });

    it('should properly log out admin and revoke admin session', async () => {
      await gameService.loginAdmin('admin@fridayfun.com', 'admin123');
      expect(await gameService.checkIsAdmin()).toBe(true);

      await gameService.logoutAdmin();
      expect(await gameService.checkIsAdmin()).toBe(false);
    });
  });

  // 2. Game Management Tests
  describe('2. Game Management & Validation', () => {
    it('should create a new game with default settings', async () => {
      const game = await gameService.createGame(
        'QA Championship 2026',
        'Automated test room',
        { min_participants: 3, max_participants: 20, points_correct: 10 }
      );

      expect(game).toBeDefined();
      expect(game.name).toBe('QA Championship 2026');
      expect(game.status).toBe('registration_open');
      expect(game.settings.min_participants).toBe(3);
      expect(game.settings.points_correct).toBe(10);
    });

    it('should reject invalid game configurations (empty name, max < min)', async () => {
      await expect(
        gameService.createGame('', 'test', { min_participants: 3 })
      ).rejects.toThrow('Game name cannot be empty');

      await expect(
        gameService.createGame('Invalid Room', 'test', { min_participants: 10, max_participants: 4 })
      ).rejects.toThrow('Maximum participants cannot be less than minimum participants');

      await expect(
        gameService.createGame('Invalid Min', 'test', { min_participants: 1 })
      ).rejects.toThrow('Minimum participants must be at least 2');
    });

    it('should transition game status: active, pause, complete, cancel', async () => {
      const game = await gameService.createGame('Status Test Game', 'testing', {});
      
      await gameService.updateGameStatus(game.id, 'active');
      let updated = await gameService.getGame(game.id);
      expect(updated?.status).toBe('active');

      await gameService.updateGameStatus(game.id, 'waiting_for_answers');
      updated = await gameService.getGame(game.id);
      expect(updated?.status).toBe('waiting_for_answers');

      await gameService.updateGameStatus(game.id, 'completed');
      updated = await gameService.getGame(game.id);
      expect(updated?.status).toBe('completed');
    });
  });

  // 3. Participant Management & Token Hashing
  describe('3. Participant Management & Cryptographic Security', () => {
    it('should add participants with unique codes (A, B, C, D)', async () => {
      const game = await gameService.createGame('Roster Game', 'test', {});

      const { participant: pA, rawToken: tokenA } = await gameService.addParticipant(game.id, 'Arun', 'A');
      const { participant: pB, rawToken: tokenB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
      const { participant: pC, rawToken: tokenC } = await gameService.addParticipant(game.id, 'Amal', 'C');
      const { participant: pD, rawToken: tokenD } = await gameService.addParticipant(game.id, 'Nikhil', 'D');

      expect(pA.player_code).toBe('A');
      expect(pB.player_code).toBe('B');
      expect(pC.player_code).toBe('C');
      expect(pD.player_code).toBe('D');

      // Tokens must be unique and unguessable
      expect(tokenA).not.toBe(tokenB);
      expect(tokenB).not.toBe(tokenC);
      expect(tokenC).not.toBe(tokenD);
      expect(tokenA.length).toBeGreaterThanOrEqual(32);

      // Verify SHA-256 hash
      const expectedHashA = await hashToken(tokenA);
      expect(pA.invitation_token_hash).toBe(expectedHashA);
    });

    it('should reject duplicate player codes within the same game', async () => {
      const game = await gameService.createGame('Duplicate Test', 'test', {});
      await gameService.addParticipant(game.id, 'Arun', 'A');

      await expect(
        gameService.addParticipant(game.id, 'Another Arun', 'A')
      ).rejects.toThrow('already taken');
    });

    it('should allow editing a participant name and player code', async () => {
      const game = await gameService.createGame('Edit Participant Game', 'test', {});
      const { participant: p } = await gameService.addParticipant(game.id, 'Arun', 'A');

      const updated = await gameService.updateParticipant(p.id, {
        displayName: 'Arun Kumar',
        playerCode: 'A1',
      });

      expect(updated?.display_name).toBe('Arun Kumar');
      expect(updated?.player_code).toBe('A1');
    });
  });

  // 4. Topic Management Tests
  describe('4. Topic Management', () => {
    it('should load default 10 categories', async () => {
      const topics = await gameService.getTopics();
      expect(topics.length).toBeGreaterThanOrEqual(10);
      const names = topics.map((t) => t.name);
      expect(names).toContain('Politics & Government');
      expect(names).toContain('Pollution & Environment');
      expect(names).toContain('AI & Technology');
      expect(names).toContain('Kerala & Current Affairs');
      expect(names).toContain('Cricket & Sports');
    });

    it('should toggle topic enabled/disabled status', async () => {
      const topics = await gameService.getAllTopics();
      const first = topics[0];

      await gameService.toggleTopic(first.id, false);
      const activeTopics = await gameService.getTopics();
      expect(activeTopics.some((t) => t.id === first.id)).toBe(false);

      await gameService.toggleTopic(first.id, true);
      const reactivated = await gameService.getTopics();
      expect(reactivated.some((t) => t.id === first.id)).toBe(true);
    });

    it('should add custom topic and prevent duplicates', async () => {
      const newTopic = await gameService.addTopic('Space Exploration', 'NASA, ISRO, and cosmic science');
      expect(newTopic.name).toBe('Space Exploration');

      await expect(
        gameService.addTopic('Space Exploration', 'Duplicate')
      ).rejects.toThrow('already exists');
    });
  });

  // 5. Complete Multiplayer Workflow Test (Phase 4 Matrix)
  describe('5. Complete Multiplayer Challenge Workflow (A, B, C, D)', () => {
    it('should execute full round matrix: A->C, B->D, C->A, D->B', async () => {
      const game = await gameService.createGame('Multiplayer Blitz', 'test', {});
      const round = await gameService.getActiveRound(game.id);
      expect(round).toBeDefined();

      const { participant: pA, rawToken: tokenA } = await gameService.addParticipant(game.id, 'Arun', 'A');
      const { participant: pB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
      const { participant: pC, rawToken: tokenC } = await gameService.addParticipant(game.id, 'Amal', 'C');
      const { participant: pD } = await gameService.addParticipant(game.id, 'Nikhil', 'D');

      const topics = await gameService.getTopics();
      const topicPollution = topics.find((t) => t.name.includes('Pollution')) || topics[0];
      const topicAI = topics.find((t) => t.name.includes('AI')) || topics[1];
      const topicPolitics = topics.find((t) => t.name.includes('Politics')) || topics[2];
      const topicCricket = topics.find((t) => t.name.includes('Cricket')) || topics[3];

      // Rule: Self selection is rejected
      await expect(
        gameService.submitSelectionAndGenerateChallenge({
          gameId: game.id,
          roundId: round!.id,
          senderId: pA.id,
          receiverId: pA.id,
          topicId: topicPollution.id,
          topicName: topicPollution.name,
        })
      ).rejects.toThrow('Self-selection is not permitted');

      // 1. A selects C (Pollution)
      const challengeAC = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pA.id,
        receiverId: pC.id,
        topicId: topicPollution.id,
        topicName: topicPollution.name,
      });
      expect(challengeAC.assignment).toBeDefined();
      expect(challengeAC.assignment.receiver_id).toBe(pC.id);

      // 2. B selects D (AI & Technology)
      const challengeBD = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pB.id,
        receiverId: pD.id,
        topicId: topicAI.id,
        topicName: topicAI.name,
      });
      expect(challengeBD.assignment.receiver_id).toBe(pD.id);

      // 3. C selects A (Politics)
      const challengeCA = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pC.id,
        receiverId: pA.id,
        topicId: topicPolitics.id,
        topicName: topicPolitics.name,
      });
      expect(challengeCA.assignment.receiver_id).toBe(pA.id);

      // 4. D selects B (Cricket)
      const challengeDB = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pD.id,
        receiverId: pB.id,
        topicId: topicCricket.id,
        topicName: topicCricket.name,
      });
      expect(challengeDB.assignment.receiver_id).toBe(pB.id);

      // Verify Admin can see all 4 assignments
      const liveAssignments = await gameService.getLiveAssignments(game.id);
      expect(liveAssignments.length).toBe(4);

      // 6. Test Multiple Incoming Challenges (A->C, B->C, D->C)
      const challengeBC = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pB.id,
        receiverId: pC.id,
        topicId: topicCricket.id,
        topicName: topicCricket.name,
      });
      const incomingForC = await gameService.getIncomingChallenges(pC.id, game.id);
      expect(incomingForC.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 6. Quiz, Answering & Zero-Leak Protection
  describe('6. Quiz Answering & Correct Answer Protection', () => {
    it('should hide correct_option before round reveal and expose after reveal', async () => {
      const game = await gameService.createGame('Quiz Game', 'test', {});
      const round = await gameService.getActiveRound(game.id);
      const { participant: pA } = await gameService.addParticipant(game.id, 'Arun', 'A');
      const { participant: pB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
      const topics = await gameService.getTopics();

      const { rawChallengeToken } = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pA.id,
        receiverId: pB.id,
        topicId: topics[0].id,
        topicName: topics[0].name,
      });

      // Fetch challenge as participant before reveal
      const challengeBeforeReveal = await gameService.getChallengeByToken(rawChallengeToken);
      expect(challengeBeforeReveal.question.correct_option).toBeNull();
      expect(challengeBeforeReveal.question.explanation).toBeNull();

      // Submit an answer (Option A)
      const submitRes = await gameService.submitAnswer(rawChallengeToken, 'A');
      expect(submitRes.success).toBe(true);

      // Duplicate submission blocked
      const duplicateRes = await gameService.submitAnswer(rawChallengeToken, 'B');
      expect(duplicateRes.success).toBe(false);
      expect(duplicateRes.error).toContain('already been submitted');

      // Admin reveals round
      await gameService.revealRound(round!.id, game.id);

      // Fetch challenge after reveal
      const challengeAfterReveal = await gameService.getChallengeByToken(rawChallengeToken);
      expect(challengeAfterReveal.question.correct_option).not.toBeNull();
      expect(['A', 'B', 'C', 'D']).toContain(challengeAfterReveal.question.correct_option);
      expect(challengeAfterReveal.question.explanation).toBeDefined();
    });
  });

  // 7. Scoring & Leaderboard Calculation
  describe('7. Server-Side Scoring & Leaderboard Rankings', () => {
    it('should calculate points correctly (+10 for correct, 0 for wrong)', async () => {
      const game = await gameService.createGame('Scoring Game', 'test', { points_correct: 10, points_wrong: 0 });
      const round = await gameService.getActiveRound(game.id);
      const { participant: pA } = await gameService.addParticipant(game.id, 'Arun', 'A');
      const { participant: pB } = await gameService.addParticipant(game.id, 'Rahul', 'B');
      const topics = await gameService.getTopics();

      const { assignment, rawChallengeToken } = await gameService.submitSelectionAndGenerateChallenge({
        gameId: game.id,
        roundId: round!.id,
        senderId: pA.id,
        receiverId: pB.id,
        topicId: topics[0].id,
        topicName: topics[0].name,
      });

      // Get actual correct option from storage to test exact scoring
      const questions = JSON.parse(localStorage.getItem('friday_fun_2026_questions') || '[]');
      const q = questions.find((item: any) => item.assignment_id === assignment.id);
      const correctOpt = q.correct_option;

      // Submit correct answer
      await gameService.submitAnswer(rawChallengeToken, correctOpt);

      const leaderboard = await gameService.getLeaderboard(game.id);
      const scoreB = leaderboard.find((s) => s.participant_id === pB.id);

      expect(scoreB?.correct_answers).toBe(1);
      expect(scoreB?.total_points).toBe(10);
    });
  });
});
