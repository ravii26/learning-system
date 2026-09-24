import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { db } from '@/lib/db';

/** Every cached lesson for a topic, keyed by moduleId — CurriculumView loads this on mount so a remount doesn't lose (or re-bill for) already-generated lessons. */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topicId = new URL(request.url).searchParams.get('topicId');
    if (!topicId) {
      return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
    }
    const rows = await db.generatedLesson.findMany({ where: { userId, topicId } });
    const lessons: Record<string, unknown> = {};
    for (const r of rows) lessons[r.moduleId] = r.content;
    return NextResponse.json({ lessons });
  } catch (e) {
    console.error('Failed to load cached lessons:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { moduleTitle, topicTitle, area = 'Tech', topicId, moduleId, regenerate = false } = body;

    if (!moduleTitle) {
      return NextResponse.json({ error: 'moduleTitle is required' }, { status: 400 });
    }

    // Persistence is opt-in via topicId+moduleId; without both this behaves
    // exactly as before (generate, return, store nothing).
    const canPersist = Boolean(topicId && moduleId);
    if (canPersist && !regenerate) {
      const cached = await db.generatedLesson.findFirst({ where: { userId, topicId, moduleId } });
      if (cached) {
        return NextResponse.json({ ...(cached.content as object), cached: true });
      }
    }

    if (!hasAnyAIProviderConfigured()) {
      return NextResponse.json({
        title: moduleTitle,
        summary: `Foundational overview for ${moduleTitle}`,
        keyTakeaways: [
          'Understand core principles and mechanics',
          'Practice guided step-by-step workflows',
          'Apply concepts to practical real-world problems',
        ],
        explanation: `### Overview of ${moduleTitle}\nThis module covers fundamental concepts in ${topicTitle || 'this subject'}. Focus on understanding core mechanisms before diving into advanced practical implementation.\n\n### Key Concepts\n- Core rules and conventions\n- Standard workflow patterns\n- Common edge cases and error prevention`,
        codeOrExample: `// Example Implementation Pattern for ${moduleTitle}\nfunction executeWorkflow() {\n  console.log("Executing ${moduleTitle} workflow...");\n  // Add practical implementation steps here\n}`,
        quiz: [
          {
            question: `What is the primary objective of ${moduleTitle}?`,
            options: [
              'To establish core mechanics and practical understanding',
              'To memorize syntax without practice',
              'To skip foundational concepts',
              'None of the above',
            ],
            correctIndex: 0,
            explanation: 'Mastering core mechanics is the foundational step before advanced application.',
          },
        ],
        fallback: true,
      });
    }

    const systemPrompt = `You are a Master Educator and Curriculum Content Generator.
Your job is to generate a comprehensive, highly engaging, interactive lesson and quiz for a student learning:
Module: "${moduleTitle}"
Topic Domain: "${topicTitle || 'General Knowledge'}"
Category: "${area}"

Generate valid JSON matching this structure:
{
  "title": "${moduleTitle}",
  "summary": "Concise 1-sentence summary of what this module covers",
  "keyTakeaways": [
    "Takeaway 1",
    "Takeaway 2",
    "Takeaway 3"
  ],
  "explanation": "Markdown formatted explanation with headings (###), bullet points, and clear examples (approx 250-400 words).",
  "codeOrExample": "Concrete code snippet, step-by-step practical drill, or real-world example illustrating the concept.",
  "quiz": [
    {
      "question": "Clear multiple-choice question testing understanding",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this answer is correct and what principle it demonstrates"
    },
    {
      "question": "Second conceptual question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 1,
      "explanation": "Explanation for second question"
    }
  ]
}

RETURN VALID JSON ONLY. NO MARKDOWN WRAPPERS OR EXTRA TEXT.`;

    const { content: rawContent, provider } = await callAIContent([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate the complete lesson content and quiz for "${moduleTitle}".` },
    ], { temperature: 0.3 });
    const parsed = JSON.parse(rawContent);

    if (canPersist) {
      // Only reached with real AI output — every canned fallback returns
      // earlier or from the catch below, so filler is never cached.
      const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } });
      if (topic) {
        await db.generatedLesson.upsert({
          where: { topicId_moduleId: { topicId, moduleId } },
          create: { userId, topicId, moduleId, moduleTitle, content: parsed, provider },
          update: { moduleTitle, content: parsed, provider },
        });
      }
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Lesson generation error:', error);
    return NextResponse.json({
      title: 'Module Overview',
      summary: 'Module summary and guided practice',
      keyTakeaways: ['Core principles', 'Practical application', 'Self-check practice'],
      explanation: 'Detailed overview of core module concepts.',
      codeOrExample: '// Practical code example\nconsole.log("Lesson overview");',
      quiz: [
        {
          question: 'What is the key focus of this lesson?',
          options: ['Practical understanding', 'Rote memory', 'Ignoring concepts', 'None'],
          correctIndex: 0,
          explanation: 'Focusing on practical understanding leads to better retention.',
        },
      ],
      fallback: true,
    });
  }
}
