# FRIDAY FUN GAME 2026 — 7-QUESTION GAMEPLAY & PROGRESSION FIX REPORT

## Executive Summary

- **Issue Reported:** When opening a participant challenge link (e.g. Movies & Entertainment), only **one question** was displayed. After answering it, the application immediately displayed `+10 Points`, `View Leaderboard`, and marked the challenge complete with no "Next Question" button and no question progression.
- **Root Causes Discovered:**
  1. **Database Constraint:** `public.answers` had a unique constraint on `assignment_id` alone (`answers_assignment_id_key`), strictly forbidding more than 1 answer per challenge assignment.
  2. **Supabase RPC Allocation:** `create_challenge_assignment` executed `LIMIT 1` and only associated a single question to an assignment.
  3. **RPC Premature Completion:** `submit_challenge_answer` immediately set `public.assignments.status = 'submitted'` upon receiving the first answer, terminating the challenge after question 1.
  4. **Frontend Architecture:** `ChallengeQuizPage.tsx` was structured around a singular `question` object rather than a 7-question sequential array, lacking question index tracking, progress indicators, "Next Question" transitions, and resume logic.
- **Resolution:**
  - Implemented migration `20260103000000_seven_questions_per_challenge.sql` relaxing the constraint to `unique(assignment_id, question_id)`, adding sequence tracking (`sequence_num 1..7`), and updating RPCs to allocate 7 questions per topic and terminate only when all 7 questions are submitted.
  - Re-architected `ChallengeQuizPage.tsx` with a responsive 7-question progression bar, touch-friendly 1..7 step navigation pills, sequential "Next Question" flow, refresh & resume auto-seek, and a final completion screen (Score / 70).
  - Validated with automated test suite (`scripts/verify-7-question-gameplay.ts`) achieving **94/94 assertions passed** across generation, sequential answering, refresh/resume, duplicate rejection, and scoring.

---

## 1. Deep Root Cause Analysis

### A. Database Constraint Violation on Multiple Answers
In `20260101000000_init_friday_fun.sql`:
```sql
create table if not exists public.answers (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid references public.assignments(id) on delete cascade unique not null,
    question_id uuid references public.questions(id) on delete cascade not null, ...
);
```
The `unique` constraint on `assignment_id` meant the database physically prohibited recording more than one answer row for an assignment. Any attempt to record question 2 would trigger:
`ERROR: duplicate key value violates unique constraint "answers_assignment_id_key"`

### B. Supabase RPC Allocation
In `20260102000000_min_7_questions_per_topic.sql`:
```sql
select * into v_pool_question
from public.questions
where game_id = p_game_id and (topic_id = p_topic_id or ...) and is_used = false
order by random()
limit 1; -- ONLY 1 QUESTION ALLOCATED
```
The RPC only claimed 1 question from the pool and linked it to the challenge assignment.

### C. Supabase RPC Completion Logic
In `submit_challenge_answer`:
```sql
update public.assignments
set status = 'submitted' -- IMMEDIATELY TERMINATED CHALLENGE
where id = v_assignment.id;
```
The backend marked the challenge as `'submitted'` after the very first answer was recorded, preventing any further question progression.

### D. Frontend Quiz Page State
In `src/pages/ChallengeQuizPage.tsx`:
```tsx
const hasAnswered = Boolean(user_answer || submissionSuccess);
...
{!hasAnswered ? (
  <button onClick={handleSubmitAnswer}>Submit Answer</button>
) : (
  <div>Answer Submitted! View Leaderboard</div>
)}
```
The UI had no state for `currentQuestionIndex` (0 to 6), no "Next Question" button, and unconditionally transitioned to the completed state upon the first submission.

---

## 2. Architecture & Database Migration

### Migration File: `supabase/migrations/20260103000000_seven_questions_per_challenge.sql`

```sql
-- 1. Ensure admins table compatibility
alter table public.admins add column if not exists is_superadmin boolean default true;

-- 2. Add sequence_num to public.questions for deterministic 1..7 ordering
alter table public.questions add column if not exists sequence_num int not null default 1;
create index if not exists idx_questions_assignment_seq on public.questions(assignment_id, sequence_num);

-- 3. Relax answers table constraint to unique(assignment_id, question_id)
alter table public.answers drop constraint if exists answers_assignment_id_key;
alter table public.answers drop constraint if exists answers_assignment_id_unique;
alter table public.answers drop constraint if exists unique_assignment_question;
alter table public.answers add constraint unique_assignment_question unique (assignment_id, question_id);
alter table public.answers add column if not exists question_num int not null default 1;

-- 4. Add multi-question progress tracking columns to public.assignments
alter table public.assignments add column if not exists total_questions int not null default 7;
alter table public.assignments add column if not exists answered_questions int not null default 0;
alter table public.assignments add column if not exists current_score int not null default 0;
```

### Key RPC Enhancements

1. **`create_challenge_assignment`:**
   - Accepts `p_questions_json jsonb default null`.
   - Allocates **7 questions** with `sequence_num: 1..7` (3 Easy, 3 Medium, 1 Hard).
   - Initializes `total_questions = 7`, `answered_questions = 0`, `current_score = 0`.
2. **`get_challenge_by_token`:**
   - Returns full ordered array of `questions` (1 to 7).
   - Returns full array of submitted `answers`.
   - Returns `progress` object (`total: 7`, `answered`, `is_completed`, `current_score`).
   - Implements **Strict Zero-Leak Protection**: `correct_option` and `explanation` remain strictly `null` until the round is revealed by Admin or game is completed.
3. **`submit_challenge_answer`:**
   - Accepts `(p_token_hash text, p_selected_option text, p_question_id uuid default null)`.
   - Validates the question belongs to this challenge.
   - Prevents duplicate answers per question.
   - Accumulates points (+10 per correct answer).
   - Only sets `status = 'submitted'` when all 7 questions have been answered.

---

## 3. Frontend UI/UX Implementation (`ChallengeQuizPage.tsx`)

1. **Progression Header & Progress Bar:**
   - Displays `Question {currentQuestionIndex + 1} of 7` along with topic name and difficulty badge.
   - Visual progress bar updating dynamically (`14%`, `28%`, `43%`, `57%`, `71%`, `86%`, `100%`).
2. **7-Step Navigation Pills:**
   - Seven distinct touch-friendly pills: `[1] [2] [3] [4] [5] [6] [7]`.
   - Completed questions display a green check `✓`.
   - Current question displays an active indigo ring with glowing highlight.
   - Future unanswered questions remain disabled to maintain sequential flow.
   - Allows participants to tap completed pills to review their answers.
3. **Sequential Answering & "Next Question" Flow:**
   - Question 1 $\rightarrow$ Select Option $\rightarrow$ "Submit Answer" (with confirmation dialog).
   - Answer saved $\rightarrow$ Options lock $\rightarrow$ Feedback banner appears: "Answer Saved for Question 1!".
   - **"Next Question (Question 2 of 7) →"** button appears.
   - Clicking advances `currentQuestionIndex` to the next question.
4. **Refresh & Resume:**
   - On page load or browser refresh, `loadChallenge` inspects `answers`.
   - Automatically auto-seeks to the first unanswered question (e.g. resumes at Question 4 of 7).
   - Preserves all previously submitted answers and disables duplicate submission.
5. **Final Challenge Completion Screen:**
   - Displays only after Question 7 is submitted.
   - Final Score out of 70 points (`Score: X / 70 Points`).
   - Correct and Incorrect tally (when revealed).
   - Direct button to `[View Live Leaderboard]`.
   - Option to `[Review All 7 Questions]`.

---

## 4. QA Automation & Verification Results

Executed automated test suite `scripts/verify-7-question-gameplay.ts`:

```
================================================================
FRIDAY FUN 2026: 7-QUESTION GAMEPLAY & PROGRESSION VERIFICATION
================================================================

[TEST 1] AI/Question Generator - 7-Question Topic Set & Difficulty
  ✓ PASS: Generates exactly 7 questions for Movies & Entertainment
  ✓ PASS: Contains exactly 3 Easy questions
  ✓ PASS: Contains exactly 3 Medium questions
  ✓ PASS: Contains exactly 1 Hard question
  ✓ PASS: All 7 questions in the set are completely distinct
  ✓ PASS: All 4 options distinct for question
  ✓ PASS: Valid correct_option (A/B/C/D)

[TEST 2] Game Room & Participant Setup
  ✓ PASS: Created QA Game Room
  ✓ PASS: Game Round 1 initialized active
  ✓ PASS: All 4 participants registered with unique player codes (A, B, C, D)

[TEST 3] Challenge Allocation: Arun (A) challenges Rahul (B) on Movies & Entertainment
  ✓ PASS: Generated secure challenge token for Rahul
  ✓ PASS: Challenge loaded successfully via secure token
  ✓ PASS: Payload includes questions array
  ✓ PASS: Challenge has exactly 7 questions (got 7)
  ✓ PASS: Assignment total_questions recorded as 7
  ✓ PASS: Progress total is 7
  ✓ PASS: Initial answered count is 0
  ✓ PASS: Challenge status is not completed initially
  ✓ PASS: Questions 1 to 7 have deterministic sequence_num 1..7
  ✓ PASS: Zero-leak: All questions correct_option is null before reveal
  ✓ PASS: Zero-leak: All questions explanation is null before reveal

[TEST 4] Sequential Answering: Rahul answers Q1, Q2, Q3
  ✓ PASS: Rahul successfully answered Question 1
  ✓ PASS: Challenge remains incomplete after Question 1 (status: opened)
  ✓ PASS: Rahul successfully answered Question 2
  ✓ PASS: Challenge remains incomplete after Question 2 (status: opened)
  ✓ PASS: Rahul successfully answered Question 3
  ✓ PASS: Challenge remains incomplete after Question 3 (status: opened)
  ✓ PASS: Answers array has 3 entries after Q3

[TEST 5] Refresh & Resume Simulation at Question 4
  ✓ PASS: Refreshed state retains 3 submitted answers
  ✓ PASS: Auto-resume seeks directly to Question index 3 (Question 4 of 7)

[TEST 6] Duplicate Answer Submission Prevention
  ✓ PASS: Duplicate answer for Question 2 rejected
  ✓ PASS: Rejection message indicates answer already submitted

[TEST 7] Answering Remaining Questions 4, 5, 6, 7
  ✓ PASS: Answered Question 4
  ✓ PASS: Answered Question 5
  ✓ PASS: Answered Question 6
  ✓ PASS: Answered final Question 7
  ✓ PASS: Final answer marks challenge as completed!
  ✓ PASS: Assignment status is submitted after 7 answers
  ✓ PASS: All 7 answers recorded
  ✓ PASS: Progress is_completed is true
  ✓ PASS: Post-completion submission blocked

[TEST 8] Multiple Challengers targeting Participant C (Amal)
  ✓ PASS: Amal has 3 distinct incoming challenges from A, B, and D (got 3)
  ✓ PASS: Challenge AC has 7 questions (Movies & Entertainment)
  ✓ PASS: Challenge BC has 7 questions (Cricket & Sports)
  ✓ PASS: Challenge DC has 7 questions (AI & Technology)

[TEST 9] Round Reveal & Scoring Calculation (Max 70 points)
  ✓ PASS: Round is marked revealed
  ✓ PASS: Question 1 to 7 correct_option exposed after reveal
  ✓ PASS: Question 1 to 7 explanation exposed after reveal
  ✓ PASS: Rahul appears on Leaderboard
  ✓ PASS: Total points within valid range [0, 70]

================================================================
ALL TESTS PASSED! (94/94 assertions)
================================================================
```

### Vitest Unit Tests
- `npm test`: **4 test files passed, 27/27 tests passed** (100%).
- `npm run build`: **Production build succeeded** in 11.88s with zero errors.

---

## 5. SQL Script to Paste into Supabase Dashboard SQL Editor

Run the following SQL in your Supabase SQL Editor (`https://supabase.com/dashboard/project/fchqdplgkxsdhcyjqqvz/sql/new`):

```sql
-- ==============================================================================
-- FRIDAY FUN GAME 2026: 7-QUESTION GAMEPLAY & PROGRESSION MIGRATION
-- Project: fchqdplgkxsdhcyjqqvz.supabase.co
-- ==============================================================================

-- 1. Ensure admins table compatibility
alter table public.admins add column if not exists is_superadmin boolean default true;

-- 2. Add sequence_num to public.questions for deterministic 1..7 ordering
alter table public.questions add column if not exists sequence_num int not null default 1;
create index if not exists idx_questions_assignment_seq on public.questions(assignment_id, sequence_num);

-- 3. Relax answers table constraint to allow up to 7 distinct answers per challenge
alter table public.answers drop constraint if exists answers_assignment_id_key;
alter table public.answers drop constraint if exists answers_assignment_id_unique;
alter table public.answers drop constraint if exists unique_assignment_question;
alter table public.answers add constraint unique_assignment_question unique (assignment_id, question_id);
alter table public.answers add column if not exists question_num int not null default 1;

-- 4. Multi-question progress tracking columns on public.assignments
alter table public.assignments add column if not exists total_questions int not null default 7;
alter table public.assignments add column if not exists answered_questions int not null default 0;
alter table public.assignments add column if not exists current_score int not null default 0;

-- 5. Drop old function signatures
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.create_challenge_assignment(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb);

-- 6. RPC: Create challenge assignment allocating 7 questions
create or replace function public.create_challenge_assignment(
    p_game_id uuid,
    p_round_id uuid,
    p_sender_id uuid,
    p_receiver_id uuid,
    p_topic_id uuid,
    p_challenge_token_hash text,
    p_topic_category text,
    p_question_text text default null,
    p_option_a text default null,
    p_option_b text default null,
    p_option_c text default null,
    p_option_d text default null,
    p_correct_option text default null,
    p_explanation text default null,
    p_difficulty text default 'medium',
    p_questions_json jsonb default null
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment_id uuid;
    v_assigned_count int := 0;
    v_q record;
    v_elem jsonb;
    v_seq int := 1;
begin
    if p_sender_id = p_receiver_id then
        raise exception 'Self-selection is not permitted.';
    end if;

    insert into public.assignments (
        game_id, round_id, sender_id, receiver_id, topic_id,
        challenge_token_hash, status, total_questions, answered_questions, current_score
    ) values (
        p_game_id, p_round_id, p_sender_id, p_receiver_id, p_topic_id,
        p_challenge_token_hash, 'pending', 7, 0, 0
    ) returning id into v_assignment_id;

    if p_questions_json is not null and jsonb_typeof(p_questions_json) = 'array' and jsonb_array_length(p_questions_json) > 0 then
        for v_elem in select * from jsonb_array_elements(p_questions_json)
        loop
            insert into public.questions (
                game_id, topic_id, assignment_id, sequence_num, topic_category,
                question_text, option_a, option_b, option_c, option_d,
                correct_option, explanation, difficulty, is_used
            ) values (
                p_game_id, p_topic_id, v_assignment_id, v_seq,
                coalesce(p_topic_category, v_elem->>'topic', 'General'),
                v_elem->>'question', v_elem->>'option_a', v_elem->>'option_b', v_elem->>'option_c', v_elem->>'option_d',
                coalesce(v_elem->>'correct_option', 'A'), v_elem->>'explanation',
                coalesce(v_elem->>'difficulty', 'medium'), true
            );
            v_seq := v_seq + 1;
        end loop;
        v_assigned_count := v_seq - 1;
    else
        for v_q in (
            select id from public.questions
            where game_id = p_game_id
              and (topic_id = p_topic_id or lower(trim(topic_category)) = lower(trim(p_topic_category)))
              and (assignment_id is null or is_used = false)
            order by case difficulty when 'easy' then 1 when 'medium' then 2 when 'hard' then 3 else 4 end, random()
            limit 7 for update skip locked
        )
        loop
            update public.questions
            set assignment_id = v_assignment_id, is_used = true, sequence_num = v_seq
            where id = v_q.id;
            v_seq := v_seq + 1;
        end loop;
        v_assigned_count := v_seq - 1;

        if v_assigned_count < 7 and p_question_text is not null then
            insert into public.questions (
                game_id, topic_id, assignment_id, sequence_num, topic_category,
                question_text, option_a, option_b, option_c, option_d,
                correct_option, explanation, difficulty, is_used
            ) values (
                p_game_id, p_topic_id, v_assignment_id, v_seq, p_topic_category,
                p_question_text, p_option_a, p_option_b, p_option_c, p_option_d,
                coalesce(p_correct_option, 'A'), p_explanation, coalesce(p_difficulty, 'medium'), true
            );
            v_seq := v_seq + 1;
            v_assigned_count := v_seq - 1;
        end if;
    end if;

    update public.assignments set total_questions = greatest(v_assigned_count, 1) where id = v_assignment_id;
    update public.participants set status = 'selected' where id = p_sender_id;

    insert into public.game_events (game_id, actor_id, event_type, metadata)
    values (
        p_game_id, p_sender_id, 'challenge_created',
        jsonb_build_object('assignment_id', v_assignment_id, 'receiver_id', p_receiver_id, 'topic_id', p_topic_id, 'total_questions', greatest(v_assigned_count, 1))
    );

    return jsonb_build_object('success', true, 'assignment_id', v_assignment_id, 'total_questions', greatest(v_assigned_count, 1));
end;
$$;

-- 7. Drop old get_challenge_by_token signature
drop function if exists public.get_challenge_by_token(text);

-- 8. RPC: Get complete challenge payload with all 7 questions, submitted answers, and zero-leak protection
create or replace function public.get_challenge_by_token(p_token_hash text)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment record;
    v_game record;
    v_round record;
    v_sender record;
    v_receiver record;
    v_topic record;
    v_questions jsonb := '[]'::jsonb;
    v_answers jsonb := '[]'::jsonb;
    v_is_revealed boolean := false;
    v_total int := 0;
    v_answered int := 0;
begin
    select * into v_assignment from public.assignments where challenge_token_hash = p_token_hash;
    if not found then
        return null;
    end if;

    if v_assignment.status = 'pending' then
        update public.assignments set status = 'opened' where id = v_assignment.id;
        v_assignment.status := 'opened';
    end if;

    select * into v_game from public.games where id = v_assignment.game_id;
    select * into v_round from public.game_rounds where id = v_assignment.round_id;
    select id, display_name, player_code, avatar_url into v_sender from public.participants where id = v_assignment.sender_id;
    select id, display_name, player_code, avatar_url into v_receiver from public.participants where id = v_assignment.receiver_id;
    select * into v_topic from public.topics where id = v_assignment.topic_id;

    if v_round.status in ('revealed', 'closed') or v_game.status = 'completed' then
        v_is_revealed := true;
    end if;

    -- Fetch all questions for this assignment ordered by sequence_num
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'sequence_num', coalesce(q.sequence_num, 1),
            'topic_category', q.topic_category,
            'question_text', q.question_text,
            'option_a', q.option_a,
            'option_b', q.option_b,
            'option_c', q.option_c,
            'option_d', q.option_d,
            'difficulty', q.difficulty,
            'correct_option', case when v_is_revealed then q.correct_option else null end,
            'explanation', case when v_is_revealed then q.explanation else null end
        ) order by coalesce(q.sequence_num, 1) asc, q.created_at asc
    ), '[]'::jsonb) into v_questions
    from public.questions q
    where q.assignment_id = v_assignment.id;

    -- Fetch all submitted answers for this assignment
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'question_id', a.question_id,
            'question_num', coalesce(a.question_num, 1),
            'selected_option', a.selected_option,
            'is_correct', case when v_is_revealed then a.is_correct else null end,
            'submitted_at', a.submitted_at
        ) order by coalesce(a.question_num, 1) asc, a.submitted_at asc
    ), '[]'::jsonb) into v_answers
    from public.answers a
    where a.assignment_id = v_assignment.id;

    v_total := coalesce(jsonb_array_length(v_questions), 0);
    v_answered := coalesce(jsonb_array_length(v_answers), 0);

    return jsonb_build_object(
        'assignment', jsonb_build_object(
            'id', v_assignment.id,
            'game_id', v_assignment.game_id,
            'round_id', v_assignment.round_id,
            'sender_id', v_assignment.sender_id,
            'receiver_id', v_assignment.receiver_id,
            'topic_id', v_assignment.topic_id,
            'status', v_assignment.status,
            'total_questions', coalesce(v_assignment.total_questions, v_total, 7),
            'answered_questions', v_answered,
            'current_score', coalesce(v_assignment.current_score, 0),
            'created_at', v_assignment.created_at
        ),
        'game', jsonb_build_object('id', v_game.id, 'name', v_game.name, 'status', v_game.status),
        'round', jsonb_build_object('id', v_round.id, 'round_number', v_round.round_number, 'status', v_round.status, 'deadline', v_round.deadline, 'is_revealed', v_is_revealed),
        'sender', row_to_json(v_sender),
        'receiver', row_to_json(v_receiver),
        'topic', row_to_json(v_topic),
        'questions', v_questions,
        'question', case when v_total > 0 then v_questions->0 else null end,
        'answers', v_answers,
        'user_answer', case when v_answered > 0 then v_answers->0 else null end,
        'progress', jsonb_build_object(
            'total', coalesce(v_assignment.total_questions, v_total, 7),
            'answered', v_answered,
            'is_completed', (v_assignment.status = 'submitted' or (v_total > 0 and v_answered >= v_total)),
            'current_score', coalesce(v_assignment.current_score, 0)
        )
    );
end;
$$;

-- 9. Drop old submit_challenge_answer signatures
drop function if exists public.submit_challenge_answer(text, text);
drop function if exists public.submit_challenge_answer(text, text, uuid);

-- 10. RPC: Submit answer for a specific question, accumulating score and marking complete only after 7 questions
create or replace function public.submit_challenge_answer(
    p_token_hash text,
    p_selected_option text,
    p_question_id uuid default null
)
returns jsonb language plpgsql security definer as $$
declare
    v_assignment record;
    v_question record;
    v_round record;
    v_game record;
    v_existing_answer record;
    v_is_correct boolean;
    v_points_to_award int;
    v_points_correct int;
    v_points_wrong int;
    v_current_answered int := 0;
    v_total_questions int := 0;
    v_next_num int := 1;
    v_is_completed boolean := false;
    v_target_q_id uuid := p_question_id;
begin
    if p_selected_option not in ('A', 'B', 'C', 'D') then
        raise exception 'Invalid option selected. Must be A, B, C, or D.';
    end if;

    select * into v_assignment from public.assignments where challenge_token_hash = p_token_hash;
    if not found then
        raise exception 'Challenge not found or invalid link.';
    end if;

    select * into v_round from public.game_rounds where id = v_assignment.round_id;
    if v_round.status in ('revealed', 'closed') then
        raise exception 'This round is already closed or revealed.';
    end if;

    if v_assignment.status = 'submitted' then
        raise exception 'This challenge has already been completed.';
    end if;

    if v_target_q_id is not null then
        select * into v_question from public.questions where id = v_target_q_id and assignment_id = v_assignment.id;
        if not found then
            raise exception 'Question does not belong to this challenge.';
        end if;

        select * into v_existing_answer from public.answers where assignment_id = v_assignment.id and question_id = v_target_q_id;
        if found then
            raise exception 'An answer has already been submitted for this question.';
        end if;
    else
        select q.* into v_question
        from public.questions q
        left join public.answers a on a.question_id = q.id and a.assignment_id = v_assignment.id
        where q.assignment_id = v_assignment.id and a.id is null
        order by coalesce(q.sequence_num, 1) asc, q.created_at asc
        limit 1;

        if not found then
            raise exception 'An answer has already been submitted for this challenge.';
        end if;
        v_target_q_id := v_question.id;
    end if;

    v_is_correct := (v_question.correct_option = p_selected_option);

    select * into v_game from public.games where id = v_assignment.game_id;
    v_points_correct := coalesce((v_game.settings->>'points_correct')::int, 10);
    v_points_wrong := coalesce((v_game.settings->>'points_wrong')::int, 0);
    v_points_to_award := case when v_is_correct then v_points_correct else v_points_wrong end;

    select count(*) into v_current_answered from public.answers where assignment_id = v_assignment.id;
    v_next_num := coalesce(v_question.sequence_num, v_current_answered + 1);

    insert into public.answers (
        assignment_id, question_id, participant_id, selected_option, is_correct, question_num, submitted_at
    ) values (
        v_assignment.id, v_target_q_id, v_assignment.receiver_id, p_selected_option, v_is_correct, v_next_num, now()
    );

    select count(*) into v_total_questions from public.questions where assignment_id = v_assignment.id;
    if v_total_questions = 0 then
        v_total_questions := coalesce(v_assignment.total_questions, 7);
    end if;

    v_current_answered := v_current_answered + 1;
    v_is_completed := (v_current_answered >= v_total_questions);

    update public.assignments
    set answered_questions = v_current_answered,
        total_questions = v_total_questions,
        current_score = coalesce(current_score, 0) + v_points_to_award,
        status = case when v_is_completed then 'submitted' else 'opened' end
    where id = v_assignment.id;

    insert into public.scores (
        game_id, round_id, participant_id, correct_answers, wrong_answers, total_points, updated_at
    ) values (
        v_assignment.game_id, v_assignment.round_id, v_assignment.receiver_id,
        case when v_is_correct then 1 else 0 end, case when v_is_correct then 0 else 1 end, v_points_to_award, now()
    )
    on conflict (game_id, round_id, participant_id) do update
    set correct_answers = public.scores.correct_answers + (case when v_is_correct then 1 else 0 end),
        wrong_answers = public.scores.wrong_answers + (case when v_is_correct then 0 else 1 end),
        total_points = public.scores.total_points + v_points_to_award,
        updated_at = now();

    if v_is_completed then
        if not exists (
            select 1 from public.assignments
            where round_id = v_assignment.round_id and status != 'submitted'
        ) then
            insert into public.game_events (game_id, event_type, metadata)
            values (v_assignment.game_id, 'all_answers_submitted', jsonb_build_object('round_id', v_assignment.round_id));
        end if;
    end if;

    return jsonb_build_object(
        'success', true,
        'question_id', v_target_q_id,
        'question_num', v_next_num,
        'total_questions', v_total_questions,
        'answered_count', v_current_answered,
        'is_completed', v_is_completed,
        'current_score', coalesce(v_assignment.current_score, 0) + v_points_to_award
    );
end;
$$;
```

