import { aiQuotaGate } from '@/lib/rateLimit';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import {
  callAIContent,
  hasAnyAIProviderConfigured,
} from '@/lib/ai/aiClient';
import { db } from '@/lib/db';
import { buildLessonContext, type LessonContext } from '@/lib/lessonContext';
import { normalizeLesson } from '@/lib/lessonNormalize';
import { extractJson, fixPrompt, toChatPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';
import type { AIMessage } from '@/lib/ai/aiClient';
import { competencyFromModuleId, type CompetencyMap } from '@/data/competencies';
import { guessArchetype, isArchetype, type Archetype } from '@/lib/program/fieldGuide';
import type { Intake } from '@/lib/program/types';
import { lessonKindOf } from '@/lib/lessonKinds';
import { buildLessonMessages } from '@/lib/lessonPrompt';
import { normalizeBlueprint } from '@/lib/lessonBlocks';
import { KIND_BLOCKS } from '@/lib/lessonKinds';

export const maxDuration = 90;

/**
 * When the topic belongs to a learning plan: what kind of learning it is,
 * which topic this lesson belongs to and what the learner told us about
 * themselves. A grammar lesson for a nervous interview candidate should
 * not read like one for a homemaker learning to shop in English.
 */
async function loadPlanContext(userId: string, topicId: string, moduleId: string | undefined) {
  const item = await db.programItem.findFirst({
    where: { userId, topicId, program: { status: 'active' } },
    select: { program: { select: { competencyMap: true, intake: true } } },
  });
  if (!item) return null;
  const map = item.program.competencyMap as unknown as CompetencyMap;
  const intake = item.program.intake as unknown as Intake;
  const key = competencyFromModuleId(moduleId);
  const comp = key ? map.competencies?.find((c) => c.key === key) : undefined;
  const archetype = isArchetype(map.archetype) ? map.archetype : isArchetype(intake.archetype) ? intake.archetype : guessArchetype(`${map.title} ${intake.goal}`);
  return {
    archetype,
    field: map.title,
    goal: intake.goal,
    answers: intake.answers ?? [],
    competency: comp ? { title: comp.title, summary: comp.summary, lessons: comp.lessons ?? [] } : null,
  };
}

/** Loads the rows buildLessonContext needs for one topic/module. */
async function loadLessonContext(userId: string, topicId: string, moduleId: string | undefined): Promise<LessonContext | null> {
  const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { contract: true } });
  if (!topic) return null;
  const [modules, attempts, confusions, mistakes] = await Promise.all([
    db.curriculumItem.findMany({ where: { topicId, removed: false }, select: { legacyId: true, order: true, title: true, completed: true } }),
    db.moduleAttempt.findMany({ where: { userId, topicId }, orderBy: { createdAt: 'desc' }, take: 20, select: { moduleId: true, kind: true, verdict: true, details: true } }),
    db.confusion.findMany({ where: { topicId, removed: false, resolved: false }, orderBy: { createdAt: 'desc' }, take: 5, select: { text: true, resolved: true } }),
    db.mistake.findMany({ where: { topicId, removed: false }, orderBy: { occurredAt: 'desc' }, take: 5, select: { mistake: true } }),
  ]);
  const contract = topic.contract as Record<string, unknown> | null;
  return buildLessonContext({ modules, moduleId, contractLevel: contract?.currentLevel, attempts, confusions, mistakes });
}

/**
 * Every cached lesson for a topic, keyed by moduleId.
 *
 * CurriculumView loads this on mount so a remount doesn't lose
 * or unnecessarily regenerate an already-generated lesson.
 */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const topicId = new URL(request.url).searchParams.get('topicId');

    if (!topicId) {
      return NextResponse.json(
        { error: 'topicId is required' },
        { status: 400 }
      );
    }

    const rows = await db.generatedLesson.findMany({
      where: {
        userId,
        topicId,
      },
    });

    const lessons: Record<string, unknown> = {};

    for (const row of rows) {
      lessons[row.moduleId] = row.content;
    }

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Failed to load cached lessons:', error);

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * Lessons being written right now, by user+topic+module. A second request
 * for the same lesson (React's double mount in development, two tabs, a
 * double click) waits for the first instead of paying for it twice.
 */
const writing = new Map<string, Promise<Response>>();

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const peek = (await request.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const key = peek.topicId && peek.moduleId && !peek.regenerate && !peek.mode ? `${auth.userId}:${peek.topicId}:${peek.moduleId}` : null;
  if (!key) return writeLesson(request);
  const running = writing.get(key);
  if (running) return (await running).clone();
  const job = writeLesson(request).finally(() => writing.delete(key));
  writing.set(key, job);
  return (await job).clone();
}

async function writeLesson(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  // Parse the request body exactly once.
  let body: Record<string, any>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const {
    moduleTitle,
    topicTitle,
    area = 'Tech',
    topicId,
    moduleId,
    regenerate = false,

    // Optional learner context. When omitted and topicId is given, it is
    // derived server-side from real evidence (see loadLessonContext below).
    learnerLevel: bodyLearnerLevel,
    priorKnowledge: bodyPriorKnowledge = '',
    knownWeaknesses: bodyKnownWeaknesses = [],
    recentMistakes: bodyRecentMistakes = [],
  } = body;

  if (!moduleTitle) {
    return NextResponse.json(
      { error: 'moduleTitle is required' },
      { status: 400 }
    );
  }

  // "Use my own ChatGPT/Claude": step "prompt" returns the prompt, step
  // "import" takes the pasted reply through the same checks and save.
  const manual = body.mode === 'manual' ? (body.step === 'import' ? 'import' : 'prompt') : null;
  if (!manual) {
    const overQuota = await aiQuotaGate(userId);
    if (overQuota) return overQuota;
  }

  /*
   * Persistence is opt-in via topicId + moduleId.
   *
   * Without both, the route behaves as a stateless lesson generator.
   */
  const canPersist = Boolean(topicId && moduleId);

  if (canPersist && !regenerate && manual !== 'import') {
    try {
      const cached = await db.generatedLesson.findFirst({
        where: {
          userId,
          topicId,
          moduleId,
        },
      });

      if (cached) {
        return NextResponse.json({
          ...(cached.content as object),
          cached: true,
        });
      }
    } catch (error) {
      console.error('Failed to load cached lesson:', error);
      // Do not fail lesson generation just because cache lookup failed.
    }
  }

  /*
   * The teaching prompt is deliberately strict.
   *
   * The important change is that we are no longer merely asking the model
   * to "write a comprehensive lesson."
   *
   * We define:
   * - who the learner is
   * - what the lesson must accomplish
   * - how the explanation should progress
   * - what constitutes a useful example
   * - what misconceptions to address
   * - what the quiz must test
   * - what the model must NOT do
   */

  /*
   * Learner context from real evidence: where this module sits in the
   * course, what's been completed, challenge answers graded partial or
   * wrong, wrong quiz answers, open confusions, logged mistakes. Explicit
   * values in the request body take precedence.
   */
  const ctx = topicId ? await loadLessonContext(userId, topicId, moduleId).catch((e) => {
    console.warn('Could not load learner context:', e);
    return null;
  }) : null;

  const plan = topicId ? await loadPlanContext(userId, topicId, moduleId).catch(() => null) : null;
  const archetype: Archetype = plan?.archetype ?? guessArchetype(`${topicTitle ?? ''} ${moduleTitle}`);
  const planBlock = plan
    ? `The learner's goal: ${plan.goal} (plan: ${plan.field}).
${plan.answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')}${plan.competency ? `
This lesson is part of the topic "${plan.competency.title}", which should leave them able to: ${plan.competency.summary}
Lessons in that topic, in order: ${plan.competency.lessons.join(' | ') || plan.competency.title}. Teach only this lesson's part.` : ''}`
    : '';

  const learnerLevel: string = bodyLearnerLevel || ctx?.learnerLevel || 'beginner';
  const priorKnowledge: string = bodyPriorKnowledge || ctx?.priorKnowledge || '';
  const coursePosition: string = ctx?.coursePosition || '';

  const normalizedWeaknesses = Array.isArray(bodyKnownWeaknesses) && bodyKnownWeaknesses.length
    ? bodyKnownWeaknesses.slice(0, 10)
    : ctx?.knownWeaknesses ?? [];

  const normalizedMistakes = Array.isArray(bodyRecentMistakes) && bodyRecentMistakes.length
    ? bodyRecentMistakes.slice(0, 10)
    : ctx?.recentMistakes ?? [];

  // What the lesson must leave the learner able to do. Unknown or missing is a
  // concept lesson, which is every lesson written before this existed.
  // An explicit request wins; otherwise the kind the module was created with.
  const stored = canPersist
    ? await db.curriculumItem.findFirst({ where: { topicId, legacyId: moduleId, removed: false }, select: { kind: true, blueprint: true } }).catch(() => null)
    : null;
  const kind = lessonKindOf(body.kind ?? stored?.kind);
  const messages: AIMessage[] = buildLessonMessages({
    kind,
    moduleTitle,
    topicTitle,
    area,
    learnerLevel,
    priorKnowledge,
    planBlock,
    coursePosition,
    weaknesses: normalizedWeaknesses,
    mistakes: normalizedMistakes,
    archetype,
    blueprint: kind !== 'concept' ? normalizeBlueprint(body.blueprint ?? stored?.blueprint, KIND_BLOCKS[kind]) : undefined,
  });
  if (manual === 'prompt') return NextResponse.json({ prompt: toChatPrompt(messages) });

  /*
   * Honest fallback.
   *
   * This intentionally does NOT pretend to be an AI-generated lesson.
   * A fake lesson is worse than telling the user that generation is unavailable.
   */
  if (!manual && !hasAnyAIProviderConfigured()) {
    return NextResponse.json({
      title: moduleTitle,

      summary: `AI lesson generation is unavailable for "${moduleTitle}" because no AI provider is configured.`,

      keyTakeaways: [
        `Find a precise definition of "${moduleTitle}" in the context of ${topicTitle || 'your subject'
        }.`,
        `Work through at least one concrete example of "${moduleTitle}".`,
        `Explain "${moduleTitle}" from memory and identify what you cannot explain clearly.`,
      ],

      explanation: `### AI generation unavailable

A complete lesson for **${moduleTitle}** cannot be generated because no AI provider is currently configured.

This response is intentionally not pretending to teach the topic with generic filler.

To study it independently:

1. Find a reliable explanation of **${moduleTitle}**.
2. Work through a concrete example rather than only reading the definition.
3. Close the source and explain the concept in your own words.
4. Try one problem or implementation involving the concept.
5. Write down anything you could not explain or implement.
6. Return and regenerate this lesson once an AI provider is configured.`,

      codeOrExample: `// AI generation is unavailable.
//
// Study "${moduleTitle}" using a concrete example,
// then return once an AI provider is configured.`,

      commonMistakes: [
        `Do not rely on memorizing the definition of "${moduleTitle}".`,
        'Do not move on until you can explain the concept using a concrete example.',
      ],

      quiz: [],

      fallback: true,
      reason: 'AI provider not configured',
    });
  }

  try {
    let rawContent: string;
    let provider: string;
    if (manual === 'import') {
      const found = extractJson(typeof body.reply === 'string' ? body.reply : '');
      if (!found.ok) return NextResponse.json({ problems: [found.problem], fixPrompt: fixPrompt([found.problem]) }, { status: 422 });
      rawContent = JSON.stringify(found.value);
      provider = 'manual';
    } else {
      ({ content: rawContent, provider } = await callAIContent(messages, {
        purpose: 'lesson', temperature: 0.35,
        tier: 'content',
        maxTokens: 9000,
      }));
    }

    let parsed: any;

    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      console.error('AI returned invalid JSON:', rawContent);

      return NextResponse.json({
        title: moduleTitle,
        summary: `The AI generated an invalid lesson response for "${moduleTitle}".`,
        keyTakeaways: [
          'The generated response could not be parsed safely.',
          'No lesson content was cached.',
          'Regenerate the lesson to try again.',
        ],
        explanation:
          'The AI provider returned a response that did not match the required JSON format. No generated content was saved because the response could not be validated.',
        codeOrExample: '',
        commonMistakes: [],
        whenToUse: [],
        whenNotToUse: [],
        quiz: [],
        fallback: true,
        reason: 'Invalid AI JSON',
      });
    }

    /*
     * Basic structural validation.
     *
     * We do not blindly trust model output just because JSON.parse succeeded.
     */
    // normalizeLesson drops quiz questions the UI can't render, coerces
    // list fields, and returns null if the core teaching content is missing.
    const normalized = normalizeLesson(parsed);

    if (!normalized && manual) {
      const problems = ['The lesson needs at least a "summary" and an "explanation".'];
      return NextResponse.json({ problems, fixPrompt: fixPrompt(problems) }, { status: 422 });
    }
    if (!normalized) {
      console.error('AI returned structurally invalid lesson:', parsed);

      return NextResponse.json({
        title: moduleTitle,
        summary: `The generated lesson for "${moduleTitle}" did not pass validation.`,
        keyTakeaways: [
          'The AI response did not match the expected lesson structure.',
          'No invalid content was cached.',
          'Regenerate the lesson to try again.',
        ],
        explanation:
          'The AI response was received but did not contain the required lesson fields. The response was rejected rather than showing potentially broken content.',
        codeOrExample: '',
        commonMistakes: [],
        whenToUse: [],
        whenNotToUse: [],
        quiz: [],
        fallback: true,
        reason: 'Invalid lesson structure',
      });
    }

    // The kind comes from the request, never from the model. Concept lessons
    // stay exactly as they were saved before kinds existed.
    const lesson = kind === 'concept' ? normalized : { ...normalized, kind };

    /*
     * Persist only verified AI content.
     */
    if (canPersist) {
      const topic = await db.topic.findFirst({
        where: {
          id: topicId,
          userId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (topic) {
        await db.generatedLesson.upsert({
          where: {
            topicId_moduleId: {
              topicId,
              moduleId,
            },
          },
          create: {
            userId,
            topicId,
            moduleId,
            moduleTitle,
            content: lesson as object,
            provider,
          },
          update: {
            moduleTitle,
            content: lesson as object,
            provider,
          },
        });
      }
    }

    if (manual) await logManualImport('lesson', userId, provider);
    return NextResponse.json(lesson);
  } catch (error) {
    console.error('Lesson generation error:', error);

    /*
     * Use the already-parsed request body instead of calling request.json()
     * again. Request bodies should not be assumed to be reusable streams.
     */
    return NextResponse.json({
      title: 'Lesson generation failed',

      summary: `Could not generate a lesson for "${moduleTitle}".`,

      keyTakeaways: [
        'The AI service did not return usable lesson content.',
        'No failed response was cached as a lesson.',
        'Try generating the lesson again.',
      ],

      explanation: `### Lesson generation failed

The AI service could not generate a usable lesson for **${moduleTitle}**.

This response is intentionally not pretending that generic text is a real lesson.

Possible causes include:

- AI provider rate limits
- Temporary provider failure
- Network failure
- Invalid AI response
- Provider configuration problems

Try generating the lesson again. If the problem continues, check the configured AI provider.`,

      codeOrExample: '',

      commonMistakes: [],

      whenToUse: [],

      whenNotToUse: [],

      quiz: [],

      fallback: true,
      reason: 'Generation error',
    });
  }
}
