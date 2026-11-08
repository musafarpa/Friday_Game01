import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { generateQuestionSetForTopic, POOL_TARGET, POOL_MINIMUM_TOTAL } from './questionGenerator';
import {
  Game,
  GameAction,
  GameStatus,
  Participant,
  Topic,
  TopicStats,
  GameRound,
  Assignment,
  DefaultRules,
  PoolStatus,
  GameTopicProgress,
  JoinPayload,
  ChallengeData,
  LeaderboardPayload,
} from '../types';

// ============================================================================
// Error handling
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns PostgREST / network errors into messages an admin or participant can act on. */
export function friendlyError(err: any, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback;
  const msg: string = String(err.message ?? err);
  if (/Failed to fetch|NetworkError|Load failed|network request failed|fetch failed/i.test(msg)) {
    return 'Cannot reach the database. Check your internet connection and try again.';
  }
  if (/permission denied|not authorized|row-level security|JWT expired|invalid jwt/i.test(msg)) {
    return /JWT expired|invalid jwt/i.test(msg)
      ? 'Your admin session has expired. Please sign in again.'
      : 'You are not authorised to do that.';
  }
  if (/could not find the function|schema cache|does not exist/i.test(msg)) {
    return 'The database is missing the latest migration (20260104000000_security_lifecycle_hardening.sql). Ask the administrator to apply it.';
  }
  return msg || fallback;
}

function requireConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
}

async function rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  requireConfigured();
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(friendlyError(error));
    return data as T;
  } catch (e: any) {
    throw new Error(friendlyError(e));
  }
}

function unwrap<T>(res: { data: T | null; error: any }, what: string): T {
  if (res.error) throw new Error(`${what}: ${friendlyError(res.error)}`);
  return res.data as T;
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

// ============================================================================
// Service
// ============================================================================

export interface PoolGenerationResult {
  success: boolean;
  progress: GameTopicProgress[];
  warnings: string[];
}

export const gameService = {
  // ---------------------------------------------------------------- Admin auth
  /** True only for a valid (server-verified, non-expired) session whose user is in public.admins. */
  async checkIsAdmin(): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return false;
      const { data: userRes, error } = await supabase.auth.getUser(); // validates the JWT with the server
      if (error || !userRes.user) return false;
      const { data, error: rpcErr } = await supabase.rpc('is_admin');
      if (rpcErr) return false;
      return data === true;
    } catch {
      return false;
    }
  },

  async loginAdmin(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim();
    if (!cleanEmail) return { success: false, error: 'Email cannot be empty.' };
    if (!pass) return { success: false, error: 'Password cannot be empty.' };
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase is not configured for this deployment.' };

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: pass });
      if (authError) return { success: false, error: friendlyError(authError) };

      const { data: isAdmin, error } = await supabase.rpc('is_admin');
      if (error || isAdmin !== true) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Access denied. This account is signed in but does not have Admin privileges.',
        };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: friendlyError(e) };
    }
  },

  async logoutAdmin(): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore – local session is cleared regardless */
      }
    }
  },

  async resetAdminPassword(email: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim();
    if (!cleanEmail) return { success: false, error: 'Email cannot be empty.' };
    requireConfigured();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) return { success: false, error: friendlyError(error) };
    return { success: true };
  },

  /** Calls `onSignedOut` when the admin session ends (logout in another tab, expiry, revocation). */
  onAdminSessionEnded(onSignedOut: () => void): () => void {
    if (!isSupabaseConfigured) return () => {};
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') onSignedOut();
    });
    return () => data.subscription.unsubscribe();
  },

  // ---------------------------------------------------------------- Games (admin)
  async getGames(): Promise<Game[]> {
    requireConfigured();
    const res = await supabase.from('games').select('*').order('created_at', { ascending: false });
    return unwrap(res, 'Failed to load games') as Game[];
  },

  async getGame(gameId: string): Promise<Game | null> {
    requireConfigured();
    if (!UUID_RE.test(gameId)) return null;
    const res = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();
    return unwrap(res, 'Failed to load game') as Game | null;
  },

  async createGame(params: {
    name: string;
    description?: string;
    rules?: Partial<DefaultRules>;
    topicIds: string[];
    initialStatus?: 'draft' | 'registration_open';
  }): Promise<Game> {
    const name = params.name.trim();
    if (!name) throw new Error('Game name cannot be empty.');
    if (params.topicIds.length === 0) throw new Error('Select at least 1 topic for this game.');
    const rules = params.rules ?? {};
    if (rules.min_participants !== undefined && rules.max_participants !== undefined && rules.max_participants < rules.min_participants) {
      throw new Error('Maximum participants cannot be less than minimum participants.');
    }
    const res = await rpc<{ game_id: string }>('admin_create_game', {
      p_name: name,
      p_description: params.description?.trim() ?? '',
      p_settings: rules,
      p_topic_ids: params.topicIds,
      p_initial_status: params.initialStatus ?? 'registration_open',
    });
    const game = await this.getGame(res.game_id);
    if (!game) throw new Error('Game was created but could not be loaded.');
    return game;
  },

  async updateGame(
    gameId: string,
    updates: { name: string; description?: string; rules?: Partial<DefaultRules> }
  ): Promise<void> {
    await rpc('admin_update_game', {
      p_game_id: gameId,
      p_name: updates.name,
      p_description: updates.description ?? '',
      p_settings: updates.rules ?? {},
    });
  },

  /** Lifecycle transition. The server enforces valid transitions and the start gate. */
  async setGameStatus(gameId: string, action: GameAction): Promise<{ status: GameStatus; previous_status: GameStatus }> {
    return rpc('admin_set_game_status', { p_game_id: gameId, p_action: action });
  },

  async deleteGame(gameId: string): Promise<{
    name: string;
    participants_removed: number;
    challenges_removed: number;
    answers_removed: number;
  }> {
    return rpc('admin_delete_game', { p_game_id: gameId });
  },

  async cleanupFinishedGames(retentionHours = 24): Promise<{ cleaned_count: number; games: Array<{ name: string; status: string }> }> {
    return rpc('cleanup_completed_games', { p_retention_hours: retentionHours });
  },

  // ---------------------------------------------------------------- Default rules
  async getDefaultRules(): Promise<DefaultRules> {
    requireConfigured();
    const res = await supabase.from('app_settings').select('value').eq('key', 'default_game_rules').maybeSingle();
    const v = unwrap(res, 'Failed to load default rules') as { value: Partial<DefaultRules> } | null;
    return {
      min_participants: v?.value?.min_participants ?? 3,
      max_participants: v?.value?.max_participants ?? 30,
      points_correct: v?.value?.points_correct ?? 10,
      points_wrong: v?.value?.points_wrong ?? 0,
    };
  },

  async setDefaultRules(rules: DefaultRules): Promise<DefaultRules> {
    return rpc('admin_set_default_rules', { p_rules: rules });
  },

  // ---------------------------------------------------------------- Topics
  async getTopics(): Promise<Topic[]> {
    requireConfigured();
    const res = await supabase.from('topics').select('*').eq('is_active', true).order('name');
    return unwrap(res, 'Failed to load topics') as Topic[];
  },

  async getAllTopics(): Promise<Topic[]> {
    requireConfigured();
    const res = await supabase.from('topics').select('*').order('name');
    return unwrap(res, 'Failed to load topics') as Topic[];
  },

  async getTopicStats(): Promise<Record<string, TopicStats>> {
    const rows = await rpc<TopicStats[]>('admin_topic_stats');
    return Object.fromEntries((rows || []).map((r) => [r.topic_id, r]));
  },

  async toggleTopic(topicId: string, isActive: boolean): Promise<void> {
    requireConfigured();
    const res = await supabase.from('topics').update({ is_active: isActive }).eq('id', topicId).select('id');
    const rows = unwrap(res, 'Failed to update topic');
    if (!rows || rows.length === 0) throw new Error('Topic was not updated (not found or not permitted).');
  },

  async addTopic(name: string, description: string, icon: string = 'Sparkles'): Promise<Topic> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Topic name cannot be empty.');
    if (cleanName.length > 60) throw new Error('Topic name must be 60 characters or fewer.');
    requireConfigured();
    const existing = await this.getAllTopics();
    if (existing.some((t) => t.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error(`Topic "${cleanName}" already exists.`);
    }
    const res = await supabase
      .from('topics')
      .insert({ name: cleanName, description: description.trim().slice(0, 200), icon, is_active: true })
      .select()
      .single();
    if (res.error) {
      if (res.error.code === '23505') throw new Error(`Topic "${cleanName}" already exists.`);
      throw new Error(`Failed to add topic: ${friendlyError(res.error)}`);
    }
    return res.data as Topic;
  },

  async editTopic(topicId: string, name: string, description: string): Promise<Topic> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Topic name cannot be empty.');
    if (cleanName.length > 60) throw new Error('Topic name must be 60 characters or fewer.');
    requireConfigured();
    const res = await supabase
      .from('topics')
      .update({ name: cleanName, description: description.trim().slice(0, 200) })
      .eq('id', topicId)
      .select()
      .maybeSingle();
    if (res.error) {
      if (res.error.code === '23505') throw new Error(`Topic "${cleanName}" already exists.`);
      throw new Error(`Failed to update topic: ${friendlyError(res.error)}`);
    }
    if (!res.data) throw new Error('Topic was not updated (not found or not permitted).');
    return res.data as Topic;
  },

  async deleteTopic(topicId: string): Promise<void> {
    await rpc('admin_delete_topic', { p_topic_id: topicId });
  },

  async getGameTopicIds(gameId: string): Promise<string[]> {
    requireConfigured();
    const res = await supabase.from('game_topics').select('topic_id').eq('game_id', gameId);
    return (unwrap(res, 'Failed to load game topics') as any[]).map((r) => r.topic_id);
  },

  // ---------------------------------------------------------------- Question pool (admin)
  async getPoolStatus(gameId: string): Promise<PoolStatus> {
    return rpc<PoolStatus>('admin_pool_status', { p_game_id: gameId });
  },

  async getGameTopicProgress(gameId: string): Promise<GameTopicProgress[]> {
    const pool = await this.getPoolStatus(gameId);
    return (pool.topics || []).map((t) => ({
      topic_id: t.topic_id,
      topic_name: t.topic_name,
      required_count: pool.required_per_topic ?? POOL_MINIMUM_TOTAL,
      current_count: t.total,
      status: t.is_complete ? 'complete' : t.total > 0 ? 'incomplete' : 'pending',
      difficulty_counts: { easy: t.easy, medium: t.medium, hard: t.hard },
    }));
  },

  /**
   * Tops each selected topic up to the pool target (10 = 4E/4M/2H; the start gate needs 3/3/1) and saves
   * it through the validating admin RPC. Never pads a topic with another topic's questions.
   */
  async generateQuestionPoolForGame(
    gameId: string,
    topicIds?: string[],
    onProgress?: (progress: GameTopicProgress[]) => void
  ): Promise<PoolGenerationResult> {
    const allTopics = await this.getAllTopics();
    const gameTopicIds = topicIds && topicIds.length > 0 ? topicIds : await this.getGameTopicIds(gameId);
    const topics = allTopics.filter((t) => gameTopicIds.includes(t.id));
    if (topics.length === 0) throw new Error('No topics selected for this game.');

    const warnings: string[] = [];
    let progress = await this.getGameTopicProgress(gameId);
    progress = progress.filter((p) => gameTopicIds.includes(p.topic_id));
    onProgress?.([...progress]);

    for (const topic of topics) {
      const idx = progress.findIndex((p) => p.topic_id === topic.id);
      const setStatus = (patch: Partial<GameTopicProgress>) => {
        if (idx >= 0) progress[idx] = { ...progress[idx], ...patch };
        onProgress?.([...progress]);
      };
      setStatus({ status: 'generating', error: undefined });
      try {
        const res = await supabase
          .from('questions')
          .select('question_text, difficulty')
          .eq('game_id', gameId)
          .eq('topic_id', topic.id)
          .is('assignment_id', null);
        const existing = (unwrap(res, 'Failed to read existing questions') as any[]) || [];
        const have = (d: string) => existing.filter((q) => q.difficulty === d).length;
        const need = {
          easy: Math.max(0, POOL_TARGET.easy - have('easy')),
          medium: Math.max(0, POOL_TARGET.medium - have('medium')),
          hard: Math.max(0, POOL_TARGET.hard - have('hard')),
        };

        if (need.easy + need.medium + need.hard > 0) {
          const gen = await generateQuestionSetForTopic(topic.name, need, existing.map((q) => q.question_text));
          gen.warnings.forEach((w) => warnings.push(`${topic.name}: ${w}`));
          if (gen.questions.length > 0) {
            await rpc('admin_save_pool_questions', {
              p_game_id: gameId,
              p_topic_id: topic.id,
              p_questions: gen.questions.map((q) => ({
                question_text: q.question,
                option_a: q.option_a,
                option_b: q.option_b,
                option_c: q.option_c,
                option_d: q.option_d,
                correct_option: q.correct_option,
                explanation: q.explanation,
                difficulty: q.difficulty,
              })),
            });
          }
        }
        const fresh = (await this.getGameTopicProgress(gameId)).find((p) => p.topic_id === topic.id);
        if (fresh) setStatus({ ...fresh, error: fresh.status === 'complete' ? undefined : 'Needs at least 7 questions (3 easy, 3 medium, 1 hard).' });
      } catch (e: any) {
        setStatus({ status: 'failed', error: friendlyError(e, 'Generation failed') });
      }
    }

    const final = await this.getGameTopicProgress(gameId);
    return { success: final.every((p) => p.status === 'complete'), progress: final, warnings };
  },

  // ---------------------------------------------------------------- Participants (admin)
  async getParticipants(gameId: string): Promise<Participant[]> {
    requireConfigured();
    const res = await supabase
      .from('participants')
      .select('id, game_id, display_name, player_code, email_or_contact, avatar_url, status, joined_at, created_at, participant_secrets(raw_token)')
      .eq('game_id', gameId)
      .order('player_code', { ascending: true });
    const rows = unwrap(res, 'Failed to load participants') as any[];
    return (rows || []).map((r) => {
      const { participant_secrets, ...rest } = r;
      return { ...rest, raw_invitation_token: one<{ raw_token: string }>(participant_secrets)?.raw_token } as Participant;
    });
  },

  async addParticipant(
    gameId: string,
    displayName: string,
    playerCode: string,
    contact?: string
  ): Promise<{ participantId: string; displayName: string; playerCode: string; rawToken: string }> {
    const r = await rpc<any>('admin_add_participant', {
      p_game_id: gameId,
      p_display_name: displayName,
      p_player_code: playerCode,
      p_contact: contact ?? null,
    });
    return { participantId: r.participant_id, displayName: r.display_name, playerCode: r.player_code, rawToken: r.raw_token };
  },

  async updateParticipant(
    participantId: string,
    updates: { displayName: string; playerCode: string; contact?: string }
  ): Promise<void> {
    await rpc('admin_update_participant', {
      p_participant_id: participantId,
      p_display_name: updates.displayName,
      p_player_code: updates.playerCode,
      p_contact: updates.contact ?? null,
    });
  },

  async removeParticipant(participantId: string): Promise<void> {
    await rpc('admin_remove_participant', { p_participant_id: participantId });
  },

  async regenerateInvitation(participantId: string): Promise<string> {
    const r = await rpc<{ raw_token: string }>('admin_regenerate_invitation', { p_participant_id: participantId });
    return r.raw_token;
  },

  // ---------------------------------------------------------------- Rounds
  async getActiveRound(gameId: string): Promise<GameRound | null> {
    requireConfigured();
    if (!UUID_RE.test(gameId)) return null;
    const res = await supabase
      .from('game_rounds')
      .select('*')
      .eq('game_id', gameId)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    return unwrap(res, 'Failed to load round') as GameRound | null;
  },

  // ---------------------------------------------------------------- Participant flow (token based)
  /** Opens an invitation. Returns null for an invalid / revoked / wrong-game link. */
  async joinGame(gameId: string, token: string): Promise<JoinPayload | null> {
    if (!UUID_RE.test(gameId ?? '') || !token) return null;
    return (await rpc<JoinPayload | null>('participant_join', { p_game_id: gameId, p_token: token })) ?? null;
  },

  async createChallenge(params: {
    gameId: string;
    token: string;
    receiverId: string;
    topicId: string;
  }): Promise<{ assignment_id: string; raw_token: string; total_questions: number; receiver: { id: string; display_name: string }; topic: { id: string; name: string } }> {
    return rpc('participant_create_challenge', {
      p_game_id: params.gameId,
      p_token: params.token,
      p_receiver_id: params.receiverId,
      p_topic_id: params.topicId,
    });
  },

  async getChallengeByToken(token: string): Promise<ChallengeData | null> {
    if (!token) return null;
    return (await rpc<ChallengeData | null>('get_challenge_by_token', { p_token: token })) ?? null;
  },

  async submitAnswer(
    token: string,
    selectedOption: 'A' | 'B' | 'C' | 'D',
    questionId: string
  ): Promise<{
    success: boolean;
    is_completed?: boolean;
    answered_count?: number;
    alreadyAnswered?: boolean;
    error?: string;
  }> {
    if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
      return { success: false, error: 'Invalid answer option. Must be A, B, C, or D.' };
    }
    try {
      const data = await rpc<any>('submit_challenge_answer', {
        p_token: token,
        p_selected_option: selectedOption,
        p_question_id: questionId,
      });
      return { success: true, is_completed: data?.is_completed ?? false, answered_count: data?.answered_count };
    } catch (e: any) {
      const msg = String(e.message || '');
      if (/ALREADY_ANSWERED/.test(msg)) {
        return { success: false, alreadyAnswered: true, error: 'You already answered this question.' };
      }
      return { success: false, error: msg.replace(/^ALREADY_ANSWERED:\s*/, '') };
    }
  },

  // ---------------------------------------------------------------- Monitoring & leaderboard
  async getLiveAssignments(gameId: string): Promise<Assignment[]> {
    requireConfigured();
    const res = await supabase
      .from('assignments')
      .select(`
        id, game_id, round_id, sender_id, receiver_id, topic_id, status,
        total_questions, answered_questions, current_score, created_at,
        sender:participants!assignments_sender_id_fkey(id, display_name, player_code),
        receiver:participants!assignments_receiver_id_fkey(id, display_name, player_code),
        topic:topics(id, name),
        assignment_secrets(raw_token),
        answers(question_id, selected_option, is_correct, question_num, submitted_at)
      `)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false });
    const rows = unwrap(res, 'Failed to load challenges') as any[];
    return (rows || []).map((r) => {
      const { assignment_secrets, ...rest } = r;
      return {
        ...rest,
        raw_challenge_token: one<{ raw_token: string }>(assignment_secrets)?.raw_token,
        answers: (r.answers || []).sort((a: any, b: any) => (a.question_num || 0) - (b.question_num || 0)),
      } as Assignment;
    });
  },

  async getLeaderboard(gameId: string): Promise<LeaderboardPayload | null> {
    if (!UUID_RE.test(gameId ?? '')) return null;
    return (await rpc<LeaderboardPayload | null>('get_leaderboard', { p_game_id: gameId })) ?? null;
  },

  // ---------------------------------------------------------------- Realtime
  /**
   * Live updates. `mode: 'admin'` listens to the admin-only tables (RLS filters events by the
   * admin's JWT); `mode: 'public'` listens to the public games row only (its updated_at is bumped
   * on every play event server-side). A polling fallback guarantees refresh even if the socket drops.
   */
  subscribeToGameUpdates(
    gameId: string,
    onUpdate: () => void,
    opts: { mode?: 'admin' | 'public'; pollMs?: number; onStatus?: (status: string) => void } = {}
  ): () => void {
    if (!isSupabaseConfigured) return () => {};
    const mode = opts.mode ?? 'public';
    let timer: ReturnType<typeof setTimeout> | null = null;
    // every answer bumps games.updated_at, so public pages can get a burst of events: coalesce them
    const debounceMs = mode === 'admin' ? 350 : 1000;
    const fire = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        onUpdate();
      }, debounceMs);
    };

    let channel = supabase.channel(`friday_${mode}_${gameId}_${Math.random().toString(36).slice(2, 8)}`);
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, fire);
    if (mode === 'admin') {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `game_id=eq.${gameId}` }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `game_id=eq.${gameId}` }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds', filter: `game_id=eq.${gameId}` }, fire);
    }
    channel.subscribe((status) => opts.onStatus?.(status));

    const poll = setInterval(onUpdate, opts.pollMs ?? (mode === 'admin' ? 15_000 : 10_000));
    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  },
};
