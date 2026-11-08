# Friday Fun 2026 — Discovered bugs & root causes (pre-fix investigation)

Evidence column: **LIVE** = reproduced against the real Supabase project with only the public key
(`scripts/qa/probe-anon.ts`); **CODE** = read directly from source/SQL (file:line).

## Security / data exposure

| # | Severity | Bug | Root cause | Evidence |
|---|---|---|---|---|
| S1 | CRITICAL | Any visitor can read the **correct answer of every pooled question** | The question pool (incl. `correct_option`) is stored in `games.settings.topics_question_pool`; `games` has `SELECT using (true)` | LIVE – game "ww": `poolLeaksCorrectAnswersToAnon: true`; `gameService.ts:707-763` |
| S2 | CRITICAL | Any visitor can **impersonate any participant** | `participants` is publicly readable incl. `invitation_token_hash`, and `get_participant_by_token(p_token_hash)` accepts the *hash* as the credential | LIVE – anon can list `invitation_token_hash`; init migration L199, L631 |
| S3 | HIGH | Participant PII (`email_or_contact`) readable by anyone | same public SELECT policy on `participants` | LIVE – column visible to anon |
| S4 | CRITICAL | Anyone can create challenges **as any participant** with **client-chosen questions and correct answers** | `create_challenge_assignment` is `SECURITY DEFINER`, executable by anon, no token check, trusts `p_questions_json`; plus `INSERT … with check (true)` policies on `assignments` and `questions` | migration 3 L32-218; init L657, L666 |
| S5 | HIGH | Same hole for challenge links: `assignments` public SELECT exposes `challenge_token_hash`, which `get_challenge_by_token`/`submit_challenge_answer` accept as the credential → anyone can open/answer anyone's challenge | init L656; migration 3 L224 | CODE |
| S6 | HIGH | `/api/generate-question` is unauthenticated with `Access-Control-Allow-Origin: *` → anyone can burn the AI key budget; Gemini key sent in URL query | `api/generate-question.ts:24-27, 73-74` | CODE |
| S7 | MEDIUM | Production build silently falls back to a **localStorage demo engine** where *any* 6+ char password logs in as admin if Supabase env vars are missing | `gameService.ts:198-205`, `isSupabaseConfigured` | CODE |
| S8 | MEDIUM | `SECURITY DEFINER` functions have no `search_path` pin | init migration | CODE |
| S9 | MEDIUM | Live scores publicly readable while answers are "hidden": each score tick discloses whether the last answer was correct | `scores` public SELECT | CODE |

## Lifecycle / data-integrity

| # | Bug | Root cause |
|---|---|---|
| L1 | "Complete" button flips status directly with **no confirmation, no finalize, no reveal**; shown for cancelled/registration games; "Start Game" shown for completed/cancelled games (restart) | `AdminDashboard.tsx:1187-1239`; no transition guard anywhere |
| L2 | **Cancel has no confirmation**; cancelled games still accept answers/new challenges | `AdminDashboard.tsx:1232`; `submit_challenge_answer` never checks game status |
| L3 | Delete of an **active** game allowed; RPC failure silently falls back to a direct delete; no impact summary | `gameService.ts:475-490` |
| L4 | Start ignores min/max participants; readiness is computed from the leaked settings pool | `gameService.ts:444-453`, `AdminDashboard.tsx:1171-1183` |
| L5 | Deleting a **topic cascades** into `game_topics`, `assignments`, `questions` (destroys live game data) | init migration FKs `on delete cascade`; `gameService.deleteTopic` |
| L6 | Removing a participant cascades into other players' challenges/answers/scores | FK cascade; `removeParticipant` |
| L7 | Participant status `completed` is never set anywhere | grep: no writer |
| L8 | Question reuse: pool rows are *claimed* by the first challenge; second challenge for same topic gets client-generated fallback questions (not from pool) | migration 3 Method B/A |
| L9 | Client generates tokens/question sets; score increments are client-independent but `scores` are incremented (not recomputed) → drift on any failure | migration 3 L464-486 |
| L10 | Sequential order not enforced server-side (client may answer question 7 first) | `submit_challenge_answer` |
| L11 | One sender can create unlimited challenges (UI assumes one) | no unique constraint |

## Admin dashboard

| # | Bug | Root cause |
|---|---|---|
| D1 | **Switching game shows the previous game's data**; "Copy link"/delete can act on the wrong game's roster | `onChange` calls `setSelectedGame(g); refreshAllData()` – `refreshAllData` closes over the stale `selectedGame` (`AdminDashboard.tsx:633-638, 1252-1255`) |
| D2 | **Copy Invite Link / WhatsApp copy the token *hash*** whenever the admin opens the dashboard in another browser/session (raw token only lives in the creating browser's localStorage) → links do not work | `gameService.ts:1035` `raw_invitation_token: tokenCache[p.id] || p.invitation_token_hash` |
| D3 | Same for challenge links in Answer Monitoring and the participant's "incoming challenges" list | `gameService.ts:1827`, `ParticipantJoinPage.tsx:266` |
| D4 | Game Rules tab is entirely `disabled` inputs (cannot edit/save) and shows hard-coded 40/40/20 difficulty split that contradicts the 3/3/1 rule | `AdminDashboard.tsx:1751-1811` |
| D5 | Overview "Questions Created" shows `assignments.length`; "Answers Submitted" counts finished challenges; no totals for games/status/challenges | `AdminDashboard.tsx:586-590` |
| D6 | Monitoring shows only the first answer per challenge, hard-codes "+10", no progress/score per challenge | `AdminDashboard.tsx:1491-1503` |
| D7 | Create-Game offers "Active Immediately" (bypasses readiness); generation failure after insert leaves a half-created game and no list refresh | `AdminDashboard.tsx:2135`, `gameService.createGame` |
| D8 | `handleRemoveParticipant`, `handleToggleTopic`, `handleDeleteTopic`, `handleCloseRound` have no error handling → success banners / unhandled rejections on failure | `AdminDashboard.tsx:285,500,542,490` |
| D9 | Topics tab has no search/filter/question counts; delete is unsafe (L5) | — |
| D10 | Leaderboard ranks ties as distinct ranks (#idx+1) | `AdminDashboard.tsx:1629` |
| D11 | No pause/resume that actually blocks play ("Pause" = `waiting_for_answers`, which still permits everything) | status handling |

## Question bank

| # | Bug | Root cause |
|---|---|---|
| Q1 | A **custom topic with no bank entries gets questions from random other topics** (wrong topic association) | `questionBank.ts getRandomQuestionForTopic/getBankQuestionsForTopic`: `candidates = QUESTION_BANK` fallback |
| Q2 | Generator pool target = exactly 7; a second challenge for the same topic cannot be served from the pool | design |
| Q3 | Gemini model `gemini-1.5-flash` is retired; API key in URL | `api/generate-question.ts:74` |

## Participant / quiz

| # | Bug | Root cause |
|---|---|---|
| P1 | Join page ignores `gameId` from the URL when validating the token (token from game A opens under game B URL) | RPC looks up by hash only |
| P2 | Hard-coded `* 10` / "+10 Points" instead of the game's configured points | `ChallengeQuizPage.tsx:222, 258, 549` |
| P3 | Score is sent to the client before reveal (`current_score`), hidden only by the UI | `get_challenge_by_token` |
| P4 | Realtime on the quiz page subscribes to `answers` (RLS admin-only → never fires for participants) | `subscribeToGameUpdates` |
