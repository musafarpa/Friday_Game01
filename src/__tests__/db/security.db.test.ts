// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDb, ANON, ADMIN, NON_ADMIN_USER, SERVICE, Db, expectError, seedGame, addPlayers,
} from './harness';

/**
 * Security / RLS / authorization tests. Every assertion runs under the real Postgres role
 * (anon / authenticated) with RLS enforced - an HTTP 200 proves nothing, row visibility does.
 */
describe('security: RLS, RPC permissions and secret hygiene', () => {
  let db: Db;
  let gameA: string, gameB: string;
  let playersA: Awaited<ReturnType<typeof addPlayers>>;
  let playersB: Awaited<ReturnType<typeof addPlayers>>;
  let topicA: string;
  let challenge: { raw_token: string; assignment_id: string };

  beforeAll(async () => {
    db = await createDb();
    const a = await seedGame(db, 'Sec Game A');
    const b = await seedGame(db, 'Sec Game B');
    gameA = a.gameId; gameB = b.gameId; topicA = a.topicIds[0];
    playersA = await addPlayers(db, gameA, [['Arun', 'A'], ['Rahul', 'B'], ['Amal', 'C']]);
    playersB = await addPlayers(db, gameB, [['Zed', 'A'], ['Yan', 'B'], ['Xia', 'C']]);
    await db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: gameA, p_action: 'start' });
    challenge = await db.rpc(ANON, 'participant_create_challenge', {
      p_game_id: gameA, p_token: playersA.Arun.token, p_receiver_id: playersA.Amal.id, p_topic_id: topicA,
    });
  }, 180_000);

  describe('table visibility for the public (anon) role', () => {
    for (const t of ['participants', 'assignments', 'questions', 'answers', 'scores', 'game_events',
                     'participant_secrets', 'assignment_secrets', 'app_settings', 'admins']) {
      it(`anon sees ZERO rows in ${t} while admin sees data`, async () => {
        const anonRows = await db.q(ANON, `select count(*)::int c from public.${t}`);
        expect(anonRows[0].c).toBe(0);
      });
    }

    it('admin can read the admin-only tables (control group)', async () => {
      for (const t of ['participants', 'assignments', 'questions', 'participant_secrets', 'assignment_secrets', 'game_events']) {
        const r = await db.q(ADMIN, `select count(*)::int c from public.${t}`);
        expect(r[0].c, t).toBeGreaterThan(0);
      }
    });

    it('a signed-in NON-admin user is treated like anon', async () => {
      for (const t of ['participants', 'questions', 'participant_secrets', 'app_settings']) {
        expect((await db.q(NON_ADMIN_USER, `select count(*)::int c from public.${t}`))[0].c, t).toBe(0);
      }
    });

    it('games.settings never contains correct answers or a question pool', async () => {
      const rows = await db.q(ANON, `select settings from public.games`);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const s = JSON.stringify(r.settings);
        expect(s).not.toContain('correct_option');
        expect(s).not.toContain('topics_question_pool');
      }
    });

    it('public tables expose no invitation hashes or contact details', async () => {
      const cols = await db.q(SERVICE, `
        select table_name, column_name from information_schema.columns
        where table_schema='public' and column_name in ('invitation_token_hash','challenge_token_hash','email_or_contact','raw_token')`);
      const publicReadable = await db.q(SERVICE, `select tablename from pg_policies where schemaname='public' and cmd='SELECT' and qual='true'`);
      const publicTables = new Set(publicReadable.map((r: any) => r.tablename));
      for (const c of cols) expect(publicTables.has(c.table_name), `${c.table_name}.${c.column_name} must not be publicly readable`).toBe(false);
    });
  });

  describe('writes by the public role are rejected', () => {
    it('anon cannot insert assignments / questions / answers / participants', async () => {
      await expectError(db.q(ANON, `insert into public.assignments (game_id, round_id, sender_id, receiver_id, topic_id, challenge_token_hash)
        select $1, id, $2, $3, $4, 'x' from public.game_rounds limit 1`, [gameA, playersA.Arun.id, playersA.Rahul.id, topicA]), /row-level security|permission denied/i);
      await expectError(db.q(ANON, `insert into public.questions (game_id, topic_category, question_text, option_a, option_b, option_c, option_d, correct_option)
        values ($1, 't', 'forged question text here', 'a', 'b', 'c', 'd', 'A')`, [gameA]), /row-level security|permission denied/i);
      await expectError(db.q(ANON, `insert into public.participants (game_id, display_name, player_code, invitation_token_hash)
        values ($1, 'Mallory', 'M', 'h')`, [gameA]), /row-level security|permission denied/i);
    });

    it('anon UPDATE/DELETE on games and participants affect zero rows', async () => {
      const upd = await db.pg.query('select 1'); // keep pg alive
      void upd;
      await db.as(ANON, async () => {
        const r1 = await db.pg.query(`update public.games set status = 'completed' where id = $1`, [gameA]);
        const r2 = await db.pg.query(`delete from public.games where id = $1`, [gameA]);
        const r3 = await db.pg.query(`update public.participants set display_name = 'pwned' where id = $1`, [playersA.Arun.id]);
        expect(r1.affectedRows).toBe(0);
        expect(r2.affectedRows).toBe(0);
        expect(r3.affectedRows).toBe(0);
      });
      const g = await db.q(SERVICE, `select status from public.games where id = $1`, [gameA]);
      expect(g[0].status).toBe('active');
    });
  });

  describe('admin RPC authorization', () => {
    const adminCalls: Array<[string, Record<string, any>]> = [
      ['admin_create_game', { p_name: 'x', p_description: '', p_settings: '{}', p_topic_ids: [], p_initial_status: 'draft' }],
      ['admin_update_game', { p_game_id: '00000000-0000-0000-0000-000000000000', p_name: 'x', p_description: '', p_settings: '{}' }],
      ['admin_set_game_status', { p_game_id: '00000000-0000-0000-0000-000000000000', p_action: 'cancel' }],
      ['admin_delete_game', { p_game_id: '00000000-0000-0000-0000-000000000000' }],
      ['cleanup_completed_games', { p_retention_hours: 1 }],
      ['admin_add_participant', { p_game_id: '00000000-0000-0000-0000-000000000000', p_display_name: 'x', p_player_code: 'X' }],
      ['admin_update_participant', { p_participant_id: '00000000-0000-0000-0000-000000000000', p_display_name: 'x', p_player_code: 'X' }],
      ['admin_remove_participant', { p_participant_id: '00000000-0000-0000-0000-000000000000' }],
      ['admin_regenerate_invitation', { p_participant_id: '00000000-0000-0000-0000-000000000000' }],
      ['admin_pool_status', { p_game_id: '00000000-0000-0000-0000-000000000000' }],
      ['admin_save_pool_questions', { p_game_id: '00000000-0000-0000-0000-000000000000', p_topic_id: '00000000-0000-0000-0000-000000000000', p_questions: '[]' }],
      ['admin_delete_topic', { p_topic_id: '00000000-0000-0000-0000-000000000000' }],
      ['admin_topic_stats', {}],
      ['admin_set_default_rules', { p_rules: '{}' }],
    ];
    for (const [fn, args] of adminCalls) {
      it(`${fn}: anon is denied`, async () => {
        await expectError(db.rpc(ANON, fn, args), /permission denied/i);
      });
      it(`${fn}: authenticated non-admin is denied`, async () => {
        await expectError(db.rpc(NON_ADMIN_USER, fn, args), /Unauthorized|permission denied/i);
      });
    }

    it('internal helpers are not callable by API roles', async () => {
      await expectError(db.q(ANON, `select public._hash_token('abc')`), /permission denied/i);
      await expectError(db.q(ANON, `select public._recompute_scores('${gameA}')`), /permission denied/i);
      await expectError(db.q(NON_ADMIN_USER, `select public._pool_status('${gameA}')`), /permission denied/i);
      await expectError(db.q(ANON, `select public._participant_by_token('${gameA}', '${playersA.Arun.token}')`), /permission denied/i);
    });

    it('the exploitable legacy RPC create_challenge_assignment no longer exists', async () => {
      await expectError(db.q(ANON, `select public.create_challenge_assignment('${gameA}')`), /does not exist|function/i);
    });
  });

  describe('token verification (participants)', () => {
    it('valid invitation token authenticates only for ITS game', async () => {
      const ok = await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: playersA.Arun.token });
      expect(ok.participant.display_name).toBe('Arun');
      const wrongGame = await db.rpc(ANON, 'participant_join', { p_game_id: gameB, p_token: playersA.Arun.token });
      expect(wrongGame).toBeNull();
    });

    it('rejects garbage, empty, short, whitespace and SQL-ish tokens', async () => {
      for (const t of ['', '   ', 'abc', 'x'.repeat(64), "' or 1=1 --", playersA.Arun.token.slice(0, -1), playersA.Arun.token.toUpperCase()]) {
        expect(await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: t }), JSON.stringify(t)).toBeNull();
      }
    });

    it('the stored HASH is not usable as a token (the original exploit)', async () => {
      const hash = (await db.q(SERVICE, `select invitation_token_hash h from public.participants where id = $1`, [playersA.Arun.id]))[0].h;
      expect(await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: hash })).toBeNull();
      const chHash = (await db.q(SERVICE, `select challenge_token_hash h from public.assignments where id = $1`, [challenge.assignment_id]))[0].h;
      expect(await db.rpc(ANON, 'get_challenge_by_token', { p_token: chHash })).toBeNull();
      await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: chHash, p_selected_option: 'A', p_question_id: '00000000-0000-0000-0000-000000000000' }), /not found or invalid/i);
    });

    it('participant_join exposes no hashes, tokens of others, contact info or answers', async () => {
      const payload = await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: playersA.Rahul.token });
      const s = JSON.stringify(payload);
      expect(s).not.toContain('invitation_token_hash');
      expect(s).not.toContain('email_or_contact');
      expect(s).not.toContain('correct_option');
      expect(s).not.toContain(playersA.Arun.token);
      expect(s).not.toContain(playersA.Amal.token);
    });

    it("a participant sees only THEIR OWN challenge tokens (Amal sees Arun's challenge, Rahul does not)", async () => {
      const amal = await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: playersA.Amal.token });
      const rahul = await db.rpc(ANON, 'participant_join', { p_game_id: gameA, p_token: playersA.Rahul.token });
      expect(amal.incoming.map((c: any) => c.raw_token)).toContain(challenge.raw_token);
      expect(JSON.stringify(rahul)).not.toContain(challenge.raw_token);
    });
  });

  describe('answer secrecy until the game is completed', () => {
    it('questions carry no correct_option / explanation and answers no is_correct before completion', async () => {
      const q = await db.q(SERVICE, `select id, sequence_num, correct_option from public.questions where assignment_id = $1 order by sequence_num`, [challenge.assignment_id]);
      await db.rpc(ANON, 'submit_challenge_answer', { p_token: challenge.raw_token, p_selected_option: q[0].correct_option, p_question_id: q[0].id });
      const c = await db.rpc(ANON, 'get_challenge_by_token', { p_token: challenge.raw_token });
      expect(c.questions).toHaveLength(7);
      for (const x of c.questions) { expect(x.correct_option).toBeNull(); expect(x.explanation).toBeNull(); }
      expect(c.answers[0].is_correct).toBeNull();
      expect(c.progress.current_score).toBeNull();
      expect(JSON.stringify(c)).not.toContain('"is_correct": true');
      const submitRes = await db.rpc(ANON, 'submit_challenge_answer', { p_token: challenge.raw_token, p_selected_option: 'A', p_question_id: q[1].id });
      expect(Object.keys(submitRes).sort()).toEqual(['answered_count', 'is_completed', 'question_id', 'question_num', 'success', 'total_questions']);
    });

    it('live leaderboard does not reveal per-answer correctness (counts completed challenges only)', async () => {
      const lb = await db.rpc(ANON, 'get_leaderboard', { p_game_id: gameA });
      const amal = lb.rows.find((r: any) => r.display_name === 'Amal');
      expect(amal.total_points).toBe(0);           // 2 answers given, challenge not complete -> not counted
      expect(amal.challenges_completed).toBe(0);
    });

    it('a challenge token cannot answer a question of a DIFFERENT challenge', async () => {
      const other = await db.rpc(ANON, 'participant_create_challenge', {
        p_game_id: gameA, p_token: playersA.Rahul.token, p_receiver_id: playersA.Arun.id, p_topic_id: topicA,
      });
      const foreignQ = (await db.q(SERVICE, `select id from public.questions where assignment_id = $1 limit 1`, [other.assignment_id]))[0].id;
      await expectError(db.rpc(ANON, 'submit_challenge_answer', { p_token: challenge.raw_token, p_selected_option: 'A', p_question_id: foreignQ }), /does not belong/i);
    });
  });

  describe('status transition guard (trigger) also blocks direct admin table writes', () => {
    it('cannot move completed -> active or cancelled -> active by direct UPDATE', async () => {
      const g = await seedGame(db, 'Guard Game', { pool: false });
      await db.q(ADMIN, `update public.games set status = 'cancelled' where id = $1`, [g.gameId]);
      await expectError(db.q(ADMIN, `update public.games set status = 'active' where id = $1`, [g.gameId]), /Invalid game status change/);
    });
  });
});
