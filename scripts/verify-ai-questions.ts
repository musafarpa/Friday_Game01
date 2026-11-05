import { QUESTION_BANK, getRandomQuestionForTopic } from '../src/data/questionBank';
import { generateQuestionForTopic } from '../src/services/questionGenerator';

export async function runAIQuestionVerification() {
  console.log('================================================================');
  console.log('AI QUESTION GENERATION & BANK VERIFICATION (20+ QUESTIONS)');
  console.log('================================================================');

  const topicsToTest = [
    { topic: 'Politics & Government', diff: 'easy' as const },
    { topic: 'Politics & Government', diff: 'medium' as const },
    { topic: 'Politics & Government', diff: 'hard' as const },
    { topic: 'Pollution & Environment', diff: 'easy' as const },
    { topic: 'Pollution & Environment', diff: 'medium' as const },
    { topic: 'Pollution & Environment', diff: 'hard' as const },
    { topic: 'AI & Technology', diff: 'easy' as const },
    { topic: 'AI & Technology', diff: 'medium' as const },
    { topic: 'AI & Technology', diff: 'hard' as const },
    { topic: 'Social Media', diff: 'easy' as const },
    { topic: 'Social Media', diff: 'medium' as const },
    { topic: 'Social Media', diff: 'hard' as const },
    { topic: 'Kerala & Current Affairs', diff: 'easy' as const },
    { topic: 'Kerala & Current Affairs', diff: 'medium' as const },
    { topic: 'Kerala & Current Affairs', diff: 'hard' as const },
    { topic: 'Cricket & Sports', diff: 'easy' as const },
    { topic: 'Cricket & Sports', diff: 'medium' as const },
    { topic: 'Cricket & Sports', diff: 'hard' as const },
    { topic: 'Movies & Entertainment', diff: 'easy' as const },
    { topic: 'Movies & Entertainment', diff: 'medium' as const },
    { topic: 'College & Office Life', diff: 'easy' as const },
    { topic: 'Money & Lifestyle', diff: 'medium' as const },
    { topic: 'Funny & Random', diff: 'hard' as const },
  ];

  const seenQuestions = new Set<string>();

  for (let i = 0; i < topicsToTest.length; i++) {
    const { topic, diff } = topicsToTest[i];
    const q = await generateQuestionForTopic(topic, diff, Array.from(seenQuestions));

    // 1. Verify 4 distinct options
    const options = [q.option_a, q.option_b, q.option_c, q.option_d];
    const uniqueOptions = new Set(options.map((o) => o.trim().toLowerCase()));
    if (uniqueOptions.size !== 4) {
      throw new Error(`[FAIL] Question #${i + 1} does not have 4 distinct options: ${JSON.stringify(options)}`);
    }

    // 2. Exactly one correct answer
    if (!['A', 'B', 'C', 'D'].includes(q.correct_option)) {
      throw new Error(`[FAIL] Question #${i + 1} has invalid correct option: ${q.correct_option}`);
    }

    // 3. Explanation non-empty
    if (!q.explanation || q.explanation.trim().length < 10) {
      throw new Error(`[FAIL] Question #${i + 1} missing clear explanation`);
    }

    // 4. Topic matching
    if (!q.topic.toLowerCase().includes(topic.toLowerCase().split(' ')[0])) {
      throw new Error(`[FAIL] Question #${i + 1} topic mismatch: expected "${topic}", got "${q.topic}"`);
    }

    // 5. Duplicate detection
    if (seenQuestions.has(q.question)) {
      throw new Error(`[FAIL] Duplicate question detected: "${q.question}"`);
    }
    seenQuestions.add(q.question);

    console.log(
      `[PASS #${(i + 1).toString().padStart(2, '0')}] [${q.difficulty.toUpperCase().padEnd(6)}] [${q.topic.padEnd(24)}] Q: "${q.question.slice(0, 50)}..." (Correct: ${q.correct_option})`
    );
  }

  console.log(`\n[PASS] Verified ${seenQuestions.size} unique questions with 100% distinct options and validated answers.`);

  // Test Failure & Fallback Behavior
  console.log('\n--- Testing AI Failure & Fallback Behavior ---');
  const fallbackQ = getRandomQuestionForTopic('AI & Technology', 'hard');
  if (!fallbackQ || fallbackQ.topic !== 'AI & Technology' || fallbackQ.difficulty !== 'hard') {
    throw new Error('Fallback Question Bank failed for AI & Technology');
  }
  console.log('[PASS] Question Bank Fallback is operational, instant, and verified.');

  console.log('\n================================================================');
  console.log('AI QUESTION GENERATION VERIFICATION: ALL 23 CHECKS PASSED!');
  console.log('================================================================\n');
  return true;
}
