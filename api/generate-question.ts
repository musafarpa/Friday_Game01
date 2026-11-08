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

function isUsable(p: any): boolean {
  return (
    p &&
    typeof p.question === 'string' && p.question.trim().length >= 10 &&
    ['A', 'B', 'C', 'D'].includes(p.correct_option) &&
    typeof p.explanation === 'string' && p.explanation.trim().length > 0 &&
    areOptionsDistinct(String(p.option_a), String(p.option_b), String(p.option_c), String(p.option_d))
  );
}

/**
 * Only a signed-in ADMIN may spend the AI budget. The caller's Supabase JWT is verified by calling
 * the database's own is_admin() with it (no service key needed, nothing trusted from the client).
 */
async function isAdminRequest(req: VercelRequest): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 500, error: 'Server is missing Supabase configuration.' };
  const auth = String(req.headers['authorization'] || '');
  if (!/^Bearer\s+\S+/.test(auth)) return { ok: false, status: 401, error: 'Authentication required.' };
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return { ok: false, status: 401, error: 'Invalid or expired session.' };
    const isAdmin = await r.json();
    return isAdmin === true ? { ok: true, status: 200 } : { ok: false, status: 403, error: 'Admin access required.' };
  } catch {
    return { ok: false, status: 502, error: 'Could not verify session.' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Same-origin only: no wildcard CORS. Browsers calling from our own origin do not need CORS headers.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gate = await isAdminRequest(req);
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

  const { topic = 'General Trivia', difficulty = 'medium', excludeQuestions = [] } = req.body || {};
  const cleanTopic = String(topic).trim().slice(0, 80) || 'General Trivia';
  const cleanDifficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const exclude: string[] = Array.isArray(excludeQuestions) ? excludeQuestions.slice(0, 60).map(String) : [];

  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const avoid = exclude.length ? `\nDo NOT repeat or paraphrase any of these questions:\n- ${exclude.slice(0, 30).join('\n- ')}` : '';
  const schemaHint = `{"topic":"${cleanTopic}","question":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A","explanation":"...","difficulty":"${cleanDifficulty}"}`;

  // 1. Google Gemini (key in a header, never in the URL)
  if (geminiKey) {
    try {
      const prompt = `Generate ONE multiple-choice quiz question about the topic "${cleanTopic}" at "${cleanDifficulty}" difficulty.
Rules: factual, neutral and respectful; exactly 4 DISTINCT options; exactly ONE correct option; the other three plausible but definitely wrong; short explanation.${avoid}
Return strictly valid JSON: ${schemaHint}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isUsable(parsed)) {
            return res.status(200).json({ ...parsed, topic: cleanTopic, difficulty: cleanDifficulty, source: 'ai-gemini' } as QuestionResult);
          }
        }
      } else {
        console.error('Gemini returned HTTP', response.status);
      }
    } catch (err) {
      console.error('Gemini API call failed, falling back:', err);
    }
  }

  // 2. OpenAI
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            {
              role: 'system',
              content: 'You write high quality multiple-choice quiz questions as strict JSON with keys: topic, question, option_a, option_b, option_c, option_d, correct_option (A|B|C|D), explanation, difficulty. All 4 options must be distinct; exactly one is correct.',
            },
            { role: 'user', content: `One question on "${cleanTopic}", difficulty "${cleanDifficulty}".${avoid}` },
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
          if (isUsable(parsed)) {
            return res.status(200).json({ ...parsed, topic: cleanTopic, difficulty: cleanDifficulty, source: 'ai-openai' } as QuestionResult);
          }
        }
      } else {
        console.error('OpenAI returned HTTP', response.status);
      }
    } catch (err) {
      console.error('OpenAI API call failed, falling back:', err);
    }
  }

  // 3. Curated bank - strictly the SAME topic. Unknown/custom topics have no bank questions.
  const fallback = getRandomQuestionForTopic(cleanTopic, cleanDifficulty, exclude);
  if (fallback) {
    return res.status(200).json({ ...fallback, source: 'question-bank' } as QuestionResult);
  }
  return res.status(200).json({
    source: 'none',
    error: geminiKey || openaiKey
      ? 'AI providers failed and the curated bank has no unused questions for this topic.'
      : 'No AI key configured and the curated bank has no questions for this topic.',
  });
}
