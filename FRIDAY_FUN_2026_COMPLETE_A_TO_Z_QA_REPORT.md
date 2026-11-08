# FRIDAY FUN GAME 2026 — Complete A-to-Z Investigation, Fix & QA Report

**Date:** 2026-11-08 · **Branch:** `main` (changes are in the working tree, **not committed**) · **Written for:** the project owner

## 0. Verdict — read this first

| Question | Answer |
|---|---|
| Is the application code fixed and verified? | **Yes, on a local, real PostgreSQL** (migration SQL executed in PGlite under `anon`/`authenticated` roles with RLS) **and in real browsers** (Playwright, production bundle, separate sessions). 203 unit/component/SQL tests + 56 E2E tests pass (E2E run three times in a row from a cold start: 0 failures, 0 flaky). `tsc` and the production build pass. |
| Has any of it been applied to / tested against **your Supabase cloud project**? | **No.** The Friday project (`fchqdplgkxsdhcyjqqvz`) is not in the Supabase account this machine's CLI is logged into, and I had no DB password or admin credential. Migration `20260104000000` is **written, tested, but NOT applied**. Every "cloud" criterion below is therefore **BLOCKED**, not passed. |
| Is the live site still vulnerable? | **Yes, until you apply the migration** (see §2: anyone with the public key can read every participant's token hash + contact details and every pooled question's correct answer; read-only proof in §7). |
| Acceptance (§19 of the brief)? | **Not yet met** — the cloud-dependent criteria (real Supabase RLS/Realtime/auth, Vercel env) cannot be signed off until you do the steps in `docs/qa/DEPLOYMENT_CHECKLIST.md` and run `scripts/qa/cloud-verify.ts`. Everything that *can* be verified without your project is verified. |

**What "tested" means in this report.** Three kinds of evidence, never mixed up:
- **PGlite** — the shipped migration files run in an in-process Postgres with Supabase-style roles and `auth.uid()`; RLS and function grants are enforced exactly as in Postgres. (`src/__tests__/db/*`)
- **EMULATOR** — `scripts/qa/supabase-emulator.ts`: the same SQL behind a PostgREST/GoTrue/Realtime-compatible HTTP+WebSocket server so the *real built frontend* and the *real `supabase-js`* run unmodified. It is **not** Supabase; fidelity gaps are possible (I found and fixed one: it ignored column defaults on insert).
- **CLOUD** — your project. Only **read-only, public-key** probes were done (§7).

Status legend: **PASS** executed & passed · **FAIL** executed & failed · **BLOCKED** needs access I don't have · **NOT TESTED** not executed.

---

## 1. Architecture inspected
React 18 + Vite + TypeScript + Tailwind SPA → `supabase-js` (anon/publishable key) → Supabase Postgres (RLS, RPCs, Realtime) · Vercel (`vercel.json` SPA rewrite) + one serverless function `api/generate-question.ts` (Gemini/OpenAI, curated 100-question bank fallback). Routes: `/`, `/admin/login`, `/admin`, `/join/:gameId/:token`, `/challenge/:token`, `/leaderboard/:gameId`. Tables: `admins, games, participants, topics, game_topics, game_rounds, assignments, questions, answers, scores, game_events` (+ new `participant_secrets, assignment_secrets, app_settings`). Inspected: all 4 migrations, every RPC, every RLS policy, `gameService.ts` (1,984 lines), `AdminDashboard.tsx` (2,380 lines), all participant pages, the AI endpoint, the question bank, Vercel/Vite/TS config.

## 2. Existing features and sections inspected
Admin login · Overview · Games · Participants · Topics · Answer Monitoring · Leaderboard · Game Rules · Participant invitation page · 7-question quiz · public leaderboard · WhatsApp/copy sharing · AI generation · retention cleanup. Full list of defects with root causes: **`docs/qa/00_BUG_LIST_AND_ROOT_CAUSES.md`** (summarised in §3).

## 3. Root causes of discovered issues (all fixed unless noted)

| # | Sev | Defect | Root cause | Fix |
|---|---|---|---|---|
| S1 | CRIT | Anyone can read **every correct answer** | pool stored in public `games.settings` | pool moved to admin-only `questions`; settings scrubbed (verified on legacy-state upgrade test) |
| S2 | CRIT | Anyone can **impersonate any participant** | `participants` publicly readable incl. token hash; RPC accepted the *hash* as credential | `participants` admin-only; RPCs take the **raw** token and hash server-side; old RPC dropped |
| S3 | HIGH | Contact details (`email_or_contact`) public | same policy | admin-only |
| S4 | CRIT | Anyone could create challenges as anyone, **choosing their own questions/answers** | anon-callable `create_challenge_assignment` trusting `p_questions_json`; `INSERT … with check (true)` policies | dropped; new `participant_create_challenge` picks questions server-side, validates token/state |
| S5 | HIGH | Challenge links readable/usable by anyone | `assignments.challenge_token_hash` public + hash-as-credential | admin-only; raw token verified server-side |
| S6 | HIGH | `/api/generate-question` open to the internet (`CORS *`, key in URL) | none | admin-JWT required (verified via DB `is_admin()`), no CORS wildcard, key in header, model configurable |
| S7 | MED | Prod build silently ran a localStorage **demo engine** where any 6-char password = admin | `isSupabaseConfigured` fallback | demo engine removed; missing env ⇒ "not configured" screen |
| S8/S9 | MED | `SECURITY DEFINER` without `search_path`; live scores leaked per-answer correctness | — | pinned; live board counts finished challenges only |
| L1–L3 | HIGH | **Complete** had no confirm/finalise/reveal and was offered for cancelled games; **Start** offered for completed/cancelled (restart); **Cancel** unconfirmed and still accepted answers; **Delete** allowed on active games, fell back to a raw DELETE on RPC failure | UI + no transition rules | server lifecycle RPCs + guard trigger; confirm dialogs; delete locked while in progress |
| L4 | HIGH | Start ignored min/max players; readiness computed from the leaked pool | — | server start gate lists exactly what's missing |
| L5/L6 | HIGH | Deleting a topic / participant **cascaded into live game data** | FK `on delete cascade` | FKs `restrict`; safe RPCs refuse with guidance |
| L7 | LOW | Participant status `completed` never set | no writer | `_refresh_participant_status` |
| L8/Q2 | MED | 2nd challenge on a topic used client-generated fallback questions; pool = exactly 7 | claim-once pool design | pool rows are templates; per-challenge copies; reuse across receivers allowed, never repeating for one receiver; target pool 10/topic |
| L10/L11 | MED | Out-of-order answers accepted; unlimited challenges per sender | — | enforced server-side (+ unique index) |
| D1 | HIGH | **Switching game showed the previous game's data**; Copy/delete could act on the wrong game | stale closure: `setSelectedGame(g); refreshAllData()` | single hook reading a ref; game-scoped data cleared on switch; regression test |
| D2/D3 | HIGH | **Copy Invite Link / challenge links copied the token *hash*** whenever the dashboard was opened outside the browser that created them | raw token only in creator's localStorage | raw tokens stored admin-only server-side (`participant_secrets`, `assignment_secrets`); legacy rows show "Generate new link" |
| D4 | MED | Game Rules tab fully `disabled`, hard-coded 40/40/20 split | — | editable per game + defaults for new games; fixed 3/3/1 shown |
| D5/D6 | MED | Overview counts wrong ("Questions Created" = challenges); monitoring showed 1st answer only, hard-coded "+10" | — | real stats; per-challenge progress, correctness after reveal |
| D7 | MED | "Active Immediately" bypassed readiness; failed generation left a half-made game silently | — | removed; failure reported, game selected, "Top Up" |
| D8 | MED | Remove participant / toggle & delete topic / close round had no error handling (success banners on failure) | — | uniform `run()` wrapper with busy-lock + error banner |
| Q1 | HIGH | **Custom topic with no bank entries got questions from other topics** | `candidates = QUESTION_BANK` fallback | strict topic matching; never cross-topic |
| P1/P2/P3 | MED | join page ignored URL `gameId`; hard-coded `×10`; score sent to client pre-reveal | — | token must match game; points from settings; score null until reveal |

**Found while testing, also fixed:** `index.html` blocked pinch-zoom (`user-scalable=no`); leaderboard CSV vulnerable to spreadsheet-formula injection; several 16–20 px tap targets; start-error wording "A active game…"; a potential lock-order deadlock in my own SQL (caught in review, `FOR UPDATE` order fixed before testing); emulator ignored column defaults (test infra).

## 4. Files changed
**Database:** `supabase/migrations/20260104000000_security_lifecycle_hardening.sql` (new, 1,348 lines) · `supabase/admin_provision.sql` (now only grants admin; no QA game, no hard-coded token hashes).
**App:** `src/services/gameService.ts` (rewritten, Supabase-only) · `questionGenerator.ts` · `data/questionBank.ts` · `types/index.ts` · `lib/supabase.ts` · `utils/sharing.ts` · `App.tsx` · pages `AdminDashboard.tsx` (split into `pages/admin/{useAdminData,actions,ui,OverviewTab,GamesTab,ParticipantsTab,MonitoringTab,LeaderboardTab,TopicsTab,RulesTab}`), `ParticipantJoinPage`, `ChallengeQuizPage`, `LeaderboardPage`, `AdminLoginPage`, `HomePage`, `components/Navbar.tsx`.
**Server/config:** `api/generate-question.ts` · `vercel.json` (+ Referrer-Policy, Permissions-Policy, HSTS) · `index.html` · `.env.example` · `vite.config.ts` · `tsconfig.json` · `package.json` (+scripts, devDeps `@electric-sql/pglite`, `ws`, `tsx`) · `README.md`.
**Tests/QA tooling (new):** `src/__tests__/db/*` (PGlite harness + 4 suites), `src/__tests__/{gameService,pages,questionGenerator}.test.*`, `e2e/*` (5 specs), `playwright.config.ts`, `scripts/qa/{supabase-emulator,emulator-smoke,cloud-verify,probe-anon,probe-cloud-schema}.ts`, `docs/qa/*`.
**Removed:** `scripts/verify-*.ts` + `run-all-verifications.ts` (called the removed exploitable RPCs / local demo engine; mutated the live DB), obsolete local-mode `gameService.test.ts`. Six older reports moved to `docs/archive/` (superseded; they publish a QA admin password — see §24).
**Behaviour changes to be aware of:** "Reveal all answers" and "Close round" buttons are replaced by **Complete & Reveal** (one explicit, confirmed action); "Pause" is now a real pause (blocks answers/challenges); the Create-Game "Active Immediately" option is gone.

## 5. Database schema changes (migration `20260104000000`)
`games.status` + `paused` · `questions.source_question_id` + partial unique indexes (pool text unique per game; per-challenge text/sequence unique) · distinct-options CHECK (new rows) · topic FKs → `restrict` · unique `(round,sender)`, case-insensitive unique participant name/code · tables `participant_secrets`, `assignment_secrets`, `app_settings` (admin-only) · game-status guard trigger · RLS rewritten (admin-only for 10 tables; public read only for `games, topics, game_topics, game_rounds`) · function grants (admin RPCs → `authenticated`, token RPCs → `anon`, internals → nobody) · 14 `admin_*`/cleanup RPCs, 4 participant RPCs (`participant_join`, `participant_create_challenge`, `get_challenge_by_token`, `submit_challenge_answer`) + `get_leaderboard` · 6 legacy RPCs dropped · legacy pool migrated out of `games.settings`.

## 6. Migrations applied and pending
| Migration | Cloud | Local (PGlite/emulator) |
|---|---|---|
| 20260101 init | applied (read-only probe) | PASS |
| 20260102 min-7-questions | applied (probe: `questions.game_id`) | PASS |
| 20260103 seven-questions | applied (probe: `sequence_num`) | PASS |
| **20260104 security/lifecycle** | **PENDING — manual** | PASS (fresh DB, **upgrade from legacy state with leaked pool**, idempotent re-run) |

## 7. Supabase connectivity & cloud evidence (read-only, public key) — `scripts/qa/probe-anon.ts`, `probe-cloud-schema.ts`
- Connectivity: **PASS** (all 11 tables answer, 10 topics, 1 game).
- **FAIL (security, live today):** `games.settings.topics_question_pool` of game `ww` contains correct answers readable by anon; `participants` exposes `invitation_token_hash` + `email_or_contact` to anon.
- Migration-4 objects absent (`PGRST205/PGRST202`); legacy exploitable RPCs still callable.
- Admin login, real inserts/updates/deletes, real RLS with an admin session, real Realtime, Vercel env: **BLOCKED** (no cloud credentials; migration not applied). The runnable cloud check is `scripts/qa/cloud-verify.ts` (guarded; dry-run on emulator 39/39).

## 8. Admin authentication — EMULATOR (e2e/01, 8 tests)
| Test | Result |
|---|---|
| Correct password → dashboard | PASS |
| Incorrect password → "Invalid login credentials", stays on login | PASS |
| Empty password (native required validation) | PASS |
| Valid user that is **not** in `admins` → refused + signed out | PASS |
| Logout; `/admin` afterwards redirects | PASS |
| Session persists across refresh; login page bounces an authenticated admin | PASS |
| Expired/revoked session: in-page action shows "session has expired", reload → login; re-login works | PASS |
| Unauthorised `/admin` without session | PASS |
| Forgot password: asks for an email first, then confirms the reset request was accepted (mail delivery itself is not testable locally) | PASS |
| Forged/garbage JWT → 401; admin tables empty to public key | PASS |
| Admin verification against **Supabase cloud** | **BLOCKED** |

## 9. Game management — PGlite (28 lifecycle tests) + EMULATOR (e2e/02, 03)
Create (validation: empty/80+ chars name, min<2, max<min, max>100, points 0, non-numeric, no topics, disabled topic, `active` initial status, duplicate open name) **PASS** · Edit (name always, rules locked after start, max < current participants refused) **PASS** · Start gate (lists missing participants **and** each incomplete topic with its counts; ≥7 questions with a bad mix, e.g. 5E/5M/0H, is refused) **PASS** · Pause / Resume (players see it live; answers blocked) **PASS** · Complete (confirm dialog shows finished/unanswered counts; locks answers; finalises scores; reveals answers) **PASS** · Cancel (confirm; records kept; links show cancelled; no restart) **PASS** · Delete (locked while in progress; dialog names the game; no orphans; other games untouched) **PASS** · Refresh **PASS** · View/select **PASS** · Transitions `REGISTRATION_OPEN→IN_PROGRESS⇄PAUSED→COMPLETED`, `→CANCELLED`, invalid ones (restart completed/cancelled, complete from registration, resume non-paused, direct table `UPDATE completed→active`) **PASS**.

## 10. Participant management — PGlite + EMULATOR
Add (server-generated 256-bit token, hash stored, raw only in admin-only secrets) · duplicate name (case-insensitive) / duplicate code / invalid name/code / > max / on finished game refused · double-click creates exactly one · Edit changes only that participant, link unchanged · Delete (confirm names them; blocked if they have challenges; counts update) · Regenerate (old link dies, new works) · statuses pending→joined→selected→completed are real DB state — **all PASS**.

## 11. Invitation links & WhatsApp — EMULATOR (e2e/02 #2–#5)
| Check | Result |
|---|---|
| Four links unique; host = deployed origin (never localhost placeholder) | PASS |
| **Copy Invite Link** copies *that* participant's URL (clipboard read for all four) | PASS |
| **Share on WhatsApp**: `https://wa.me/?text=…` containing only that participant's link, `target=_blank`, click opens a popup to wa.me (external site stubbed) | PASS |
| Link opens the right participant/game; refresh works; separate browser sessions | PASS |
| Invalid token / malformed game id / valid token under another game → useful error | PASS |
| Revoked token (regenerated) rejected | PASS |
| Expired by **time** | **Not implemented by design** (tokens die on regenerate/removal/game deletion) |
| Real WhatsApp app / real phone / production domain | **NOT TESTED** |

## 12. Button-by-button inventory (EMULATOR, real UI; "DB" = verified in database)
| Section | Button / control | Expected → actual | DB op | Result |
|---|---|---|---|---|
| Auth | Sign In | wrong pw error / admin → dashboard | `signInWithPassword`, `is_admin` | PASS |
| Auth | Sign Out | session ends, `/admin` redirects | `signOut` | PASS |
| Auth | Forgot password | asks for an email, then confirms the request | auth recover | PASS (request accepted; e-mail delivery not testable locally) |
| Header | Game selector | loads **that** game (regression D1) | selects | PASS |
| Header | Create Game / Refresh | opens modal / reloads all | selects | PASS |
| Overview | Test Connection | live probe + latency shown ("Connected (Nms)") | `select topics` | PASS |
| Overview | Complete & Reveal | confirm → completed | `admin_set_game_status` | PASS |
| Overview | Top Up All Topics | fills pools to 10/topic | `admin_save_pool_questions` | PASS |
| Overview / Games | Live Monitor / View all & manage / Select & view | navigates; selects the right game | – | PASS |
| Games | Create New Game (modal: Select All / Clear / topic checkboxes / min / max / points / status / Cancel / Create) | validation + atomic create + pool | `admin_create_game` | PASS |
| Games | Edit (modal), Refresh, Retention Cleanup | validate+save / reload / only old finished games | `admin_update_game`, `cleanup_completed_games` | PASS |
| Games | Start / Pause / Resume / Complete / Cancel / Delete / Select & view | per status, with confirm where destructive | lifecycle RPCs | PASS |
| Participants | Add (modal) / Edit (modal) / Remove (confirm) / Copy Invite Link / Share on WhatsApp / Regenerate link / search / status filter | as §10–11 | admin RPCs | PASS |
| Topics | Add / Edit / Enable / Disable / Delete (confirm) / search / filter | safe delete refuses used topics | topics, `admin_delete_topic` | PASS |
| Monitoring | Refresh / filter / search / Copy Link / Complete | live progress per challenge | selects | PASS |
| Leaderboard | Refresh / Export CSV (escaped) | ranks with ties | `get_leaderboard` | PASS |
| Game Rules | Save game rules / Save defaults | validated; defaults only affect new games | `admin_update_game`, `admin_set_default_rules` | PASS |
| Gameplay | Pick player / Pick topic / Generate & Send / Copy / WhatsApp / Answer / Submit / Next / Prev / step pills (future ones locked) / View Final Results / Review / View Leaderboard | as §15 | participant RPCs | PASS |
| Modals | every confirm/cancel pair incl. "Keep as is" | cancel changes nothing (DB-checked) | – | PASS |

## 13. Topic management — EMULATOR e2e/03 #7 + PGlite
View, add (custom topic), duplicate refused, empty refused, edit, enable/disable (persisted; disabled topics cannot be picked for **new** games and are hidden from players), delete **used** topic refused ("Disable it instead"; also blocked by FK `restrict`), delete unused custom topic OK, search & filter, usage counts (games / pooled questions / challenges) — **PASS**.

## 14. Seven-question generation (pool) — PGlite + EMULATOR + unit
Each selected topic gets a pool of 10 (4E/4M/2H); start requires **≥7 with ≥3E/≥3M/≥1H**; creation shows "N topics × 7 = 7N". Questions: valid (4 distinct options, exactly one correct, difficulty, topic), unique per game, topic correct (checked in DB for every pooled and assigned question) — **PASS**. Every one of the 10 built-in topics can supply a full 3/3/1 set from the bank — **PASS**. Server rejects (and reports why) invalid/duplicate/short/bad-option questions — **PASS**.
**Pool-size policy (explicit):** pool questions are *templates*; each challenge gets its own copies. The same pool serves every receiver once; a receiver never sees the same question twice, so with a 10-question pool a receiver can get **each topic from only one sender** — a second sender picking the same receiver+topic gets "Not enough unseen … Pick another topic or player" (nothing partial is saved). Larger pools (AI keys / manual) lift this. Start is blocked if any topic < 7 valid.
Failure modes: AI unavailable (HTTP 503) → bank fallback + warning **PASS**; AI timeout (AbortError path) **PASS (unit; the real 20 s wait was not exercised)**; incomplete generation (custom topic, no bank, AI down → 0 questions, game created but cannot start, topic named) **PASS** (unit + E2E); duplicate generation **PASS**; malformed AI output rejected **PASS**; **real Gemini/OpenAI calls NOT TESTED** (no keys; default model name `gemini-2.5-flash` is unverified).

## 15. Seven-question gameplay — EMULATOR e2e/02 + PGlite
4 players, 4 separate browser contexts; A→C Movies, B→C Cricket, D→C AI, C→A Movies. **PASS:** 4 unique challenge links; each challenge exactly 7 questions, sequence 1–7, difficulties E,E,E,M,M,M,H, all in the right topic; C receives 3 independent challenges (3 links, separate progress); one challenge per sender; no self/foreign receiver/foreign topic/disabled topic; "Question n of 7" + progress bar; each answer saved; **out-of-order rejected**; **duplicate rejected without double points** (stale tab answers the same question → server `ALREADY_ANSWERED`, UI reconciles, DB row count 4 not 5); refresh after Q3 → resumes at Q4; closing the browser (new context) and a 2nd tab both resume at Q4; double-clicking Submit sends one request; after Q7 → completed + result screen + leaderboard link; **correct answers hidden** — 97 network responses captured in the players' browsers (last run) contain no `correct_option`/`is_correct`/`explanation` before completion (with a positive control proving the detector fires after completion).

## 16. Answer Monitoring — EMULATOR
Counts (participants, challenges, assigned questions, answers in, pending, completed) correct; three challenges to the same receiver shown separately ("7/7", "7/7", "7/7" vs "3/7"); **live update without reload** when a player answers (and for pause/complete); filter + search; correctness shown only after Complete — **PASS**. Realtime was exercised on the **emulator** (DB triggers → WebSocket, RLS-aware: admins get answer events, anon clients get `games` only). **Real Supabase Realtime: BLOCKED.**

## 17. Leaderboard — PGlite + EMULATOR
7 correct = **70** ✔ · 7 wrong = **0** ✔ · 5 correct = **50** ✔ · 3 correct (+ unanswered) = **30** ✔ · unanswered = 0 ✔ · custom points (20/−5) ✔ · multi-challenge aggregation (Amal 120 = 70+0+50) ✔ · server-side only (no write path from the browser; forged inserts → 403; PATCH of score/status changes nothing) ✔ · ties share a rank (1,2,3,3) and co-champions are announced ✔ · live view counts finished challenges only; final after Complete ✔ · `scores` table equals leaderboard ✔ · CSV export (quotes + formula-injection escaped) ✔ · live refresh ✔.

## 18. Game rules — EMULATOR
View; edit & save per game (min/max/points/wrong points); validation (min>max, ranges); locked after start; default rules apply to **new** games only and never silently change existing ones (DB-checked); fixed rules shown (7 questions, 3/3/1, reveal on completion) — **PASS**.

## 19. Complete / Cancel / Delete results
See §9. Complete ≠ Delete (record kept, results visible). Cancel ≠ Delete (assignments preserved, DB-checked). Delete cascades a played game fully with an impact summary and **no orphans** (participants, secrets, rounds, topics links, questions, answers, scores, events) — **PASS** (PGlite + EMULATOR).

## 20. Cleanup verification — PGlite + EMULATOR
Six disposable games aged 2–900 h: only the **old completed** and **old cancelled** were removed; recent completed, **active, paused, registration-open** untouched, with their participants intact; second run reports "nothing to remove"; retention < 1 h refused — **PASS**. Scheduling (pg_cron) is optional and documented; **not applied**.

## 21. Security & RLS — PGlite (55 tests) + EMULATOR (e2e/04, 9 tests)
Public key sees **0 rows** in 10 sensitive tables (admin sees data — control) · signed-in non-admin = anon · `games.settings` has no pool/answers · token hash/`challenge_token_hash` useless as credential (**the original exploit chain, replayed, now fails**) · 6 legacy RPCs gone · all 14 admin RPCs denied to anon **and** non-admin (28 checks) · internal helpers uncallable · hostile tokens (SQL-ish, 5 KB, `<script>`, path traversal) → null, no 5xx · forged inserts into 5 tables → 403 with RLS message; forged PATCH of score/status/game status changes nothing · participants never receive others' tokens (traffic inspected) · AI endpoint static checks · bundle scan: no `service_role`, no secret key values, any embedded JWT is not `service_role`; both `VITE_` keys are `sb_publishable_…` — **all PASS**. **On the cloud: FAIL today (§7), BLOCKED to re-verify after migration.** Dependency audit: 2 moderate `react-router` advisories (SSR/open-redirect paths; this SPA has no SSR; fix is the breaking v7 upgrade — not done) and dev-only tooling issues.

## 22. Responsive — EMULATOR (e2e/05), Chromium only
9 widths (320, 360, 390, 430, 768, 1024, 1366, 1440, 1920) × 19 screens (home, admin login, join waiting / select / sent / incoming, quiz question, final result, leaderboard live & final, 7 admin tabs, create-game modal, confirm dialog) = **171 audited screens: 0 px horizontal overflow, 0 clipped controls, 0 console errors, smallest touch target 38 px**, create-game submit reachable at 320 px. Screenshots: `docs/qa/screenshots/<width>/<screen>.png`. Firefox/WebKit **NOT TESTED** (not installed); real devices **NOT TESTED**. Note: at 320 px the 7th step-pill scrolls horizontally inside its own container (the Next button is the primary control). The Google Fonts CDN (external, in `index.html`) is stubbed in this audit because a slow CDN made screenshots wait and logged `ERR_*` console errors on this machine; the app degrades to system fonts if the CDN is unreachable (an external runtime dependency you may want to self-host).

## 23. Automated tests & build (evidence in `docs/qa/evidence/`)
| Check | Result | Evidence |
|---|---|---|
| `tsc --noEmit` | **PASS** (exit 0) | `tsc.log` |
| Vitest — 203 tests / 9 files: SQL security 55 · lifecycle 28 · gameplay 19 · migration 7 · service 25 · pages 35 · generator 25 · components 5 · sharing 4 | **PASS 203/203** | `vitest-results.json` |
| Playwright — 56 tests (auth 8 · full game 15 · lifecycle 15 · security 9 · responsive 9), cold start, run **three times consecutively** | **PASS 56/56 (3 consecutive runs at 55 before the last test was added), 0 flaky** | `playwright-results.json`, per-spec `0*.json` |
| Mutation check (broke the 3/3/1 mix in the SQL) | caught by at least 8 tests | — |
| `npm run build` | **PASS** | `build.log` |
| "Supabase integration tests" against the **cloud** | **BLOCKED** | — |
Run: `npm test` · `npm run e2e` · `npm run build` (E2E builds and serves the production bundle itself).

## 24. Remaining bugs / limitations
1. **Cloud not migrated/tested (BLOCKED)** and the **live site is vulnerable until it is** (§7).
2. **Committed credentials:** the archived reports/scripts in git history list admin `admin@fridayfun.com / [REDACTED-OLD-PASSWORD]` (and `[REDACTED-OLD-PASSWORD]`). **Rotate it** (checklist step 0). I cannot do this.
3. **Real concurrency not load-tested:** PGlite is one connection. Locking order (assignment → game → advisory → participants) was designed and reviewed to avoid deadlocks, but simultaneous submissions from many phones have not been exercised on real Postgres.
4. **Realtime evidence is emulated.** Real Supabase Realtime (incl. RLS on DELETE events) untested.
5. **Links never expire by time** (by design; revoke = regenerate/remove/delete).
6. **One topic per receiver** with the default 10-question pool (policy above).
7. **Custom topics need an AI key** (or manual questions — there is no manual-entry UI) to be startable.
8. **Real AI providers, real WhatsApp app, real phones, Safari/Firefox, Vercel env: NOT TESTED.**
9. Low: `games.created_by` (admin's user id) stays publicly readable; `react-router` advisories; the 7th quiz step-pill scrolls at 320 px; password-reset e-mail delivery not exercised.
10. Behaviour changes listed in §4 (Close Round/Reveal merged into Complete; Pause now real).

## 25. Manual steps still required
Everything in **`docs/qa/DEPLOYMENT_CHECKLIST.md`**: rotate the committed password → back up → apply migration 4 → regenerate links for pre-existing participants → provision admin + disable public sign-ups → set Vercel env (incl. `VITE_PUBLIC_BASE_URL`) → deploy → run `scripts/qa/cloud-verify.ts` → test on real phones/WhatsApp/Safari/Firefox → optionally schedule cleanup. Then this report's BLOCKED rows can be turned into PASS/FAIL.

---
### Appendix — evidence index
`docs/qa/00_BUG_LIST_AND_ROOT_CAUSES.md` · `docs/qa/evidence/{tsc.log, vitest-results.json, build.log, playwright-results.json, 01-…05-*.json, EMULATOR-DRY-RUN-of-cloud-verify.json}` · `docs/qa/screenshots/` · `docs/qa/DEPLOYMENT_CHECKLIST.md` · read-only cloud probes `scripts/qa/probe-anon.ts`, `probe-cloud-schema.ts` · tooling `scripts/qa/supabase-emulator.ts`, `cloud-verify.ts`.

---
### Addendum — same friend picked by two players (migration `20260105000000_challenge_topic_availability.sql`)
**Design (confirmed):** *players* choose who to challenge and the topic (as in the brief); the admin only configures the game. Several players may challenge the same friend — each challenge is independent. A friend never sees the same question twice, so with a 10-question pool each friend can receive **each topic once**. The invitation page now receives `unavailable` (friend, topic) pairs from the server, disables those topics up-front ("Already used for <friend>"), tells the player if every topic is used up for a friend, and drops a selection that another player just used up. The server still refuses a clash atomically as a backstop. Tests: SQL (`unavailable` content, no sender/question leak), component (4 cases incl. older-server tolerance), E2E #14 (second player blocked on the used topic, succeeds with another topic, receiver ends with 2 independent challenges). **This small migration is additive and safe to re-run; the frontend works with or without it (without it the clash is only reported after sending).**

### Addendum 2 — fair ranking (migration `20260106000000_leaderboard_average_ranking.sql`)
Players can receive a different number of challenges (one picked by 3 friends can score up to 210, one nobody picked cannot score). The leaderboard now **ranks by average points per received challenge** (total / challenges received); total, challenges and average are all shown; players nobody challenged show "no challenge received", have no average, and share the last rank; ties share a rank. Applies to the live view (finished challenges only) and the final view; admin tab, public page and CSV (`…,Challenges,Average`) updated. Tests: SQL (#20: 70+0 over 2 challenges ranks below 50 over 1; null-average players share last rank), component (average/total/no-challenge display, champion excludes no-challenge players), E2E (CSV + admin table). Totals now: 205 unit/SQL tests, 56 E2E tests (2 consecutive clean runs). **Requires running the migration; until it is applied the app falls back to showing totals without averages.**
