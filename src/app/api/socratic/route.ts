import { NextResponse } from 'next/server';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { requireAuth } from '@/lib/apiAuth';

function stringifyField(val: any): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join('\n');
  }
  if (typeof val === 'object' && val !== null) return JSON.stringify(val, null, 2);
  return String(val || '');
}

function generateSmartFallback(conceptTitle: string, topicTitle?: string) {
  const topic = topicTitle || 'this subject';
  return {
    explain: `Understanding "${conceptTitle}" is essential for mastering ${topic}.\n\nAt its core, this concept gives you a clear mental model: it defines what rules govern how things work, why they behave that way, and how to spot common pitfalls before they cause problems. Take a moment to think about how this fits into the bigger picture of ${topic}.`,
    demonstrate: `For example, think about how "${conceptTitle}" appears in a real scenario: when building or analyzing something in ${topic}, you have to choose how to handle inputs, edge cases, and expected outputs. Applying "${conceptTitle}" properly ensures your solution behaves consistently and predictably.`,
    connect: `Connect "${conceptTitle}" to what you already know: just like following a recipe or a blueprint, having clear definitions upfront prevents confusing errors later in ${topic}.`,
    question: `In your own words, what is the main purpose of "${conceptTitle}", and what problem does it solve in ${topic}?`,
    apply: `Consider a situation where someone misunderstands or misapplies "${conceptTitle}". What mistake would they make, and how would you correct it?`,
    idealAnswer: `A strong answer will:\n1. Clearly state what "${conceptTitle}" is and isn't.\n2. Point out the specific mistake someone would make.\n3. Explain the exact corrective step to take.`,
    isAi: false,
  };
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { action = 'generate', conceptTitle, topicTitle, userRecall, idealAnswer } = body;

    // 1. Generate Structured Course Curriculum
    if (action === 'generate-curriculum') {
      if (!topicTitle) {
        return NextResponse.json({ error: 'topicTitle is required' }, { status: 400 });
      }

      const prompt = `You are a world-class curriculum designer and educator.
Create a progressive, 5 to 7 module learning syllabus for the subject: "${topicTitle}".
Each module must be a concrete, capability-building topic (e.g. "Types of Data: Categorical vs Numerical", "Calculating Summary Statistics", "Cleaning Missing Values").
NEVER use generic placeholder titles like "Module 1: Mental Models" or corporate buzzwords.

Return JSON only in this exact format:
{
  "modules": [
    {
      "title": "Clear Concrete Module Title",
      "estimatedMinutes": 30,
      "notes": "Brief 1-sentence description of what the student will learn and practice"
    }
  ]
}`;

      try {
        const result = await callAIContent([
          { role: 'system', content: 'You create structured practical curricula. Return JSON only.' },
          { role: 'user', content: prompt },
        ], { jsonMode: true, temperature: 0.3 });

        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed.modules) && parsed.modules.length > 0) {
          return NextResponse.json(parsed);
        }
      } catch (e) {
        console.warn('AI curriculum generation failed, using intelligent fallback:', e);
      }

      return NextResponse.json({
        modules: [
          { title: `${topicTitle} Fundamentals & Core Mental Models`, estimatedMinutes: 25, notes: 'Foundational concepts and key terminology.' },
          { title: `Core Techniques & Step-by-Step Examples`, estimatedMinutes: 30, notes: 'Essential mechanics with real-world examples.' },
          { title: `Practical Application & Hands-on Exercises`, estimatedMinutes: 35, notes: 'Hands-on practice solving real problems.' },
          { title: `Common Mistakes & Edge Cases to Avoid`, estimatedMinutes: 25, notes: 'Debugging and critical thinking.' },
          { title: `Independent Project & Synthesis`, estimatedMinutes: 45, notes: 'Synthesize everything learned into a complete outcome.' },
        ],
      });
    }

    // 2. Generate Structured Concept Tree
    if (action === 'generate-concepts') {
      if (!topicTitle) {
        return NextResponse.json({ error: 'topicTitle is required' }, { status: 400 });
      }

      if (!hasAnyAIProviderConfigured()) {
        return NextResponse.json({
          concepts: [
            { title: `Core Fundamentals of ${topicTitle}`, difficulty: 'Low', importance: 'High' },
            { title: `Key Terminology & Mental Models`, difficulty: 'Low', importance: 'High' },
            { title: `Practical Techniques & Workflows`, difficulty: 'Medium', importance: 'High' },
            { title: `Common Mistakes & Edge Cases`, difficulty: 'Medium', importance: 'Medium' },
            { title: `Real-World Application & Problem Solving`, difficulty: 'High', importance: 'High' },
          ],
        });
      }

      const prompt = `You are a world-class educator and curriculum designer.
Generate a structured, progressive learning concept tree for the topic: "${topicTitle}".
Create 5 to 7 essential, highly specific sub-concepts that a learner must understand step-by-step.
Make concept titles concrete and practical (e.g. "Types of data: categorical vs numerical", "Handling Missing Values", "Building a Linear Model"), NEVER generic corporate filler.

Return JSON only in this exact format:
{
  "concepts": [
    {
      "title": "Specific Concept Name",
      "difficulty": "Low" | "Medium" | "High",
      "importance": "Low" | "Medium" | "High"
    }
  ]
}`;

      try {
        const result = await callAIContent([
          { role: 'system', content: 'You are an expert tutor creating structured concept maps. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ], { jsonMode: true, temperature: 0.3 });

        const parsed = JSON.parse(result.content);
        return NextResponse.json(parsed);
      } catch (aiErr) {
        console.warn('AI call failed for generate-concepts, returning fallback:', aiErr);
        return NextResponse.json({
          concepts: [
            { title: `Core Fundamentals of ${topicTitle}`, difficulty: 'Low', importance: 'High' },
            { title: `Key Terminology & Mental Models`, difficulty: 'Low', importance: 'High' },
            { title: `Practical Techniques & Workflows`, difficulty: 'Medium', importance: 'High' },
            { title: `Common Mistakes & Edge Cases`, difficulty: 'Medium', importance: 'Medium' },
            { title: `Real-World Application & Problem Solving`, difficulty: 'High', importance: 'High' },
          ],
        });
      }
    }

    // 2. Evaluate Student Recall
    if (action === 'evaluate') {
      if (!userRecall || !idealAnswer) {
        return NextResponse.json({ error: 'userRecall and idealAnswer are required' }, { status: 400 });
      }

      if (!hasAnyAIProviderConfigured()) {
        return NextResponse.json({
          captured: 'Good effort attempting to explain the concept from memory!',
          missed: 'Compare your response with the ideal answer below to spot any missing details.',
          tip: 'Active recall strengthens long-term memory far more than re-reading.',
        });
      }

      const prompt = `You are an expert, encouraging Socratic tutor evaluating a student's self-recall attempt.
Concept: "${conceptTitle || 'General Concept'}"
Topic: "${topicTitle || 'Study Subject'}"

Ideal Answer:
"${idealAnswer}"

Student's Attempted Recall:
"${userRecall}"

Compare the student's attempt against the ideal answer. Be direct, helpful, and friendly. Avoid academic jargon.
Respond with JSON only in this exact format:
{
  "captured": "1-2 sentences highlighting the key ideas the student understood correctly.",
  "missed": "1-2 sentences highlighting important nuances or facts they missed or got slightly wrong.",
  "tip": "One clear, memorable takeaway or mnemonic to cement this concept forever."
}`;

      try {
        const result = await callAIContent([
          { role: 'system', content: 'You evaluate student learning recall accurately, warmly, and constructively. Return JSON only.' },
          { role: 'user', content: prompt },
        ], { jsonMode: true, temperature: 0.3 });

        const parsed = JSON.parse(result.content);
        return NextResponse.json(parsed);
      } catch (aiErr) {
        console.warn('AI call failed for evaluate, returning fallback:', aiErr);
        return NextResponse.json({
          captured: 'You captured the main idea in your own words.',
          missed: 'Check the ideal answer to see if you can add more precision to your explanation.',
          tip: 'Try teaching this concept out loud to an imaginary beginner.',
        });
      }
    }

    // 3. Default Action: Generate Socratic Lesson Content
    if (!conceptTitle) {
      return NextResponse.json({ error: 'conceptTitle is required' }, { status: 400 });
    }

    if (!hasAnyAIProviderConfigured()) {
      return NextResponse.json(generateSmartFallback(conceptTitle, topicTitle));
    }

    const prompt = `You are a brilliant, world-class personal tutor inspired by the Feynman technique and Socratic method.
Your goal is to teach the concept: "${conceptTitle}" within the subject: "${topicTitle || 'General Knowledge'}".

CRITICAL GUIDELINES:
- Use clear, vivid, everyday language. Absolutely NO corporate buzzwords ("controls data flow, execution rules, or architectural decisions", "predictable, scalable, and resilient").
- Treat the student like an intelligent person who wants real understanding, not memorized textbook definitions.
- Use concrete examples, intuitive analogies, and practical demonstrations.

Generate a JSON object with EXACTLY these 6 fields:
{
  "explain": "A crystal-clear explanation (2 short paragraphs). Start with an intuitive intuition: what is this, and what real-world problem does it solve? Then break down the mechanics simply.",
  "demonstrate": "A concrete, relatable real-world example or scenario illustrating this concept in action. Show how it looks when done right vs. wrong.",
  "connect": "Explain how this concept connects to intuitive concepts the student already knows, or why it matters for future learning.",
  "question": "A sharp Socratic question that tests whether the student truly understands the underlying principle, not just terminology.",
  "apply": "A realistic scenario or mini-challenge where the student must apply this concept to solve a specific problem.",
  "idealAnswer": "A clear, well-explained model answer showing how to solve the apply challenge step-by-step."
}`;

    try {
      const result = await callAIContent([
        { role: 'system', content: 'You are a master educator. Explain clearly, directly, and engagingly. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: 0.4 });

      const parsed = JSON.parse(result.content || '{}');

      return NextResponse.json({
        explain: stringifyField(parsed.explain),
        demonstrate: stringifyField(parsed.demonstrate),
        connect: stringifyField(parsed.connect),
        question: stringifyField(parsed.question),
        apply: stringifyField(parsed.apply),
        idealAnswer: stringifyField(parsed.idealAnswer),
        isAi: true,
      });
    } catch (aiErr) {
      console.error('Socratic AI generation failed, falling back:', aiErr);
      return NextResponse.json(generateSmartFallback(conceptTitle, topicTitle));
    }
  } catch (error: any) {
    console.error('Socratic route top-level error:', error);
    return NextResponse.json(generateSmartFallback('Study Concept'));
  }
}
