// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, makeDb, migrationFiles, MIGRATIONS_DIR, SERVICE, ANON, ADMIN, ADMIN_ID, Db } from './harness';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Upgrade-path test: apply the three historical migrations, seed LEGACY data the way the
 * deployed app produced it (including the leaked question pool inside games.settings),
 * then apply the hardening migration and verify data is preserved and scrubbed.
 */
describe('migration 20260104 - upgrade from legacy cloud state', () => {
  let db: Db;
  let gameId: string;
  let topicId: string;
  const legacyHash = '84664b36981c091fae9f99ed0a659830b4f94daf02723bdb61250aa966cfeee3';

  beforeAll(async () => {
    db = await createDb({ upTo: '20260103000000_seven_questions_per_challenge.sql' });
    topicId = (await db.q(SERVICE, `select id from public.topics where name = 'Movies & Entertainment'`))[0].id;
    const pool = {
      [topicId]: {
        topic_id: topicId, topic_name: 'Movies & Entertainment', status: 'complete',
        questions: [
          { topic_category: 'Movies & Entertainment', question_text: 'Legacy leaked question one is here?', option_a: 'a1', option_b: 'b1', option_c: 'c1', option_d: 'd1', correct_option: 'B', explanation: 'x', difficulty: 'easy' },
          { topic_category: 'Movies & Entertainment', question_text: 'Legacy leaked question one is here?', option_a: 'a1', option_b: 'b1', option_c: 'c1', option_d: 'd1', correct_option: 'B', explanation: 'dup', difficulty: 'easy' },
          { topic_category: 'Movies & Entertainment', question_text: 'Legacy broken question has same options', option_a: 'same', option_b: 'same', option_c: 'c1', option_d: 'd1', correct_option: 'A', explanation: 'bad', difficulty: 'easy' },
        ],
      },
    };
    const settings = { min_participants: 3, max_participants: 30, points_correct: 10, points_wrong: 0, selected_topics: [topicId], topics_question_pool: pool };
    const g = await db.q(SERVICE, `insert into public.games (name, status, settings) values ('ww', 'registration_open', $1::jsonb) returning id`, [JSON.stringify(settings)]);
    gameId = g[0].id;
    await db.q(SERVICE, `insert into public.game_topics (game_id, topic_id) values ($1, $2)`, [gameId, topicId]);
    await db.q(SERVICE, `insert into public.game_rounds (game_id, round_number, status) values ($1, 1, 'active')`, [gameId]);
    await db.q(SERVICE, `insert into public.participants (game_id, display_name, player_code, invitation_token_hash, email_or_contact) values ($1, 'Arun', 'A', $2, 'arun@private.example')`, [gameId, legacyHash]);

    // BEFORE: prove the legacy exploit exists (anon can read answers + token hashes)
    const leaked = await db.q(ANON, `select settings->'topics_question_pool' as pool from public.games where id = $1`, [gameId]);
    expect(JSON.stringify(leaked[0].pool)).toContain('correct_option');
    const hashes = await db.q(ANON, `select invitation_token_hash, email_or_contact from public.participants`);
    expect(hashes[0].invitation_token_hash).toBe(legacyHash);

    // Apply the hardening migration (the file under test)
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260104000000_security_lifecycle_hardening.sql'), 'utf8'));
  }, 120_000);

  it('moves the legacy pool into admin-only public.questions and keeps only valid unique rows', async () => {
    const rows = await db.q(SERVICE, `select question_text, correct_option, topic_id, assignment_id from public.questions where game_id = $1`, [gameId]);
    expect(rows).toHaveLength(1); // duplicate collapsed, same-options row rejected
    expect(rows[0].topic_id).toBe(topicId);
    expect(rows[0].correct_option).toBe('B');
    expect(rows[0].assignment_id).toBeNull();
  });

  it('scrubs the question pool (and every correct answer) out of games.settings', async () => {
    const r = await db.q(ANON, `select settings from public.games where id = $1`, [gameId]);
    expect(r[0].settings.topics_question_pool).toBeUndefined();
    expect(JSON.stringify(r[0].settings)).not.toContain('correct_option');
    expect(r[0].settings.min_participants).toBe(3); // other settings preserved
  });

  it('preserves the existing game, participant and topics', async () => {
    const g = await db.q(SERVICE, `select name, status from public.games where id = $1`, [gameId]);
    expect(g[0]).toEqual({ name: 'ww', status: 'registration_open' });
    expect((await db.q(SERVICE, `select count(*)::int c from public.participants where game_id = $1`, [gameId]))[0].c).toBe(1);
    expect((await db.q(SERVICE, `select count(*)::int c from public.topics`))[0].c).toBe(10);
  });

  it('removes the exploitable legacy RPCs', async () => {
    const rows = await db.q(SERVICE, `
      select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in
        ('get_participant_by_token','create_challenge_assignment','reveal_round_answers','delete_game_room','save_game_question','check_game_ready_to_start')`);
    expect(rows).toEqual([]);
  });

  it('legacy hash can no longer be used as a credential', async () => {
    // The legacy participant has NO raw token stored; presenting the hash must not authenticate.
    const r = await db.rpc(ANON, 'participant_join', { p_game_id: gameId, p_token: legacyHash });
    expect(r).toBeNull();
  });

  it('is idempotent: re-applying the migration succeeds and changes nothing', async () => {
    const before = (await db.q(SERVICE, `select count(*)::int c from public.questions`))[0].c;
    await db.pg.exec(readFileSync(join(MIGRATIONS_DIR, '20260104000000_security_lifecycle_hardening.sql'), 'utf8'));
    const after = (await db.q(SERVICE, `select count(*)::int c from public.questions`))[0].c;
    expect(after).toBe(before);
  }, 60_000);

  it('migrations apply in order from an empty database', async () => {
    const fresh = await createDb();
    expect(migrationFiles()).toHaveLength(6);
    const r = await fresh.q(SERVICE, `select count(*)::int c from public.topics`);
    expect(r[0].c).toBe(10);
  }, 120_000);
});
