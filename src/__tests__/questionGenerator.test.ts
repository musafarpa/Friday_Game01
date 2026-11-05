import { describe, it, expect } from 'vitest';
import { QUESTION_BANK, getRandomQuestionForTopic } from '../data/questionBank';

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
    expect(qEasy.topic).toBe('AI & Technology');
    expect(qEasy.difficulty).toBe('easy');

    const qKerala = getRandomQuestionForTopic('Kerala & Current Affairs');
    expect(qKerala.topic).toBe('Kerala & Current Affairs');
  });
});

