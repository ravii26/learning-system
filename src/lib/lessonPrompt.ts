/**
 * The messages that ask a model to write one lesson. Pure: everything it
 * needs about the learner is passed in, so the lesson route and
 * scripts/compare-lessons.ts build exactly the same prompt.
 */
import type { AIMessage } from '@/lib/ai/aiClient';
import { EXERCISES_JSON, LESSON_GUIDE } from '@/lib/program/lessonGuide';
import type { Archetype } from '@/lib/program/fieldGuide';
import { buildKindMessages } from '@/lib/kindLessons';
import type { LessonKind } from '@/lib/lessonKinds';
import type { BlockType } from '@/lib/lessonBlocks';

export interface LessonPromptInput {
  kind: LessonKind;
  moduleTitle: string;
  topicTitle?: string;
  area: string;
  learnerLevel: string;
  priorKnowledge: string;
  /** Goal and intake answers from the learner's plan, already formatted; '' when none. */
  planBlock: string;
  coursePosition: string;
  weaknesses: string[];
  mistakes: string[];
  archetype: Archetype;
  /** Which sections to write (kinds other than concept). */
  blueprint?: BlockType[];
  /** "October 2026"; defaults to now. */
  today?: string;
}

export function buildLessonMessages(input: LessonPromptInput): AIMessage[] {
  const {
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
  } = input;
  const today = input.today ?? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (kind !== 'concept') {
    return buildKindMessages(kind, {
      topicTitle: topicTitle ?? '',
      moduleTitle,
      area,
      learnerLevel,
      priorKnowledge,
      planBlock,
      coursePosition,
      weaknesses: normalizedWeaknesses,
      mistakes: normalizedMistakes,
      today,
      blueprint: input.blueprint,
    });
  }

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
WHO THIS IS FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${planBlock || 'No plan context.'}

Use their situation for every example (their job, exam, city, goal), not generic textbook examples.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO TEACH THIS KIND OF SUBJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${LESSON_GUIDE[archetype]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COURSE POSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${coursePosition || 'Standalone lesson — no course position provided.'}

Use this to avoid re-teaching earlier modules (refer to them briefly when
you build on them) and to avoid teaching the next module early.

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
OPTIONAL SECTIONS RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Not every lesson needs every section. Include a section ONLY when it helps
this lesson; otherwise return it empty ([] for lists, "" for text). An empty
section is better than a forced one, and the learner never sees it.

- "whenToUse" and "whenNotToUse": for tools, techniques and methods that have
  a right and wrong moment. Leave both [] for a fact, a skill drill, a language
  point or a habit, where "when not to use it" would be filler.
- "commonMistakes": only real, specific mistakes people make with this exact
  topic. [] if you cannot name a concrete one.
- "codeOrExample": runnable code, a recipe card, a worked routine or a worked
  numeric example when one teaches the idea. "" when the explanation already
  contains its example and a second one would repeat it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL LIFE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use a real-life example (a named person or company, an everyday situation,
realistic numbers) only where it makes THIS lesson clearer. Decide per
lesson: an abstract idea or a behaviour usually needs one; a plain fact, a
definition or a drill may not. Do not add one just to have one. When you use
an example you made up rather than a documented fact, mark it as an
illustration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRACTICE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reading is not learning. Write "exercises" the learner does right after
reading, following the guide above for this kind of subject: the actual
items (sentences, questions, tasks), each with a model answer or a clear
success check. Start easy and end with at least one exercise that uses the
learner's own situation. Every model answer must be correct.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REVIEW CARDS RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Write 3 to 5 "reviewCards": the few things from this lesson most worth
remembering in a month. They are shown later with NO lesson context, as
spaced-repetition flashcards.

- The prompt asks for recall or reasoning ("Why does X fail when Y?",
  "What would you use for Z, and why?"), never yes/no or a definition to
  parrot.
- The prompt must be answerable on its own — name the concept; don't say
  "this lesson" or "the example above".
- The answer is short (1-3 sentences) and complete enough to check yourself
  against.
- One idea per card.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT QUALITY TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before returning the JSON, verify:

1. Is the lesson specifically about "${moduleTitle}"?
2. Could a student actually learn something from it?
3. Is there a concrete example?
4. If this topic has natural mistakes, did you name a realistic one (else leave it empty)?
5. Is there a practical application?
6. Do the questions require reasoning?
7. Are the distractors plausible?
8. Is anything generic filler?
9. Did the lesson accidentally become a lesson about the entire topic?
10. Does the content match the learner level?
11. Are there enough exercises, and is every model answer and every technical/grammar label correct?

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

  "codeOrExample": "Runnable code or a detailed concrete example. Include comments where useful. \"\" if none fits.",

  "commonMistakes": [
    "Specific realistic mistake and how to avoid it (use [] if none is natural)",
    "Another important misconception, if applicable"
  ],

  "whenToUse": [
    "Concrete situation where the concept is appropriate (use [] if the idea has no right or wrong moment)",
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

  "recommendedResources": [
    {
      "title": "Specific Video Title or Book Chapter (e.g. StatQuest / CrashCourse / Book Chapter)",
      "type": "video",
      "searchQuery": "YouTube or Google search query to find this exact material",
      "whyRecommended": "1 clear sentence explaining why this video or book is the best resource for visual or deep understanding."
    },
    {
      "title": "Book or Documentation Reference",
      "type": "book",
      "searchQuery": "Recommended book title and chapter",
      "whyRecommended": "Authoritative textbook or reference chapter for deep mastery."
    }
  ],

  "socraticChallenge": {
    "scenario": "A concrete real-world dilemma or dataset scenario where this concept applies.",
    "question": "A sharp question asking the student to diagnose, choose, or explain how to handle the scenario.",
    "idealAnswer": "Clear, complete breakdown of how to solve the challenge correctly."
  },

${EXERCISES_JSON}

  "reviewCards": [
    {
      "concept": "Short name of the idea",
      "prompt": "Standalone recall or reasoning question",
      "answer": "Short, checkable answer"
    }
  ],

  "estimatedDifficulty": "beginner | intermediate | advanced",

  "prerequisites": [
    "Only genuinely necessary prerequisite concepts"
  ]
}
`;

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

Course position:
${coursePosition || 'Standalone lesson'}

Important:
Teach "${moduleTitle}" itself.

Do not generate a generic introduction to "${topicTitle || 'the subject'}".
Do not use motivational filler.
Do not merely describe what the student should learn.
Actually teach the concept.
`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
