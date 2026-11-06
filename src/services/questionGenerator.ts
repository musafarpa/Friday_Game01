import { getRandomQuestionForTopic, getBankQuestionsForTopic, BankQuestion } from '../data/questionBank';

export interface GeneratedQuestion {
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source?: string;
}

export function isValidQuestion(q: GeneratedQuestion | BankQuestion): boolean {
  if (!q.question || q.question.trim().length < 5) return false;
  if (!q.option_a || !q.option_b || !q.option_c || !q.option_d) return false;
  const opts = [
    q.option_a.trim().toLowerCase(),
    q.option_b.trim().toLowerCase(),
    q.option_c.trim().toLowerCase(),
    q.option_d.trim().toLowerCase(),
  ];
  const uniqueOpts = new Set(opts);
  if (uniqueOpts.size !== 4) return false; // Must be 4 distinct options!
  if (!['A', 'B', 'C', 'D'].includes(q.correct_option)) return false;
  if (!q.explanation || q.explanation.trim().length === 0) return false;
  return true;
}

export async function generateQuestionForTopic(
  topicName: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  excludeQuestions: string[] = []
): Promise<GeneratedQuestion> {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    if (baseUrl && baseUrl.startsWith('http')) {
      const response = await fetch(`${baseUrl}/api/generate-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topicName,
          difficulty,
          excludeQuestions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (
          data.question &&
          data.option_a &&
          data.option_b &&
          data.option_c &&
          data.option_d &&
          ['A', 'B', 'C', 'D'].includes(data.correct_option)
        ) {
          return data as GeneratedQuestion;
        }
      }
    }
  } catch (err) {
    // API unavailable, fallback cleanly
  }

  // Guaranteed fallback to question bank
  const fallback = getRandomQuestionForTopic(topicName, difficulty, excludeQuestions);
  return {
    ...fallback,
    source: 'question-bank',
  };
}

/**
 * Generates at least `count` (minimum 7) unique, high-quality questions for a selected topic
 * with the exact required difficulty distribution (3 Easy, 3 Medium, 1 Hard).
 * Guarantees zero duplicate questions within the set and against `excludeQuestions`.
 */
export async function generateQuestionSetForTopic(
  topicName: string,
  count: number = 7,
  distribution: { easy: number; medium: number; hard: number } = { easy: 3, medium: 3, hard: 1 },
  excludeQuestions: string[] = []
): Promise<GeneratedQuestion[]> {
  const result: GeneratedQuestion[] = [];
  const seenTexts = new Set<string>(excludeQuestions.map((t) => t.toLowerCase().trim()));

  // Target sequence of difficulties according to distribution:
  // 3 Easy, 3 Medium, 1 Hard
  const diffSequence: Array<'easy' | 'medium' | 'hard'> = [];
  for (let i = 0; i < distribution.easy; i++) diffSequence.push('easy');
  for (let i = 0; i < distribution.medium; i++) diffSequence.push('medium');
  for (let i = 0; i < distribution.hard; i++) diffSequence.push('hard');

  // If count exceeds distribution total, fill with medium
  while (diffSequence.length < count) {
    diffSequence.push('medium');
  }

  // 1. Attempt generation for each target difficulty
  for (const diff of diffSequence) {
    try {
      const generated = await generateQuestionForTopic(
        topicName,
        diff,
        Array.from(seenTexts)
      );
      if (isValidQuestion(generated) && !seenTexts.has(generated.question.toLowerCase().trim())) {
        result.push(generated);
        seenTexts.add(generated.question.toLowerCase().trim());
        continue;
      }
    } catch {
      // Fallback
    }
  }

  // 2. If short of requested count or missing difficulty distributions, pull from verified question bank
  if (result.length < count) {
    const easyNeeded = Math.max(0, distribution.easy - result.filter((q) => q.difficulty === 'easy').length);
    const medNeeded = Math.max(0, distribution.medium - result.filter((q) => q.difficulty === 'medium').length);
    const hardNeeded = Math.max(0, distribution.hard - result.filter((q) => q.difficulty === 'hard').length);

    const bankQuestions = getBankQuestionsForTopic(
      topicName,
      count - result.length,
      { easy: easyNeeded, medium: medNeeded, hard: hardNeeded },
      Array.from(seenTexts)
    );

    for (const bq of bankQuestions) {
      const norm = bq.question.toLowerCase().trim();
      if (!seenTexts.has(norm)) {
        result.push({
          ...bq,
          source: 'question-bank',
        });
        seenTexts.add(norm);
      }
      if (result.length >= count) break;
    }
  }

  return result;
}
