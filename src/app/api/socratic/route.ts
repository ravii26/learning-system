import { NextResponse } from 'next/server';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { requireAuth } from '@/lib/apiAuth';
import { db } from '@/lib/db';

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
  const { userId } = auth;

  try {
    const body = await request.json();
    const { action = 'generate', conceptTitle, topicTitle, userRecall, idealAnswer } = body;

    // 1. Generate Structured Course Curriculum
    if (action === 'generate-curriculum') {
      if (!topicTitle) {
        return NextResponse.json({ error: 'topicTitle is required' }, { status: 400 });
      }

      const { why, level, depthTarget, area } = body as { why?: string; level?: string; depthTarget?: string; area?: string };

      const prompt = `Design a study syllabus for one learner.

Subject: "${topicTitle}"
${area ? `Area: ${area}\n` : ''}Why they are learning it: ${why?.trim() || 'not stated'}
Current level: ${level || 'beginner'}
How deep they need to go: ${depthTarget || 'working knowledge — able to use it confidently'}

Rules:
- 5 to 8 modules, ordered so each builds on the previous ones (foundations → mechanisms → application → integration).
- Each module is ONE concrete, teachable concept or skill that fits a 20-60 minute session. Split anything bigger.
- Titles name the actual thing learned (e.g. "Two Pointers on Sorted Arrays", "Reading a Cash-Flow Statement", "Structuring a 2-Minute Answer: Point–Reason–Example").
  Never generic titles ("Fundamentals", "Core Concepts", "Advanced Topics", "Mental Models", "Best Practices").
- Fit the stated reason: if they learn it for interviews, bias toward what gets asked and practiced; for a job task, toward what they will actually do.
- Match the level: skip what a ${level || 'beginner'} already knows; don't jump past what they need.
- Stop at the stated depth — no modules beyond what they need.
- "notes": one sentence saying what they will be able to DO after the module (an observable outcome, not "understand X").
- The last module should apply everything to one realistic task or mini-project.

Return JSON only:
{
  "modules": [
    { "title": "Concrete module title", "estimatedMinutes": 40, "notes": "After this you can ..." }
  ]
}`;

      try {
        const result = await callAIContent([
          { role: 'system', content: 'You design practical, well-sequenced curricula for self-learners. Return JSON only.' },
          { role: 'user', content: prompt },
        ], { jsonMode: true, temperature: 0.3 });

        const parsed = JSON.parse(result.content);
        const modules = (Array.isArray(parsed.modules) ? parsed.modules : [])
          .filter((m: any) => m && typeof m.title === 'string' && m.title.trim())
          .slice(0, 10)
          .map((m: any) => ({
            title: m.title.trim(),
            estimatedMinutes: Math.min(120, Math.max(10, Math.round(Number(m.estimatedMinutes) || 30))),
            notes: typeof m.notes === 'string' ? m.notes.trim() : '',
          }));
        if (modules.length >= 2) {
          return NextResponse.json({ modules });
        }
        console.warn('AI curriculum had too few usable modules:', parsed);
      } catch (e) {
        console.warn('AI curriculum generation failed:', e instanceof Error ? e.message : e);
      }

      // Honest failure — no generic filler syllabus saved as if it were real.
      return NextResponse.json({ modules: [], fallback: true, reason: 'Could not generate a syllabus right now' });
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

      // Never invent feedback: when no real evaluation is possible, say so,
      // and don't record it as evidence.
      const unavailable = (reason: string) =>
        NextResponse.json({
          fallback: true,
          reason,
          verdict: null,
          captured: '',
          missed: '',
          tip: 'AI feedback is unavailable right now — compare your answer with the model solution yourself.',
        });

      if (!hasAnyAIProviderConfigured()) return unavailable('AI provider not configured');

      const { question, scenario, topicId, moduleId } = body as { question?: string; scenario?: string; topicId?: string; moduleId?: string };

      const prompt = `You are grading one learner's answer to a practice challenge, as a demanding but kind tutor.

Subject: "${topicTitle || 'Study subject'}"
Concept: "${conceptTitle || 'General concept'}"
${scenario ? `Scenario given to the learner:\n"${scenario}"\n` : ''}${question ? `Question the learner had to answer:\n"${question}"\n` : ''}
Reference answer (what a strong answer covers):
"${idealAnswer}"

The learner's answer:
"${userRecall}"

How to grade:
- Judge the reasoning, not the wording. A different but correct approach is correct.
- "correct": the key idea and reasoning are right; small omissions are fine.
- "partial": the right direction but a load-bearing step, condition, or trade-off is missing or wrong.
- "incorrect": the core idea is wrong, missing, or the answer doesn't address the question.
- Be specific. Quote or paraphrase the exact part of their answer you are reacting to. Never write feedback that could apply to any answer.
- If they hold a misconception, name it and correct it in one sentence.
- Do not pad with praise. If the answer is weak, say what is missing.

Return JSON only:
{
  "verdict": "correct" | "partial" | "incorrect",
  "captured": "What they got right, specifically (1-2 sentences). Empty string if nothing.",
  "missed": "The most important thing missing or wrong, and the correction (1-2 sentences). Empty string if nothing.",
  "tip": "One concrete, memorable rule or check they can reuse next time.",
  "followUp": "One short question that probes exactly the gap you found (or deepens it if the answer was correct)."
}`;

      let parsed: Record<string, unknown>;
      try {
        const result = await callAIContent([
          { role: 'system', content: 'You grade learner answers accurately and specifically. Return JSON only.' },
          { role: 'user', content: prompt },
        ], { jsonMode: true, temperature: 0.2 });
        parsed = JSON.parse(result.content);
      } catch (aiErr) {
        console.warn('AI call failed for evaluate:', aiErr instanceof Error ? aiErr.message : aiErr);
        return unavailable('AI evaluation failed');
      }

      const verdict = ['correct', 'partial', 'incorrect'].includes(String(parsed.verdict)) ? String(parsed.verdict) : null;
      const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const evaluation = {
        verdict,
        captured: text(parsed.captured),
        missed: text(parsed.missed),
        tip: text(parsed.tip),
        followUp: text(parsed.followUp),
      };

      // Record as evidence only for a real verdict on a topic you own.
      if (verdict && topicId && moduleId) {
        const owned = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } });
        if (owned) {
          await db.moduleAttempt.create({
            data: {
              userId,
              topicId,
              moduleId,
              kind: 'challenge',
              verdict,
              score: verdict === 'correct' ? 1 : verdict === 'partial' ? 0.5 : 0,
              answer: String(userRecall).slice(0, 5000),
              details: { captured: evaluation.captured, missed: evaluation.missed, tip: evaluation.tip, followUp: evaluation.followUp },
            },
          });
        }
      }

      return NextResponse.json(evaluation);
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
