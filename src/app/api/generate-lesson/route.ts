import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { moduleTitle, topicTitle, area = 'Tech' } = body;

    if (!moduleTitle) {
      return NextResponse.json({ error: 'moduleTitle is required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
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

    const candidateModels = ['openai/gpt-oss-120b', 'groq/compound', 'qwen/qwen3.6-27b'];
    let groqRes: Response | null = null;
    let lastErr: any = null;

    for (const model of candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Generate the complete lesson content and quiz for "${moduleTitle}".` },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        });

        if (res.ok) {
          groqRes = res;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    if (!groqRes || !groqRes.ok) {
      throw new Error(`Groq models failed: ${lastErr?.message || 'API request error'}`);
    }

    const groqData = await groqRes.json();
    const rawContent = groqData.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

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
