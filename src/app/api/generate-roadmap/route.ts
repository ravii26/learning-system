import { NextResponse } from 'next/server';
import {
  callAIContent,
  hasAnyAIProviderConfigured,
} from '@/lib/ai/aiClient';
import { requireAuth } from '@/lib/apiAuth';

export interface GeneratedTopic {
  title: string;
  area:
  | 'Tech'
  | 'Business'
  | 'Finance'
  | 'Creative'
  | 'Personal'
  | 'Other'
  | string;

  /**
   * Why this topic exists at this exact point in the roadmap.
   */
  why: string;

  depthTarget:
  | 'Awareness'
  | 'Working Knowledge'
  | 'Proficiency'
  | 'Deep'
  | 'Mastery';

  estimatedHours: number;

  /**
   * The smallest concrete action the learner can take immediately.
   */
  nextAction: string;

  mode: 'self_directed' | 'course' | 'project';

  /**
   * Specific concepts/modules inside this topic.
   */
  curriculum?: string[];

  /**
   * What the learner should be capable of doing after completing
   * this topic.
   */
  outcome?: string;

  /**
   * Optional evidence that the learner has actually learned it.
   */
  completionCriteria?: string[];
}

export interface RoadmapResponse {
  isValid: boolean;
  invalidReason?: string;

  /**
   * Helpful alternatives when the original goal is ambiguous,
   * too broad, or not directly learnable.
   */
  suggestions?: string[];

  roadmapTitle?: string;
  estimatedWeeks?: number;
  totalEstimatedHours?: number;
  topics?: GeneratedTopic[];

  fallback?: boolean;
  reason?: string;
}

/**
 * Attempts to infer a reasonable area from the goal.
 *
 * This is only used for fallback generation. AI-generated roadmaps
 * should determine the area themselves.
 */
function inferArea(goal: string): GeneratedTopic['area'] {
  const value = goal.toLowerCase();

  if (
    /react|javascript|typescript|node|python|java|flutter|dart|sql|mongodb|database|dsa|algorithm|coding|programming|software|aws|docker|kubernetes|devops|computer science|system design|api|backend|frontend/.test(
      value
    )
  ) {
    return 'Tech';
  }

  if (
    /business|startup|sales|marketing|product management|entrepreneur|crm/.test(
      value
    )
  ) {
    return 'Business';
  }

  if (
    /finance|investing|investment|stocks|accounting|budget|money|personal finance/.test(
      value
    )
  ) {
    return 'Finance';
  }

  if (
    /writing|music|film|filmmaking|design|drawing|photography|creative/.test(
      value
    )
  ) {
    return 'Creative';
  }

  if (
    /fitness|communication|english|leadership|productivity|habit|confidence|career/.test(
      value
    )
  ) {
    return 'Personal';
  }

  return 'Other';
}

/**
 * Honest fallback roadmap.
 *
 * This should be treated as a safety net, not as the main curriculum engine.
 * It is intentionally useful but much less ambitious than an AI-generated
 * roadmap.
 */
function buildFallbackTopics(
  goal: string,
  currentLevel: string,
  desiredOutcome: string
): GeneratedTopic[] {
  const area = inferArea(goal);

  const topics: GeneratedTopic[] = [
    {
      title: `${goal}: Mental Model, Vocabulary & Real-World Purpose`,
      area,
      why: `Build the minimum mental model needed to understand what ${goal} is, what problem it solves, and where it is actually useful before learning implementation details.`,
      depthTarget: 'Working Knowledge',
      estimatedHours: 6,
      nextAction: `Write down what you currently believe "${goal}" means, then compare it with two reliable explanations and list the three biggest differences.`,
      mode: 'course',
      outcome: `Explain ${goal} in simple language, identify its main components, and describe at least three situations where it is useful.`,
      completionCriteria: [
        `Explain ${goal} without reading notes.`,
        'Give three concrete use cases.',
        'Explain the main terminology without relying on memorized definitions.',
      ],
      curriculum: [
        `${goal}: What it is and what problem it solves`,
        `${goal}: Essential terminology and concepts`,
        `${goal}: Main components, relationships, and boundaries`,
        `${goal}: Real-world use cases and non-use cases`,
      ],
    },

    {
      title: `${goal}: Core Concepts Through Worked Examples`,
      area,
      why: `Move from definitions to concrete examples so the learner can see how the important ideas behave instead of only memorizing terminology.`,
      depthTarget: 'Working Knowledge',
      estimatedHours: 8,
      nextAction: `Choose one small real example of ${goal}, work through it step by step, and write down what changes at each step.`,
      mode: 'course',
      outcome: `Work through common examples of ${goal} and explain why each step produces the observed result.`,
      completionCriteria: [
        'Complete a worked example without copying the solution.',
        'Explain why each major step is necessary.',
        'Identify what would change if an important input changed.',
      ],
      curriculum: [
        `${goal}: First worked example from start to finish`,
        `${goal}: Second example with a different input or constraint`,
        `${goal}: Compare two approaches and explain the difference`,
        `${goal}: Edge case that breaks the naive approach`,
      ],
    },

    {
      title: `${goal}: Practical Application & Problem Solving`,
      area,
      why: `The learner now needs to use the concepts independently rather than only recognize explanations.`,
      depthTarget: 'Proficiency',
      estimatedHours: 10,
      nextAction: `Complete one small ${goal} exercise without following a tutorial, then write down exactly where you got stuck.`,
      mode: 'course',
      outcome: `Use the core concepts of ${goal} to solve a new problem with limited guidance.`,
      completionCriteria: [
        'Complete a new problem without copying a solution.',
        'Explain the approach before executing it.',
        'Diagnose at least one incorrect attempt.',
      ],
      curriculum: [
        `${goal}: Guided practical exercise`,
        `${goal}: Independent exercise`,
        `${goal}: Debugging and failure analysis`,
        `${goal}: Choosing between alternative approaches`,
      ],
    },

    {
      title: `${goal}: Real-World Project`,
      area,
      why: `A project exposes gaps that tutorials hide. The learner must make decisions, handle incomplete information, and connect multiple concepts.`,
      depthTarget: 'Deep',
      estimatedHours: 20,
      nextAction: `Choose one realistic ${goal} project, define its goal and three essential requirements, and produce a one-page implementation plan.`,
      mode: 'self_directed',
      outcome: `Build a small but complete project using ${goal} without step-by-step instructions.`,
      completionCriteria: [
        'Define the problem independently.',
        'Build the core functionality.',
        'Handle at least two realistic edge cases.',
        'Explain the important design decisions.',
        'Identify what you would improve in a second version.',
      ],
      curriculum: [
        `${goal}: Project scope and requirements`,
        `${goal}: Design the solution before implementation`,
        `${goal}: Build the smallest working version`,
        `${goal}: Handle errors and edge cases`,
        `${goal}: Test, review, and explain the finished project`,
      ],
    },
  ];

  /*
   * If the learner is already beyond beginner level, make the fallback
   * less introductory.
   */
  if (
    ['intermediate', 'experienced', 'advanced'].includes(
      currentLevel.toLowerCase()
    )
  ) {
    topics[0].title = `${goal}: Architecture, Trade-offs & Existing Knowledge Gaps`;
    topics[0].why = `Start from the learner's existing knowledge and identify the important concepts, trade-offs, and gaps required for ${desiredOutcome}.`;
    topics[0].nextAction = `List the three parts of ${goal} you already understand and the three parts you cannot confidently explain or apply.`;
  }

  return topics;
}

function sanitizeTopics(raw: unknown): GeneratedTopic[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const valid: GeneratedTopic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title || '').trim();
    if (!title || title.length < 3) continue;
    const why = String(item.why || `Build foundational capability in ${title}.`).trim();
    const nextAction = String(item.nextAction || `Review the core concepts of ${title} and complete the first exercise.`).trim();
    const rawHours = typeof item.estimatedHours === 'number' ? item.estimatedHours : parseInt(String(item.estimatedHours || '10'), 10);
    const estimatedHours = isNaN(rawHours) ? 10 : Math.max(2, Math.min(100, rawHours));
    const curriculum = Array.isArray(item.curriculum) && item.curriculum.length > 0
      ? item.curriculum.map((c: any) => typeof c === 'object' && c?.title ? String(c.title) : String(c))
      : [`Core Principles of ${title}`, `Practical Examples of ${title}`, `Hands-on Practice with ${title}`];

    valid.push({
      title,
      area: String(item.area || 'Tech'),
      why,
      depthTarget: item.depthTarget || 'Working Knowledge',
      estimatedHours,
      nextAction,
      mode: (item.mode === 'self_directed' || item.mode === 'project' || item.mode === 'course') ? item.mode : 'course',
      curriculum,
      outcome: typeof item.outcome === 'string' ? item.outcome : `Able to understand and apply ${title} independently.`,
      completionCriteria: Array.isArray(item.completionCriteria) ? item.completionCriteria.map((c: any) => String(c)) : [`Demonstrate understanding of ${title}`],
    });
  }
  return valid.length >= 3 ? valid : null;
}

export async function POST(request: Request) {
  const auth = requireAuth();

  if (auth instanceof NextResponse) {
    return auth;
  }

  /*
   * Read request body once.
   *
   * The previous implementation attempted request.json() again inside
   * catch(). Request bodies should not be treated as reusable streams.
   */
  let body: Record<string, any>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON request body',
      },
      { status: 400 }
    );
  }

  const {
    goal,
    currentLevel = 'beginner',
    desiredOutcome = '',
    weeklyHours = 5,
  } = body;

  if (!goal || typeof goal !== 'string' || !goal.trim()) {
    return NextResponse.json(
      {
        error: 'Goal is required',
      },
      { status: 400 }
    );
  }

  const cleanGoal = goal.trim();

  const normalizedWeeklyHours =
    typeof weeklyHours === 'number' &&
      Number.isFinite(weeklyHours) &&
      weeklyHours > 0
      ? Math.min(weeklyHours, 168)
      : 5;

  const normalizedLevel =
    typeof currentLevel === 'string'
      ? currentLevel.trim().toLowerCase()
      : 'beginner';

  const normalizedOutcome =
    typeof desiredOutcome === 'string'
      ? desiredOutcome.trim()
      : '';

  /*
   * AI unavailable:
   *
   * Return a useful fallback rather than pretending an AI-generated roadmap
   * exists.
   */
  if (!hasAnyAIProviderConfigured()) {
    const topics = buildFallbackTopics(
      cleanGoal,
      normalizedLevel,
      normalizedOutcome
    );

    const totalEstimatedHours = topics.reduce(
      (total, topic) => total + topic.estimatedHours,
      0
    );

    return NextResponse.json({
      isValid: true,
      roadmapTitle: `${cleanGoal}: Learning Path`,
      estimatedWeeks: Math.max(
        1,
        Math.ceil(totalEstimatedHours / normalizedWeeklyHours)
      ),
      totalEstimatedHours,
      topics,
      fallback: true,
      reason: 'AI provider not configured',
    } satisfies RoadmapResponse);
  }

  /*
   * This prompt is intentionally much more demanding than:
   *
   * "Generate 5–8 topics."
   *
   * The model has to design a dependency-aware learning sequence.
   */
  const systemPrompt = `
You are an expert curriculum architect and learning-science-informed teacher.

Your task is to design a practical learning roadmap for ONE learner.

You are NOT generating a generic list of topics.

You are deciding:

1. What the learner needs to learn.
2. What order they should learn it in.
3. Why each step belongs where it does.
4. What practical ability each step should create.
5. What evidence should demonstrate that the learner is ready to continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Goal:
"${cleanGoal}"

Current level:
"${normalizedLevel}"

Desired outcome:
"${normalizedOutcome ||
    'Gain practical competence and become able to use the subject independently.'
    }"

Available study time:
${normalizedWeeklyHours} hours/week

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIRST: VALIDATE THE GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Determine whether "${cleanGoal}" is a meaningful learnable goal.

INVALID examples:

- random characters
- meaningless text
- impossible or undefined learning objectives
- prompts such as "asdfgh"
- a request that is not actually a subject, skill, or learnable outcome

If invalid:

{
  "isValid": false,
  "invalidReason": "Specific explanation",
  "suggestions": [
    "Possible clearer goal",
    "Another possible interpretation"
  ]
}

Do NOT generate a fake roadmap for an invalid goal.

If the goal is broad but learnable, DO NOT reject it.

Instead, intelligently narrow it into a practical progression.

For example:

"Programming"

should become a progression involving programming fundamentals,
problem solving, one practical language, projects, debugging, and
increasingly complex applications.

Do not ask the user to clarify unless the goal is genuinely impossible
to interpret.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE ROADMAP'S JOB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The roadmap must transform:

"I want to learn X"

into:

"I know exactly what to learn next, why I am learning it, and what I
should be able to do afterward."

The roadmap is NOT a table of contents.

It is a sequence of capability-building stages.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPENDENCY-FIRST ORDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Order topics according to actual learning dependencies.

Do NOT simply order them from "easy" to "hard".

Ask:

- What must be understood first?
- What concepts depend on previous concepts?
- What can be learned through practice rather than theory?
- Where should the learner encounter a realistic problem?
- Where should deliberate practice happen?
- Where should a project or capstone expose knowledge gaps?

A later topic should normally build on earlier capability.

If two topics are independent, explain the chosen order through usefulness
or learning efficiency.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEVEL ADAPTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGINNER:

Assume almost no knowledge.

Build intuition first.

Introduce terminology only when needed.

Provide early hands-on work.

INTERMEDIATE:

Do NOT waste most of the roadmap repeating beginner material.

Briefly verify fundamentals, then move into practical patterns,
problem-solving, debugging, trade-offs, and independent work.

EXPERIENCED:

Focus on gaps, advanced patterns, architecture, edge cases,
performance, trade-offs, and real-world application.

ADVANCED:

Focus on specialization, difficult problems, nuanced trade-offs,
internals, optimization, research-level or expert-level material where
appropriate.

Never invent prior knowledge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTCOME-FIRST DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each topic must create a capability.

Bad:

"Learn React Hooks."

Good:

"Build a React interface that uses local state and effects correctly,
including cleanup for subscriptions."

Bad:

"Learn SQL."

Good:

"Write SQL queries that join multiple tables, aggregate results, and
filter grouped data correctly."

Bad:

"Learn investing."

Good:

"Evaluate a basic investment using expected return, risk, time horizon,
and diversification rather than choosing solely from recent performance."

The learner should know what they can DO after each stage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPIC COUNT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate 5–8 major learning stages.

Use fewer stages if the subject is narrow.

Use more only when genuinely necessary.

Do NOT split one concept into meaningless micro-topics just to increase
the topic count.

Each major stage should represent a meaningful capability.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRICULUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each topic must contain 3–6 specific curriculum items.

These are modules the learner can actually study.

BAD:

- Foundations
- Core Principles
- Advanced Concepts
- Practical Application

GOOD:

For Binary Search:

- Why sorted data allows logarithmic search
- Choosing left, right, and midpoint boundaries
- Updating boundaries without skipping the answer
- Handling duplicate values and first/last occurrence
- Implementing binary search and testing edge cases

GOOD:

For Personal Finance:

- Tracking fixed vs variable expenses
- Building a monthly cash-flow view
- Emergency fund sizing
- Comparing debt interest with expected investment returns
- Automating savings and bill payments

If the curriculum item could belong to almost any subject,
rewrite it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHY FIELD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The "why" must explain why this stage exists HERE.

It should answer:

"What does learning this now unlock?"

Bad:

"This topic is important because it provides a strong foundation."

Good:

"Once you can reason about array indexing and loop boundaries,
binary search becomes easier to implement correctly because the main
difficulty shifts from syntax to maintaining the search invariant."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT ACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The nextAction must be:

- concrete
- immediately executable
- verb-first
- small enough to start today
- directly connected to the topic

Bad:

"Study the fundamentals."

Good:

"Create a small array of 10 numbers, implement a linear search, then
write down how many elements it checks in the best and worst cases."

Bad:

"Learn budgeting."

Good:

"Open a spreadsheet and enter every expense from the last 7 days,
grouping each into a category."

The learner should be able to act immediately after reading it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPTH TARGET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Choose honestly:

Awareness:
The learner can explain what it is and recognize it.

Working Knowledge:
The learner can use it with guidance.

Proficiency:
The learner can use it independently in common situations.

Deep:
The learner understands trade-offs, edge cases, and can solve unfamiliar
problems.

Mastery:
The learner can teach, design, optimize, critique, or create advanced
work in the area.

Do not label everything "Mastery".

The depth target should reflect the desired outcome.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIME ESTIMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Estimate realistic focused learning time.

Do NOT count:

- endless passive reading
- vague "research"
- commuting
- unrelated work
- unrealistic 12-hour study days

Include:

- learning
- examples
- exercises
- deliberate practice
- projects
- review where genuinely necessary

Each topic should normally require 4–25 focused hours.

Only exceed 25 when a substantial project genuinely justifies it.

Total hours must be mathematically consistent with estimatedWeeks.

Formula:

estimatedWeeks =
ceil(totalEstimatedHours / ${normalizedWeeklyHours})

Do not invent a random number of weeks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRACTICE DISTRIBUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A good roadmap should NOT consist entirely of explanations.

Across the roadmap, include:

- conceptual learning
- worked examples
- deliberate practice
- independent problem solving
- debugging or error analysis where applicable
- at least one realistic project/capstone when appropriate

For technical subjects, the roadmap should progressively reduce
step-by-step guidance.

For non-technical subjects, replace coding projects with realistic
application, decision-making, creation, or practice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REALITY CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do not promise mastery simply because the learner completes the roadmap.

The roadmap should represent a realistic path toward the requested
outcome.

If the desired outcome is much larger than the available time,
acknowledge that by making the first roadmap stage realistic and
appropriately scoped.

Do not use motivational exaggeration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAPSTONE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When the subject benefits from practical application, end with an
independent capstone.

The capstone should require the learner to combine previous skills.

Do not make the capstone merely:

"Build a project."

Specify what makes it meaningful.

Example:

Instead of:

"Build a React project."

Use:

"Build a React application with authentication, server-side data
fetching, loading/error states, form validation, and reusable components.
Implement the architecture yourself and document two design decisions."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NO GENERIC CURRICULUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before returning each topic, ask:

"If I replace "${cleanGoal}" with another subject, would this topic still
make sense?"

If YES, it is too generic.

Rewrite it.

Also reject filler such as:

- Domain Terminology & Mental Models
- Tooling & Environment Setup
- Fundamental Syntax & Core Mechanics
- Advanced Concepts
- Best Practices
- Practical Applications
- Real-World Applications
- Review & Assessment

These phrases may appear ONLY when followed by highly specific content,
and preferably should be replaced with the actual concept.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROADMAP QUALITY CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before returning the JSON, verify:

1. The roadmap is specifically about "${cleanGoal}".
2. The order has a learning reason.
3. Each topic creates a meaningful capability.
4. Each topic has specific curriculum items.
5. Each nextAction can be performed immediately.
6. Each why explains what the stage unlocks.
7. The level matches "${normalizedLevel}".
8. The desired outcome is reflected in the sequence.
9. The time estimates are realistic.
10. estimatedWeeks mathematically matches total hours.
11. The roadmap contains practice, not only theory.
12. The final stage provides meaningful independent application where appropriate.
13. No topic is generic filler.
14. The roadmap does not pretend completion equals mastery.

Fix any failure before returning the JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return VALID JSON ONLY.

No markdown.
No code fences.
No explanation outside the JSON.

For a valid goal:

{
  "isValid": true,
  "roadmapTitle": "Specific learning path title",
  "estimatedWeeks": 10,
  "totalEstimatedHours": 50,
  "topics": [
    {
      "title": "Specific capability-building stage",
      "area": "Tech",
      "why": "Why this stage belongs here and what it unlocks next.",
      "depthTarget": "Working Knowledge",
      "estimatedHours": 8,
      "nextAction": "Concrete verb-first action the learner can do today.",
      "mode": "course",
      "outcome": "What the learner should be capable of doing after this stage.",
      "completionCriteria": [
        "Observable evidence of learning",
        "Another observable capability"
      ],
      "curriculum": [
        "Specific concept or skill",
        "Specific concept or skill",
        "Specific practical exercise",
        "Specific edge case or application"
      ]
    }
  ]
}

For an invalid goal:

{
  "isValid": false,
  "invalidReason": "Specific reason",
  "suggestions": [
    "Clearer interpretation",
    "Another possible interpretation"
  ]
}
`;

  const userPrompt = `
Design the roadmap now.

Goal:
"${cleanGoal}"

Current level:
"${normalizedLevel}"

Desired outcome:
"${normalizedOutcome ||
    'Gain practical competence and become able to use the subject independently.'
    }"

Available time:
${normalizedWeeklyHours} hours/week

Important:

Do not simply list things associated with this subject.

Design a sequence of capabilities.

The learner should be able to look at the roadmap and know:

1. What to learn first.
2. Why it comes first.
3. What to do today.
4. What ability they should gain.
5. What they should learn next.
6. How they will eventually prove they can use the subject independently.
`;

  try {
    const { content: rawContent } = await callAIContent(
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

    let parsed: RoadmapResponse;

    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      console.error(
        'Roadmap AI returned invalid JSON:',
        rawContent
      );

      const topics = buildFallbackTopics(
        cleanGoal,
        normalizedLevel,
        normalizedOutcome
      );

      const totalEstimatedHours = topics.reduce(
        (total, topic) => total + topic.estimatedHours,
        0
      );

      return NextResponse.json({
        isValid: true,
        roadmapTitle: `${cleanGoal}: Learning Path`,
        estimatedWeeks: Math.max(
          1,
          Math.ceil(totalEstimatedHours / normalizedWeeklyHours)
        ),
        totalEstimatedHours,
        topics,
        fallback: true,
        reason: 'AI returned invalid JSON',
      } satisfies RoadmapResponse);
    }

    /*
     * Invalid goals should pass through directly.
     */
    if (parsed.isValid === false) {
      return NextResponse.json({
        isValid: false,
        invalidReason:
          parsed.invalidReason ||
          `The goal "${cleanGoal}" could not be interpreted as a clear learning objective.`,
        suggestions: parsed.suggestions || [],
      } satisfies RoadmapResponse);
    }

    /*
     * Validate the actual roadmap structure.
     *
     * Valid JSON is not necessarily a valid roadmap.
     */
    const sanitizedTopics = sanitizeTopics(parsed.topics);
    if (!sanitizedTopics) {
      console.error(
        'AI returned structurally invalid roadmap:',
        parsed
      );

      const topics = buildFallbackTopics(
        cleanGoal,
        normalizedLevel,
        normalizedOutcome
      );

      const totalEstimatedHours = topics.reduce(
        (total, topic) => total + topic.estimatedHours,
        0
      );

      return NextResponse.json({
        isValid: true,
        roadmapTitle: `${cleanGoal}: Learning Path`,
        estimatedWeeks: Math.max(
          1,
          Math.ceil(totalEstimatedHours / normalizedWeeklyHours)
        ),
        totalEstimatedHours,
        topics,
        fallback: true,
        reason: 'AI roadmap failed validation',
      } satisfies RoadmapResponse);
    }

    parsed.topics = sanitizedTopics;

    /*
     * Recalculate total hours ourselves.
     *
     * Never trust the model to perform arithmetic that the server can
     * calculate deterministically.
     */
    const totalEstimatedHours = parsed.topics.reduce(
      (total, topic) => total + topic.estimatedHours,
      0
    );

    const estimatedWeeks = Math.max(
      1,
      Math.ceil(totalEstimatedHours / normalizedWeeklyHours)
    );

    /*
     * Normalize server-controlled values.
     */
    parsed.isValid = true;
    parsed.totalEstimatedHours = totalEstimatedHours;
    parsed.estimatedWeeks = estimatedWeeks;

    if (!parsed.roadmapTitle?.trim()) {
      parsed.roadmapTitle = `${cleanGoal}: Learning Path`;
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Roadmap generation error:', error);

    /*
     * Use the already-parsed goal instead of calling request.json()
     * a second time.
     */
    const topics = buildFallbackTopics(
      cleanGoal,
      normalizedLevel,
      normalizedOutcome
    );

    const totalEstimatedHours = topics.reduce(
      (total, topic) => total + topic.estimatedHours,
      0
    );

    return NextResponse.json({
      isValid: true,
      roadmapTitle: `${cleanGoal}: Learning Path`,
      estimatedWeeks: Math.max(
        1,
        Math.ceil(totalEstimatedHours / normalizedWeeklyHours)
      ),
      totalEstimatedHours,
      topics,
      fallback: true,
      reason: 'Roadmap generation failed',
    } satisfies RoadmapResponse);
  }
}
