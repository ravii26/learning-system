import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function callGroq(messages: Array<{ role: string; content: string }>, responseFormatJson = true) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  // Model fallback priority order based on available models on user account
  const candidateModels = ['openai/gpt-oss-120b', 'groq/compound', 'qwen/qwen3.6-27b'];
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.5,
          response_format: responseFormatJson ? { type: 'json_object' } : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (content) return content;
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`Groq model ${model} failed, trying fallback...`, e);
    }
  }

  throw lastError || new Error('All Groq candidate models failed');
}

export async function POST(request: Request) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { action = 'generate', conceptTitle, topicTitle, userRecall, idealAnswer } = body;

    if (action === 'generate-concepts') {
      if (!topicTitle) {
        return NextResponse.json({ error: 'topicTitle is required' }, { status: 400 });
      }

      const prompt = `
Generate a structured learning concept tree for the study topic: "${topicTitle}"
Generate 5 to 8 essential sub-concepts that a student must learn sequentially to master this topic.

Return JSON only in this exact format:
{
  "concepts": [
    {
      "title": "Concept Title (e.g. Present Simple Tense, Vectorization, CAP Theorem)",
      "difficulty": "Low" | "Medium" | "High",
      "importance": "Low" | "Medium" | "High"
    }
  ]
}
`;

      const rawJson = await callGroq([
        { role: 'system', content: 'You are an expert tutor creating structured concept maps. Return valid JSON only.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(rawJson || '{}');
      return NextResponse.json(parsed);
    }

    if (action === 'evaluate') {
      if (!userRecall || !idealAnswer) {
        return NextResponse.json({ error: 'userRecall and idealAnswer are required' }, { status: 400 });
      }

      const prompt = `
You are an expert Socratic tutor evaluating a student's self-recall effort.
Concept: "${conceptTitle || 'General Concept'}"
Topic: "${topicTitle || 'Study Subject'}"

Ideal Answer:
"${idealAnswer}"

Student's Attempted Recall:
"${userRecall}"

Compare the student's attempt against the ideal answer.
Respond with JSON only in this exact format:
{
  "captured": "Short bullet list or statement of key ideas the student got right",
  "missed": "Key points or nuances the student missed or got slightly wrong",
  "tip": "One concise, memorable tip to help cement this understanding"
}
`;

      const rawJson = await callGroq([
        { role: 'system', content: 'You evaluate student learning recall accurately and constructively. Return JSON only.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(rawJson || '{}');
      return NextResponse.json(parsed);
    }

    // Default action: 'generate' Socratic content
    if (!conceptTitle) {
      return NextResponse.json({ error: 'conceptTitle is required' }, { status: 400 });
    }

    const prompt = `
You are a world-class Socratic tutor. Generate a complete 6-stage Socratic learning module for:
Concept: "${conceptTitle}"
Topic Domain: "${topicTitle || 'General Knowledge'}"

Return JSON only with these exact keys:
{
  "explain": "Clear, engaging explanation (2 concise paragraphs). Explain core mechanics simply without fluff.",
  "demonstrate": "A vivid, concrete real-world analogy or example demonstrating how this works.",
  "connect": "How this connects to fundamental principles or everyday concepts the student already knows.",
  "question": "A sharp Socratic question that tests whether they truly understand the mechanism.",
  "apply": "A practical scenario or challenge problem where they must apply this concept to solve something.",
  "idealAnswer": "What an ideal, thorough response to the 'apply' challenge looks like."
}
`;

    const rawJson = await callGroq([
      { role: 'system', content: 'You are a master teacher and mentor. Explain clearly, directly, and engagingly. Return JSON only.' },
      { role: 'user', content: prompt }
    ]);

    const parsed = JSON.parse(rawJson || '{}');

    // Helper to flatten string or array into string
    const stringifyField = (val: any) => {
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('\n');
      if (typeof val === 'object' && val !== null) return JSON.stringify(val, null, 2);
      return String(val || '');
    };

    return NextResponse.json({
      explain: stringifyField(parsed.explain),
      demonstrate: stringifyField(parsed.demonstrate),
      connect: stringifyField(parsed.connect),
      question: stringifyField(parsed.question),
      apply: stringifyField(parsed.apply),
      idealAnswer: stringifyField(parsed.idealAnswer),
    });
  } catch (error: any) {
    console.error('Socratic AI route error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to process Socratic request' }, { status: 500 });
  }
}
