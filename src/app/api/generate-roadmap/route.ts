import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { callGroqContent } from '@/lib/ai/groqClient';

export interface GeneratedTopic {
  title: string;
  area: 'Tech' | 'Business' | 'Finance' | 'Creative' | 'Personal' | 'Other' | string;
  why: string;
  depthTarget: 'Awareness' | 'Working Knowledge' | 'Proficiency' | 'Deep' | 'Mastery';
  estimatedHours: number;
  nextAction: string;
  mode: 'self_directed' | 'course';
  curriculum?: string[]; // Detailed module breakdown
}

export interface RoadmapResponse {
  isValid: boolean;
  invalidReason?: string;
  suggestions?: string[];
  roadmapTitle?: string;
  estimatedWeeks?: number;
  topics?: GeneratedTopic[];
  fallback?: boolean;
}

const TEMPLATE_FALLBACKS: Record<string, GeneratedTopic[]> = {
  default: [
    {
      title: 'Foundations & Core Principles',
      area: 'Tech',
      why: 'Master core concepts and mental models before building complex applications.',
      depthTarget: 'Working Knowledge',
      estimatedHours: 8,
      nextAction: 'Review foundational concepts and complete the setup checklist',
      mode: 'course',
      curriculum: [
        'Module 1: Domain Terminology & Mental Models',
        'Module 2: Tooling & Development Environment Setup',
        'Module 3: Fundamental Syntax & Core Mechanics',
      ],
    },
    {
      title: 'Core Practice & Structured Exercises',
      area: 'Tech',
      why: 'Develop practical fluency through structured hands-on drills and guided exercises.',
      depthTarget: 'Proficiency',
      estimatedHours: 12,
      nextAction: 'Complete guided practice exercise set 1',
      mode: 'course',
      curriculum: [
        'Module 1: Guided Implementation Patterns',
        'Module 2: Error Handling & Debugging Techniques',
        'Module 3: Real-World Scenarios & Workflows',
      ],
    },
    {
      title: 'Intermediate Concepts & Design Patterns',
      area: 'Tech',
      why: 'Learn industry best practices, patterns, and component architecture.',
      depthTarget: 'Proficiency',
      estimatedHours: 15,
      nextAction: 'Architect a modular prototype following design principles',
      mode: 'course',
      curriculum: [
        'Module 1: Scalable Architecture Patterns',
        'Module 2: State & Data Management',
        'Module 3: Integration & External APIs',
      ],
    },
    {
      title: 'Real-World Project & Capstone Application',
      area: 'Tech',
      why: 'Apply skills independently to solve realistic problems and create tangible proof of learning.',
      depthTarget: 'Deep',
      estimatedHours: 20,
      nextAction: 'Draft capstone project specification and core feature breakdown',
      mode: 'self_directed',
      curriculum: [
        'Module 1: Project Scoping & Architecture Specification',
        'Module 2: Core Feature Implementation',
        'Module 3: Testing, Refactoring & Deployment',
      ],
    },
  ],
};

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { goal, currentLevel = 'beginner', desiredOutcome = '', weeklyHours = 5 } = body;

    if (!goal || !goal.trim()) {
      return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        isValid: true,
        topics: TEMPLATE_FALLBACKS.default,
        estimatedWeeks: 8,
        roadmapTitle: `${goal} Learning Path`,
        fallback: true,
      } as RoadmapResponse);
    }

    const systemPrompt = `You are a World-Class Principal Curriculum Designer and Educational Master Agent.
Your job is to analyze user learning requests across ANY domain (Technology, Software, Business, Finance, Languages, Creative Arts, Music, Sciences, Personal Development, Cooking, Fitness, etc.) and generate a structured, highly actionable, expert-level learning roadmap.

INPUT VALIDATION RULES:
1. Assess if the user's input "${goal}" is a valid, meaningful learning topic or goal.
2. If the input is nonsense, random characters (e.g. "asdfgh"), gibberish, offensive, or completely non-learning related:
   Set "isValid": false, provide a clear "invalidReason" (e.g., "The input provided appears to be random text. Please enter a specific subject or skill you wish to learn."), and provide 3 helpful "suggestions" for valid learning topics.
3. If the input is valid, set "isValid": true.

CURRICULUM DESIGN RULES (when isValid is true):
1. Domain Classification: Classify the topic area into one of ["Tech", "Business", "Finance", "Creative", "Personal", "Other"].
2. Starting Level Adaptation:
   - "beginner": Start with essential terminology, core principles, environment setup, and fundamental mechanics.
   - "intermediate": Skip trivial basics; jump into core practical patterns, workflow efficiency, and intermediate techniques.
   - "experienced": Focus on advanced patterns, production readiness, optimization, edge cases, and architectural design.
   - "advanced": Focus on expert specialization, deep internal mechanics, performance tuning, and cutting-edge paradigms.
3. Quantity & Progression: Generate 5 to 8 logically sequential topics ordered from foundational to capstone/mastery.
4. Rich Module Breakdown: For EVERY topic, provide 3 to 5 clear, concrete sub-modules in the "curriculum" array.
5. Mode Selection: Set "mode" to "course" (structured curriculum) for foundational and guided topics, and "self_directed" (exploratory project) for capstone/independent building.
6. Actionable Next Step: Provide a verb-first, concrete "nextAction" for each topic (e.g., "Set up Expo CLI and create a new TypeScript starter project").
7. Time Estimation: Estimate realistic study hours per topic ("estimatedHours", e.g. 6 to 25 hours per topic). Calculate total "estimatedWeeks" based on total hours divided by the user's ${weeklyHours} hours/week availability.

RETURN ONLY VALID JSON WITH NO EXTRA TEXT OR MARKDOWN.
JSON Output Format:
{
  "isValid": true,
  "invalidReason": "",
  "suggestions": [],
  "roadmapTitle": "Specific & Engaging Title for the Learning Path",
  "estimatedWeeks": 10,
  "topics": [
    {
      "title": "Clear Topic Title",
      "area": "Tech",
      "why": "Why this specific topic is essential at this stage of the learning path",
      "depthTarget": "Working Knowledge",
      "estimatedHours": 10,
      "nextAction": "Concrete verb-first first step",
      "mode": "course",
      "curriculum": [
        "Module 1: Specific Sub-topic",
        "Module 2: Specific Sub-topic",
        "Module 3: Practical Exercise"
      ]
    }
  ]
}`;

    const userPrompt = `Learning Goal: "${goal}"
Current Level: "${currentLevel}"
Desired Outcome: "${desiredOutcome || 'Gain practical mastery and real-world competence'}"
Study Time Available: ${weeklyHours} hours/week

Generate the complete JSON learning path following all validation and curriculum design rules.`;

    const rawContent = await callGroqContent(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.3 });
    const parsed: RoadmapResponse = JSON.parse(rawContent);

    // Validate parsed output structure
    if (parsed.isValid === false) {
      return NextResponse.json(parsed);
    }

    // Ensure topics array is valid and enriched
    if (!parsed.topics || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
      parsed.topics = TEMPLATE_FALLBACKS.default;
    }

    // Ensure calculated estimated weeks if missing
    if (!parsed.estimatedWeeks) {
      const totalHours = parsed.topics.reduce((acc, t) => acc + (t.estimatedHours || 10), 0);
      parsed.estimatedWeeks = Math.max(1, Math.ceil(totalHours / (weeklyHours || 5)));
    }

    parsed.isValid = true;
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Roadmap generation error:', error);
    // Fallback response
    return NextResponse.json({
      isValid: true,
      roadmapTitle: `${request.headers.get('x-goal') || 'Custom'} Learning Path`,
      estimatedWeeks: 8,
      topics: TEMPLATE_FALLBACKS.default,
      fallback: true,
    } as RoadmapResponse);
  }
}
