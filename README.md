# 🎮 Friday Fun Game 2026

A multiplayer topic-selection quiz game for friends and teams. Built with **React + Vite + TypeScript + Tailwind + Supabase (Postgres, Auth, Realtime, RLS)** and a Vercel serverless function for AI question generation.

> The app talks **only** to your Supabase project. There is no demo/offline mode: if the Supabase variables are missing the site shows a configuration error instead of pretending to work.

## How the game works

1. **Admin** signs in, creates a game (name, min/max players, points, **topics**). Each topic needs ≥ 7 valid questions (3 easy · 3 medium · 1 hard); the pool is topped up to 10 per topic from AI / the curated bank.
2. Admin adds participants → every participant gets a unique secure invitation link (copy / WhatsApp).
3. Admin **Starts** the game (the server refuses unless min players are present and every topic's pool is valid).
4. Each participant opens their link, picks **one friend + one topic** → the server builds a private **7-question challenge** (3E/3M/1H) and a private challenge link to send to the friend. A player can receive several challenges (each independent).
5. The receiver answers Question 1 → 7 (answers are saved one by one; refresh/reopen resumes where they left off).
6. Admin watches live progress; **Complete** closes the game, finalises scores (10 pts per correct answer, unanswered = 0, max 70 per challenge) and **reveals the correct answers**.
7. Leaderboard is public: live (finished challenges only) → final (everything) with tie-aware ranks.

Lifecycle: `Registration open → In progress ⇄ Paused → Completed`, and `→ Cancelled` from any unfinished state. Completed/cancelled games are removed by the retention cleanup (24 h) – active/paused/registration games never are.

## Security model (important)

* Participant data tables (`participants`, `assignments`, `questions`, `answers`, `scores`, secrets…) are **admin-only** under RLS. Participants use token-checked RPCs; the **raw token is hashed on the server** so a hash is worthless.
* Correct answers never leave the database before the game is completed (not in `games.settings`, not in RPC payloads, not in the live leaderboard).
* Scores are computed in SQL from stored answers; challenges and tokens are generated server-side.
* The browser only ever holds the **publishable/anon** key. Never put a service-role key in a `VITE_` variable.
* `/api/generate-question` requires a signed-in admin JWT.

## Setup

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                     # http://localhost:3000
```

### Database (Supabase SQL Editor, in order)
1. `supabase/migrations/20260101000000_init_friday_fun.sql`
2. `supabase/migrations/20260102000000_min_7_questions_per_topic.sql`
3. `supabase/migrations/20260103000000_seven_questions_per_challenge.sql`
4. `supabase/migrations/20260104000000_security_lifecycle_hardening.sql` ← **security fix; deploy the matching frontend right after**
5. Create the admin user (Authentication → Users), then run `supabase/admin_provision.sql` with their email.

### Environment variables
See `.env.example`. Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_PUBLIC_BASE_URL`. Server (Vercel only): `GEMINI_API_KEY` / `OPENAI_API_KEY` (optional), `GEMINI_MODEL`, `OPENAI_MODEL`.

## Testing

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript (strict) |
| `npm test` | Vitest: unit + component tests **and** the SQL suites (`src/__tests__/db`) that run the real migrations in an in-process Postgres (PGlite) under `anon` / `authenticated` roles with RLS enforced |
| `npm run e2e` | Playwright against the production bundle + a local Supabase-compatible emulator (`scripts/qa/supabase-emulator.ts`) that executes the same migration SQL. Covers the full A-to-Z flow with separate browser sessions, lifecycle, security, failures and 9 responsive widths. |
| `npm run build` | Typecheck + production build |

The emulator and `e2e/` never touch your Supabase project.

See `FRIDAY_FUN_2026_COMPLETE_A_TO_Z_QA_REPORT.md` for results/evidence and `docs/qa/DEPLOYMENT_CHECKLIST.md` for the release steps.
