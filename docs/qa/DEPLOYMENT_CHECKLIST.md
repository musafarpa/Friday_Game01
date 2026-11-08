# Friday Fun 2026 — Production deployment checklist

Nothing here has been executed against your Supabase project or Vercel. These are the steps the project owner must perform.
**Why order matters:** migration `20260104000000` *deliberately drops* the old hash-based RPCs (they are the security hole). The
currently deployed frontend calls those RPCs, so it stops working the moment the migration is applied. Do steps 3–5 in one
sitting, ideally outside a live game.

## 0. Rotate credentials that were committed to this repository (do this first)
- [ ] `docs/archive/*` (git history) lists the admin login **`admin@fridayfun.com` / `[REDACTED-OLD-PASSWORD]`** and older scripts used `[REDACTED-OLD-PASSWORD]`. **Change that password now** (Supabase → Authentication → Users) or delete the user and create a new admin.
- [ ] The archived reports also list QA participant tokens for the old "FRIDAY FUN – QA TEST ROOM" game. The migration makes hash-based tokens useless, but delete that QA game if it exists (Games tab → Cancel → Delete).

## 1. Back up
- [ ] Supabase Dashboard → Database → Backups (or `supabase db dump`). The migration rewrites `games.settings` (moves the question pool out) and drops functions.

## 2. Pre-flight facts (as observed read-only on 2026-11-08 with the public key)
- Cloud has migrations 1–3 applied; **migration 4 is NOT applied** (`participant_secrets`, `app_settings`, `participant_join`, `get_leaderboard` do not exist).
- Live exposure today: anyone can read every participant's `invitation_token_hash` + `email_or_contact`, and every pooled question's correct answer (inside `games.settings`). One real game exists (`ww`, registration_open, 1 participant).
- Re-run `node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa/probe-cloud-schema.ts` (read-only) to see the current state at any time.

## 3. Apply the migration
- [ ] SQL Editor → paste `supabase/migrations/20260104000000_security_lifecycle_hardening.sql` → Run. (Idempotent; safe to re-run.)
- [ ] Then paste and run `supabase/migrations/20260105000000_challenge_topic_availability.sql` (small, additive: disables already-used topics for a friend on the invitation page).
- [ ] Then paste and run `supabase/migrations/20260106000000_leaderboard_average_ranking.sql` (small, additive: ranks the leaderboard by average points per challenge received).
- [ ] Verify (all should hold):
```sql
select count(*) from information_schema.tables where table_schema='public' and table_name in ('participant_secrets','assignment_secrets','app_settings'); -- 3
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('get_participant_by_token','create_challenge_assignment','delete_game_room','reveal_round_answers','save_game_question','check_game_ready_to_start'); -- 0 rows
select count(*) from public.games where settings ? 'topics_question_pool'; -- 0
select tablename, policyname from pg_policies where schemaname='public' and tablename in ('participants','assignments','questions','answers','scores','game_events') order by 1; -- only "admin all …" policies
```
- [ ] Existing game `ww`: its question pool moved into `public.questions`; its participant has no stored link → in the dashboard press **Generate new link** for each pre-existing participant.

## 4. Admin account
- [ ] Authentication → Users: confirm your admin user exists; run `supabase/admin_provision.sql` (edit the email) → the final `select` must return one row.
- [ ] Authentication → Providers → Email: **disable "Allow new users to sign up"** (admin accounts are created by you), enforce a strong minimum password, enable leaked-password protection if available.

## 5. Vercel
- [ ] Project → Settings → Environment Variables (**Production** scope):
  | Variable | Value | Note |
  |---|---|---|
  | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | public |
  | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | public; **never** the service-role/`sb_secret_` key |
  | `VITE_PUBLIC_BASE_URL` | `https://<your-production-domain>` | makes every invitation/challenge link use the real domain |
  | `GEMINI_API_KEY` and/or `OPENAI_API_KEY` | secret | optional; without them only the 10 built-in topics can build pools |
  | `GEMINI_MODEL` / `OPENAI_MODEL` | optional | defaults `gemini-2.5-flash` / `gpt-4o-mini` |
- [ ] Deploy `main` (this branch). `vercel.json` already rewrites all routes to `index.html` (deep links `/join/…`, `/challenge/…`, `/leaderboard/…`, `/admin`) and `/api/*` to the function.
- [ ] If the site is opened without the Supabase variables it shows **"Friday Fun is not configured"** (there is no demo mode any more).

## 6. Verify on the cloud (this is the part that has NOT been run)
- [ ] `QA_ADMIN_EMAIL=… QA_ADMIN_PASSWORD='…' CONFIRM_CLOUD_TEST=yes node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/qa/cloud-verify.ts`
  Creates only `QA-DISPOSABLE-*` games, exercises auth / RLS / RPCs / scoring / **real Supabase Realtime**, deletes only what it created, writes `docs/qa/evidence/cloud-verify-<ts>.json`. It refuses to run if the migration is missing. (It was dry-run against the local emulator: 39/39 — `docs/qa/evidence/EMULATOR-DRY-RUN-of-cloud-verify.json`.)
- [ ] Manual, on real devices: open an invitation link on an iPhone and an Android phone; tap **Share on WhatsApp** (opens the WhatsApp app with the message); answer a 7-question challenge; rotate the phone; pinch-zoom works. Test Safari and Firefox (only Chromium was available to automated tests).
- [ ] Browser console on `/`, `/admin`, a `/join/...`, a `/challenge/...`, `/leaderboard/...`: no errors; Network tab: no request to `localhost`.
- [ ] Confirm the production bundle contains only the publishable key (`grep` the downloaded JS for `service_role`/`sb_secret_`).

## 7. Operations
- [ ] Retention: press **Retention Cleanup** in the Games tab (deletes completed/cancelled games older than 24 h), or schedule it (Supabase → Database → Extensions → `pg_cron`):
```sql
select cron.schedule('friday-fun-retention', '17 * * * *', $$
  delete from public.games where status in ('completed','cancelled') and updated_at < now() - interval '24 hours' $$);
```
- [ ] Supabase Realtime: Database → Replication → `supabase_realtime` must include `games, participants, assignments, answers, scores, game_rounds` (the init migration added them; `games` is what drives participant live updates).

## 8. Rollback
Restore the backup from step 1 **and** redeploy the previous Vercel build (the old frontend only works with the old RPCs). The old schema was publicly readable, so prefer fixing forward.

## Known limits to accept (see report §24)
Links never expire by time (they die when regenerated, when the participant is removed, or when the game is deleted by cleanup); a receiver can receive each topic once (10-question pool per topic); correctness of simultaneous submissions rests on row locks that were reviewed but not load-tested on a real multi-connection Postgres.
