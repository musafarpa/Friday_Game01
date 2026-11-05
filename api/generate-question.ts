import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRandomQuestionForTopic } from '../src/data/questionBank';

interface QuestionResult {
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source: 'ai-gemini' | 'ai-openai' | 'question-bank';
}

function areOptionsDistinct(a: string, b: string, c: string, d: string): boolean {
  if (!a || !b || !c || !d) return false;
  const set = new Set([a.trim().toLowerCase(), b.trim().toLowerCase(), c.trim().toLowerCase(), d.trim().toLowerCase()]);
  return set.size === 4;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic = 'General Trivia', difficulty = 'medium', excludeQuestions = [] } = req.body || {};

  const cleanTopic = String(topic).trim() || 'General Trivia';
  const cleanDifficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // 1. Try Google Gemini API if key is present
  if (geminiKey) {
    try {
      const prompt = `Generate a single multiple-choice quiz question about the topic: "${cleanTopic}".
Difficulty: "${cleanDifficulty}".
Guidelines:
1. Neutral, respectful, factual, and entertaining.
2. Provide exactly 4 distinct options (A, B, C, D).
3. Exactly ONE option must be correct. The other three must be plausible but definitively incorrect.
4. Ensure all 4 options are distinct strings with no duplicates.
5. Provide a clear, short explanation for why the correct option is right.
6. Return strictly valid JSON with this exact schema:
{
  "topic": "${cleanTopic}",
  "question": "The question text",
  "option_a": "Option text A",
  "option_b": "Option text B",
  "option_c": "Option text C",
  "option_d": "Option text D",
  "correct_option": "A",
  "explanation": "Short explanation",
  "difficulty": "${cleanDifficulty}"
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsed = JSON.parse(rawJsonText);
          if (
            parsed.question &&
            parsed.option_a &&
            parsed.option_b &&
            parsed.option_c &&
            parsed.option_d &&
            ['A', 'B', 'C', 'D'].includes(parsed.correct_option) &&
            areOptionsDistinct(parsed.option_a, parsed.option_b, parsed.option_c, parsed.option_d)
          ) {
            return res.status(200).json({
              ...parsed,
              topic: cleanTopic,
              difficulty: cleanDifficulty,
              source: 'ai-gemini',
            } as QuestionResult);
          }
        }
      }
    } catch (err) {
      console.error('Gemini API call failed, falling back:', err);
    }
  }

  // 2. Try OpenAI API if key is present
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You generate high quality multiple-choice quiz questions formatted strictly as JSON with keys: topic, question, option_a, option_b, option_c, option_d, correct_option (A|B|C|D), explanation, difficulty. All 4 options must be distinct.',
            },
            {
              role: 'user',
              content: `Generate 1 quiz question on topic: "${cleanTopic}", difficulty: "${cleanDifficulty}". Exactly 1 correct answer. 4 distinct options.`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (
            parsed.question &&
            parsed.option_a &&
            parsed.option_b &&
            parsed.option_c &&
            parsed.option_d &&
            ['A', 'B', 'C', 'D'].includes(parsed.correct_option) &&
            areOptionsDistinct(parsed.option_a, parsed.option_b, parsed.option_c, parsed.option_d)
          ) {
            return res.status(200).json({
              ...parsed,
              topic: cleanTopic,
              difficulty: cleanDifficulty,
              source: 'ai-openai',
            } as QuestionResult);
          }
        }
      }
    } catch (err) {
      console.error('OpenAI API call failed, falling back:', err);
    }
  }

  // 3. Guaranteed Robust Fallback: Built-in Question Bank
  const fallback = getRandomQuestionForTopic(cleanTopic, cleanDifficulty, excludeQuestions);
  return res.status(200).json({
    ...fallback,
    source: 'question-bank',
  } as QuestionResult);
}
