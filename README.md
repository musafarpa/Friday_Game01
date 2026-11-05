# 🎮 Friday Fun Game 2026

A modern, production-ready, multiplayer topic-selection and quiz challenge web application built for friends, college groups, and workplace teams.

Built with **React + Vite + TypeScript + Tailwind CSS + Supabase (Auth, DB, Realtime, RLS) + Serverless AI API (Google Gemini / OpenAI)**.

---

## 🌟 Key Features

- **Dark Premium Interface**: Modern gaming aesthetic with deep navy backgrounds, purple, electric blue, and neon accents.
- **100% Mobile-First & Touch Friendly**: Minimum 44px touch targets, zero horizontal scrolling, responsive cards, and adaptive modals across all screen sizes (320px–1440px+).
- **Cryptographic Invitation Links**: Every participant receives an unguessable invitation token securely hashed using SHA-256 in the database.
- **One-Tap WhatsApp Sharing**: Pre-formatted, emoji-rich WhatsApp messages for both participant room invitations and challenge links.
- **Participant Selection Flow**:
  1. A player opens their personal link (`/join/:gameId/:token`).
  2. Selects any other player (excluding themselves).
  3. Picks a topic category from 10 pre-approved default topics or custom admin categories.
  4. Automatically triggers the server-side AI Question Generator.
  5. Receives a private challenge link (`/challenge/:challengeToken`) to send to their friend via WhatsApp!
- **AI & Question Bank Dual Engine**:
  - Automatically queries Google Gemini 1.5/2.0 or OpenAI API to produce unique 4-option questions with explanations.
  - Guaranteed fallback to an extensive 100+ curated question bank across all 10 topics and 3 difficulty tiers (40% Easy, 40% Medium, 20% Hard) ensuring 100% uptime and zero gameplay interruption!
- **Zero-Leak RLS & Stored Procedures**:
  - Correct answers and explanations are hidden server-side via Supabase Row-Level Security and stored functions until the Admin triggers the official answer reveal.
  - Submissions are locked and duplicate submissions blocked.
- **Real-Time Admin Monitoring**:
  - Live Supabase Realtime subscriptions to track who has opened, who is pending, and who has submitted answers without page reloads.
  - Admin controls: "REVEAL ALL ANSWERS", manual round closure, CSV export.
- **Leaderboard & Champion Podium**:
  - Server-calculated scores (+10 points for correct answers, 0 for wrong/unanswered).
  - Top-3 podium (🥇 1st, 🥈 2nd, 🥉 3rd) with celebration confetti.
  - Full standings table and one-click CSV export.

---

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript |
| **Styling** | Tailwind CSS, Plus Jakarta Sans font |
| **Icons & Effects** | Lucide React, Canvas Confetti |
| **Backend & DB** | Supabase (PostgreSQL, Auth, Realtime, RPC) |
| **Security** | Row Level Security (RLS), Web Crypto SHA-256 |
| **Serverless AI** | Vercel Serverless Functions (`/api/generate-question`) |
| **Hosting** | Vercel (SPA routing with `vercel.json`) |

---

## 🚀 1. Installation & Local Development

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm or pnpm

### Clone & Install
```bash
git clone https://github.com/your-username/friday-fun-2026.git
cd friday-fun-2026
npm install
```

### Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Zero-Config Local Interactive Mode**:
> If you run the app before configuring Supabase credentials, the application automatically launches in **Local Interactive Mode** with seeded demo players (Arun, Rahul, Amal, Nikhil, Akhil) so you can test all features immediately! You can log into the Admin portal with `admin@fridayfun.com` and any 6+ character password.

---

## 🗄️ 2. Supabase Setup & Migrations

### A. Create a Supabase Project
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Note down your **Project URL** and **anon public key** from `Settings > API`.

### B. Run Database Migrations
1. Open the **SQL Editor** in your Supabase dashboard.
2. Open the migration file: `supabase/migrations/20260101000000_init_friday_fun.sql` from this repository.
3. Paste the entire SQL script and click **Run**.
4. This creates:
   - All 11 relational tables (`admins`, `games`, `participants`, `topics`, `game_topics`, `game_rounds`, `assignments`, `questions`, `answers`, `scores`, `game_events`).
   - Performance indexes.
   - Row-Level Security policies.
   - Secure RPC stored procedures (`get_participant_by_token`, `get_challenge_by_token`, `submit_challenge_answer`, `reveal_round_answers`).
   - Default seeds for the 10 core topic categories.
   - Realtime publication enablement.

---

## 👤 3. Admin Account Provisioning

For strict security, public registration for Admin is disabled. Admin accounts are provisioned securely:

1. In Supabase Dashboard, go to **Authentication > Users** and click **Add User > Create User**.
2. Enter an email (e.g. `admin@fridayfun.com`) and a secure password.
3. In the Supabase **SQL Editor**, run the script from `supabase/admin_provision.sql`:
   ```sql
   DO $$
   DECLARE
       v_user_id uuid;
       v_admin_email text := 'admin@fridayfun.com'; -- Replace with your admin email
   BEGIN
       SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;
       IF v_user_id IS NOT NULL THEN
           INSERT INTO public.admins (user_id, email)
           VALUES (v_user_id, v_admin_email)
           ON CONFLICT (user_id) DO NOTHING;
           RAISE NOTICE 'Admin granted!';
       END IF;
   END $$;
   ```
4. Now you can sign in at `/admin/login` using those credentials!

---

## ⚙️ 4. Environment Variables Configuration

Create a `.env` file in the project root (see `.env.example`):

```ini
# Supabase credentials (public)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI Question Generation (Server-side only)
# Get a free API key from Google AI Studio: https://aistudio.google.com/
GEMINI_API_KEY=AIzaSy...

# Optional OpenAI fallback
OPENAI_API_KEY=sk-...
```

---

## 🌐 5. Vercel Deployment

The application is pre-configured for seamless Vercel deployment with `vercel.json` SPA routing and `/api/generate-question.ts` serverless function.

### Deploying via Vercel CLI
```bash
npm install -g vercel
vercel
```

### Deploying via GitHub & Vercel Dashboard
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: initial Friday Fun 2026 production release"
   git remote add origin https://github.com/your-username/friday-fun-2026.git
   git push -u origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com), click **Add New > Project** and import your repository.
3. Framework Preset: **Vite**.
4. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (or `OPENAI_API_KEY`)
5. Click **Deploy**!

---

## 🧪 6. Testing Instructions & Gameplay Walkthrough

1. **Host Setup**:
   - Go to `/admin/login` and log in.
   - Go to **Participants** tab and click **Add Participant** (e.g. Arun, Rahul, Amal, Nikhil).
   - Click **Share on WhatsApp** or **Copy Invite Link** for each participant.
2. **Participant Joins**:
   - Open Arun's link: `/join/<gameId>/<token>`.
   - Observe the personalized welcome screen: "Welcome, Arun! Player ID: A".
3. **Friend Challenge**:
   - Arun selects "Amal" (Player C) and chooses topic "Pollution & Environment".
   - Clicks "Generate & Send Challenge".
   - The AI generates the 4-option challenge.
   - Arun clicks **Share via WhatsApp** to send the challenge link to Amal.
4. **Taking the Quiz**:
   - Amal opens `/challenge/<challengeToken>`.
   - Sees "Arun challenged you!" with topic badge and question.
   - Selects an option and clicks **Submit Answer**.
   - Confirmation is displayed: "Answer Submitted Successfully! Wait until Admin reveals results."
   - Notice that the correct answer is hidden!
5. **Admin Live Monitoring**:
   - Admin sees Amal's challenge status transition in real-time from `Pending` -> `Opened` -> `Submitted`.
6. **Answer Reveal & Celebration**:
   - Admin clicks **REVEAL ALL ANSWERS**.
   - Amal's screen updates in real time to show whether their answer was correct, +10 points, the explanation, and a link to the Leaderboard.
   - The Leaderboard ranks all players, crowns the champion with confetti, and allows CSV download.

---

## 🛡️ Security Architecture

1. **SHA-256 Token Hashing**: Raw invitation and challenge tokens are never stored plain-text in the database.
2. **Server-Side Correct Answer Masking**: The `get_challenge_by_token` stored function explicitly returns `NULL` for `correct_option` and `explanation` until the round status is officially updated to `revealed`.
3. **No Direct Answer Table Access**: Participants cannot view or edit rows in the `answers` table directly. Answers are submitted via the `submit_challenge_answer` RPC function which enforces strict validation.
4. **No Secrets in Frontend**: `GEMINI_API_KEY`, `OPENAI_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are only used server-side in `/api` functions.

---

## 📄 License
MIT License. Crafted for high-energy social gaming, team celebrations, and college events!
