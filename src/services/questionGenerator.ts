import { getRandomQuestionForTopic, getBankQuestionsForTopic, BankQuestion } from '../data/questionBank';
import { supabase } from '../lib/supabase';

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

/** Pool target per topic: 10 questions (4 easy / 4 medium / 2 hard). The hard minimum is 7 (3/3/1). */
export const POOL_TARGET = { easy: 4, medium: 4, hard: 2 } as const;
export const POOL_MINIMUM = { easy: 3, medium: 3, hard: 1 } as const;
export const POOL_MINIMUM_TOTAL = 7;

export function isValidQuestion(q: GeneratedQuestion | BankQuestion): boolean {
  if (!q || !q.question || q.question.trim().length < 10) return false;
  if (!q.option_a || !q.option_b || !q.option_c || !q.option_d) return false;
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d].map((o) => o.trim().toLowerCase());
  if (opts.some((o) => o.length === 0)) return false;
  if (new Set(opts).size !== 4) return false; // exactly four DISTINCT options
  if (!['A', 'B', 'C', 'D'].includes(q.correct_option)) return false; // exactly one correct answer
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) return false;
  if (!q.explanation || q.explanation.trim().length === 0) return false;
  return true;
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export interface GenerationAttempt {
  question: GeneratedQuestion | null;
  /** Why the AI endpoint produced nothing (so the UI can explain instead of silently degrading). */
  aiError?: string;
}

/** Ask the server-side AI endpoint for ONE question. Never throws. */
async function requestAiQuestion(
  topicName: string,
  difficulty: 'easy' | 'medium' | 'hard',
  excludeQuestions: string[]
): Promise<GenerationAttempt> {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    if (!baseUrl.startsWith('http')) return { question: null, aiError: 'No browser origin for API call' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000); // AI timeout => fall back, never hang
    try {
      const response = await fetch(`${baseUrl}/api/generate-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ topic: topicName, difficulty, excludeQuestions }),
        signal: controller.signal,
      });
      if (!response.ok) return { question: null, aiError: `AI endpoint returned HTTP ${response.status}` };
      const data = await response.json();
      if (data?.source === 'none') return { question: null, aiError: data.error || 'No AI provider configured' };
      const candidate = { ...data, topic: topicName, difficulty } as GeneratedQuestion;
      return isValidQuestion(candidate) ? { question: candidate } : { question: null, aiError: 'AI returned an invalid question' };
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    return { question: null, aiError: err?.name === 'AbortError' ? 'AI request timed out' : err?.message || 'AI unavailable' };
  }
}

export async function generateQuestionForTopic(
  topicName: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  excludeQuestions: string[] = []
): Promise<GenerationAttempt> {
  const ai = await requestAiQuestion(topicName, difficulty, excludeQuestions);
  if (ai.question) return ai;

  // Fallback: verified bank. getRandomQuestionForTopic never crosses topics (null if none).
  const fallback = getRandomQuestionForTopic(topicName, difficulty, excludeQuestions);
  if (fallback) return { question: { ...fallback, source: 'question-bank' }, aiError: ai.aiError };
  return { question: null, aiError: ai.aiError };
}

export interface QuestionSetResult {
  questions: GeneratedQuestion[];
  /** Human readable reasons for any shortfall (AI errors, exhausted bank). Empty when fully served. */
  warnings: string[];
}

/**
 * Generates up to `distribution.easy + medium + hard` unique, valid questions for a topic with the
 * requested difficulty mix. Guarantees: no duplicates within the set or against excludeQuestions,
 * every question valid (4 distinct options, one correct answer), every question belongs to the topic.
 * If fewer can be produced, returns what it has plus warnings - the caller decides (we never pad
 * with questions from another topic).
 */
export async function generateQuestionSetForTopic(
  topicName: string,
  distribution: { easy: number; medium: number; hard: number } = { ...POOL_MINIMUM },
  excludeQuestions: string[] = []
): Promise<QuestionSetResult> {
  const result: GeneratedQuestion[] = [];
  const warnings = new Set<string>();
  const seen = new Set<string>(excludeQuestions.map((t) => t.toLowerCase().trim()));

  const plan: Array<'easy' | 'medium' | 'hard'> = [
    ...Array(Math.max(0, distribution.easy)).fill('easy'),
    ...Array(Math.max(0, distribution.medium)).fill('medium'),
    ...Array(Math.max(0, distribution.hard)).fill('hard'),
  ];

  for (const diff of plan) {
    const attempt = await generateQuestionForTopic(topicName, diff, Array.from(seen));
    if (attempt.aiError) warnings.add(attempt.aiError);
    const q = attempt.question;
    if (q && isValidQuestion(q) && !seen.has(q.question.toLowerCase().trim())) {
      result.push(q);
      seen.add(q.question.toLowerCase().trim());
    }
  }

  // Top up from the verified bank for any difficulty still short.
  const have = (d: string) => result.filter((q) => q.difficulty === d).length;
  const need = {
    easy: Math.max(0, distribution.easy - have('easy')),
    medium: Math.max(0, distribution.medium - have('medium')),
    hard: Math.max(0, distribution.hard - have('hard')),
  };
  if (need.easy + need.medium + need.hard > 0) {
    const bank = getBankQuestionsForTopic(topicName, need.easy + need.medium + need.hard, need, Array.from(seen));
    for (const bq of bank) {
      const key = bq.question.toLowerCase().trim();
      if (!seen.has(key) && isValidQuestion(bq)) {
        result.push({ ...bq, source: 'question-bank' });
        seen.add(key);
      }
    }
  }

  const missing = plan.length - result.length;
  if (missing > 0) {
    warnings.add(
      `Only ${result.length} of ${plan.length} requested questions could be produced for "${topicName}". ` +
        `Configure an AI key (GEMINI_API_KEY / OPENAI_API_KEY) or add questions manually.`
    );
  }
  return { questions: result, warnings: Array.from(warnings) };
}
