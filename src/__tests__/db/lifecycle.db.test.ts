// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDb, ANON, ADMIN, SERVICE, Db, expectError, seedGame, addPlayers, topicIdByName, makePoolQuestions, TOPICS,
} from './harness';

const status = async (db: Db, id: string) => (await db.q(SERVICE, `select status from public.games where id = $1`, [id]))[0]?.status;
const act = (db: Db, id: string, a: string) => db.rpc(ADMIN, 'admin_set_game_status', { p_game_id: id, p_action: a });

async function backdate(db: Db, gameId: string, hours: number) {
  // The status guard trigger stamps updated_at; disable it only to age a disposable test row.
  await db.pg.exec('alter table public.games disable trigger trg_guard_game_status');
  await db.pg.query(`update public.games set updated_at = now() - make_interval(hours => $2) where id = $1`, [gameId, hours]);
  await db.pg.exec('alter table public.games enable trigger trg_guard_game_status');
}

describe('game lifecycle, participants, topics, rules, delete & cleanup', () => {
  let db: Db;
  beforeAll(async () => { db = await createDb(); }, 120_000);

  describe('create game validation', () => {
    it('rejects invalid configurations with clear messages', async () => {
      const t = [await topicIdByName(db, TOPICS.movies)];
      const call = (over: any) => db.rpc(ADMIN, 'admin_create_game', {
        p_name: 'V', p_description: '', p_settings: JSON.stringify({}), p_topic_ids: t, p_initial_status: 'registration_open', ...over });
      await expectError(call({ p_name: '   ' }), /name cannot be empty/i);
      await expectError(call({ p_name: 'x'.repeat(81) }), /80 characters/i);
      await expectError(call({ p_settings: JSON.stringify({ min_participants: 1 }) }), /at least|between 2 and 100/i);
      await expectError(call({ p_settings: JSON.stringify({ min_participants: 5, max_participants: 3 }) }), /cannot be less than minimum/i);
      await expectError(call({ p_settings: JSON.stringify({ max_participants: 500 }) }), /cannot exceed 100/i);
      await expectError(call({ p_settings: JSON.stringify({ points_correct: 0 }) }), /between 1 and 100/i);
      await expectError(call({ p_settings: JSON.stringify({ points_correct: 'abc' }) }), /whole number/i);
      await expectError(call({ p_topic_ids: [] }), /at least 1 topic/i);
      await expectError(call({ p_topic_ids: ['00000000-0000-0000-0000-000000000000'] }), /do not exist or are disabled/i);
      await expectError(call({ p_initial_status: 'active' }), /Draft or Registration Open/i);
    });

    it('rejects a duplicate open game name but allows reuse after completion/cancel', async () => {
      const a = await seedGame(db, 'Dup Name', { pool: false });
      await expectError(seedGame(db, 'dup name', { pool: false }), /already exists/i);
      await act(db, a.gameId, 'cancel');
      const again = await seedGame(db, 'Dup Name', { pool: false });
      expect(again.gameId).not.toBe(a.gameId);
    });

    it('creates game + game_topics + round 1 atomically', async () => {
      const g = await seedGame(db, 'Atomic Game', { pool: false });
      expect((await db.q(SERVICE, `select count(*)::int c from public.game_topics where game_id = $1`, [g.gameId]))[0].c).toBe(3);
      const r = await db.q(SERVICE, `select round_number, status from public.game_rounds where game_id = $1`, [g.gameId]);
      expect(r).toEqual([{ round_number: 1, status: 'active' }]);
    });

    it('applies validated defaults; disabled topics cannot be selected for new games', async () => {
      const t = await topicIdByName(db, TOPICS.ai);
      await db.q(ADMIN, `update public.topics set is_active = false where id = $1`, [t]);
      await expectError(db.rpc(ADMIN, 'admin_create_game', { p_name: 'Disabled Topic Game', p_description: '', p_settings: '{}', p_topic_ids: [t], p_initial_status: 'draft' }), /disabled/i);
      await db.q(ADMIN, `update public.topics set is_active = true where id = $1`, [t]);
    });
  });

  describe('start gate', () => {
    it('lists exactly what is missing: participants AND incomplete pool', async () => {
      const g = await seedGame(db, 'Gate Game', { pool: false, settings: { min_participants: 3, max_participants: 5 } });
      await addPlayers(db, g.gameId, [['P1', 'A']]);
      await db.rpc(ADMIN, 'admin_save_pool_questions', { p_game_id: g.gameId, p_topic_id: g.topicIds[0], p_questions: JSON.stringify(makePoolQuestions('Movies', 3, 3, 1)) });
      await db.rpc(ADMIN, 'admin_save_pool_questions', { p_game_id: g.gameId, p_topic_id: g.topicIds[1], p_questions: JSON.stringify(makePoolQuestions('Cricket', 7, 0, 0)) }); // 7 but wrong mix
      let err = '';
      try { await act(db, g.gameId, 'start'); } catch (e: any) { err = e.message; }
      expect(err).toMatch(/Cannot start game/);
      expect(err).toMatch(/At least 3 participants are required but only 1 added/);
      expect(err).toMatch(/Cricket & Sports \(7 questions: 7 easy \/ 0 medium \/ 0 hard\)/);
      expect(err).toMatch(/AI & Technology \(0 questions/);
      expect(err).not.toMatch(/Movies & Entertainment \(/); // movies pool is valid 3/3/1
      expect(await status(db, g.gameId)).toBe('registration_open'); // nothing changed
    });

    it('a pool of >=7 questions with a bad difficulty mix is NOT enough (3E/3M/1H rule)', async () => {
      const g = await seedGame(db, 'Mix Game', { pool: false, topics: [TOPICS.movies] });
      await addPlayers(db, g.gameId, [['P1', 'A'], ['P2', 'B'], ['P3', 'C']]);
      await db.rpc(ADMIN, 'admin_save_pool_questions', { p_game_id: g.gameId, p_topic_id: g.topicIds[0], p_questions: JSON.stringify(makePoolQuestions('Movies', 5, 5, 0)) });
      await expectError(act(db, g.gameId, 'start'), /Incomplete: Movies & Entertainment \(10 questions: 5 easy \/ 5 medium \/ 0 hard\)/);
      await db.rpc(ADMIN, 'admin_save_pool_questions', { p_game_id: g.gameId, p_topic_id: g.topicIds[0], p_questions: JSON.stringify(makePoolQuestions('MoviesHard', 0, 0, 1)) });
      await act(db, g.gameId, 'start');
      expect(await status(db, g.gameId)).toBe('active');
    });

    it('enforces the maximum participant limit at add time and at start time', async () => {
      const g = await seedGame(db, 'Max Game', { settings: { min_participants: 2, max_participants: 2 } });
      await addPlayers(db, g.gameId, [['M1', 'A'], ['M2', 'B']]);
      await expectError(db.rpc(ADMIN, 'admin_add_participant', { p_game_id: g.gameId, p_display_name: 'M3', p_player_code: 'C' }), /maximum of 2 participants/i);
    });

    it('rejects pool questions that are invalid or duplicates and reports why', async () => {
      const g = await seedGame(db, 'Pool Validation', { pool: false, topics: [TOPICS.movies] });
      const good = makePoolQuestions('PV', 1, 0, 0)[0];
      const res = await db.rpc(ADMIN, 'admin_save_pool_questions', {
        p_game_id: g.gameId, p_topic_id: g.topicIds[0], p_questions: JSON.stringify([
          good, good,
          { ...good, question_text: 'Same option text question here?', option_a: 'dup', option_b: 'DUP' },
          { ...good, question_text: 'Bad correct option question here?', correct_option: 'E' },
          { ...good, question_text: 'Bad difficulty question is here?', difficulty: 'extreme' },
          { ...good, question_text: 'short' },
          { ...good, question_text: 'Missing option text question?', option_c: '' },
        ]),
      });
      expect(res.inserted).toBe(1);
      expect(res.duplicates).toBe(1);
      expect(res.rejected).toHaveLength(5);
      const reasons = res.rejected.map((r: any) => r.reason).join('|');
      expect(reasons).toMatch(/distinct/);
      expect(reasons).toMatch(/correct_option/);
      expect(reasons).toMatch(/difficulty/);
    });
  });

  describe('status transitions', () => {
    let g: Awaited<ReturnType<typeof seedGame>>;
    beforeAll(async () => {
      g = await seedGame(db, 'Transition Game');
      await addPlayers(db, g.gameId, [['T1', 'A'], ['T2', 'B'], ['T3', 'C']]);
    });

    it('rejects out-of-order actions while registration is open', async () => {
      await expectError(act(db, g.gameId, 'complete'), /Only a game that is in progress can be completed/);
      await expectError(act(db, g.gameId, 'pause'), /Only an active game can be paused/);
      await expectError(act(db, g.gameId, 'resume'), /Only a paused game can be resumed/);
      await expectError(act(db, g.gameId, 'open_registration'), /Only a draft game/);
      await expectError(act(db, g.gameId, 'explode'), /Unknown game action/);
    });

    it('REGISTRATION_OPEN -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED', async () => {
      await act(db, g.gameId, 'start');           expect(await status(db, g.gameId)).toBe('active');
      await act(db, g.gameId, 'pause');           expect(await status(db, g.gameId)).toBe('paused');
      await act(db, g.gameId, 'resume');          expect(await status(db, g.gameId)).toBe('active');
      await act(db, g.gameId, 'complete');        expect(await status(db, g.gameId)).toBe('completed');
      const round = await db.q(SERVICE, `select status from public.game_rounds where game_id = $1`, [g.gameId]);
      expect(round[0].status).toBe('revealed');
    });

    it('a completed game cannot be restarted, resumed, paused, cancelled or completed again', async () => {
      for (const a of ['start', 'resume', 'pause', 'cancel', 'complete']) {
        await expectError(act(db, g.gameId, a), /cannot be restarted|Only|already/i);
      }
      expect(await status(db, g.gameId)).toBe('completed');
    });

    it('a cancelled game stays cancelled (no restart) and its round is closed', async () => {
      const c = await seedGame(db, 'Cancel Me');
      await addPlayers(db, c.gameId, [['C1', 'A'], ['C2', 'B'], ['C3', 'C']]);
      await act(db, c.gameId, 'start');
      await act(db, c.gameId, 'cancel');
      expect(await status(db, c.gameId)).toBe('cancelled');
      await expectError(act(db, c.gameId, 'start'), /cancelled game cannot be restarted/);
      await expectError(act(db, c.gameId, 'cancel'), /already cancelled/);
      await expectError(act(db, c.gameId, 'complete'), /Only a game that is in progress/);
      expect((await db.q(SERVICE, `select status from public.game_rounds where game_id = $1`, [c.gameId]))[0].status).toBe('closed');
      // cancel keeps the records (no automatic deletion)
      expect((await db.q(SERVICE, `select count(*)::int c from public.participants where game_id = $1`, [c.gameId]))[0].c).toBe(3);
    });

    it('draft -> registration_open, and draft/registration games can be cancelled', async () => {
      const d = await db.rpc(ADMIN, 'admin_create_game', { p_name: 'Draft G', p_description: '', p_settings: '{}', p_topic_ids: [g.topicIds[0]], p_initial_status: 'draft' });
      await act(db, d.game_id, 'open_registration');
      expect(await status(db, d.game_id)).toBe('registration_open');
      await act(db, d.game_id, 'cancel');
      expect(await status(db, d.game_id)).toBe('cancelled');
    });
  });

  describe('edit game', () => {
    it('name editable always (until finished); rules locked after start; validation applies', async () => {
      const g = await seedGame(db, 'Edit Game');
      await addPlayers(db, g.gameId, [['E1', 'A'], ['E2', 'B'], ['E3', 'C']]);
      await db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: 'Edit Game 2', p_description: 'd', p_settings: JSON.stringify({ points_correct: 20, max_participants: 8 }) });
      const s = (await db.q(SERVICE, `select name, settings from public.games where id = $1`, [g.gameId]))[0];
      expect(s.name).toBe('Edit Game 2');
      expect(s.settings.points_correct).toBe(20);
      expect(s.settings.max_participants).toBe(8);
      await expectError(db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: 'Edit Game 2', p_description: '', p_settings: JSON.stringify({ min_participants: 2, max_participants: 2 }) }), /lower than the 3 participants/);
      await expectError(db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: '', p_description: '', p_settings: '{}' }), /cannot be empty/);
      await act(db, g.gameId, 'start');
      await expectError(db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: 'x', p_description: '', p_settings: JSON.stringify({ points_correct: 99 }) }), /Rules are locked/);
      await db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: 'Renamed Live', p_description: '', p_settings: '{}' });
      await act(db, g.gameId, 'complete');
      await expectError(db.rpc(ADMIN, 'admin_update_game', { p_game_id: g.gameId, p_name: 'z', p_description: '', p_settings: '{}' }), /can no longer be edited/);
    });

    it('global default rules apply to NEW games and never silently change existing ones', async () => {
      const before = await seedGame(db, 'Before Defaults', { pool: false, settings: {} });
      const beforePts = (await db.q(SERVICE, `select settings->>'points_correct' p from public.games where id = $1`, [before.gameId]))[0].p;
      await db.rpc(ADMIN, 'admin_set_default_rules', { p_rules: JSON.stringify({ min_participants: 4, max_participants: 12, points_correct: 25, points_wrong: 0 }) });
      const after = await seedGame(db, 'After Defaults', { pool: false, settings: {} });
      const a = (await db.q(SERVICE, `select settings from public.games where id = $1`, [after.gameId]))[0].settings;
      expect([a.min_participants, a.max_participants, a.points_correct]).toEqual([4, 12, 25]);
      const stillBefore = (await db.q(SERVICE, `select settings->>'points_correct' p from public.games where id = $1`, [before.gameId]))[0].p;
      expect(stillBefore).toBe(beforePts);
      await expectError(db.rpc(ADMIN, 'admin_set_default_rules', { p_rules: JSON.stringify({ points_correct: -5 }) }), /between 1 and 100/);
      await db.rpc(ADMIN, 'admin_set_default_rules', { p_rules: JSON.stringify({ min_participants: 3, max_participants: 30, points_correct: 10, points_wrong: 0 }) });
    });
  });

  describe('participants', () => {
    let g: Awaited<ReturnType<typeof seedGame>>;
    beforeAll(async () => { g = await seedGame(db, 'Participant Game', { settings: { min_participants: 2, max_participants: 4 } }); });

    it('adds participants with unique 48+ char tokens, server-generated, never stored in plaintext on the participant row', async () => {
      const p = await addPlayers(db, g.gameId, [['Arun', 'A'], ['Rahul', 'B']]);
      expect(p.Arun.token).not.toBe(p.Rahul.token);
      expect(p.Arun.token).toMatch(/^[0-9a-f]{64}$/);
      const row = (await db.q(SERVICE, `select invitation_token_hash from public.participants where id = $1`, [p.Arun.id]))[0];
      expect(row.invitation_token_hash).not.toBe(p.Arun.token);
      expect(row.invitation_token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects duplicate name (case-insensitive), duplicate code, invalid name/code', async () => {
      const add = (n: string, c: string) => db.rpc(ADMIN, 'admin_add_participant', { p_game_id: g.gameId, p_display_name: n, p_player_code: c });
      await expectError(add('arun', 'Z'), /already exists/);
      await expectError(add('  ARUN  ', 'Z'), /already exists/);
      await expectError(add('Newbie', 'a'), /already taken/);
      await expectError(add('', 'Z'), /cannot be empty/);
      await expectError(add('x'.repeat(41), 'Z'), /40 characters/);
      await expectError(add('Bad\u0007Name', 'Z'), /invalid characters/);
      await expectError(add('Newbie', ''), /1-4 letters or digits/);
      await expectError(add('Newbie', 'TOOLONG'), /1-4 letters or digits/);
      await expectError(add('Newbie', 'A-1'), /1-4 letters or digits/);
    });

    it('edit changes only the targeted participant; invitation link keeps working', async () => {
      const rows = await db.q(SERVICE, `select id, display_name from public.participants where game_id = $1 order by player_code`, [g.gameId]);
      const [arun, rahul] = rows;
      const tokenBefore = (await db.q(SERVICE, `select raw_token from public.participant_secrets where participant_id = $1`, [arun.id]))[0].raw_token;
      await db.rpc(ADMIN, 'admin_update_participant', { p_participant_id: arun.id, p_display_name: 'Arun K', p_player_code: 'a', p_contact: '+971500000000' });
      const after = await db.q(SERVICE, `select id, display_name, player_code, email_or_contact from public.participants where game_id = $1 order by id`, [g.gameId]);
      expect(after.find((r: any) => r.id === arun.id)).toMatchObject({ display_name: 'Arun K', player_code: 'A', email_or_contact: '+971500000000' });
      expect(after.find((r: any) => r.id === rahul.id)).toMatchObject({ display_name: 'Rahul', player_code: 'B' });
      expect((await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: tokenBefore })).participant.display_name).toBe('Arun K');
      await expectError(db.rpc(ADMIN, 'admin_update_participant', { p_participant_id: arun.id, p_display_name: 'Rahul', p_player_code: 'A' }), /already exists/);
      await expectError(db.rpc(ADMIN, 'admin_update_participant', { p_participant_id: arun.id, p_display_name: 'Arun K', p_player_code: 'B' }), /already taken/);
    });

    it('statuses are real DB state: pending -> joined on first open', async () => {
      const [r] = await db.q(SERVICE, `select id, status from public.participants where game_id = $1 and player_code = 'B'`, [g.gameId]);
      expect(r.status).toBe('pending');
      const tok = (await db.q(SERVICE, `select raw_token from public.participant_secrets where participant_id = $1`, [r.id]))[0].raw_token;
      await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: tok });
      expect((await db.q(SERVICE, `select status, joined_at from public.participants where id = $1`, [r.id]))[0].status).toBe('joined');
    });

    it('regenerate revokes the old link immediately and issues a working new one', async () => {
      const [r] = await db.q(SERVICE, `select id from public.participants where game_id = $1 and player_code = 'A'`, [g.gameId]);
      const old = (await db.q(SERVICE, `select raw_token from public.participant_secrets where participant_id = $1`, [r.id]))[0].raw_token;
      const res = await db.rpc(ADMIN, 'admin_regenerate_invitation', { p_participant_id: r.id });
      expect(res.raw_token).not.toBe(old);
      expect(await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: old })).toBeNull();
      expect((await db.rpc(ANON, 'participant_join', { p_game_id: g.gameId, p_token: res.raw_token })).participant.id).toBe(r.id);
    });

    it('remove deletes only that participant and updates counts; blocked when they have challenges', async () => {
      const more = await addPlayers(db, g.gameId, [['Temp', 'T']]);
      const before = (await db.q(SERVICE, `select count(*)::int c from public.participants where game_id = $1`, [g.gameId]))[0].c;
      await db.rpc(ADMIN, 'admin_remove_participant', { p_participant_id: more.Temp.id });
      expect((await db.q(SERVICE, `select count(*)::int c from public.participants where game_id = $1`, [g.gameId]))[0].c).toBe(before - 1);
      expect((await db.q(SERVICE, `select count(*)::int c from public.participant_secrets where participant_id = $1`, [more.Temp.id]))[0].c).toBe(0);

      // now a participant with a challenge
      const h = await seedGame(db, 'Remove Guard');
      const pl = await addPlayers(db, h.gameId, [['R1', 'A'], ['R2', 'B'], ['R3', 'C']]);
      await act(db, h.gameId, 'start');
      await db.rpc(ANON, 'participant_create_challenge', { p_game_id: h.gameId, p_token: pl.R1.token, p_receiver_id: pl.R2.id, p_topic_id: h.topicIds[0] });
      await expectError(db.rpc(ADMIN, 'admin_remove_participant', { p_participant_id: pl.R2.id }), /part of 1 challenge/);
      await expectError(db.rpc(ADMIN, 'admin_remove_participant', { p_participant_id: pl.R1.id }), /part of 1 challenge/);
      expect((await db.q(SERVICE, `select count(*)::int c from public.assignments where game_id = $1`, [h.gameId]))[0].c).toBe(1);
      await db.rpc(ADMIN, 'admin_remove_participant', { p_participant_id: pl.R3.id }); // uninvolved -> fine
    });

    it('cannot add/regenerate on a finished game', async () => {
      const h = await seedGame(db, 'Finished Game', { pool: false });
      const pl = await addPlayers(db, h.gameId, [['F1', 'A']]);
      await act(db, h.gameId, 'cancel');
      await expectError(db.rpc(ADMIN, 'admin_add_participant', { p_game_id: h.gameId, p_display_name: 'F2', p_player_code: 'B' }), /Cannot add participants to a cancelled game/);
      await expectError(db.rpc(ADMIN, 'admin_regenerate_invitation', { p_participant_id: pl.F1.id }), /cannot be regenerated/);
    });
  });

  describe('topics', () => {
    it('cannot delete a topic used by a game (disable instead); unused custom topic can be deleted', async () => {
      const used = await seedGame(db, 'Topic Usage', { pool: false, topics: [TOPICS.movies] });
      await expectError(db.rpc(ADMIN, 'admin_delete_topic', { p_topic_id: used.topicIds[0] }), /is used by \d+ game\(s\) and \d+ challenge\(s\)\. Disable it instead/i);
      // direct deletion is also blocked at the FK level (no cascade into live data)
      await expectError(db.q(ADMIN, `delete from public.topics where id = $1`, [used.topicIds[0]]), /violates foreign key|restrict/i);
      expect((await db.q(SERVICE, `select count(*)::int c from public.game_topics where game_id = $1`, [used.gameId]))[0].c).toBe(1);

      const created = await db.q(ADMIN, `insert into public.topics (name, description) values ('Science', 'Physics etc') returning id`);
      await db.rpc(ADMIN, 'admin_delete_topic', { p_topic_id: created[0].id });
      expect((await db.q(SERVICE, `select count(*)::int c from public.topics where name = 'Science'`))[0].c).toBe(0);
    });

    it('disable/enable persists; disabled topic still exists for history; topic names are unique', async () => {
      const t = await topicIdByName(db, TOPICS.cricket);
      await db.q(ADMIN, `update public.topics set is_active = false where id = $1`, [t]);
      expect((await db.q(ANON, `select is_active from public.topics where id = $1`, [t]))[0].is_active).toBe(false);
      await db.q(ADMIN, `update public.topics set is_active = true where id = $1`, [t]);
      await expectError(db.q(ADMIN, `insert into public.topics (name) values ('Cricket & Sports')`), /duplicate key|unique/i);
    });

    it('topic stats expose per-topic usage for the admin', async () => {
      const stats = await db.rpc(ADMIN, 'admin_topic_stats');
      const movies = await topicIdByName(db, TOPICS.movies);
      const row = stats.find((s: any) => s.topic_id === movies);
      expect(row.games_using).toBeGreaterThan(0);
      expect(stats).toHaveLength(10); // the 10 default topics (custom "Science" was deleted above)
    });
  });

  describe('delete & retention cleanup', () => {
    it('refuses to delete in-progress games; deletes registration/cancelled/completed games with an impact summary; leaves other games alone', async () => {
      const keep = await seedGame(db, 'Keep Me');
      const act1 = await seedGame(db, 'Active Game');
      await addPlayers(db, act1.gameId, [['K1', 'A'], ['K2', 'B'], ['K3', 'C']]);
      await act(db, act1.gameId, 'start');
      await expectError(db.rpc(ADMIN, 'admin_delete_game', { p_game_id: act1.gameId }), /in progress.*Cancel or complete/);
      await act(db, act1.gameId, 'pause');
      await expectError(db.rpc(ADMIN, 'admin_delete_game', { p_game_id: act1.gameId }), /in progress/);
      expect(await status(db, act1.gameId)).toBe('paused');

      const victim = await seedGame(db, 'Delete Me');
      const pl = await addPlayers(db, victim.gameId, [['D1', 'A'], ['D2', 'B'], ['D3', 'C']]);
      const res = await db.rpc(ADMIN, 'admin_delete_game', { p_game_id: victim.gameId });
      expect(res).toMatchObject({ name: 'Delete Me', participants_removed: 3, challenges_removed: 0 });
      // no orphans left behind
      for (const [t, col] of [['participants', 'game_id'], ['game_topics', 'game_id'], ['game_rounds', 'game_id'], ['questions', 'game_id'], ['game_events', 'game_id'], ['scores', 'game_id']]) {
        expect((await db.q(SERVICE, `select count(*)::int c from public.${t} where ${col} = $1`, [victim.gameId]))[0].c, t).toBe(0);
      }
      expect((await db.q(SERVICE, `select count(*)::int c from public.participant_secrets where participant_id = $1`, [pl.D1.id]))[0].c).toBe(0);
      // the other games are untouched
      expect(await status(db, keep.gameId)).toBe('registration_open');
      expect((await db.q(SERVICE, `select count(*)::int c from public.questions where game_id = $1`, [keep.gameId]))[0].c).toBe(30);
      expect(await status(db, act1.gameId)).toBe('paused');
      await expectError(db.rpc(ADMIN, 'admin_delete_game', { p_game_id: victim.gameId }), /Game not found/);
    });

    it('delete cascades a played game fully (challenges, questions, answers, scores)', async () => {
      const g = await seedGame(db, 'Played Then Deleted');
      const pl = await addPlayers(db, g.gameId, [['L1', 'A'], ['L2', 'B'], ['L3', 'C']]);
      await act(db, g.gameId, 'start');
      const ch = await db.rpc(ANON, 'participant_create_challenge', { p_game_id: g.gameId, p_token: pl.L1.token, p_receiver_id: pl.L2.id, p_topic_id: g.topicIds[0] });
      const q = (await db.q(SERVICE, `select id, correct_option from public.questions where assignment_id = $1 order by sequence_num limit 1`, [ch.assignment_id]))[0];
      await db.rpc(ANON, 'submit_challenge_answer', { p_token: ch.raw_token, p_selected_option: q.correct_option, p_question_id: q.id });
      await act(db, g.gameId, 'complete');
      const res = await db.rpc(ADMIN, 'admin_delete_game', { p_game_id: g.gameId });
      expect(res).toMatchObject({ challenges_removed: 1, answers_removed: 1 });
      expect((await db.q(SERVICE, `select count(*)::int c from public.answers where assignment_id = $1`, [ch.assignment_id]))[0].c).toBe(0);
      expect((await db.q(SERVICE, `select count(*)::int c from public.assignment_secrets where assignment_id = $1`, [ch.assignment_id]))[0].c).toBe(0);
      expect(await db.rpc(ANON, 'get_challenge_by_token', { p_token: ch.raw_token })).toBeNull(); // old link now invalid
    });

    it('cleanup removes ONLY completed/cancelled games older than the retention window', async () => {
      const mk = async (name: string, finalAction: string | null, ageHours: number) => {
        const g = await seedGame(db, name);
        await addPlayers(db, g.gameId, [[`${name}1`.slice(0, 20), 'A'], [`${name}2`.slice(0, 20), 'B'], [`${name}3`.slice(0, 20), 'C']]);
        if (finalAction === 'complete') { await act(db, g.gameId, 'start'); await act(db, g.gameId, 'complete'); }
        if (finalAction === 'cancel') await act(db, g.gameId, 'cancel');
        if (finalAction === 'active') await act(db, g.gameId, 'start');
        if (finalAction === 'paused') { await act(db, g.gameId, 'start'); await act(db, g.gameId, 'pause'); }
        await backdate(db, g.gameId, ageHours);
        return g.gameId;
      };
      const oldCompleted = await mk('CL old completed', 'complete', 48);
      const oldCancelled = await mk('CL old cancelled', 'cancel', 48);
      const newCompleted = await mk('CL new completed', 'complete', 1);
      const oldActive = await mk('CL old active', 'active', 500);
      const oldPaused = await mk('CL old paused', 'paused', 500);
      const oldRegistration = await mk('CL old registration', null, 500);

      const res = await db.rpc(ADMIN, 'cleanup_completed_games', { p_retention_hours: 24 });
      const names = res.games.map((x: any) => x.name).sort();
      expect(names).toEqual(['CL old cancelled', 'CL old completed']);
      expect(res.cleaned_count).toBe(2);

      expect(await status(db, oldCompleted)).toBeUndefined();
      expect(await status(db, oldCancelled)).toBeUndefined();
      expect(await status(db, newCompleted)).toBe('completed');
      expect(await status(db, oldActive)).toBe('active');
      expect(await status(db, oldPaused)).toBe('paused');
      expect(await status(db, oldRegistration)).toBe('registration_open');
      expect((await db.q(SERVICE, `select count(*)::int c from public.participants where game_id = $1`, [oldActive]))[0].c).toBe(3);
      await expectError(db.rpc(ADMIN, 'cleanup_completed_games', { p_retention_hours: 0 }), /at least 1 hour/);
    });
  });
});
