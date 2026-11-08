/**
 * LOCAL SUPABASE EMULATOR (test infrastructure - NOT the cloud project).
 *
 * Runs the REAL migrations from supabase/migrations inside an in-process Postgres (PGlite) and exposes
 * the subset of the Supabase HTTP surface the app uses:
 *   - GoTrue:   POST /auth/v1/token (password | refresh_token), GET /auth/v1/user, POST /auth/v1/logout, /recover
 *   - PostgREST: POST /rest/v1/rpc/<fn>, GET/HEAD/POST/PATCH/DELETE /rest/v1/<table> (filters, order, limit,
 *                count=exact, single-object Accept, the specific embeds the app selects)
 *   - Realtime: /realtime/v1/websocket (Phoenix v2 protocol, postgres_changes driven by real DB triggers)
 * Every query runs under `set role anon|authenticated` with request.jwt.claim.* set, so RLS and function
 * grants are enforced exactly like in Supabase. Test helpers live under /__qa/*.
 *
 * Run:  npx tsx scripts/qa/supabase-emulator.ts   (listens on 127.0.0.1:54321)
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createDb, makeDb, Db, ADMIN_ID, OTHER_USER_ID } from '../../src/__tests__/db/harness';

const PORT = Number(process.env.EMULATOR_PORT || 54321);
const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const USERS: Record<string, { id: string; password: string }> = {
  'admin@test.local': { id: ADMIN_ID, password: 'Admin#QA-2026' },
  'player@test.local': { id: OTHER_USER_ID, password: 'Player#QA-2026' },
};

let db: Db;
let sessionEpoch = 0; // bumping this invalidates every previously issued token (expired-session test)
const adminOnlyTables = new Set(['participants', 'assignments', 'questions', 'answers', 'scores', 'game_events', 'participant_secrets', 'assignment_secrets', 'app_settings', 'admins']);

// ---------------------------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------------------------
const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signJwt(payload: Record<string, any>): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
type Claims = { role: 'anon' | 'authenticated'; sub?: string; epoch?: number };
function verifyJwt(token: string): { ok: true; claims: Claims } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid' };
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (sig !== parts[2]) return { ok: false, reason: 'invalid' };
  const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (p.exp * 1000 < Date.now() || (p.epoch ?? 0) < sessionEpoch) return { ok: false, reason: 'JWT expired' };
  return { ok: true, claims: { role: 'authenticated', sub: p.sub, epoch: p.epoch } };
}
function issueSession(email: string) {
  const u = USERS[email];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = signJwt({ sub: u.id, role: 'authenticated', email, exp, epoch: sessionEpoch, aud: 'authenticated' });
  const refresh_token = signJwt({ sub: u.id, kind: 'refresh', email, exp: exp + 86400, epoch: sessionEpoch });
  return {
    access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
function claimsFromReq(req: http.IncomingMessage): { claims: Claims } | { error: { status: number; body: any } } {
  const auth = String(req.headers['authorization'] || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || !token.includes('.')) return { claims: { role: 'anon' } }; // publishable key / no token => anon
  const v = verifyJwt(token);
  if (!v.ok) return { error: { status: 401, body: { code: 'PGRST301', message: v.reason === 'JWT expired' ? 'JWT expired' : 'JWSError JWSInvalidSignature', details: null, hint: null } } };
  return { claims: v.claims };
}

// ---------------------------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'apikey,authorization,content-type,prefer,accept,accept-profile,content-profile,x-client-info,x-supabase-api-version,range,x-upsert',
  'Access-Control-Expose-Headers': 'Content-Range,Content-Profile',
};
async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}
function send(res: http.ServerResponse, status: number, body: any, headers: Record<string, string> = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...headers });
  res.end(payload);
}

function pgErrorToHttp(e: any): { status: number; body: any } {
  const code: string = e?.code || '';
  const message: string = e?.message || String(e);
  if (code === '42501') return { status: 403, body: { code, message, details: null, hint: null } };
  if (code === '23505' || code === '23503') return { status: 409, body: { code, message, details: e.detail ?? null, hint: null } };
  if (code === '42883') return { status: 404, body: { code: 'PGRST202', message: `Could not find the function ${message}`, details: null, hint: null } };
  if (code === '42P01') return { status: 404, body: { code: 'PGRST205', message, details: null, hint: null } };
  if (code === '42703') return { status: 400, body: { code, message, details: null, hint: null } };
  return { status: 400, body: { code: code || 'P0001', message, details: e.detail ?? null, hint: e.hint ?? null } };
}

// PGlite is a single session: role / jwt-claim state is per connection, so DB work MUST be serialized
// or two in-flight HTTP requests would clobber each other's role (a real cross-user data leak in tests).
let dbChain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = dbChain.then(fn, fn);
  dbChain = p.then(() => undefined, () => undefined);
  return p;
}
async function asRole<T>(claims: Claims, fn: () => Promise<T>): Promise<T> {
  return exclusive(() => db.as({ role: claims.role, sub: claims.sub }, fn));
}

// ---------------------------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------------------------
const fnMeta = new Map<string, { names: string[]; types: string[] } | null>();
async function getFnMeta(fn: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return null;
  if (fnMeta.has(fn)) return fnMeta.get(fn)!;
  const r = await exclusive(() => db.pg.query<any>(
    `select p.proargnames as names, (select array_agg(format_type(t, null)) from unnest(p.proargtypes) t) as types
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [fn]));
  const m = r.rows[0] ? { names: r.rows[0].names || [], types: r.rows[0].types || [] } : null;
  fnMeta.set(fn, m);
  return m;
}
async function callRpc(fn: string, args: Record<string, any>, claims: Claims) {
  const meta = await getFnMeta(fn);
  if (!meta) return { status: 404, body: { code: 'PGRST202', message: `Could not find the function public.${fn}(${Object.keys(args).join(', ')}) in the schema cache`, details: null, hint: null } };
  const keys = Object.keys(args);
  const params = keys.map((k) => {
    const idx = meta.names.indexOf(k);
    const type = idx >= 0 ? meta.types[idx] : '';
    const v = args[k];
    if (v !== null && v !== undefined && (type === 'jsonb' || type === 'json')) return JSON.stringify(v);
    return v ?? null;
  });
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  try {
    const rows = await asRole(claims, async () => (await db.pg.query<any>(sql, params)).rows);
    return { status: 200, body: rows[0]?.r ?? null };
  } catch (e: any) {
    return pgErrorToHttp(e);
  }
}

// ---------------------------------------------------------------------------------------------
// Tables (mini PostgREST)
// ---------------------------------------------------------------------------------------------
const TABLE_RE = /^[a-z_][a-z0-9_]*$/;

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
interface Embed { alias: string; table: string; cols: string[] }
function parseSelect(sel: string): { cols: string[] | '*'; embeds: Embed[] } {
  const items = splitTop(sel || '*');
  const cols: string[] = [];
  const embeds: Embed[] = [];
  for (const it of items) {
    const m = it.match(/^(?:([a-z_]+):)?([a-z_]+)(?:!([a-z_]+))?\(([^)]*)\)$/s);
    if (m) embeds.push({ alias: m[1] || m[2], table: m[2], cols: splitTop(m[4]).map((c) => c.replace(/\s+/g, '')) });
    else cols.push(it.replace(/\s+/g, ''));
  }
  return { cols: cols.includes('*') || cols.length === 0 ? '*' : cols, embeds };
}
function pick(row: any, cols: string[] | '*') {
  if (cols === '*') return row;
  const o: any = {};
  for (const c of cols) o[c] = row[c];
  return o;
}
async function attachEmbeds(parentTable: string, rows: any[], embeds: Embed[], select: (sql: string, p?: any[]) => Promise<any[]>) {
  for (const e of embeds) {
    if (!TABLE_RE.test(e.table)) continue;
    for (const row of rows) {
      let related: any[] = [];
      let single = false;
      if (e.alias === 'sender' || e.alias === 'receiver') {
        related = await select(`select to_jsonb(t) r from public.participants t where id = $1`, [row[`${e.alias}_id`]]);
        single = true;
      } else if (e.table === 'topics') {
        related = await select(`select to_jsonb(t) r from public.topics t where id = $1`, [row.topic_id]);
        single = true;
      } else if (e.table === 'participant_secrets') {
        related = await select(`select to_jsonb(t) r from public.participant_secrets t where participant_id = $1`, [row.id]);
        single = true;
      } else if (e.table === 'assignment_secrets') {
        related = await select(`select to_jsonb(t) r from public.assignment_secrets t where assignment_id = $1`, [row.id]);
        single = true;
      } else if (e.table === 'answers') {
        related = await select(`select to_jsonb(t) r from public.answers t where assignment_id = $1 order by question_num`, [row.id]);
      }
      const objs = related.map((r) => pick(r.r, e.cols.length ? e.cols : '*'));
      row[e.alias] = single ? objs[0] ?? null : objs;
    }
  }
}

function buildWhere(params: URLSearchParams, startIdx = 1) {
  const clauses: string[] = [];
  const values: any[] = [];
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  for (const [k, v] of params.entries()) {
    if (reserved.has(k)) continue;
    if (!TABLE_RE.test(k)) throw Object.assign(new Error(`bad column ${k}`), { code: '42703' });
    const dot = v.indexOf('.');
    const op = v.slice(0, dot);
    const val = v.slice(dot + 1);
    if (op === 'eq') { values.push(val); clauses.push(`t."${k}"::text = $${startIdx + values.length - 1}`); }
    else if (op === 'neq') { values.push(val); clauses.push(`t."${k}"::text <> $${startIdx + values.length - 1}`); }
    else if (op === 'is') clauses.push(`t."${k}" is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    else if (op === 'in') { values.push(val.replace(/^\(|\)$/g, '').split(',')); clauses.push(`t."${k}"::text = any($${startIdx + values.length - 1}::text[])`); }
    else if (['gt', 'gte', 'lt', 'lte'].includes(op)) { values.push(val); clauses.push(`t."${k}" ${{ gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]} $${startIdx + values.length - 1}`); }
    else throw Object.assign(new Error(`unsupported operator ${op}`), { code: '42703' });
  }
  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', values };
}
function buildOrder(order: string | null) {
  if (!order) return '';
  const parts = order.split(',').map((o) => {
    const [col, dir] = o.split('.');
    if (!TABLE_RE.test(col)) throw Object.assign(new Error('bad order'), { code: '42703' });
    return `t."${col}" ${dir === 'desc' ? 'desc' : 'asc'}`;
  });
  return `order by ${parts.join(', ')}`;
}

async function handleTable(req: http.IncomingMessage, res: http.ServerResponse, table: string, url: URL, claims: Claims) {
  if (!TABLE_RE.test(table)) return send(res, 404, { code: 'PGRST205', message: 'bad table' });
  const prefer = String(req.headers['prefer'] || '');
  const wantsObject = String(req.headers['accept'] || '').includes('vnd.pgrst.object+json');
  const wantRepr = prefer.includes('return=representation');
  const wantCount = prefer.includes('count=exact');
  const sel = parseSelect(url.searchParams.get('select') || '*');
  const method = req.method!;
  const body = method === 'POST' || method === 'PATCH' ? await readBody(req) : undefined;

  const runSelect = (sql: string, p: any[] = []) => db.pg.query<any>(sql, p).then((r) => r.rows);
  try {
    const result = await asRole(claims, async () => {
      let rows: any[] = [];
      let total: number | null = null;
      if (method === 'GET' || method === 'HEAD') {
        const { where, values } = buildWhere(url.searchParams);
        const order = buildOrder(url.searchParams.get('order'));
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        if (wantCount) total = Number((await runSelect(`select count(*)::int c from public."${table}" t ${where}`, values))[0].c);
        const r = await runSelect(`select to_jsonb(t) r from public."${table}" t ${where} ${order} ${limit ? `limit ${parseInt(limit, 10)}` : ''} ${offset ? `offset ${parseInt(offset, 10)}` : ''}`, values);
        rows = r.map((x) => x.r);
      } else if (method === 'POST') {
        const arr = Array.isArray(body) ? body : [body];
        // like PostgREST: only the supplied columns are inserted, so column DEFAULTs apply to the rest
        const cols = Array.from(new Set(arr.flatMap((o: any) => Object.keys(o))));
        if (cols.length === 0 || !cols.every((c) => TABLE_RE.test(c))) throw Object.assign(new Error('empty or invalid insert body'), { code: '22023' });
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const r = await runSelect(
          `with ins as (insert into public."${table}" (${colList}) select ${colList} from jsonb_populate_recordset(null::public."${table}", $1::jsonb) returning *) select to_jsonb(ins) r from ins`,
          [JSON.stringify(arr)]
        );
        rows = r.map((x) => x.r);
      } else if (method === 'PATCH') {
        const cols = Object.keys(body || {});
        if (cols.length === 0 || !cols.every((c) => TABLE_RE.test(c))) throw Object.assign(new Error('empty or invalid patch body'), { code: '22023' });
        const { where, values } = buildWhere(url.searchParams, 2);
        const setList = cols.map((c) => `"${c}" = src."${c}"`).join(', ');
        const r = await runSelect(
          `with upd as (update public."${table}" t set ${setList} from jsonb_populate_record(null::public."${table}", $1::jsonb) src ${where} returning t.*) select to_jsonb(upd) r from upd`,
          [JSON.stringify(body), ...values]
        );
        rows = r.map((x) => x.r);
      } else if (method === 'DELETE') {
        const { where, values } = buildWhere(url.searchParams);
        const r = await runSelect(`with del as (delete from public."${table}" t ${where} returning t.*) select to_jsonb(del) r from del`, values);
        rows = r.map((x) => x.r);
      }
      await attachEmbeds(table, rows, sel.embeds, runSelect);
      return { rows: rows.map((r) => ({ ...pick(r, sel.cols), ...Object.fromEntries(sel.embeds.map((e) => [e.alias, r[e.alias]])) })), total };
    });

    const headers: Record<string, string> = {};
    if (result.total !== null) headers['Content-Range'] = `0-${Math.max(0, result.rows.length - 1)}/${result.total}`;
    if (method === 'HEAD') { res.writeHead(200, { ...CORS, ...headers }); return res.end(); }
    if (method === 'POST' && !wantRepr) return send(res, 201, undefined, headers);
    if ((method === 'PATCH' || method === 'DELETE') && !wantRepr) return send(res, 204, undefined, headers);
    if (wantsObject) {
      if (result.rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${result.rows.length} rows`, hint: null });
      return send(res, method === 'POST' ? 201 : 200, result.rows[0], headers);
    }
    return send(res, method === 'POST' ? 201 : 200, result.rows, headers);
  } catch (e: any) {
    const { status, body: b } = pgErrorToHttp(e);
    return send(res, status, b);
  }
}

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------
async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const path = url.pathname;

  // ---- QA helpers
  if (path === '/__qa/health') return send(res, 200, { ok: true, epoch: sessionEpoch });
  if (path === '/__qa/reset' && req.method === 'POST') { await bootDb(); return send(res, 200, { reset: true }); }
  if (path === '/__qa/expire-sessions' && req.method === 'POST') { sessionEpoch++; return send(res, 200, { epoch: sessionEpoch }); }
  if (path === '/__qa/sql' && req.method === 'POST') {
    const b = await readBody(req);
    try {
      const rows = await exclusive(() => db.q({ role: 'postgres' }, b.sql, b.params));
      return send(res, 200, rows);
    } catch (e: any) { return send(res, 400, { message: e.message }); }
  }

  // ---- GoTrue
  if (path === '/auth/v1/token' && req.method === 'POST') {
    const body = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = USERS[String(body?.email || '').toLowerCase()];
      if (!u || u.password !== body?.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(res, 200, issueSession(String(body.email).toLowerCase()));
    }
    if (grant === 'refresh_token') {
      const v = verifyJwt(String(body?.refresh_token || ''));
      if (!v.ok) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
      const email = Object.keys(USERS).find((k) => USERS[k].id === v.claims.sub)!;
      return send(res, 200, issueSession(email));
    }
    return send(res, 400, { msg: 'unsupported grant' });
  }
  if (path === '/auth/v1/user' && req.method === 'GET') {
    const c = claimsFromReq(req);
    if ('error' in c || c.claims.role === 'anon') return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT: unable to parse or verify signature, token is expired' });
    const email = Object.keys(USERS).find((k) => USERS[k].id === c.claims.sub)!;
    return send(res, 200, { id: c.claims.sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  }
  if (path === '/auth/v1/logout') return send(res, 204, undefined);
  if (path === '/auth/v1/recover') return send(res, 200, {});

  // ---- PostgREST
  if (path.startsWith('/rest/v1/')) {
    const c = claimsFromReq(req);
    if ('error' in c) return send(res, c.error.status, c.error.body);
    const name = path.slice('/rest/v1/'.length);
    if (name.startsWith('rpc/')) {
      const args = (await readBody(req)) || {};
      const out = await callRpc(name.slice(4), typeof args === 'object' ? args : {}, c.claims);
      return send(res, out.status, out.body);
    }
    return handleTable(req, res, name, url, c.claims);
  }
  send(res, 404, { message: 'not found' });
}

// ---------------------------------------------------------------------------------------------
// Realtime (Phoenix v2 over WebSocket). Events come from real DB triggers via LISTEN/NOTIFY.
// ---------------------------------------------------------------------------------------------
interface Sub { id: number; table: string; event: string; filter?: { col: string; val: string } }
interface Chan { joinRef: string | null; topic: string; subs: Sub[] }
interface Conn { ws: WebSocket; isAdmin: boolean; chans: Map<string, Chan> }
const conns = new Set<Conn>();
let subSeq = 1000;

async function isAdminToken(token: string): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const v = verifyJwt(token);
  if (!v.ok || !v.claims.sub) return false;
  return (await exclusive(() => db.pg.query<any>('select exists(select 1 from public.admins where user_id = $1) a', [v.claims.sub]))).rows[0].a;
}
function deliver(change: { table: string; op: string; row: Record<string, any> }) {
  for (const c of conns) {
    if (adminOnlyTables.has(change.table) && !c.isAdmin) continue; // RLS: participants never receive admin-table events
    for (const ch of c.chans.values()) {
      const ids = ch.subs
        .filter((s) => s.table === change.table && (s.event === '*' || s.event === change.op) && (!s.filter || String(change.row[s.filter.col]) === s.filter.val))
        .map((s) => s.id);
      if (ids.length === 0) continue;
      const payload = { ids, data: { schema: 'public', table: change.table, commit_timestamp: new Date().toISOString(), type: change.op, columns: [], record: change.row, old_record: {}, errors: null } };
      c.ws.send(JSON.stringify([ch.joinRef, null, ch.topic, 'postgres_changes', payload]));
    }
  }
}
async function installNotifyTriggers() {
  await db.pg.exec(`
    create or replace function public._qa_notify() returns trigger language plpgsql as $$
    declare r jsonb := to_jsonb(coalesce(new, old));
    begin
      perform pg_notify('qa_changes', jsonb_build_object('table', tg_table_name, 'op', tg_op,
        'row', jsonb_build_object('id', r->'id', 'game_id', r->'game_id', 'assignment_id', r->'assignment_id', 'participant_id', r->'participant_id'))::text);
      return coalesce(new, old);
    end $$;
    ${['games', 'assignments', 'answers', 'participants', 'scores', 'game_rounds', 'game_topics', 'topics']
      .map((t) => `drop trigger if exists qa_notify on public.${t}; create trigger qa_notify after insert or update or delete on public.${t} for each row execute function public._qa_notify();`).join('\n')}
  `);
  await db.pg.listen('qa_changes', (payload: string) => {
    try { deliver(JSON.parse(payload)); } catch { /* ignore */ }
  });
}

function attachRealtime(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (!String(req.url).startsWith('/realtime/v1/websocket')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const conn: Conn = { ws, isAdmin: false, chans: new Map() };
    conns.add(conn);
    ws.on('close', () => conns.delete(conn));
    ws.on('message', async (raw: Buffer, isBinary: boolean) => {
      if (isBinary) return;
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const [joinRef, ref, topic, event, payload] = msg as [string | null, string | null, string, string, any];
      if (topic === 'phoenix' && event === 'heartbeat') return ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]));
      if (event === 'phx_join') {
        if (payload?.access_token) conn.isAdmin = await isAdminToken(payload.access_token) || conn.isAdmin;
        const wanted: any[] = payload?.config?.postgres_changes || [];
        const subs: Sub[] = wanted.map((w) => {
          const m = typeof w.filter === 'string' ? w.filter.match(/^([a-z_]+)=eq\.(.+)$/) : null;
          return { id: ++subSeq, table: w.table, event: w.event, filter: m ? { col: m[1], val: m[2] } : undefined };
        });
        conn.chans.set(topic, { joinRef, topic, subs });
        const response = { postgres_changes: subs.map((s, i) => ({ id: s.id, event: wanted[i].event, schema: wanted[i].schema, table: wanted[i].table, ...(wanted[i].filter ? { filter: wanted[i].filter } : {}) })) };
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
        ws.send(JSON.stringify([joinRef, null, topic, 'system', { message: 'Subscribed to PostgreSQL', status: 'ok', extension: 'postgres_changes', channel: topic }]));
        return;
      }
      if (event === 'access_token') { conn.isAdmin = await isAdminToken(payload?.access_token); return; }
      if (event === 'phx_leave') { conn.chans.delete(topic); return ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])); }
    });
  });
}

async function bootDb() {
  db = await createDb();
  fnMeta.clear();
  await installNotifyTriggers();
}

async function main() {
  await bootDb();
  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => { console.error('emulator error', e); try { send(res, 500, { message: String(e?.message || e) }); } catch { /* */ } });
  });
  attachRealtime(server);
  server.listen(PORT, '127.0.0.1', () => console.log(`[emulator] Supabase-compatible emulator on http://127.0.0.1:${PORT} (admin@test.local / Admin#QA-2026)`));
}
void makeDb;
main();
