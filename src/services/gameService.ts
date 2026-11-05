import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { generateSecureToken, hashToken } from '../lib/crypto';
import { generateQuestionForTopic } from './questionGenerator';
import {
  Game,
  GameSettings,
  Participant,
  Topic,
  GameRound,
  Assignment,
  Question,
  Answer,
  Score,
} from '../types';

// ============================================================================
// LOCAL STORAGE BACKUP FOR ZERO-CONFIG DEMO MODE
// (Automatically superseded whenever live Supabase credentials are configured)
// ============================================================================
const STORAGE_PREFIX = 'friday_fun_2026_';

function getLocal<T>(key: string, defaultValue: T): T {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

// Initial Mock Seed for Zero-Config Local Mode
function initLocalMockData() {
  if (getLocal('initialized', false)) return;

  const defaultTopics: Topic[] = [
    { id: 't1', name: 'Politics & Government', description: 'Elections, Indian Constitution, ministers, public policies, and democratic institutions.', icon: 'Landmark', is_active: true, created_at: new Date().toISOString() },
    { id: 't2', name: 'Pollution & Environment', description: 'Air, plastic, water pollution, climate change, waste management, and green energy.', icon: 'Leaf', is_active: true, created_at: new Date().toISOString() },
    { id: 't3', name: 'AI & Technology', description: 'Artificial intelligence, ChatGPT, robotics, cybersecurity, smartphones, and future tech.', icon: 'Cpu', is_active: true, created_at: new Date().toISOString() },
    { id: 't4', name: 'Social Media', description: 'Instagram, YouTube, WhatsApp, influencers, privacy, memes, and internet trends.', icon: 'Share2', is_active: true, created_at: new Date().toISOString() },
    { id: 't5', name: 'Kerala & Current Affairs', description: 'Kerala geography, history, culture, achievements, current events, and general knowledge.', icon: 'MapPin', is_active: true, created_at: new Date().toISOString() },
    { id: 't6', name: 'Cricket & Sports', description: 'Cricket, Football, Indian sports legends, Olympics, tournaments, and records.', icon: 'Trophy', is_active: true, created_at: new Date().toISOString() },
    { id: 't7', name: 'Movies & Entertainment', description: 'Malayalam and Indian cinema, legendary actors, directors, songs, and box office trivia.', icon: 'Film', is_active: true, created_at: new Date().toISOString() },
    { id: 't8', name: 'College & Office Life', description: 'College life, interviews, workplace culture, careers, campus stories, and office memes.', icon: 'Briefcase', is_active: true, created_at: new Date().toISOString() },
    { id: 't9', name: 'Money & Lifestyle', description: 'Personal finance, savings, online payments, banking, shopping, and everyday economics.', icon: 'Wallet', is_active: true, created_at: new Date().toISOString() },
    { id: 't10', name: 'Funny & Random', description: 'Friendship, unexpected twists, brain teasers, wacky logic puzzles, and hilarious trivia.', icon: 'Smile', is_active: true, created_at: new Date().toISOString() },
  ];

  const defaultGameId = 'game-demo-2026';
  const defaultGame: Game = {
    id: defaultGameId,
    name: 'Friday Team Blitz 2026',
    description: 'Weekly team challenge & multiple-choice battle!',
    game_date: new Date().toISOString().split('T')[0],
    status: 'active',
    settings: {
      min_participants: 3,
      max_participants: 30,
      questions_per_participant: 1,
      points_correct: 10,
      points_wrong: 0,
      difficulty_distribution: { easy: 40, medium: 40, hard: 20 },
      reveal_mode: 'admin_manual_or_all',
      allow_multiple_incoming: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const defaultRound: GameRound = {
    id: 'round-1',
    game_id: defaultGameId,
    round_number: 1,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  const samplePlayers: Participant[] = [
    { id: 'p1', game_id: defaultGameId, display_name: 'Arun', player_code: 'A', invitation_token_hash: 'hash_arun_123', raw_invitation_token: 'token_arun_123', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p2', game_id: defaultGameId, display_name: 'Rahul', player_code: 'B', invitation_token_hash: 'hash_rahul_456', raw_invitation_token: 'token_rahul_456', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p3', game_id: defaultGameId, display_name: 'Amal', player_code: 'C', invitation_token_hash: 'hash_amal_789', raw_invitation_token: 'token_amal_789', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p4', game_id: defaultGameId, display_name: 'Nikhil', player_code: 'D', invitation_token_hash: 'hash_nikhil_101', raw_invitation_token: 'token_nikhil_101', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p5', game_id: defaultGameId, display_name: 'Akhil', player_code: 'E', invitation_token_hash: 'hash_akhil_202', raw_invitation_token: 'token_akhil_202', status: 'pending', created_at: new Date().toISOString() },
  ];

  setLocal('topics', defaultTopics);
  setLocal('games', [defaultGame]);
  setLocal('rounds', [defaultRound]);
  setLocal('participants', samplePlayers);
  setLocal('assignments', []);
  setLocal('questions', []);
  setLocal('answers', []);
  setLocal('scores', []);
  setLocal('initialized', true);
}

initLocalMockData();

// ============================================================================
// GAME SERVICE IMPLEMENTATION
// ============================================================================

export const gameService = {
  // --- Admin Auth ---
  async checkIsAdmin(): Promise<boolean> {
    if (!isSupabaseConfigured) {
      // In local demo mode, check local storage admin session
      return getLocal<boolean>('is_admin_session', false);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    return Boolean(data);
  },

  async loginAdmin(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) {
      // Local demo mode credentials
      if (email.toLowerCase().includes('admin') || pass.length >= 6) {
        setLocal('is_admin_session', true);
        setLocal('admin_email', email);
        return { success: true };
      }
      return { success: false, error: 'Invalid password. Password must be at least 6 characters.' };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  async logoutAdmin(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setLocal('is_admin_session', false);
  },

  // --- Games ---
  async getGames(): Promise<Game[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) return data as Game[];
    }
    return getLocal<Game[]>('games', []);
  },

  async getGame(gameId: string): Promise<Game | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();
      if (!error && data) return data as Game;
    }
    const games = getLocal<Game[]>('games', []);
    return games.find((g) => g.id === gameId) || null;
  },

  async createGame(name: string, description: string, settings: Partial<GameSettings>): Promise<Game> {
    const fullSettings: GameSettings = {
      min_participants: 3,
      max_participants: 30,
      questions_per_participant: 1,
      points_correct: 10,
      points_wrong: 0,
      difficulty_distribution: { easy: 40, medium: 40, hard: 20 },
      reveal_mode: 'admin_manual_or_all',
      allow_multiple_incoming: true,
      ...settings,
    };

    if (isSupabaseConfigured) {
      const { data: user } = await supabase.auth.getUser();
      const { data: newGame, error } = await supabase
        .from('games')
        .insert({
          name,
          description,
          game_date: new Date().toISOString().split('T')[0],
          status: 'registration_open',
          settings: fullSettings,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (!error && newGame) {
        // Create initial Round 1
        await supabase.from('game_rounds').insert({
          game_id: newGame.id,
          round_number: 1,
          status: 'active',
        });
        return newGame as Game;
      }
    }

    // Local Mode
    const games = getLocal<Game[]>('games', []);
    const newGame: Game = {
      id: `game-${Date.now()}`,
      name,
      description,
      game_date: new Date().toISOString().split('T')[0],
      status: 'registration_open',
      settings: fullSettings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    games.unshift(newGame);
    setLocal('games', games);

    const rounds = getLocal<GameRound[]>('rounds', []);
    rounds.push({
      id: `round-${Date.now()}`,
      game_id: newGame.id,
      round_number: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    setLocal('rounds', rounds);

    return newGame;
  },

  async updateGameStatus(gameId: string, status: Game['status']): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase
        .from('games')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', gameId);
      return;
    }

    const games = getLocal<Game[]>('games', []);
    const idx = games.findIndex((g) => g.id === gameId);
    if (idx !== -1) {
      games[idx].status = status;
      games[idx].updated_at = new Date().toISOString();
      setLocal('games', games);
    }
  },

  // --- Topics ---
  async getTopics(): Promise<Topic[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('topics')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (data && data.length > 0) return data as Topic[];
    }
    return getLocal<Topic[]>('topics', []).filter((t) => t.is_active);
  },

  async getAllTopics(): Promise<Topic[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('topics').select('*').order('name');
      if (data && data.length > 0) return data as Topic[];
    }
    return getLocal<Topic[]>('topics', []);
  },

  async toggleTopic(topicId: string, isActive: boolean): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('topics').update({ is_active: isActive }).eq('id', topicId);
      return;
    }
    const topics = getLocal<Topic[]>('topics', []);
    const topic = topics.find((t) => t.id === topicId);
    if (topic) {
      topic.is_active = isActive;
      setLocal('topics', topics);
    }
  },

  async addTopic(name: string, description: string, icon: string = 'Sparkles'): Promise<Topic> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('topics')
        .insert({ name, description, icon, is_active: true })
        .select()
        .single();
      if (data) return data as Topic;
    }
    const topics = getLocal<Topic[]>('topics', []);
    const newTopic: Topic = {
      id: `topic-${Date.now()}`,
      name,
      description,
      icon,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    topics.push(newTopic);
    setLocal('topics', topics);
    return newTopic;
  },

  // --- Participants ---
  async getParticipants(gameId: string): Promise<Participant[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('participants')
        .select('*')
        .eq('game_id', gameId)
        .order('player_code', { ascending: true });
      if (data) {
        // Hydrate raw tokens from local token cache if admin previously generated them
        const tokenCache = getLocal<Record<string, string>>('token_cache', {});
        return data.map((p) => ({
          ...p,
          raw_invitation_token: tokenCache[p.id] || p.invitation_token_hash,
        })) as Participant[];
      }
    }
    const list = getLocal<Participant[]>('participants', []);
    return list.filter((p) => p.game_id === gameId);
  },

  async addParticipant(
    gameId: string,
    displayName: string,
    playerCode: string,
    emailOrContact?: string
  ): Promise<{ participant: Participant; rawToken: string }> {
    const rawToken = generateSecureToken(24);
    const tokenHash = await hashToken(rawToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('participants')
        .insert({
          game_id: gameId,
          display_name: displayName,
          player_code: playerCode.toUpperCase(),
          email_or_contact: emailOrContact,
          invitation_token_hash: tokenHash,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      // Cache raw token locally on admin device for convenient copy/whatsapp
      const tokenCache = getLocal<Record<string, string>>('token_cache', {});
      tokenCache[data.id] = rawToken;
      setLocal('token_cache', tokenCache);

      return {
        participant: { ...data, raw_invitation_token: rawToken } as Participant,
        rawToken,
      };
    }

    // Local mode
    const participants = getLocal<Participant[]>('participants', []);
    const newParticipant: Participant = {
      id: `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      game_id: gameId,
      display_name: displayName,
      player_code: playerCode.toUpperCase(),
      email_or_contact: emailOrContact,
      invitation_token_hash: tokenHash,
      raw_invitation_token: rawToken,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    participants.push(newParticipant);
    setLocal('participants', participants);

    const tokenCache = getLocal<Record<string, string>>('token_cache', {});
    tokenCache[newParticipant.id] = rawToken;
    setLocal('token_cache', tokenCache);

    return { participant: newParticipant, rawToken };
  },

  async removeParticipant(participantId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('participants').delete().eq('id', participantId);
      return;
    }
    let participants = getLocal<Participant[]>('participants', []);
    participants = participants.filter((p) => p.id !== participantId);
    setLocal('participants', participants);
  },

  // --- Rounds ---
  async getActiveRound(gameId: string): Promise<GameRound | null> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data as GameRound;
    }
    const rounds = getLocal<GameRound[]>('rounds', []);
    return rounds.find((r) => r.game_id === gameId) || null;
  },

  // --- Participant Flow & Joining ---
  async getParticipantByInvitationToken(
    gameId: string,
    rawToken: string
  ): Promise<{ participant: Participant; game: Game; hasSelected: boolean; existingAssignment?: Assignment } | null> {
    const tokenHash = await hashToken(rawToken);

    if (isSupabaseConfigured) {
      // Use secure RPC function
      const { data, error } = await supabase.rpc('get_participant_by_token', {
        p_token_hash: tokenHash,
      });

      if (!error && data && data.participant) {
        return {
          participant: data.participant as Participant,
          game: data.game as Game,
          hasSelected: Boolean(data.has_selected),
          existingAssignment: data.existing_assignment as Assignment,
        };
      }
    }

    // Local mode verification: match either hash or raw token
    const participants = getLocal<Participant[]>('participants', []);
    const p = participants.find(
      (item) =>
        item.game_id === gameId &&
        (item.invitation_token_hash === tokenHash || item.raw_invitation_token === rawToken)
    );

    if (!p) return null;

    if (p.status === 'pending') {
      p.status = 'joined';
      p.joined_at = new Date().toISOString();
      setLocal('participants', participants);
    }

    const games = getLocal<Game[]>('games', []);
    const game = games.find((g) => g.id === gameId) || {
      id: gameId,
      name: 'Friday Fun 2026',
      game_date: new Date().toISOString(),
      status: 'active',
      settings: {
        min_participants: 3,
        max_participants: 30,
        questions_per_participant: 1,
        points_correct: 10,
        points_wrong: 0,
        difficulty_distribution: { easy: 40, medium: 40, hard: 20 },
        reveal_mode: 'admin_manual_or_all',
        allow_multiple_incoming: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const assignments = getLocal<Assignment[]>('assignments', []);
    const existing = assignments.find((a) => a.sender_id === p.id && a.game_id === gameId);

    return {
      participant: p,
      game,
      hasSelected: Boolean(existing),
      existingAssignment: existing,
    };
  },

  // --- Participant Selection Flow & AI Question Generation ---
  async submitSelectionAndGenerateChallenge(params: {
    gameId: string;
    roundId: string;
    senderId: string;
    receiverId: string;
    topicId: string;
    topicName: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }): Promise<{ assignment: Assignment; rawChallengeToken: string }> {
    const { gameId, roundId, senderId, receiverId, topicId, topicName, difficulty = 'medium' } = params;

    if (senderId === receiverId) {
      throw new Error('Self-selection is not permitted. You must challenge another player.');
    }

    // 1. Generate Question via AI or verified Question Bank
    const generatedQ = await generateQuestionForTopic(topicName, difficulty);

    // 2. Generate secure challenge token and hash
    const rawChallengeToken = generateSecureToken(24);
    const challengeTokenHash = await hashToken(rawChallengeToken);

    if (isSupabaseConfigured) {
      // Insert Assignment
      const { data: assignmentData, error: assignError } = await supabase
        .from('assignments')
        .insert({
          game_id: gameId,
          round_id: roundId,
          sender_id: senderId,
          receiver_id: receiverId,
          topic_id: topicId,
          challenge_token_hash: challengeTokenHash,
          status: 'pending',
        })
        .select()
        .single();

      if (assignError) {
        throw new Error(`Assignment creation failed: ${assignError.message}`);
      }

      // Insert Question linked to assignment
      const { error: qError } = await supabase.from('questions').insert({
        assignment_id: assignmentData.id,
        topic_category: topicName,
        question_text: generatedQ.question,
        option_a: generatedQ.option_a,
        option_b: generatedQ.option_b,
        option_c: generatedQ.option_c,
        option_d: generatedQ.option_d,
        correct_option: generatedQ.correct_option,
        explanation: generatedQ.explanation,
        difficulty: generatedQ.difficulty || difficulty,
      });

      if (qError) {
        console.error('Question insertion error:', qError);
      }

      // Update sender status
      await supabase.from('participants').update({ status: 'selected' }).eq('id', senderId);

      // Cache raw challenge token on client for easy share link access
      const challengeCache = getLocal<Record<string, string>>('challenge_token_cache', {});
      challengeCache[assignmentData.id] = rawChallengeToken;
      setLocal('challenge_token_cache', challengeCache);

      return {
        assignment: { ...assignmentData, raw_challenge_token: rawChallengeToken } as Assignment,
        rawChallengeToken,
      };
    }

    // Local mode
    const assignments = getLocal<Assignment[]>('assignments', []);
    const questions = getLocal<Question[]>('questions', []);
    const participants = getLocal<Participant[]>('participants', []);

    const newAssignmentId = `assign-${Date.now()}`;
    const newAssignment: Assignment = {
      id: newAssignmentId,
      game_id: gameId,
      round_id: roundId,
      sender_id: senderId,
      receiver_id: receiverId,
      topic_id: topicId,
      challenge_token_hash: challengeTokenHash,
      raw_challenge_token: rawChallengeToken,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    assignments.push(newAssignment);
    setLocal('assignments', assignments);

    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      assignment_id: newAssignmentId,
      topic_category: topicName,
      question_text: generatedQ.question,
      option_a: generatedQ.option_a,
      option_b: generatedQ.option_b,
      option_c: generatedQ.option_c,
      option_d: generatedQ.option_d,
      correct_option: generatedQ.correct_option,
      explanation: generatedQ.explanation,
      difficulty: generatedQ.difficulty || difficulty,
      created_at: new Date().toISOString(),
    };
    questions.push(newQuestion);
    setLocal('questions', questions);

    // Update sender status
    const sender = participants.find((p) => p.id === senderId);
    if (sender) {
      sender.status = 'selected';
      setLocal('participants', participants);
    }

    const challengeCache = getLocal<Record<string, string>>('challenge_token_cache', {});
    challengeCache[newAssignmentId] = rawChallengeToken;
    setLocal('challenge_token_cache', challengeCache);

    return {
      assignment: newAssignment,
      rawChallengeToken,
    };
  },

  // --- Challenge & Quiz Flow ---
  async getChallengeByToken(rawChallengeToken: string): Promise<any | null> {
    const tokenHash = await hashToken(rawChallengeToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('get_challenge_by_token', {
        p_token_hash: tokenHash,
      });

      if (!error && data) {
        return data;
      }
    }

    // Local mode
    const assignments = getLocal<Assignment[]>('assignments', []);
    const questions = getLocal<Question[]>('questions', []);
    const participants = getLocal<Participant[]>('participants', []);
    const topics = getLocal<Topic[]>('topics', []);
    const rounds = getLocal<GameRound[]>('rounds', []);
    const games = getLocal<Game[]>('games', []);
    const answers = getLocal<Answer[]>('answers', []);

    const assignment = assignments.find(
      (a) => a.challenge_token_hash === tokenHash || a.raw_challenge_token === rawChallengeToken
    );

    if (!assignment) return null;

    if (assignment.status === 'pending') {
      assignment.status = 'opened';
      setLocal('assignments', assignments);
    }

    const game = games.find((g) => g.id === assignment.game_id);
    const round = rounds.find((r) => r.id === assignment.round_id);
    const sender = participants.find((p) => p.id === assignment.sender_id);
    const receiver = participants.find((p) => p.id === assignment.receiver_id);
    const topic = topics.find((t) => t.id === assignment.topic_id);
    const question = questions.find((q) => q.assignment_id === assignment.id);
    const userAnswer = answers.find((ans) => ans.assignment_id === assignment.id);

    const isRevealed = round?.status === 'revealed' || game?.status === 'completed';

    return {
      assignment,
      game,
      round: { ...round, is_revealed: isRevealed },
      sender,
      receiver,
      topic,
      question: question
        ? {
            id: question.id,
            topic_category: question.topic_category,
            question_text: question.question_text,
            option_a: question.option_a,
            option_b: question.option_b,
            option_c: question.option_c,
            option_d: question.option_d,
            difficulty: question.difficulty,
            correct_option: isRevealed ? question.correct_option : null,
            explanation: isRevealed ? question.explanation : null,
          }
        : null,
      user_answer: userAnswer
        ? {
            selected_option: userAnswer.selected_option,
            submitted_at: userAnswer.submitted_at,
            is_correct: isRevealed ? userAnswer.is_correct : null,
          }
        : null,
    };
  },

  async submitAnswer(rawChallengeToken: string, selectedOption: 'A' | 'B' | 'C' | 'D'): Promise<{ success: boolean; error?: string }> {
    const tokenHash = await hashToken(rawChallengeToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('submit_challenge_answer', {
        p_token_hash: tokenHash,
        p_selected_option: selectedOption,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    }

    // Local mode answer submission
    const assignments = getLocal<Assignment[]>('assignments', []);
    const questions = getLocal<Question[]>('questions', []);
    const answers = getLocal<Answer[]>('answers', []);
    const scores = getLocal<Score[]>('scores', []);

    const assignment = assignments.find(
      (a) => a.challenge_token_hash === tokenHash || a.raw_challenge_token === rawChallengeToken
    );

    if (!assignment) {
      return { success: false, error: 'Challenge not found.' };
    }

    if (assignment.status === 'submitted') {
      return { success: false, error: 'An answer has already been submitted for this challenge.' };
    }

    const question = questions.find((q) => q.assignment_id === assignment.id);
    if (!question) {
      return { success: false, error: 'Question data not found.' };
    }

    const isCorrect = question.correct_option === selectedOption;

    const newAnswer: Answer = {
      id: `ans-${Date.now()}`,
      assignment_id: assignment.id,
      question_id: question.id,
      participant_id: assignment.receiver_id,
      selected_option: selectedOption,
      is_correct: isCorrect,
      submitted_at: new Date().toISOString(),
    };
    answers.push(newAnswer);
    setLocal('answers', answers);

    assignment.status = 'submitted';
    setLocal('assignments', assignments);

    // Update or insert score
    let score = scores.find(
      (s) => s.game_id === assignment.game_id && s.participant_id === assignment.receiver_id
    );
    if (!score) {
      score = {
        id: `sc-${Date.now()}`,
        game_id: assignment.game_id,
        round_id: assignment.round_id,
        participant_id: assignment.receiver_id,
        correct_answers: 0,
        wrong_answers: 0,
        total_points: 0,
        updated_at: new Date().toISOString(),
      };
      scores.push(score);
    }

    if (isCorrect) {
      score.correct_answers += 1;
      score.total_points += 10;
    } else {
      score.wrong_answers += 1;
    }
    score.updated_at = new Date().toISOString();
    setLocal('scores', scores);

    return { success: true };
  },

  // --- Monitoring & Rounds ---
  async getLiveAssignments(gameId: string): Promise<Assignment[]> {
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('assignments')
        .select(`
          id,
          game_id,
          round_id,
          sender_id,
          receiver_id,
          topic_id,
          challenge_token_hash,
          status,
          created_at,
          sender:participants!assignments_sender_id_fkey(id, display_name, player_code),
          receiver:participants!assignments_receiver_id_fkey(id, display_name, player_code),
          topic:topics(id, name),
          question:questions(id, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty),
          answer:answers(selected_option, is_correct, submitted_at)
        `)
        .eq('game_id', gameId)
        .order('created_at', { ascending: false });

      if (data) {
        const tokenCache = getLocal<Record<string, string>>('challenge_token_cache', {});
        return data.map((item: any) => ({
          ...item,
          raw_challenge_token: tokenCache[item.id] || item.challenge_token_hash,
          sender: item.sender,
          receiver: item.receiver,
          topic: item.topic,
          question: item.question,
          answer: Array.isArray(item.answer) ? item.answer[0] : item.answer,
        })) as Assignment[];
      }
    }

    // Local mode
    const assignments = getLocal<Assignment[]>('assignments', []).filter((a) => a.game_id === gameId);
    const participants = getLocal<Participant[]>('participants', []);
    const topics = getLocal<Topic[]>('topics', []);
    const questions = getLocal<Question[]>('questions', []);
    const answers = getLocal<Answer[]>('answers', []);
    const tokenCache = getLocal<Record<string, string>>('challenge_token_cache', {});

    return assignments.map((a) => {
      const q = questions.find((item) => item.assignment_id === a.id);
      const ans = answers.find((item) => item.assignment_id === a.id);
      return {
        ...a,
        raw_challenge_token: tokenCache[a.id] || a.raw_challenge_token || a.challenge_token_hash,
        sender: participants.find((p) => p.id === a.sender_id),
        receiver: participants.find((p) => p.id === a.receiver_id),
        topic: topics.find((t) => t.id === a.topic_id),
        question: q,
        answer: ans,
      };
    });
  },

  async revealRound(roundId: string, gameId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.rpc('reveal_round_answers', { p_round_id: roundId });
      return;
    }

    const rounds = getLocal<GameRound[]>('rounds', []);
    const round = rounds.find((r) => r.id === roundId);
    if (round) {
      round.status = 'revealed';
      round.reveal_at = new Date().toISOString();
      setLocal('rounds', rounds);
    }

    const games = getLocal<Game[]>('games', []);
    const game = games.find((g) => g.id === gameId);
    if (game) {
      game.status = 'completed';
      setLocal('games', games);
    }
  },

  // --- Leaderboard ---
  async getLeaderboard(gameId: string): Promise<Score[]> {
    const participants = await this.getParticipants(gameId);

    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('scores')
        .select('*')
        .eq('game_id', gameId);

      const scoreMap = new Map<string, Score>();
      if (data) {
        data.forEach((s) => {
          scoreMap.set(s.participant_id, s as Score);
        });
      }

      // Ensure every participant is in leaderboard even with 0 points
      const result: Score[] = participants.map((p) => {
        const sc = scoreMap.get(p.id);
        return {
          id: sc?.id || `sc-${p.id}`,
          game_id: gameId,
          round_id: sc?.round_id || '',
          participant_id: p.id,
          correct_answers: sc?.correct_answers || 0,
          wrong_answers: sc?.wrong_answers || 0,
          total_points: sc?.total_points || 0,
          updated_at: sc?.updated_at || p.created_at,
          participant: p,
        };
      });

      return result.sort((a, b) => b.total_points - a.total_points || b.correct_answers - a.correct_answers);
    }

    // Local mode
    const scores = getLocal<Score[]>('scores', []).filter((s) => s.game_id === gameId);
    const scoreMap = new Map<string, Score>();
    scores.forEach((s) => scoreMap.set(s.participant_id, s));

    const result: Score[] = participants.map((p) => {
      const sc = scoreMap.get(p.id);
      return {
        id: sc?.id || `sc-${p.id}`,
        game_id: gameId,
        round_id: sc?.round_id || '',
        participant_id: p.id,
        correct_answers: sc?.correct_answers || 0,
        wrong_answers: sc?.wrong_answers || 0,
        total_points: sc?.total_points || 0,
        updated_at: sc?.updated_at || p.created_at,
        participant: p,
      };
    });

    return result.sort((a, b) => b.total_points - a.total_points || b.correct_answers - a.correct_answers);
  },

  // --- Realtime Subscriptions ---
  subscribeToGameUpdates(gameId: string, onUpdate: () => void) {
    if (!isSupabaseConfigured) {
      // Local mode polling interval for changes
      const interval = setInterval(onUpdate, 3000);
      return () => clearInterval(interval);
    }

    const channel = supabase
      .channel(`game_channel_${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `game_id=eq.${gameId}` }, () => {
        onUpdate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, () => {
        onUpdate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, () => {
        onUpdate();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds', filter: `game_id=eq.${gameId}` }, () => {
        onUpdate();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
