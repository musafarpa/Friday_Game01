import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocked Supabase client: we assert exactly which database operations the service performs ----
const h = vi.hoisted(() => {
  const state = {
    rpcResult: { data: null as any, error: null as any },
    rpcCalls: [] as Array<{ fn: string; args: any }>,
    rpcByName: {} as Record<string, { data: any; error: any }>,
    tableResult: { data: [] as any, error: null as any, count: 0 as number | null },
    tableCalls: [] as Array<{ table: string; ops: any[] }>,
    session: { data: { session: { access_token: 't' } }, error: null } as any,
    user: { data: { user: { id: 'u1' } }, error: null } as any,
    signIn: { data: {}, error: null } as any,
    signOutCalls: 0,
  };
  const chain = (table: string) => {
    const ops: any[] = [];
    state.tableCalls.push({ table, ops });
    const p: any = new Proxy(function () {}, {
      get(_t, prop: string) {
        if (prop === 'then') return (res: any, rej: any) => Promise.resolve(state.tableResult).then(res, rej);
        return (...args: any[]) => {
          ops.push([prop, ...args]);
          return p;
        };
      },
    });
    return p;
  };
  const supabase = {
    rpc: vi.fn(async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args });
      return state.rpcByName[fn] ?? state.rpcResult;
    }),
    from: vi.fn((t: string) => chain(t)),
    auth: {
      getSession: vi.fn(async () => state.session),
      getUser: vi.fn(async () => state.user),
      signInWithPassword: vi.fn(async () => state.signIn),
      signOut: vi.fn(async () => { state.signOutCalls++; return { error: null }; }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  };
  return { state, supabase };
});

vi.mock('../lib/supabase', () => ({ supabase: h.supabase, isSupabaseConfigured: true, supabaseUrl: 'https://x.supabase.co' }));

import { gameService, friendlyError } from '../services/gameService';

const GAME = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  h.state.rpcResult = { data: null, error: null };
  h.state.rpcByName = {};
  h.state.rpcCalls.length = 0;
  h.state.tableCalls.length = 0;
  h.state.tableResult = { data: [], error: null, count: 0 };
  h.state.session = { data: { session: { access_token: 't' } }, error: null };
  h.state.user = { data: { user: { id: 'u1' } }, error: null };
  h.state.signIn = { data: {}, error: null };
  h.state.signOutCalls = 0;
});

describe('friendlyError', () => {
  it('maps network failures, auth failures and missing-migration errors to actionable messages', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/Cannot reach the database/);
    expect(friendlyError({ message: 'permission denied for function admin_delete_game' })).toMatch(/not authorised/);
    expect(friendlyError({ message: 'JWT expired' })).toMatch(/session has expired/);
    expect(friendlyError({ message: 'Could not find the function public.admin_pool_status in the schema cache' })).toMatch(/migration/i);
    expect(friendlyError({ message: 'Game name cannot be empty.' })).toBe('Game name cannot be empty.');
    expect(friendlyError(null, 'fallback')).toBe('fallback');
  });
});

describe('admin authentication', () => {
  it('checkIsAdmin is false without a session, with an invalid user, or when is_admin() is false', async () => {
    h.state.session = { data: { session: null }, error: null };
    expect(await gameService.checkIsAdmin()).toBe(false);

    h.state.session = { data: { session: { access_token: 't' } }, error: null };
    h.state.user = { data: { user: null }, error: { message: 'expired' } };
    expect(await gameService.checkIsAdmin()).toBe(false);

    h.state.user = { data: { user: { id: 'u' } }, error: null };
    h.state.rpcResult = { data: false, error: null };
    expect(await gameService.checkIsAdmin()).toBe(false);

    h.state.rpcResult = { data: true, error: null };
    expect(await gameService.checkIsAdmin()).toBe(true);
  });

  it('loginAdmin: validates input, surfaces wrong passwords, and signs out non-admin accounts', async () => {
    expect((await gameService.loginAdmin('', 'x')).error).toMatch(/Email cannot be empty/);
    expect((await gameService.loginAdmin('a@b.c', '')).error).toMatch(/Password cannot be empty/);

    h.state.signIn = { data: {}, error: { message: 'Invalid login credentials' } };
    const bad = await gameService.loginAdmin('a@b.c', 'wrong');
    expect(bad).toEqual({ success: false, error: 'Invalid login credentials' });
    expect(h.state.signOutCalls).toBe(0);

    h.state.signIn = { data: {}, error: null };
    h.state.rpcResult = { data: false, error: null }; // authenticated but not in public.admins
    const nonAdmin = await gameService.loginAdmin('player@b.c', 'pw');
    expect(nonAdmin.success).toBe(false);
    expect(nonAdmin.error).toMatch(/does not have Admin privileges/);
    expect(h.state.signOutCalls).toBe(1);

    h.state.rpcResult = { data: true, error: null };
    expect(await gameService.loginAdmin('admin@b.c', 'pw')).toEqual({ success: true });
  });
});

describe('game lifecycle calls hit the server-side RPCs with the right arguments', () => {
  it.each(['open_registration', 'start', 'pause', 'resume', 'complete', 'cancel'] as const)('setGameStatus(%s)', async (action) => {
    h.state.rpcResult = { data: { status: 'x', previous_status: 'y' }, error: null };
    await gameService.setGameStatus(GAME, action);
    expect(h.state.rpcCalls).toEqual([{ fn: 'admin_set_game_status', args: { p_game_id: GAME, p_action: action } }]);
  });

  it('server validation errors (e.g. start gate) reach the caller verbatim', async () => {
    h.state.rpcResult = { data: null, error: { message: 'Cannot start game: At least 3 participants are required but only 1 added.' } };
    await expect(gameService.setGameStatus(GAME, 'start')).rejects.toThrow('Cannot start game: At least 3 participants are required but only 1 added.');
  });

  it('deleteGame / cleanup use the protected RPCs (no direct table delete fallback)', async () => {
    h.state.rpcResult = { data: { name: 'G', participants_removed: 2, challenges_removed: 1, answers_removed: 3 }, error: null };
    await gameService.deleteGame(GAME);
    h.state.rpcResult = { data: { cleaned_count: 0, games: [] }, error: null };
    await gameService.cleanupFinishedGames(24);
    expect(h.state.rpcCalls.map((c) => c.fn)).toEqual(['admin_delete_game', 'cleanup_completed_games']);
    expect(h.state.tableCalls.filter((c) => c.ops.some((o) => o[0] === 'delete'))).toHaveLength(0);
  });

  it('a failed delete is NOT silently retried with a direct DELETE (old behaviour) and rejects', async () => {
    h.state.rpcResult = { data: null, error: { message: 'Game "X" is in progress. Cancel or complete it before deleting.' } };
    await expect(gameService.deleteGame(GAME)).rejects.toThrow(/in progress/);
    expect(h.state.tableCalls.filter((c) => c.ops.some((o) => o[0] === 'delete'))).toHaveLength(0);
  });

  it('createGame validates before calling the server and passes topics + rules', async () => {
    await expect(gameService.createGame({ name: '  ', topicIds: ['t'] })).rejects.toThrow(/name cannot be empty/);
    await expect(gameService.createGame({ name: 'G', topicIds: [] })).rejects.toThrow(/at least 1 topic/);
    await expect(gameService.createGame({ name: 'G', topicIds: ['t'], rules: { min_participants: 5, max_participants: 3 } })).rejects.toThrow(/cannot be less than minimum/);
    expect(h.state.rpcCalls).toHaveLength(0);

    h.state.rpcByName['admin_create_game'] = { data: { game_id: GAME }, error: null };
    h.state.tableResult = { data: { id: GAME, name: 'G', status: 'registration_open', settings: {} }, error: null, count: 0 };
    const g = await gameService.createGame({ name: ' G ', description: 'd', topicIds: ['t1', 't2'], rules: { points_correct: 12 } });
    expect(g.id).toBe(GAME);
    expect(h.state.rpcCalls[0]).toEqual({
      fn: 'admin_create_game',
      args: { p_name: 'G', p_description: 'd', p_settings: { points_correct: 12 }, p_topic_ids: ['t1', 't2'], p_initial_status: 'registration_open' },
    });
  });
});

describe('participants', () => {
  it('getParticipants exposes the stored raw token for the admin (so Copy Invite Link copies a WORKING link)', async () => {
    h.state.tableResult = {
      data: [
        { id: 'p1', game_id: GAME, display_name: 'Arun', player_code: 'A', status: 'pending', participant_secrets: { raw_token: 'tok-a' } },
        { id: 'p2', game_id: GAME, display_name: 'Rahul', player_code: 'B', status: 'joined', participant_secrets: [{ raw_token: 'tok-b' }] },
        { id: 'p3', game_id: GAME, display_name: 'Legacy', player_code: 'C', status: 'pending', participant_secrets: null },
      ],
      error: null,
      count: 3,
    };
    const list = await gameService.getParticipants(GAME);
    expect(list.map((p) => p.raw_invitation_token)).toEqual(['tok-a', 'tok-b', undefined]); // never falls back to a hash
    expect(JSON.stringify(list)).not.toContain('participant_secrets');
    expect(JSON.stringify(list)).not.toContain('invitation_token_hash');
  });

  it('addParticipant / update / remove / regenerate call the admin RPCs', async () => {
    h.state.rpcResult = { data: { participant_id: 'p', display_name: 'Amal', player_code: 'C', raw_token: 'raw' }, error: null };
    const r = await gameService.addParticipant(GAME, 'Amal', 'C', '+971');
    expect(r).toEqual({ participantId: 'p', displayName: 'Amal', playerCode: 'C', rawToken: 'raw' });
    await gameService.updateParticipant('p', { displayName: 'Amal K', playerCode: 'c' });
    await gameService.removeParticipant('p');
    h.state.rpcResult = { data: { raw_token: 'new' }, error: null };
    expect(await gameService.regenerateInvitation('p')).toBe('new');
    expect(h.state.rpcCalls.map((c) => c.fn)).toEqual(['admin_add_participant', 'admin_update_participant', 'admin_remove_participant', 'admin_regenerate_invitation']);
    expect(h.state.rpcCalls[0].args).toEqual({ p_game_id: GAME, p_display_name: 'Amal', p_player_code: 'C', p_contact: '+971' });
  });

  it('duplicate participant error from the server is shown unchanged', async () => {
    h.state.rpcResult = { data: null, error: { message: 'A participant named "Arun" already exists in this game.' } };
    await expect(gameService.addParticipant(GAME, 'arun', 'Z')).rejects.toThrow('A participant named "Arun" already exists in this game.');
  });
});

describe('participant gameplay calls', () => {
  it('joinGame returns null WITHOUT a network call for malformed game ids / empty tokens', async () => {
    expect(await gameService.joinGame('not-a-uuid', 'tok')).toBeNull();
    expect(await gameService.joinGame(GAME, '')).toBeNull();
    expect(h.state.rpcCalls).toHaveLength(0);
  });

  it('joinGame sends the RAW token (the server hashes it) and returns null for invalid links', async () => {
    h.state.rpcResult = { data: null, error: null };
    expect(await gameService.joinGame(GAME, 'abc'.repeat(20))).toBeNull();
    expect(h.state.rpcCalls[0]).toEqual({ fn: 'participant_join', args: { p_game_id: GAME, p_token: 'abc'.repeat(20) } });
  });

  it('createChallenge sends only ids + token (no client-chosen questions, answers or tokens)', async () => {
    h.state.rpcResult = { data: { assignment_id: 'a', raw_token: 'r', total_questions: 7 }, error: null };
    await gameService.createChallenge({ gameId: GAME, token: 'tok', receiverId: 'r1', topicId: 't1' });
    expect(Object.keys(h.state.rpcCalls[0].args).sort()).toEqual(['p_game_id', 'p_receiver_id', 'p_token', 'p_topic_id']);
  });

  it('submitAnswer: rejects invalid options locally, maps ALREADY_ANSWERED, and never sends a score', async () => {
    expect((await gameService.submitAnswer('t', 'Z' as any, 'q')).success).toBe(false);
    expect(h.state.rpcCalls).toHaveLength(0);

    h.state.rpcResult = { data: { is_completed: false, answered_count: 3 }, error: null };
    expect(await gameService.submitAnswer('tok', 'B', 'q1')).toEqual({ success: true, is_completed: false, answered_count: 3 });
    expect(h.state.rpcCalls[0].args).toEqual({ p_token: 'tok', p_selected_option: 'B', p_question_id: 'q1' });

    h.state.rpcResult = { data: null, error: { message: 'ALREADY_ANSWERED: an answer has already been submitted for this question.' } };
    const dup = await gameService.submitAnswer('tok', 'B', 'q1');
    expect(dup).toMatchObject({ success: false, alreadyAnswered: true });

    h.state.rpcResult = { data: null, error: { message: 'The game is paused by the host. Please try again shortly.' } };
    expect((await gameService.submitAnswer('tok', 'B', 'q2')).error).toMatch(/paused by the host/);
  });

  it('network interruption becomes a friendly error, not a crash', async () => {
    h.supabase.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(gameService.getChallengeByToken('tok')).rejects.toThrow(/Cannot reach the database/);
  });

  it('getLeaderboard ignores malformed ids and otherwise calls get_leaderboard', async () => {
    expect(await gameService.getLeaderboard('nope')).toBeNull();
    h.state.rpcResult = { data: { game: {}, rows: [] }, error: null };
    await gameService.getLeaderboard(GAME);
    expect(h.state.rpcCalls[0].fn).toBe('get_leaderboard');
  });
});

describe('topics', () => {
  it('toggleTopic reports failure when no row was updated (e.g. not permitted) instead of pretending success', async () => {
    h.state.tableResult = { data: [], error: null, count: 0 };
    await expect(gameService.toggleTopic('t', false)).rejects.toThrow(/not updated/);
    h.state.tableResult = { data: [{ id: 't' }], error: null, count: 1 };
    await expect(gameService.toggleTopic('t', false)).resolves.toBeUndefined();
  });

  it('deleteTopic goes through the safe RPC; a used topic is refused with guidance', async () => {
    h.state.rpcResult = { data: null, error: { message: 'Topic "Cricket & Sports" is used by 2 game(s) and 3 challenge(s). Disable it instead so history is preserved.' } };
    await expect(gameService.deleteTopic('t')).rejects.toThrow(/Disable it instead/);
    expect(h.state.rpcCalls[0].fn).toBe('admin_delete_topic');
  });

  it('addTopic rejects blank, over-long and duplicate names client-side', async () => {
    await expect(gameService.addTopic('   ', '')).rejects.toThrow(/cannot be empty/);
    await expect(gameService.addTopic('x'.repeat(61), '')).rejects.toThrow(/60 characters/);
    h.state.tableResult = { data: [{ id: '1', name: 'Cricket & Sports', is_active: true }], error: null, count: 1 };
    await expect(gameService.addTopic('cricket & sports', '')).rejects.toThrow(/already exists/);
  });
});
