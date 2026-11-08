/**
 * In-process Postgres (PGlite) harness that mimics the parts of Supabase our SQL relies on:
 *   - roles anon / authenticated / service_role (+ Supabase's default EXECUTE/ table grants)
 *   - auth.users, auth.uid(), auth.role() driven by request.jwt.claim.* settings
 *   - supabase_realtime publication
 * It then applies the REAL migration files from supabase/migrations in order, so the SQL
 * under test is byte-for-byte what is shipped. RLS is enforced because queries run under
 * `set role anon|authenticated`.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
export const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';

const SUPABASE_STUBS = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create publication supabase_realtime;
`;

export type Who = { role: 'anon' | 'authenticated' | 'service_role' | 'postgres'; sub?: string };
export const ANON: Who = { role: 'anon' };
export const ADMIN: Who = { role: 'authenticated', sub: ADMIN_ID };
export const NON_ADMIN_USER: Who = { role: 'authenticated', sub: OTHER_USER_ID };
export const SERVICE: Who = { role: 'service_role' };

export interface Db {
  pg: PGlite;
  /** Run `fn` with the session switched to the given Supabase-style caller. */
  as<T>(who: Who, fn: () => Promise<T>): Promise<T>;
  /** Run a query as a caller; returns rows. */
  q<T = any>(who: Who, sql: string, params?: any[]): Promise<T[]>;
  /** Call a function as a caller and return its (jsonb/scalar) result. */
  rpc<T = any>(who: Who, fn: string, args?: Record<string, any>): Promise<T>;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

export async function createDb(opts: { upTo?: string } = {}): Promise<Db> {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(SUPABASE_STUBS);
  await pg.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [
    ADMIN_ID, 'admin@test.local', OTHER_USER_ID, 'player@test.local',
  ]);

  const db = makeDb(pg);
  for (const f of migrationFiles()) {
    if (opts.upTo && f > opts.upTo) break;
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    if (f.startsWith('20260101')) {
      // The init migration creates public.admins; register the admin once it exists.
      await pg.query('insert into public.admins (user_id, email) values ($1, $2) on conflict do nothing', [ADMIN_ID, 'admin@test.local']);
    }
  }
  return db;
}

export function makeDb(pg: PGlite): Db {
  const setWho = async (who: Who) => {
    await pg.exec('reset role');
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`, [
      who.sub ?? '', who.role === 'postgres' ? '' : who.role,
    ]);
    if (who.role !== 'postgres') await pg.exec(`set role ${who.role}`);
  };
  const db: Db = {
    pg,
    async as(who, fn) {
      await setWho(who);
      try { return await fn(); } finally { await pg.exec('reset role'); }
    },
    async q(who, sql, params) {
      return db.as(who, async () => (await pg.query<any>(sql, params)).rows);
    },
    async rpc(who, fn, args = {}) {
      const keys = Object.keys(args);
      const placeholders = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const rows = await db.q(who, `select public.${fn}(${placeholders}) as r`, keys.map((k) => args[k]));
      return rows[0]?.r;
    },
  };
  return db;
}

/** Expect a promise to reject with a message matching the regex. */
export async function expectError(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (e: any) {
    if (!re.test(String(e?.message))) throw new Error(`Expected error ${re}, got: ${e?.message}`);
    return;
  }
  throw new Error(`Expected error ${re} but call succeeded`);
}

// ----- Test data builders ---------------------------------------------------------------

let qCounter = 0;
export function makePoolQuestions(topicLabel: string, easy = 4, medium = 4, hard = 2) {
  const mk = (difficulty: string, i: number) => {
    qCounter++;
    return {
      question_text: `${topicLabel} ${difficulty} question number ${i} (#${qCounter}) - which option is right?`,
      option_a: `${topicLabel} ${qCounter} alpha`,
      option_b: `${topicLabel} ${qCounter} bravo`,
      option_c: `${topicLabel} ${qCounter} charlie`,
      option_d: `${topicLabel} ${qCounter} delta`,
      correct_option: ['A', 'B', 'C', 'D'][qCounter % 4],
      explanation: `Because ${qCounter}.`,
      difficulty,
    };
  };
  return [
    ...Array.from({ length: easy }, (_, i) => mk('easy', i + 1)),
    ...Array.from({ length: medium }, (_, i) => mk('medium', i + 1)),
    ...Array.from({ length: hard }, (_, i) => mk('hard', i + 1)),
  ];
}

export async function topicIdByName(db: Db, name: string): Promise<string> {
  const rows = await db.q(SERVICE, 'select id from public.topics where name = $1', [name]);
  return rows[0].id;
}

export const TOPICS = {
  movies: 'Movies & Entertainment',
  cricket: 'Cricket & Sports',
  ai: 'AI & Technology',
};

/** Creates a registration-open game with the 3 QA topics and a full pool. Returns ids. */
export async function seedGame(db: Db, name: string, opts: { pool?: boolean; topics?: string[]; settings?: any } = {}) {
  const topicNames = opts.topics ?? [TOPICS.movies, TOPICS.cricket, TOPICS.ai];
  const topicIds = await Promise.all(topicNames.map((n) => topicIdByName(db, n)));
  const res = await db.rpc(ADMIN, 'admin_create_game', {
    p_name: name, p_description: 'QA', p_settings: JSON.stringify(opts.settings ?? { min_participants: 3, max_participants: 10, points_correct: 10 }),
    p_topic_ids: topicIds, p_initial_status: 'registration_open',
  });
  const gameId: string = res.game_id;
  if (opts.pool !== false) {
    for (let i = 0; i < topicIds.length; i++) {
      await db.rpc(ADMIN, 'admin_save_pool_questions', {
        p_game_id: gameId, p_topic_id: topicIds[i], p_questions: JSON.stringify(makePoolQuestions(topicNames[i])),
      });
    }
  }
  return { gameId, topicIds, topicNames };
}

export async function addPlayers(db: Db, gameId: string, players: Array<[string, string]>) {
  const out: Record<string, { id: string; token: string; code: string }> = {};
  for (const [name, code] of players) {
    const r = await db.rpc(ADMIN, 'admin_add_participant', { p_game_id: gameId, p_display_name: name, p_player_code: code });
    out[name] = { id: r.participant_id, token: r.raw_token, code };
  }
  return out;
}
