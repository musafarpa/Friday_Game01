import { getRandomQuestionForTopic, BankQuestion } from '../data/questionBank';

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

