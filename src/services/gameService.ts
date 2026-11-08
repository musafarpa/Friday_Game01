import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { generateSecureToken, hashToken } from '../lib/crypto';
import { generateQuestionForTopic, generateQuestionSetForTopic } from './questionGenerator';
import {
  Game,
  GameSettings,
  GameStatus,
  Participant,
  Topic,
  GameRound,
  Assignment,
  Question,
  Answer,
  Score,
  PoolQuestion,
  GameTopicProgress,
} from '../types';

// ============================================================================
// LOCAL STORAGE BACKUP FOR ZERO-CONFIG DEMO MODE
// (Automatically superseded whenever live Supabase credentials are configured)
// ============================================================================
const STORAGE_PREFIX = 'friday_fun_2026_';
const memStorage = new Map<string, string>();

function getLocal<T>(key: string, defaultValue: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(STORAGE_PREFIX + key);
      return val ? JSON.parse(val) : defaultValue;
    }
    const val = memStorage.get(STORAGE_PREFIX + key);
    return val ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocal<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return;
    }
    memStorage.set(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

// Initial Mock Seed for Zero-Config Local Mode
export function initLocalMockData(force: boolean = false) {
  if (isSupabaseConfigured) {
    // When connected to real Supabase, ensure offline demo data is purged
    if (typeof localStorage !== 'undefined') {
      ['games', 'rounds', 'participants', 'assignments', 'questions', 'answers', 'scores', 'initialized'].forEach((k) => {
        try {
          localStorage.removeItem(STORAGE_PREFIX + k);
        } catch {}
      });
    }
    return;
  }

  if (!force && getLocal('initialized', false) && getLocal<any[]>('assignments', []).length > 0) return;

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
    { id: 'p1', game_id: defaultGameId, display_name: 'Arun', player_code: 'A', invitation_token_hash: 'hash_arun_123', raw_invitation_token: 'token_arun_123', status: 'selected', created_at: new Date().toISOString() },
    { id: 'p2', game_id: defaultGameId, display_name: 'Rahul', player_code: 'B', invitation_token_hash: 'hash_rahul_456', raw_invitation_token: 'token_rahul_456', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p3', game_id: defaultGameId, display_name: 'Amal', player_code: 'C', invitation_token_hash: 'hash_amal_789', raw_invitation_token: 'token_amal_789', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p4', game_id: defaultGameId, display_name: 'Nikhil', player_code: 'D', invitation_token_hash: 'hash_nikhil_101', raw_invitation_token: 'token_nikhil_101', status: 'joined', created_at: new Date().toISOString() },
    { id: 'p5', game_id: defaultGameId, display_name: 'Akhil', player_code: 'E', invitation_token_hash: 'hash_akhil_202', raw_invitation_token: 'token_akhil_202', status: 'pending', created_at: new Date().toISOString() },
  ];

  const sampleAssignment: Assignment = {
    id: 'assign-sample-1',
    game_id: defaultGameId,
    round_id: 'round-1',
    sender_id: 'p1',
    receiver_id: 'p3',
    topic_id: 't2',
    challenge_token_hash: 'hash_token_arun_challenge_sample',
    raw_challenge_token: 'token_arun_challenge_sample',
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const sampleQuestion: Question = {
    id: 'q-sample-1',
    assignment_id: 'assign-sample-1',
    topic_category: 'Pollution & Environment',
    question_text: 'Which gas is the primary contributor to the global greenhouse effect emitted through human activities?',
    option_a: 'Carbon Dioxide (CO2)',
    option_b: 'Oxygen (O2)',
    option_c: 'Nitrogen (N2)',
    option_d: 'Helium (He)',
    correct_option: 'A',
    explanation: 'Carbon dioxide is the primary greenhouse gas emitted through human activities such as burning fossil fuels.',
    difficulty: 'easy',
    created_at: new Date().toISOString(),
  };

  const sampleScores: Score[] = [
    { id: 's1', game_id: defaultGameId, round_id: 'round-1', participant_id: 'p3', total_points: 20, correct_answers: 2, wrong_answers: 1, updated_at: new Date().toISOString() },
    { id: 's2', game_id: defaultGameId, round_id: 'round-1', participant_id: 'p1', total_points: 10, correct_answers: 1, wrong_answers: 0, updated_at: new Date().toISOString() },
    { id: 's3', game_id: defaultGameId, round_id: 'round-1', participant_id: 'p2', total_points: 0, correct_answers: 0, wrong_answers: 0, updated_at: new Date().toISOString() },
    { id: 's4', game_id: defaultGameId, round_id: 'round-1', participant_id: 'p4', total_points: 0, correct_answers: 0, wrong_answers: 0, updated_at: new Date().toISOString() },
  ];

  setLocal('topics', defaultTopics);
  setLocal('games', [defaultGame]);
  setLocal('rounds', [defaultRound]);
  setLocal('participants', samplePlayers);
  setLocal('assignments', [sampleAssignment]);
  setLocal('questions', [sampleQuestion]);
  setLocal('answers', []);
  setLocal('scores', sampleScores);
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
      return getLocal<boolean>('is_admin_session', false);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Admin verification check error:', error);
      return false;
    }
    return Boolean(data);
  },

  async loginAdmin(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return { success: false, error: 'Email cannot be empty.' };
    }
    if (!pass) {
      return { success: false, error: 'Password cannot be empty.' };
    }

    if (!isSupabaseConfigured) {
      if (cleanEmail.toLowerCase().includes('admin') || pass.length >= 6) {
        setLocal('is_admin_session', true);
        setLocal('admin_email', cleanEmail);
        return { success: true };
      }
      return { success: false, error: 'Invalid password. Password must be at least 6 characters.' };
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: pass,
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    // Role verification: ensure user exists in public.admins
    const { data: adminRecord } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (!adminRecord) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access denied. Your account is authenticated, but not registered with Admin privileges in public.admins.',
      };
    }

    return { success: true };
  },

  async logoutAdmin(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setLocal('is_admin_session', false);
  },

  async resetAdminPassword(email: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return { success: false, error: 'Email cannot be empty.' };
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    return { success: true };
  },

  // --- Games ---
  async getGames(): Promise<Game[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to load games from Supabase: ${error.message}`);
      }
      return (data || []) as Game[];
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
      if (error) {
        throw new Error(`Failed to load game ${gameId} from Supabase: ${error.message}`);
      }
      return (data || null) as Game | null;
    }
    const games = getLocal<Game[]>('games', []);
    return games.find((g) => g.id === gameId) || null;
  },

  async createGame(
    name: string,
    description: string,
    settings: Partial<GameSettings>,
    initialStatus: GameStatus = 'registration_open',
    selectedTopicIds?: string[]
  ): Promise<Game> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Game name cannot be empty.');
    }

    const minPart = settings.min_participants ?? 3;
    const maxPart = settings.max_participants ?? 30;

    if (minPart < 2) {
      throw new Error('Minimum participants must be at least 2.');
    }
    if (maxPart < minPart) {
      throw new Error('Maximum participants cannot be less than minimum participants.');
    }

    const targetTopicIds = selectedTopicIds || settings.selected_topics || [];

    const fullSettings: GameSettings = {
      min_participants: minPart,
      max_participants: maxPart,
      questions_per_participant: settings.questions_per_participant ?? 1,
      points_correct: settings.points_correct ?? 10,
      points_wrong: settings.points_wrong ?? 0,
      difficulty_distribution: settings.difficulty_distribution ?? { easy: 40, medium: 40, hard: 20 },
      reveal_mode: settings.reveal_mode ?? 'admin_manual_or_all',
      allow_multiple_incoming: settings.allow_multiple_incoming ?? true,
      min_questions_per_topic: settings.min_questions_per_topic ?? 7,
      selected_topics: targetTopicIds,
      topics_question_pool: settings.topics_question_pool || {},
      ...settings,
    };

    if (isSupabaseConfigured) {
      const { data: user } = await supabase.auth.getUser();
      const { data: newGame, error } = await supabase
        .from('games')
        .insert({
          name: cleanName,
          description: description?.trim() || '',
          game_date: new Date().toISOString().split('T')[0],
          status: initialStatus,
          settings: fullSettings,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create game in Supabase: ${error.message}`);
      }

      // Record selected topics in game_topics
      if (targetTopicIds.length > 0) {
        try {
          await supabase.from('game_topics').insert(
            targetTopicIds.map((tid) => ({
              game_id: newGame.id,
              topic_id: tid,
            }))
          );
        } catch (e) {
          console.warn('Notice: game_topics insert error:', e);
        }
      }

      // Create initial Round 1
      const { error: roundError } = await supabase.from('game_rounds').insert({
        game_id: newGame.id,
        round_number: 1,
        status: 'active',
      });
      if (roundError) {
        console.error('Initial round creation error:', roundError);
      }
      return newGame as Game;
    }

    // Local Mode
    const games = getLocal<Game[]>('games', []);
    const newGame: Game = {
      id: `game-${Date.now()}`,
      name: cleanName,
      description: description?.trim() || '',
      game_date: new Date().toISOString().split('T')[0],
      status: initialStatus,
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

  async updateGame(gameId: string, updates: Partial<Game>): Promise<Game | null> {
    if (updates.name && !updates.name.trim()) {
      throw new Error('Game name cannot be empty.');
    }

    if (updates.settings) {
      if (updates.settings.min_participants && updates.settings.min_participants < 2) {
        throw new Error('Minimum participants must be at least 2.');
      }
      if (
        updates.settings.min_participants &&
        updates.settings.max_participants &&
        updates.settings.max_participants < updates.settings.min_participants
      ) {
        throw new Error('Maximum participants cannot be less than minimum participants.');
      }
    }

    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('games')
        .update(payload)
        .eq('id', gameId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update game in Supabase: ${error.message}`);
      }
      return data as Game;
    }

    const games = getLocal<Game[]>('games', []);
    const idx = games.findIndex((g) => g.id === gameId);
    if (idx !== -1) {
      games[idx] = { ...games[idx], ...payload };
      setLocal('games', games);
      return games[idx];
    }
    return null;
  },

  async updateGameStatus(gameId: string, status: GameStatus): Promise<void> {
    if (status === 'active' || status === 'waiting_for_answers') {
      const readiness = await this.checkGameReadyToStart(gameId);
      if (!readiness.ready) {
        throw new Error(
          readiness.reason ||
            'Cannot start game: All selected topics must have at least 7 verified questions.'
        );
      }
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('games')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', gameId);
      if (error) {
        throw new Error(`Failed to update game status in Supabase: ${error.message}`);
      }
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

  async deleteGame(gameId: string): Promise<void> {
    if (isSupabaseConfigured) {
      // Use RPC delete_game_room if present, otherwise direct delete
      const { error } = await supabase.rpc('delete_game_room', { p_game_id: gameId });
      if (error) {
        const { error: directError } = await supabase.from('games').delete().eq('id', gameId);
        if (directError) {
          throw new Error(`Failed to delete game room from Supabase: ${directError.message}`);
        }
      }
      return;
    }
    let games = getLocal<Game[]>('games', []);
    games = games.filter((g) => g.id !== gameId);
    setLocal('games', games);
  },

  async cleanupCompletedGames(): Promise<{ cleaned_count: number }> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('cleanup_completed_games');
      if (error) {
        throw new Error(`Failed to execute completed game cleanup: ${error.message}`);
      }
      return data || { cleaned_count: 0 };
    }
    return { cleaned_count: 0 };
  },

  // --- Topics ---
  async getTopics(): Promise<Topic[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) {
        throw new Error(`Failed to load topics from Supabase: ${error.message}`);
      }
      return (data || []) as Topic[];
    }
    let local = getLocal<Topic[]>('topics', []);
    if (local.length === 0) {
      initLocalMockData(true);
      local = getLocal<Topic[]>('topics', []);
    }
    return local.filter((t) => t.is_active);
  },

  async getAllTopics(): Promise<Topic[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('topics').select('*').order('name');
      if (error) {
        throw new Error(`Failed to load all topics from Supabase: ${error.message}`);
      }
      return (data || []) as Topic[];
    }
    let local = getLocal<Topic[]>('topics', []);
    if (local.length === 0) {
      initLocalMockData(true);
      local = getLocal<Topic[]>('topics', []);
    }
    return local;
  },

  async toggleTopic(topicId: string, isActive: boolean): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('topics').update({ is_active: isActive }).eq('id', topicId);
      if (error) {
        throw new Error(`Failed to toggle topic in Supabase: ${error.message}`);
      }
      return;
    }
    const topics = getLocal<Topic[]>('topics', []);
    const topic = topics.find((t) => t.id === topicId);
    if (topic) {
      topic.is_active = isActive;
      setLocal('topics', topics);
    }
  },

  // --- Game Topics & Question Pool Management (Minimum 7 Questions Per Topic) ---
  async setGameTopics(gameId: string, topicIds: string[]): Promise<void> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error(`Game ${gameId} not found.`);

    const updatedSettings: GameSettings = {
      ...game.settings,
      selected_topics: topicIds,
    };
    await this.updateGame(gameId, { settings: updatedSettings });

    if (isSupabaseConfigured) {
      try {
        await supabase.from('game_topics').delete().eq('game_id', gameId);
        if (topicIds.length > 0) {
          await supabase.from('game_topics').insert(
            topicIds.map((tid) => ({
              game_id: gameId,
              topic_id: tid,
            }))
          );
        }
      } catch (err) {
        console.warn('game_topics sync warning:', err);
      }
    }
  },

  async getGameTopics(gameId: string): Promise<Topic[]> {
    const allTopics = await this.getAllTopics();
    const game = await this.getGame(gameId);
    if (!game) return allTopics.filter((t) => t.is_active);

    const selectedIds = game.settings?.selected_topics;
    if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
      return allTopics.filter((t) => selectedIds.includes(t.id));
    }

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('game_topics').select('topic_id').eq('game_id', gameId);
        if (data && data.length > 0) {
          const ids = data.map((d: any) => d.topic_id);
          return allTopics.filter((t) => ids.includes(t.id));
        }
      } catch {
        // Fallback
      }
    }

    return allTopics.filter((t) => t.is_active);
  },

  async generateQuestionPoolForGame(
    gameId: string,
    topicIds?: string[],
    countPerTopic: number = 7,
    onProgress?: (progress: GameTopicProgress[]) => void
  ): Promise<{ success: boolean; progress: GameTopicProgress[] }> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error(`Game ${gameId} not found.`);

    const allTopics = await this.getAllTopics();
    let targetTopicIds = topicIds || game.settings?.selected_topics || [];
    if (targetTopicIds.length === 0) {
      targetTopicIds = allTopics.filter((t) => t.is_active).map((t) => t.id);
    }

    const selectedTopics = allTopics.filter((t) => targetTopicIds.includes(t.id));
    if (selectedTopics.length === 0) {
      throw new Error('No valid topics selected for this game.');
    }

    const pool: Record<
      string,
      {
        topic_id?: string;
        topic_name: string;
        questions: PoolQuestion[];
        status: 'pending' | 'generating' | 'complete' | 'incomplete' | 'failed';
        error?: string;
      }
    > = { ...(game.settings?.topics_question_pool || {}) };

    const progressList: GameTopicProgress[] = selectedTopics.map((t) => {
      const existing = pool[t.id];
      const qCount = existing?.questions?.length || 0;
      return {
        topic_id: t.id,
        topic_name: t.name,
        required_count: countPerTopic,
        current_count: qCount,
        status: qCount >= countPerTopic ? 'complete' : 'pending',
        difficulty_counts: {
          easy: existing?.questions?.filter((q) => q.difficulty === 'easy').length || 0,
          medium: existing?.questions?.filter((q) => q.difficulty === 'medium').length || 0,
          hard: existing?.questions?.filter((q) => q.difficulty === 'hard').length || 0,
        },
      };
    });

    if (onProgress) onProgress([...progressList]);

    for (let i = 0; i < selectedTopics.length; i++) {
      const t = selectedTopics[i];
      progressList[i].status = 'generating';
      if (onProgress) onProgress([...progressList]);

      try {
        const existingQuestions = pool[t.id]?.questions || [];
        const excludeTexts = existingQuestions.map((q) => q.question_text);
        const neededCount = Math.max(0, countPerTopic - existingQuestions.length);
        let newQuestions: PoolQuestion[] = [];

        if (neededCount > 0) {
          const currentEasy = existingQuestions.filter((q) => q.difficulty === 'easy').length;
          const currentMed = existingQuestions.filter((q) => q.difficulty === 'medium').length;
          const currentHard = existingQuestions.filter((q) => q.difficulty === 'hard').length;

          const genDistribution = {
            easy: Math.max(0, 3 - currentEasy),
            medium: Math.max(0, 3 - currentMed),
            hard: Math.max(0, 1 - currentHard),
          };

          const generated = await generateQuestionSetForTopic(
            t.name,
            neededCount,
            genDistribution,
            excludeTexts
          );

          newQuestions = generated.map((g) => ({
            topic_id: t.id,
            topic_category: t.name,
            question_text: g.question,
            option_a: g.option_a,
            option_b: g.option_b,
            option_c: g.option_c,
            option_d: g.option_d,
            correct_option: g.correct_option,
            explanation: g.explanation,
            difficulty: g.difficulty,
            is_used: false,
            source: g.source,
            created_at: new Date().toISOString(),
          }));
        }

        const combinedQuestions = [...existingQuestions, ...newQuestions];
        const isComplete = combinedQuestions.length >= countPerTopic;
        pool[t.id] = {
          topic_id: t.id,
          topic_name: t.name,
          questions: combinedQuestions,
          status: isComplete ? 'complete' : 'incomplete',
        };

        // Try RPC to save in Supabase questions table if available
        if (isSupabaseConfigured) {
          for (const q of newQuestions) {
            try {
              await supabase.rpc('save_game_question', {
                p_game_id: gameId,
                p_topic_id: t.id,
                p_topic_category: t.name,
                p_question_text: q.question_text,
                p_option_a: q.option_a,
                p_option_b: q.option_b,
                p_option_c: q.option_c,
                p_option_d: q.option_d,
                p_correct_option: q.correct_option,
                p_explanation: q.explanation,
                p_difficulty: q.difficulty,
              });
            } catch {
              // Graceful RPC fallback
            }
          }
        }

        progressList[i].current_count = combinedQuestions.length;
        progressList[i].status = isComplete ? 'complete' : 'incomplete';
        progressList[i].difficulty_counts = {
          easy: combinedQuestions.filter((q) => q.difficulty === 'easy').length,
          medium: combinedQuestions.filter((q) => q.difficulty === 'medium').length,
          hard: combinedQuestions.filter((q) => q.difficulty === 'hard').length,
        };
      } catch (err: any) {
        progressList[i].status = 'failed';
        progressList[i].error = err.message || 'Generation failed';
        pool[t.id] = {
          topic_id: t.id,
          topic_name: t.name,
          questions: pool[t.id]?.questions || [],
          status: 'failed',
          error: err.message,
        };
      }

      if (onProgress) onProgress([...progressList]);
    }

    const updatedSettings: GameSettings = {
      ...game.settings,
      min_questions_per_topic: countPerTopic,
      selected_topics: targetTopicIds,
      topics_question_pool: pool,
    };
    await this.updateGame(gameId, { settings: updatedSettings });

    const allComplete = progressList.every(
      (p) => p.current_count >= countPerTopic && p.status === 'complete'
    );
    return {
      success: allComplete,
      progress: progressList,
    };
  },

  async getGameTopicProgress(gameId: string): Promise<GameTopicProgress[]> {
    const game = await this.getGame(gameId);
    if (!game) return [];

    const allTopics = await this.getAllTopics();
    let selectedTopicIds = game.settings?.selected_topics;
    if (!selectedTopicIds || selectedTopicIds.length === 0) {
      selectedTopicIds = allTopics.filter((t) => t.is_active).map((t) => t.id);
    }

    const selectedTopics = allTopics.filter((t) => selectedTopicIds!.includes(t.id));
    const pool = game.settings?.topics_question_pool || {};
    const requiredCount = game.settings?.min_questions_per_topic ?? 7;

    return selectedTopics.map((t) => {
      const entry = pool[t.id];
      const questions = entry?.questions || [];
      const count = questions.length;
      let status: 'pending' | 'generating' | 'complete' | 'incomplete' | 'failed' = entry?.status || 'pending';
      if (count >= requiredCount) {
        status = 'complete';
      } else if (count > 0 && status !== 'failed') {
        status = 'incomplete';
      }

      return {
        topic_id: t.id,
        topic_name: t.name,
        required_count: requiredCount,
        current_count: count,
        status,
        difficulty_counts: {
          easy: questions.filter((q) => q.difficulty === 'easy').length,
          medium: questions.filter((q) => q.difficulty === 'medium').length,
          hard: questions.filter((q) => q.difficulty === 'hard').length,
        },
        error: entry?.error,
      };
    });
  },

  async retryTopicQuestionGeneration(gameId: string, topicId: string): Promise<GameTopicProgress> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error(`Game ${gameId} not found.`);

    const allTopics = await this.getAllTopics();
    const topic = allTopics.find((t) => t.id === topicId);
    if (!topic) throw new Error(`Topic ${topicId} not found.`);

    const pool = { ...(game.settings?.topics_question_pool || {}) };
    const existingQuestions = pool[topicId]?.questions || [];
    const requiredCount = game.settings?.min_questions_per_topic ?? 7;

    const currentEasy = existingQuestions.filter((q) => q.difficulty === 'easy').length;
    const currentMed = existingQuestions.filter((q) => q.difficulty === 'medium').length;
    const currentHard = existingQuestions.filter((q) => q.difficulty === 'hard').length;

    const neededCount = Math.max(0, requiredCount - existingQuestions.length);
    const genDistribution = {
      easy: Math.max(0, 3 - currentEasy),
      medium: Math.max(0, 3 - currentMed),
      hard: Math.max(0, 1 - currentHard),
    };

    const excludeTexts = existingQuestions.map((q) => q.question_text);

    const generated = await generateQuestionSetForTopic(
      topic.name,
      neededCount > 0 ? neededCount : requiredCount,
      genDistribution,
      excludeTexts
    );

    const newQuestions: PoolQuestion[] = generated.map((g) => ({
      topic_id: topic.id,
      topic_category: topic.name,
      question_text: g.question,
      option_a: g.option_a,
      option_b: g.option_b,
      option_c: g.option_c,
      option_d: g.option_d,
      correct_option: g.correct_option,
      explanation: g.explanation,
      difficulty: g.difficulty,
      is_used: false,
      source: g.source,
      created_at: new Date().toISOString(),
    }));

    const combined = [...existingQuestions, ...newQuestions];
    pool[topicId] = {
      topic_id: topic.id,
      topic_name: topic.name,
      questions: combined,
      status: combined.length >= requiredCount ? 'complete' : 'incomplete',
    };

    const updatedSettings: GameSettings = {
      ...game.settings,
      topics_question_pool: pool,
    };
    await this.updateGame(gameId, { settings: updatedSettings });

    return {
      topic_id: topic.id,
      topic_name: topic.name,
      required_count: requiredCount,
      current_count: combined.length,
      status: combined.length >= requiredCount ? 'complete' : 'incomplete',
      difficulty_counts: {
        easy: combined.filter((q) => q.difficulty === 'easy').length,
        medium: combined.filter((q) => q.difficulty === 'medium').length,
        hard: combined.filter((q) => q.difficulty === 'hard').length,
      },
    };
  },

  async checkGameReadyToStart(
    gameId: string
  ): Promise<{ ready: boolean; reason?: string; progress: GameTopicProgress[] }> {
    if (isSupabaseConfigured) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('check_game_ready_to_start', {
          p_game_id: gameId,
        });
        if (!rpcErr && rpcData && typeof rpcData.ready === 'boolean') {
          const progress = await this.getGameTopicProgress(gameId);
          return {
            ready: rpcData.ready,
            reason: rpcData.ready
              ? undefined
              : `Incomplete topics: ${(rpcData.incomplete_topics || []).join(', ')}. Each topic requires at least 7 questions.`,
            progress,
          };
        }
      } catch {
        // Fallback to pool inspection
      }
    }

    const progress = await this.getGameTopicProgress(gameId);
    if (progress.length === 0) {
      return {
        ready: false,
        reason: 'No topics have been configured for this game room.',
        progress,
      };
    }

    const incomplete = progress.filter((p) => p.current_count < p.required_count);
    if (incomplete.length > 0) {
      return {
        ready: false,
        reason: `Cannot start game: ${incomplete.length} topic(s) (${incomplete
          .map((i) => `${i.topic_name}: ${i.current_count}/${i.required_count}`)
          .join(', ')}) do not have the required minimum 7 questions.`,
        progress,
      };
    }

    return {
      ready: true,
      progress,
    };
  },

  async addTopic(name: string, description: string, icon: string = 'Sparkles'): Promise<Topic> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Topic category name cannot be empty.');
    }

    const existing = await this.getAllTopics();
    if (existing.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`Topic "${cleanName}" already exists.`);
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('topics')
        .insert({ name: cleanName, description: description?.trim() || '', icon, is_active: true })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to add topic in Supabase: ${error.message}`);
      }
      return data as Topic;
    }
    const topics = getLocal<Topic[]>('topics', []);
    const newTopic: Topic = {
      id: `topic-${Date.now()}`,
      name: cleanName,
      description: description?.trim() || '',
      icon,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    topics.push(newTopic);
    setLocal('topics', topics);
    return newTopic;
  },

  async editTopic(topicId: string, name: string, description: string): Promise<Topic | null> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Topic category name cannot be empty.');
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('topics')
        .update({ name: cleanName, description: description.trim() })
        .eq('id', topicId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update topic in Supabase: ${error.message}`);
      }
      return data as Topic;
    }

    const topics = getLocal<Topic[]>('topics', []);
    const t = topics.find((item) => item.id === topicId);
    if (t) {
      t.name = cleanName;
      t.description = description.trim();
      setLocal('topics', topics);
      return t;
    }
    return null;
  },

  async deleteTopic(topicId: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('topics').delete().eq('id', topicId);
      if (error) {
        throw new Error(`Failed to delete topic in Supabase: ${error.message}`);
      }
      return;
    }
    let topics = getLocal<Topic[]>('topics', []);
    topics = topics.filter((t) => t.id !== topicId);
    setLocal('topics', topics);
  },

  // --- Participants ---
  async getParticipants(gameId: string): Promise<Participant[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('game_id', gameId)
        .order('player_code', { ascending: true });
      if (error) {
        throw new Error(`Failed to fetch participants from Supabase: ${error.message}`);
      }
      const tokenCache = getLocal<Record<string, string>>('token_cache', {});
      return (data || []).map((p) => ({
        ...p,
        raw_invitation_token: tokenCache[p.id] || p.invitation_token_hash,
      })) as Participant[];
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
    const cleanName = displayName.trim();
    const cleanCode = playerCode.trim().toUpperCase();

    if (!cleanName) {
      throw new Error('Participant name cannot be empty.');
    }
    if (!cleanCode) {
      throw new Error('Player code cannot be empty.');
    }

    const existing = await this.getParticipants(gameId);
    if (existing.some((p) => p.player_code.toUpperCase() === cleanCode)) {
      throw new Error(`Player Code "${cleanCode}" is already taken in this game.`);
    }
    if (existing.some((p) => p.display_name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`A participant named "${cleanName}" already exists in this game.`);
    }

    const rawToken = generateSecureToken(24);
    const tokenHash = await hashToken(rawToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('participants')
        .insert({
          game_id: gameId,
          display_name: cleanName,
          player_code: cleanCode,
          email_or_contact: emailOrContact?.trim() || null,
          invitation_token_hash: tokenHash,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

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
      display_name: cleanName,
      player_code: cleanCode,
      email_or_contact: emailOrContact?.trim(),
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

  async updateParticipant(
    participantId: string,
    updates: { displayName?: string; playerCode?: string; emailOrContact?: string }
  ): Promise<Participant | null> {
    if (isSupabaseConfigured) {
      const payload: any = {};
      if (updates.displayName) payload.display_name = updates.displayName.trim();
      if (updates.playerCode) payload.player_code = updates.playerCode.trim().toUpperCase();
      if (updates.emailOrContact !== undefined) payload.email_or_contact = updates.emailOrContact.trim();

      const { data, error } = await supabase
        .from('participants')
        .update(payload)
        .eq('id', participantId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update participant in Supabase: ${error.message}`);
      }
      return data as Participant;
    }

    const participants = getLocal<Participant[]>('participants', []);
    const target = participants.find((p) => p.id === participantId);
    if (!target) return null;

    if (updates.displayName) target.display_name = updates.displayName.trim();
    if (updates.playerCode) target.player_code = updates.playerCode.trim().toUpperCase();
    if (updates.emailOrContact !== undefined) target.email_or_contact = updates.emailOrContact.trim();

    setLocal('participants', participants);
    return target;
  },

  async removeParticipant(participantId: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('participants').delete().eq('id', participantId);
      if (error) {
        throw new Error(`Failed to remove participant from Supabase: ${error.message}`);
      }
      return;
    }
    let participants = getLocal<Participant[]>('participants', []);
    participants = participants.filter((p) => p.id !== participantId);
    setLocal('participants', participants);
  },

  // --- Rounds ---
  async getActiveRound(gameId: string): Promise<GameRound | null> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('game_rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to fetch active round from Supabase: ${error.message}`);
      }
      return (data || null) as GameRound | null;
    }
    const rounds = getLocal<GameRound[]>('rounds', []);
    return rounds.find((r) => r.game_id === gameId) || null;
  },

  async closeRoundManually(roundId: string, gameId: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('game_rounds')
        .update({ status: 'closed' })
        .eq('id', roundId);
      if (error) {
        throw new Error(`Failed to close round in Supabase: ${error.message}`);
      }
      return;
    }
    const rounds = getLocal<GameRound[]>('rounds', []);
    const round = rounds.find((r) => r.id === roundId);
    if (round) {
      round.status = 'closed';
      setLocal('rounds', rounds);
    }
  },

  // --- Incoming Challenges For Participant ---
  async getIncomingChallenges(receiverParticipantId: string, gameId: string): Promise<any[]> {
    const assignments = await this.getLiveAssignments(gameId);
    return assignments.filter((a) => a.receiver_id === receiverParticipantId);
  },

  // --- Participant Flow & Joining ---
  async getParticipantByInvitationToken(
    gameId: string,
    rawToken: string
  ): Promise<{
    participant: Participant;
    game: Game;
    hasSelected: boolean;
    existingAssignment?: Assignment;
    incomingChallenges: any[];
  } | null> {
    const tokenHash = await hashToken(rawToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('get_participant_by_token', {
        p_token_hash: tokenHash,
      });

      if (error) {
        throw new Error(`Invitation lookup error from Supabase: ${error.message}`);
      }

      if (data && data.participant) {
        const incoming = await this.getIncomingChallenges(data.participant.id, gameId);
        return {
          participant: data.participant as Participant,
          game: data.game as Game,
          hasSelected: Boolean(data.has_selected),
          existingAssignment: data.existing_assignment as Assignment,
          incomingChallenges: incoming,
        };
      }
      return null;
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
    const incoming = await this.getIncomingChallenges(p.id, gameId);

    return {
      participant: p,
      game,
      hasSelected: Boolean(existing),
      existingAssignment: existing,
      incomingChallenges: incoming,
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

    // 1. Generate or retrieve a full 7-question set with distribution: 3 Easy, 3 Medium, 1 Hard
    let questionsSet: any[] = [];
    try {
      const game = await this.getGame(gameId);
      if (game?.settings?.topics_question_pool) {
        const poolEntry =
          game.settings.topics_question_pool[topicId] ||
          Object.values(game.settings.topics_question_pool).find(
            (p) => p.topic_name.toLowerCase().trim() === topicName.toLowerCase().trim()
          );

        if (poolEntry && poolEntry.questions && poolEntry.questions.length > 0) {
          const unusedPool = poolEntry.questions.filter((q) => !q.is_used);
          if (unusedPool.length >= 7) {
            questionsSet = unusedPool.slice(0, 7).map((q, idx) => {
              q.is_used = true;
              return {
                topic: q.topic_category || topicName,
                question: q.question_text,
                option_a: q.option_a,
                option_b: q.option_b,
                option_c: q.option_c,
                option_d: q.option_d,
                correct_option: q.correct_option,
                explanation: q.explanation,
                difficulty: q.difficulty || (idx < 3 ? 'easy' : idx < 6 ? 'medium' : 'hard'),
                sequence_num: idx + 1,
              };
            });
            await this.updateGame(gameId, { settings: game.settings });
          }
        }
      }
    } catch (e) {
      console.warn('Notice: Error fetching pool questions:', e);
    }

    // If pool did not yield 7 questions, generate 7 unique questions with exact distribution
    if (questionsSet.length < 7) {
      const generated = await generateQuestionSetForTopic(topicName, 7, { easy: 3, medium: 3, hard: 1 });
      questionsSet = generated.map((g, idx) => ({
        topic: topicName,
        question: g.question,
        option_a: g.option_a,
        option_b: g.option_b,
        option_c: g.option_c,
        option_d: g.option_d,
        correct_option: g.correct_option,
        explanation: g.explanation,
        difficulty: g.difficulty,
        sequence_num: idx + 1,
      }));
    }

    const firstQ = questionsSet[0];

    // 2. Generate secure challenge token and hash
    const rawChallengeToken = generateSecureToken(24);
    const challengeTokenHash = await hashToken(rawChallengeToken);

    if (isSupabaseConfigured) {
      // Try atomic secure RPC allocating 7 questions
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_challenge_assignment', {
        p_game_id: gameId,
        p_round_id: roundId,
        p_sender_id: senderId,
        p_receiver_id: receiverId,
        p_topic_id: topicId,
        p_challenge_token_hash: challengeTokenHash,
        p_topic_category: topicName,
        p_question_text: firstQ.question,
        p_option_a: firstQ.option_a,
        p_option_b: firstQ.option_b,
        p_option_c: firstQ.option_c,
        p_option_d: firstQ.option_d,
        p_correct_option: firstQ.correct_option,
        p_explanation: firstQ.explanation,
        p_difficulty: firstQ.difficulty || difficulty,
        p_questions_json: questionsSet,
      });

      if (!rpcError && rpcData?.assignment_id) {
        const challengeCache = getLocal<Record<string, string>>('challenge_token_cache', {});
        challengeCache[rpcData.assignment_id] = rawChallengeToken;
        setLocal('challenge_token_cache', challengeCache);

        return {
          assignment: {
            id: rpcData.assignment_id,
            game_id: gameId,
            round_id: roundId,
            sender_id: senderId,
            receiver_id: receiverId,
            topic_id: topicId,
            challenge_token_hash: challengeTokenHash,
            raw_challenge_token: rawChallengeToken,
            status: 'pending',
            total_questions: 7,
            answered_questions: 0,
            current_score: 0,
            created_at: new Date().toISOString(),
          } as Assignment,
          rawChallengeToken,
        };
      }

      // Fallback direct table insertion
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
          total_questions: 7,
          answered_questions: 0,
          current_score: 0,
        })
        .select()
        .single();

      if (assignError) {
        throw new Error(`Assignment creation failed in Supabase: ${assignError.message}`);
      }

      // Insert all 7 questions
      const questionsToInsert = questionsSet.map((q, idx) => ({
        assignment_id: assignmentData.id,
        game_id: gameId,
        topic_id: topicId,
        sequence_num: idx + 1,
        topic_category: topicName,
        question_text: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        difficulty: q.difficulty,
        is_used: true,
      }));

      const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
      if (qError) {
        console.warn('Questions bulk insert warning:', qError.message);
      }

      await supabase.from('participants').update({ status: 'selected' }).eq('id', senderId);

      const challengeCache = getLocal<Record<string, string>>('challenge_token_cache', {});
      challengeCache[assignmentData.id] = rawChallengeToken;
      setLocal('challenge_token_cache', challengeCache);

      return {
        assignment: { ...assignmentData, raw_challenge_token: rawChallengeToken, total_questions: 7 } as Assignment,
        rawChallengeToken,
      };
    }

    // Local mode: Create assignment and store all 7 questions
    const assignments = getLocal<Assignment[]>('assignments', []);
    const questions = getLocal<Question[]>('questions', []);
    const participants = getLocal<Participant[]>('participants', []);

    const newAssignmentId = `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
      total_questions: 7,
      answered_questions: 0,
      current_score: 0,
      created_at: new Date().toISOString(),
    };
    assignments.push(newAssignment);
    setLocal('assignments', assignments);

    // Add all 7 questions to storage
    questionsSet.forEach((q, idx) => {
      questions.push({
        id: `q-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        assignment_id: newAssignmentId,
        game_id: gameId,
        topic_id: topicId,
        sequence_num: idx + 1,
        topic_category: topicName,
        question_text: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        difficulty: q.difficulty,
        is_used: true,
        created_at: new Date().toISOString(),
      });
    });
    setLocal('questions', questions);

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

      if (error) {
        throw new Error(`Failed to load challenge from Supabase: ${error.message}`);
      }
      if (!data) return null;

      // Ensure backward-compatible single object references alongside complete arrays
      const questions = Array.isArray(data.questions) ? data.questions : (data.question ? [data.question] : []);
      const answers = Array.isArray(data.answers) ? data.answers : (data.user_answer ? [data.user_answer] : []);

      return {
        ...data,
        questions,
        question: questions[0] || data.question || null,
        answers,
        user_answer: answers[0] || data.user_answer || null,
        progress: data.progress || {
          total: questions.length || 7,
          answered: answers.length,
          is_completed: data.assignment?.status === 'submitted' || answers.length >= (questions.length || 7),
          current_score: data.assignment?.current_score || 0,
        },
      };
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

    const assignmentQuestions = questions
      .filter((q) => q.assignment_id === assignment.id)
      .sort((a, b) => (a.sequence_num || 0) - (b.sequence_num || 0));

    const assignmentAnswers = answers
      .filter((ans) => ans.assignment_id === assignment.id)
      .sort((a, b) => (a.question_num || 0) - (b.question_num || 0));

    const isRevealed = round?.status === 'revealed' || round?.status === 'closed' || game?.status === 'completed';

    const sanitizedQuestions = assignmentQuestions.map((q, idx) => ({
      ...q,
      sequence_num: q.sequence_num || idx + 1,
      correct_option: isRevealed ? q.correct_option : null,
      explanation: isRevealed ? q.explanation : null,
    }));

    const sanitizedAnswers = assignmentAnswers.map((ans, idx) => ({
      ...ans,
      question_num: ans.question_num || idx + 1,
      is_correct: isRevealed ? ans.is_correct : null,
    }));

    const totalQuestions = assignment.total_questions || sanitizedQuestions.length || 7;
    const answeredCount = sanitizedAnswers.length;
    const isCompleted = assignment.status === 'submitted' || answeredCount >= totalQuestions;

    return {
      assignment: {
        ...assignment,
        total_questions: totalQuestions,
        answered_questions: answeredCount,
        current_score: assignment.current_score || 0,
      },
      game,
      round: { ...round, is_revealed: isRevealed },
      sender,
      receiver,
      topic,
      questions: sanitizedQuestions,
      question: sanitizedQuestions[0] || null,
      answers: sanitizedAnswers,
      user_answer: sanitizedAnswers[0] || null,
      progress: {
        total: totalQuestions,
        answered: answeredCount,
        is_completed: isCompleted,
        current_score: assignment.current_score || 0,
      },
    };
  },

  async submitAnswer(
    rawChallengeToken: string,
    selectedOption: 'A' | 'B' | 'C' | 'D',
    questionId?: string
  ): Promise<{ success: boolean; is_completed?: boolean; current_score?: number; error?: string }> {
    if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
      return { success: false, error: 'Invalid answer option. Must be A, B, C, or D.' };
    }

    const tokenHash = await hashToken(rawChallengeToken);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('submit_challenge_answer', {
        p_token_hash: tokenHash,
        p_selected_option: selectedOption,
        p_question_id: questionId || null,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return {
        success: true,
        is_completed: data?.is_completed ?? false,
        current_score: data?.current_score,
      };
    }

    // Local mode answer submission
    const assignments = getLocal<Assignment[]>('assignments', []);
    const questions = getLocal<Question[]>('questions', []);
    const answers = getLocal<Answer[]>('answers', []);
    const scores = getLocal<Score[]>('scores', []);
    const games = getLocal<Game[]>('games', []);

    const assignment = assignments.find(
      (a) => a.challenge_token_hash === tokenHash || a.raw_challenge_token === rawChallengeToken
    );

    if (!assignment) {
      return { success: false, error: 'Challenge not found.' };
    }

    if (assignment.status === 'submitted') {
      return { success: false, error: 'This challenge has already been completed.' };
    }

    const assignmentQuestions = questions
      .filter((q) => q.assignment_id === assignment.id)
      .sort((a, b) => (a.sequence_num || 0) - (b.sequence_num || 0));

    let targetQuestion: Question | undefined;
    if (questionId) {
      targetQuestion = assignmentQuestions.find((q) => q.id === questionId);
      if (!targetQuestion) {
        return { success: false, error: 'Question data not found.' };
      }
      const existing = answers.find(
        (ans) => ans.assignment_id === assignment.id && ans.question_id === questionId
      );
      if (existing) {
        return { success: false, error: 'An answer has already been submitted for this question.' };
      }
    } else {
      // Legacy caller: if an answer has already been submitted for this assignment, block duplicate
      const existingAny = answers.find((ans) => ans.assignment_id === assignment.id);
      if (existingAny) {
        return { success: false, error: 'An answer has already been submitted for this challenge.' };
      }
      targetQuestion = assignmentQuestions[0];
      if (!targetQuestion) {
        return { success: false, error: 'Question data not found.' };
      }
    }

    const isCorrect = targetQuestion.correct_option === selectedOption;
    const game = games.find((g) => g.id === assignment.game_id);
    const pointsCorrect = game?.settings?.points_correct ?? 10;
    const pointsWrong = game?.settings?.points_wrong ?? 0;
    const pointsAwarded = isCorrect ? pointsCorrect : pointsWrong;

    const currentAnsweredCount = answers.filter((a) => a.assignment_id === assignment.id).length;
    const questionNum = targetQuestion.sequence_num || currentAnsweredCount + 1;

    const newAnswer: Answer = {
      id: `ans-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      assignment_id: assignment.id,
      question_id: targetQuestion.id,
      participant_id: assignment.receiver_id,
      selected_option: selectedOption,
      is_correct: isCorrect,
      question_num: questionNum,
      submitted_at: new Date().toISOString(),
    };
    answers.push(newAnswer);
    setLocal('answers', answers);

    const totalQuestions = assignment.total_questions || assignmentQuestions.length || 7;
    const newAnsweredCount = currentAnsweredCount + 1;
    const isCompleted = newAnsweredCount >= totalQuestions;

    assignment.answered_questions = newAnsweredCount;
    assignment.current_score = (assignment.current_score || 0) + pointsAwarded;
    if (isCompleted) {
      assignment.status = 'submitted';
    }
    setLocal('assignments', assignments);

    let score = scores.find(
      (s) => s.game_id === assignment.game_id && s.round_id === assignment.round_id && s.participant_id === assignment.receiver_id
    );
    if (!score) {
      score = {
        id: `sc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      score.total_points += pointsCorrect;
    } else {
      score.wrong_answers += 1;
      score.total_points += pointsWrong;
    }
    score.updated_at = new Date().toISOString();
    setLocal('scores', scores);

    return {
      success: true,
      is_completed: isCompleted,
      current_score: assignment.current_score,
    };
  },

  // --- Monitoring & Rounds ---
  async getLiveAssignments(gameId: string): Promise<Assignment[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
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
          total_questions,
          answered_questions,
          current_score,
          created_at,
          sender:participants!assignments_sender_id_fkey(id, display_name, player_code),
          receiver:participants!assignments_receiver_id_fkey(id, display_name, player_code),
          topic:topics(id, name),
          question:questions(id, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, sequence_num),
          answer:answers(question_id, selected_option, is_correct, question_num, submitted_at)
        `)
        .eq('game_id', gameId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to load live assignments from Supabase: ${error.message}`);
      }

      const tokenCache = getLocal<Record<string, string>>('challenge_token_cache', {});
      return (data || []).map((item: any) => {
        const qList = Array.isArray(item.question) ? item.question : (item.question ? [item.question] : []);
        const aList = Array.isArray(item.answer) ? item.answer : (item.answer ? [item.answer] : []);
        return {
          ...item,
          raw_challenge_token: tokenCache[item.id] || item.challenge_token_hash,
          sender: item.sender,
          receiver: item.receiver,
          topic: item.topic,
          question: qList[0] || null,
          questions: qList,
          answer: aList[0] || null,
          answers: aList,
          total_questions: item.total_questions || qList.length || 7,
          answered_questions: item.answered_questions || aList.length || 0,
          current_score: item.current_score || 0,
        };
      }) as Assignment[];
    }

    // Local mode
    const assignments = getLocal<Assignment[]>('assignments', []).filter((a) => a.game_id === gameId);
    const participants = getLocal<Participant[]>('participants', []);
    const topics = getLocal<Topic[]>('topics', []);
    const questions = getLocal<Question[]>('questions', []);
    const answers = getLocal<Answer[]>('answers', []);
    const tokenCache = getLocal<Record<string, string>>('challenge_token_cache', {});

    return assignments.map((a) => {
      const qList = questions.filter((item) => item.assignment_id === a.id).sort((x, y) => (x.sequence_num || 0) - (y.sequence_num || 0));
      const aList = answers.filter((item) => item.assignment_id === a.id).sort((x, y) => (x.question_num || 0) - (y.question_num || 0));
      return {
        ...a,
        raw_challenge_token: tokenCache[a.id] || a.challenge_token_hash,
        sender: participants.find((p) => p.id === a.sender_id),
        receiver: participants.find((p) => p.id === a.receiver_id),
        topic: topics.find((t) => t.id === a.topic_id),
        question: qList[0] || null,
        questions: qList,
        answer: aList[0] || null,
        answers: aList,
        total_questions: a.total_questions || qList.length || 7,
        answered_questions: aList.length,
        current_score: a.current_score || 0,
      };
    });
  },

  async revealRound(roundId: string, gameId: string): Promise<void> {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('reveal_round_answers', { p_round_id: roundId });
      if (error) {
        throw new Error(`Failed to reveal round answers in Supabase: ${error.message}`);
      }
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
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('game_id', gameId);

      if (error) {
        throw new Error(`Failed to load leaderboard from Supabase: ${error.message}`);
      }

      const scoreMap = new Map<string, Score>();
      if (data) {
        data.forEach((s) => {
          scoreMap.set(s.participant_id, s as Score);
        });
      }

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
