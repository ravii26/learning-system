import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import {
  callAIContent,
  hasAnyAIProviderConfigured,
} from '@/lib/ai/aiClient';
import { db } from '@/lib/db';

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

export async function POST(request: Request) {
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

    // Optional learner context.
    // These can be supplied now or added to the frontend later.
    learnerLevel = 'beginner',
    priorKnowledge = '',
    knownWeaknesses = [],
    recentMistakes = [],
  } = body;

  if (!moduleTitle) {
    return NextResponse.json(
      { error: 'moduleTitle is required' },
      { status: 400 }
    );
  }

  /*
   * Persistence is opt-in via topicId + moduleId.
   *
   * Without both, the route behaves as a stateless lesson generator.
   */
  const canPersist = Boolean(topicId && moduleId);

  if (canPersist && !regenerate) {
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
   * Honest fallback.
   *
   * This intentionally does NOT pretend to be an AI-generated lesson.
   * A fake lesson is worse than telling the user that generation is unavailable.
   */
  if (!hasAnyAIProviderConfigured()) {
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

  const normalizedWeaknesses = Array.isArray(knownWeaknesses)
    ? knownWeaknesses.slice(0, 10)
    : [];

  const normalizedMistakes = Array.isArray(recentMistakes)
    ? recentMistakes.slice(0, 10)
    : [];

  const systemPrompt = `
You are an expert teacher and senior practitioner creating one focused learning lesson.

Your job is NOT to produce generic educational content.

Your job is to make the student genuinely understand ONE specific concept and become capable of applying it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Subject:
"${topicTitle || 'Unknown subject'}"

Module:
"${moduleTitle}"

Category:
"${area}"

Learner level:
"${learnerLevel}"

Known prior knowledge:
${priorKnowledge || 'No prior knowledge information provided.'}

Known weaknesses:
${normalizedWeaknesses.length
      ? normalizedWeaknesses.map((item: string) => `- ${item}`).join('\n')
      : 'No known weaknesses provided.'
    }

Recent mistakes:
${normalizedMistakes.length
      ? normalizedMistakes.map((item: string) => `- ${item}`).join('\n')
      : 'No recent mistakes provided.'
    }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After completing this lesson, the learner should be able to:

1. Explain what "${moduleTitle}" is in simple language.
2. Explain WHY it exists or what problem it solves.
3. Recognize when it should and should not be used.
4. Work through at least one concrete example.
5. Apply the concept to a new situation.
6. Avoid the most important beginner mistake related to it.

The lesson must teach the specific module:

"${moduleTitle}"

Do NOT drift into a generic overview of "${topicTitle || 'the subject'}".

If "${moduleTitle}" is a sub-concept, focus primarily on that sub-concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEACHING METHOD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build the explanation in this order whenever the subject allows:

1. INTUITION
   Start with the simplest useful mental model.

2. PROBLEM
   Explain what problem or need the concept solves.

3. MECHANISM
   Explain exactly how it works.

4. CONCRETE EXAMPLE
   Walk through a small example step by step.

5. PRACTICAL APPLICATION
   Show how a learner actually uses it.

6. COMMON MISTAKE
   Explain at least one realistic misconception or implementation mistake.

7. LIMITATION / TRADE-OFF
   Explain when the concept is not appropriate, inefficient, unsafe,
   unnecessary, or has an important limitation.

8. RETRIEVAL
   End with questions that force the learner to reason without simply
   repeating the explanation.

Do not mechanically use these headings if another structure teaches the
concept better. The learning sequence matters more than the headings.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIFICITY RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every paragraph must contain useful information about the actual concept.

Before producing each paragraph, mentally ask:

"Could this paragraph be pasted into a lesson about a completely different
topic without changing much?"

If YES, rewrite it.

Avoid phrases such as:

- "understand the core principles"
- "learn the fundamental concepts"
- "explore the key mechanisms"
- "robust implementation"
- "scalable architecture"
- "industry best practices"
- "powerful tool"
- "important concept"
- "gain deeper understanding"
- "master the fundamentals"
- "follow standard workflows"

These phrases are allowed ONLY when immediately followed by concrete
technical information explaining exactly what they mean.

Never use corporate filler.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPTH RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do not artificially make the lesson longer.

Prefer:

300 highly useful words

over:

600 words containing repetition.

The explanation should normally be 400–700 words, but accuracy and teaching
quality are more important than hitting a word count.

For simple concepts, be shorter.

For genuinely complex concepts, use additional detail where necessary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREREQUISITE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only introduce prerequisites that are actually required to understand
"${moduleTitle}".

If the learner appears to be missing a prerequisite, explain the minimum
needed prerequisite briefly.

Do NOT turn the lesson into a giant prerequisite tutorial.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Examples must be concrete.

For programming:

- Use realistic code.
- Prefer small runnable examples.
- Explain important lines.
- Show input/output when useful.
- Include edge cases when they matter.
- Do not create meaningless toy code just to satisfy the schema.

For algorithms/data structures:

- Walk through actual values.
- Show state changes.
- Explain why each step occurs.
- Include complexity only when relevant.
- Distinguish intuition from implementation details.

For databases:

- Use realistic tables/data.
- Show the actual query where appropriate.
- Explain what the database does.

For system design/software engineering:

- Use concrete components and flows.
- Explain trade-offs.
- Avoid vague architecture buzzwords.

For non-technical subjects:

- Use concrete scenarios, numbers, decisions, or examples.
- Do not invent unsupported facts.
- Clearly distinguish hypothetical examples from real-world facts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CODE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the module is technical and code is appropriate:

The codeOrExample MUST be valid, coherent, runnable code whenever practical.

Do not produce pseudo-code unless pseudo-code is genuinely more appropriate.

Use the language most appropriate to the module.

If no code is appropriate, provide a detailed concrete example instead.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MISCONCEPTION RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identify realistic mistakes a learner could actually make.

Bad:

"Students may misunderstand this concept."

Good:

"A common mistake in binary search is moving the left boundary to mid
instead of mid + 1. If mid has already been tested and is not the answer,
leaving it in the search range can cause an infinite loop."

The mistake must be specific and actionable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUIZ RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate 3 questions.

The questions must test different abilities:

Question 1:
Conceptual understanding.

Question 2:
Application or prediction.

Question 3:
Debugging, edge case, comparison, or transfer to a new situation.

Do NOT ask questions whose answer can be copied directly from a sentence
without understanding it.

Wrong answers must be plausible.

Avoid obviously ridiculous distractors.

Do not make the correct answer consistently appear at the same index.

Each explanation must explain WHY the answer is correct and identify the
underlying concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The lesson should match the learner's stated level.

For beginners:

- establish intuition
- avoid unnecessary jargon
- introduce terminology after the idea

For intermediate learners:

- move faster through basics
- emphasize edge cases and trade-offs
- require more application

For advanced learners:

- focus on subtle behavior
- trade-offs
- failure modes
- performance
- design decisions
- non-obvious cases

Never pretend the learner knows something merely because it is common
knowledge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONALIZATION RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If weaknesses or mistakes are provided, incorporate them naturally.

Example:

If the learner previously confused X and Y, explicitly distinguish X from Y.

Do NOT mention internal learner data awkwardly.

Bad:
"You previously failed question 4."

Good:
"A common source of confusion is X vs Y. They look similar, but the key
difference is..."

If no learner information is provided, do not invent a learner history.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCURACY RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Never invent APIs, syntax, algorithms, statistics, citations, or factual
claims.

If the module title is ambiguous, interpret it using the topic and category.

If ambiguity remains significant, teach the most common interpretation and
state the interpretation briefly.

Do not fabricate sources or claim something is "industry standard" unless
the claim is genuinely justified.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT QUALITY TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before returning the JSON, verify:

1. Is the lesson specifically about "${moduleTitle}"?
2. Could a student actually learn something from it?
3. Is there a concrete example?
4. Is there at least one realistic misconception?
5. Is there a practical application?
6. Do the questions require reasoning?
7. Are the distractors plausible?
8. Is anything generic filler?
9. Did the lesson accidentally become a lesson about the entire topic?
10. Does the content match the learner level?

If any answer is NO, improve the lesson before returning it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return VALID JSON ONLY.

No markdown fences.
No commentary before or after the JSON.

Use exactly this structure:

{
  "title": "Exact lesson title",

  "summary": "One concise sentence explaining what the learner will be able to do after this lesson.",

  "learningObjectives": [
    "Specific capability the learner should gain",
    "Specific concept the learner should be able to explain",
    "Specific application the learner should be able to perform"
  ],

  "keyTakeaways": [
    "Specific factual or practical takeaway",
    "Specific rule, mechanism, or distinction",
    "Specific mistake or limitation to remember"
  ],

  "explanation": "Markdown explanation containing concrete teaching, intuition, mechanisms, examples, and practical application.",

  "codeOrExample": "Runnable code or a detailed concrete example. Include comments where useful.",

  "commonMistakes": [
    "Specific realistic mistake and how to avoid it",
    "Another important misconception, if applicable"
  ],

  "whenToUse": [
    "Concrete situation where the concept is appropriate",
    "Another situation where it is useful"
  ],

  "whenNotToUse": [
    "Concrete situation where the concept is inappropriate or unnecessary",
    "Important limitation or trade-off"
  ],

  "quiz": [
    {
      "question": "Conceptual understanding question",
      "options": [
        "Plausible answer A",
        "Plausible answer B",
        "Plausible answer C",
        "Plausible answer D"
      ],
      "correctIndex": 0,
      "explanation": "Explain why the correct answer is correct and what reasoning the learner should use."
    },
    {
      "question": "Application or prediction question",
      "options": [
        "Plausible answer A",
        "Plausible answer B",
        "Plausible answer C",
        "Plausible answer D"
      ],
      "correctIndex": 1,
      "explanation": "Explain the reasoning."
    },
    {
      "question": "Debugging, edge-case, comparison, or transfer question",
      "options": [
        "Plausible answer A",
        "Plausible answer B",
        "Plausible answer C",
        "Plausible answer D"
      ],
      "correctIndex": 2,
      "explanation": "Explain the reasoning."
    }
  ],

  "estimatedDifficulty": "beginner | intermediate | advanced",

  "prerequisites": [
    "Only genuinely necessary prerequisite concepts"
  ]
}
`;

  try {
    const userPrompt = `
Create the lesson for:

Topic:
"${topicTitle || 'Unknown subject'}"

Module:
"${moduleTitle}"

Category:
"${area}"

Learner level:
"${learnerLevel}"

Prior knowledge:
${priorKnowledge || 'None provided'}

Known weaknesses:
${normalizedWeaknesses.length
        ? normalizedWeaknesses.join(', ')
        : 'None provided'
      }

Recent mistakes:
${normalizedMistakes.length
        ? normalizedMistakes.join(', ')
        : 'None provided'
      }

Important:
Teach "${moduleTitle}" itself.

Do not generate a generic introduction to "${topicTitle || 'the subject'}".
Do not use motivational filler.
Do not merely describe what the student should learn.
Actually teach the concept.
`;

    const { content: rawContent, provider } = await callAIContent(
      [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      {
        temperature: 0.35,
      }
    );

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
    const isValidLesson =
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.title === 'string' &&
      typeof parsed.summary === 'string' &&
      typeof parsed.explanation === 'string' &&
      Array.isArray(parsed.keyTakeaways) &&
      Array.isArray(parsed.quiz);

    if (!isValidLesson) {
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
            content: parsed,
            provider,
          },
          update: {
            moduleTitle,
            content: parsed,
            provider,
          },
        });
      }
    }

    return NextResponse.json(parsed);
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
