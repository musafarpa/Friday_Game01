import { describe, it, expect } from 'vitest';
import { QUESTION_BANK, getRandomQuestionForTopic, getBankQuestionsForTopic, getBankCandidatesForTopic } from '../data/questionBank';
import { generateQuestionSetForTopic, isValidQuestion, POOL_MINIMUM } from '../services/questionGenerator';
import { vi, beforeEach } from 'vitest';

describe('Friday Fun 2026 - Question Bank & Generator QA', () => {
  it('should have a rich question bank containing verified questions across all 10 topics', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(40);

    const topics = [
      'Politics & Government',
      'Pollution & Environment',
      'AI & Technology',
      'Social Media',
      'Kerala & Current Affairs',
      'Cricket & Sports',
      'Movies & Entertainment',
      'College & Office Life',
      'Money & Lifestyle',
      'Funny & Random',
    ];

    topics.forEach((t) => {
      const questionsForTopic = QUESTION_BANK.filter(
        (q) => q.topic.toLowerCase() === t.toLowerCase()
      );
      expect(
        questionsForTopic.length,
        `Topic "${t}" must have questions in bank`
      ).toBeGreaterThanOrEqual(4);
    });
  });

  it('every question must have exactly 4 distinct options, exactly 1 valid correct option, and an explanation', () => {
    QUESTION_BANK.forEach((q, idx) => {
      expect(q.question.trim().length, `Q#${idx} question text must not be empty`).toBeGreaterThan(10);
      expect(q.option_a.trim().length, `Q#${idx} option A must not be empty`).toBeGreaterThan(0);
      expect(q.option_b.trim().length, `Q#${idx} option B must not be empty`).toBeGreaterThan(0);
      expect(q.option_c.trim().length, `Q#${idx} option C must not be empty`).toBeGreaterThan(0);
      expect(q.option_d.trim().length, `Q#${idx} option D must not be empty`).toBeGreaterThan(0);

      // Verify all 4 options are distinct strings
      const set = new Set([
        q.option_a.trim().toLowerCase(),
        q.option_b.trim().toLowerCase(),
        q.option_c.trim().toLowerCase(),
        q.option_d.trim().toLowerCase(),
      ]);
      expect(set.size, `Q#${idx} ("${q.question}") must have 4 distinct options`).toBe(4);

      // Verify correct option is A, B, C, or D
      expect(['A', 'B', 'C', 'D']).toContain(q.correct_option);

      // Verify explanation exists
      expect(q.explanation?.trim().length).toBeGreaterThan(10);

      // Verify difficulty is valid
      expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
    });
  });

  it('getRandomQuestionForTopic should return questions matching topic and difficulty', () => {
    const qEasy = getRandomQuestionForTopic('AI & Technology', 'easy');
    expect(qEasy!.topic).toBe('AI & Technology');
    expect(qEasy!.difficulty).toBe('easy');

    const qKerala = getRandomQuestionForTopic('Kerala & Current Affairs');
    expect(qKerala!.topic).toBe('Kerala & Current Affairs');
  });

  describe('strict topic matching (regression: custom topics used to receive other topics questions)', () => {
    it('a custom topic with no bank entries has NO bank questions', () => {
      expect(getBankCandidatesForTopic('Underwater Basket Weaving')).toEqual([]);
      expect(getRandomQuestionForTopic('Underwater Basket Weaving', 'easy')).toBeNull();
      expect(getBankQuestionsForTopic('Underwater Basket Weaving', 7)).toEqual([]);
    });

    it('very short or empty topic names never fuzzy-match the whole bank', () => {
      expect(getBankCandidatesForTopic('')).toEqual([]);
      expect(getBankCandidatesForTopic('a')).toEqual([]);
      expect(getBankCandidatesForTopic('Fun')).toEqual([]);
    });

    it('every bank question returned for a topic belongs to that topic', () => {
      for (const t of ['Cricket & Sports', 'Movies & Entertainment', 'AI & Technology']) {
        const qs = getBankQuestionsForTopic(t, 7);
        expect(qs.length).toBe(7);
        expect(qs.every((q) => q.topic === t)).toBe(true);
        expect(new Set(qs.map((q) => q.question)).size).toBe(7);
      }
    });

    it('a descriptive alias such as "Cricket" maps to "Cricket & Sports" only', () => {
      const qs = getBankCandidatesForTopic('Cricket');
      expect(qs.length).toBeGreaterThan(0);
      expect(qs.every((q) => q.topic === 'Cricket & Sports')).toBe(true);
    });
  });

  describe('every topic can supply a full 3E/3M/1H set (7 unique questions) from the bank', () => {
    const topics = Array.from(new Set(QUESTION_BANK.map((q) => q.topic)));
    it.each(topics)('%s', (t) => {
      const qs = getBankQuestionsForTopic(t, 7, { easy: 3, medium: 3, hard: 1 });
      expect(qs).toHaveLength(7);
      expect(qs.filter((q) => q.difficulty === 'easy')).toHaveLength(3);
      expect(qs.filter((q) => q.difficulty === 'medium')).toHaveLength(3);
      expect(qs.filter((q) => q.difficulty === 'hard')).toHaveLength(1);
    });
  });

  describe('isValidQuestion', () => {
    const base = { topic: 't', question: 'A reasonably long question?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_option: 'A' as const, explanation: 'why', difficulty: 'easy' as const };
    it('accepts a good question', () => expect(isValidQuestion(base)).toBe(true));
    it('rejects duplicate options (case/space-insensitive)', () => expect(isValidQuestion({ ...base, option_b: ' A ' })).toBe(false));
    it('rejects missing/invalid correct option, difficulty, explanation, short text', () => {
      expect(isValidQuestion({ ...base, correct_option: 'E' as any })).toBe(false);
      expect(isValidQuestion({ ...base, difficulty: 'insane' as any })).toBe(false);
      expect(isValidQuestion({ ...base, explanation: '  ' })).toBe(false);
      expect(isValidQuestion({ ...base, question: 'short' })).toBe(false);
      expect(isValidQuestion({ ...base, option_c: '' })).toBe(false);
    });
  });

  describe('generateQuestionSetForTopic - AI failure handling (no AI endpoint available)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    });

    it('AI unavailable (HTTP 503): falls back to the same-topic bank and still returns a valid 3/3/1 set with a warning', async () => {
      const r = await generateQuestionSetForTopic('Cricket & Sports', { ...POOL_MINIMUM });
      expect(r.questions).toHaveLength(7);
      expect(r.questions.every((q) => q.source === 'question-bank' && isValidQuestion(q))).toBe(true);
      expect(new Set(r.questions.map((q) => q.question)).size).toBe(7);
      expect(r.warnings.join(' ')).toMatch(/HTTP 503/);
    });

    it('AI timeout / network error: does not throw and falls back', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }));
      const r = await generateQuestionSetForTopic('AI & Technology', { ...POOL_MINIMUM });
      expect(r.questions).toHaveLength(7);
      expect(r.warnings.join(' ')).toMatch(/timed out/i);
    });

    it('incomplete generation: a custom topic with no bank and no AI returns 0 questions and an explicit warning (never wrong-topic padding)', async () => {
      const r = await generateQuestionSetForTopic('Underwater Basket Weaving', { ...POOL_MINIMUM });
      expect(r.questions).toHaveLength(0);
      expect(r.warnings.join(' ')).toMatch(/Only 0 of 7 requested questions/);
    });

    it('duplicate generation: AI returning the same question repeatedly yields no duplicates', async () => {
      const dup = { question: 'What is the capital city of France?', option_a: 'Paris', option_b: 'Rome', option_c: 'Berlin', option_d: 'Madrid', correct_option: 'A', explanation: 'Paris is the capital.' };
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dup), { status: 200 })));
      const r = await generateQuestionSetForTopic('Geography Trivia', { easy: 3, medium: 3, hard: 1 });
      expect(r.questions.length).toBe(1); // only the first copy accepted; custom topic has no bank top-up
      expect(r.warnings.join(' ')).toMatch(/Only 1 of 7/);
    });

    it('AI returning malformed JSON / invalid questions is rejected, not trusted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ question: 'Dup options question?', option_a: 'x', option_b: 'x', option_c: 'y', option_d: 'z', correct_option: 'A', explanation: 'e' }), { status: 200 })));
      const r = await generateQuestionSetForTopic('Cricket & Sports', { ...POOL_MINIMUM });
      expect(r.questions.every((q) => q.source === 'question-bank')).toBe(true);
      expect(r.warnings.join(' ')).toMatch(/invalid question/);
    });
  });
});
