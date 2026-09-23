import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { callGroqContent } from '@/lib/ai/groqClient';

async function callGroq(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, responseFormatJson = true) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return callGroqContent(apiKey, messages, { temperature: 0.5, jsonMode: responseFormatJson });
}

function generateSmartFallback(conceptTitle: string, topicTitle: string = 'General Topic') {
  const c = conceptTitle.trim();
  const t = topicTitle.trim();

  return {
    explain: `Understanding "${c}" is a fundamental pillar of mastering ${t}.\n\nAt its core, "${c}" defines how data, rules, or components are structured and processed. When working with ${t}, "${c}" acts as the engine that guarantees predictable execution, performance efficiency, and architectural consistency.`,
    demonstrate: `Imagine a real-world scenario in ${t} where high volume or complexity is introduced. Without "${c}", the system experiences latency bottlenecks, data inconsistencies, or unhandled failure states.\n\nBy applying "${c}", the system enforces strict boundaries, isolating inputs and ensuring every operation yields a verifiable outcome.`,
    connect: `Think of "${c}" like a modular building block in ${t}. Just as strong foundations allow building taller structures, mastering "${c}" unlocks your ability to understand advanced paradigms and optimize real-world implementations in ${t}.`,
    question: `In your own words, what is the single most important purpose of "${c}" within ${t}, and what happens if it is omitted?`,
    apply: `You are tasked with implementing or troubleshooting "${c}" in a production ${t} project. Describe the key configuration steps, potential edge cases to watch for, and how you would verify that your setup is working correctly.`,
    idealAnswer: `An ideal implementation of "${c}" includes:\n1. Clear initialization and parameter scoping\n2. Robust error handling for edge-case inputs\n3. Verification via targeted testing and diagnostic logging to confirm output correctness.`,
    isFallback: true,
  };
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

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
      "title": "Concept Title (e.g. Vector Indexing, RAG Pipeline, CAP Theorem)",
      "difficulty": "Low" | "Medium" | "High",
      "importance": "Low" | "Medium" | "High"
    }
  ]
}
`;

      try {
        const rawJson = await callGroq([
          { role: 'system', content: 'You are an expert tutor creating structured concept maps. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ]);
        const parsed = JSON.parse(rawJson || '{}');
        return NextResponse.json(parsed);
      } catch (e) {
        console.warn('generate-concepts AI call failed, using fallback:', e instanceof Error ? e.message : e);
        // Fallback concept tree
        return NextResponse.json({
          concepts: [
            { title: `${topicTitle} Fundamentals & Core Principles`, difficulty: 'Low', importance: 'High' },
            { title: `${topicTitle} Architecture & Data Flow`, difficulty: 'Medium', importance: 'High' },
            { title: `${topicTitle} Implementation Patterns`, difficulty: 'Medium', importance: 'Medium' },
            { title: `${topicTitle} Advanced Optimization & Edge Cases`, difficulty: 'High', importance: 'High' },
          ]
        });
      }
    }

    if (action === 'generate-curriculum') {
      if (!topicTitle) {
        return NextResponse.json({ error: 'topicTitle is required' }, { status: 400 });
      }

      const prompt = `
Generate a clear, structured curriculum of 4 to 6 sequential study modules for learning: "${topicTitle}".
Each module should have a practical title, realistic estimated study minutes (between 20 and 60 minutes), and a 1-sentence description/notes.

Return JSON only in this exact format:
{
  "modules": [
    {
      "title": "Module Title (e.g., Foundations & Core Mechanics)",
      "estimatedMinutes": 30,
      "notes": "1-sentence summary of what will be learned."
    }
  ]
}
`;

      try {
        const rawJson = await callGroq([
          { role: 'system', content: 'You are an expert curriculum designer. Return valid JSON only.' },
          { role: 'user', content: prompt }
        ]);
        const parsed = JSON.parse(rawJson || '{}');
        return NextResponse.json(parsed);
      } catch (e) {
        console.warn('generate-curriculum AI call failed, using fallback:', e instanceof Error ? e.message : e);
        return NextResponse.json({
          modules: [
            { title: `Module 1: Foundations & Core Terminology of ${topicTitle}`, estimatedMinutes: 30, notes: 'Master core principles and fundamental mechanics.' },
            { title: `Module 2: Practical Patterns & Guided Exercises`, estimatedMinutes: 45, notes: 'Hands-on application and standard implementation patterns.' },
            { title: `Module 3: Troubleshooting, Edge Cases & Debugging`, estimatedMinutes: 35, notes: 'Identify common pitfalls and prevent errors.' },
            { title: `Module 4: Real-World Application & Synthesis`, estimatedMinutes: 60, notes: 'Independent problem-solving and capstone project.' },
          ]
        });
      }
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

      try {
        const rawJson = await callGroq([
          { role: 'system', content: 'You evaluate student learning recall accurately and constructively. Return JSON only.' },
          { role: 'user', content: prompt }
        ]);
        const parsed = JSON.parse(rawJson || '{}');
        return NextResponse.json(parsed);
      } catch (e) {
        console.warn('evaluate AI call failed, using heuristic fallback:', e instanceof Error ? e.message : e);
        // Heuristic evaluation fallback
        const recallLength = userRecall.trim().length;
        return NextResponse.json({
          captured: recallLength > 30 ? 'Solid attempt capturing core concepts from memory.' : 'Basic effort initiated.',
          missed: recallLength < 60 ? 'Consider elaborating on specific mechanics, constraints, or execution steps.' : 'Minor edge cases and implementation nuances.',
          tip: `Always relate "${conceptTitle || 'this concept'}" back to practical trade-offs in ${topicTitle || 'your project'}.`,
        });
      }
    }

    // Default action: 'generate' Socratic content
    if (!conceptTitle) {
      return NextResponse.json({ error: 'conceptTitle is required' }, { status: 400 });
    }

    try {
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
        isAi: true,
      });
    } catch (groqErr) {
      console.warn('generate (default) AI call failed, using smart fallback:', groqErr instanceof Error ? groqErr.message : groqErr);
      // Return smart dynamic fallback
      return NextResponse.json(generateSmartFallback(conceptTitle, topicTitle));
    }
  } catch (error: any) {
    console.error('Socratic AI route error:', error);
    return NextResponse.json(generateSmartFallback(request.headers.get('x-concept') || 'Study Concept'));
  }
}
