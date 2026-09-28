import type { AIMessage } from '@/lib/ai/aiClient';
import { ARCHETYPES, ARCHETYPE_GUIDE, guessArchetype, isArchetype, type Archetype } from './fieldGuide';

/**
 * Before drafting, ask what a good teacher would ask on day one: "Speaking
 * for what situation?", "What's hardest: freezing, grammar or words?",
 * "Which exam year?". Without these the plan can only be generic.
 */

export interface GoalQuestion {
  id: string;
  question: string;
  options: string[];
  /** More than one answer can apply ("Which of these do you struggle with?"). */
  multi: boolean;
}

export interface GoalQuestions {
  archetype: Archetype;
  /** A clean name for the field, e.g. "Spoken English for job interviews". */
  fieldTitle: string;
  questions: GoalQuestion[];
}

export const MAX_QUESTIONS = 5;

export function buildQuestionMessages(goal: string): AIMessage[] {
  const guides = ARCHETYPES.map((a) => `- ${a}: ${ARCHETYPE_GUIDE[a].split('\n')[0]}`).join('\n');
  return [
    {
      role: 'system',
      content: 'You are an experienced teacher meeting a new student. Before planning anything, you ask the few questions whose answers would most change what you teach them. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `The student says they want: "${goal}"

1. Classify the goal into one kind:
${guides}

2. Write 3 to ${MAX_QUESTIONS} short multiple-choice questions whose answers would CHANGE the plan's content, not just its pace. Ask about:
- the exact situation or purpose (e.g. English for job interviews vs office meetings vs IELTS vs daily life; guitar for strumming songs vs fingerstyle vs classical; which exam and which attempt/year)
- what they can already do, described concretely (e.g. "I can read but freeze when speaking", "I know 3 chords", "I have done NCERTs once")
- their biggest difficulty (e.g. freezing, grammar mistakes, small vocabulary, accent; chord changes; time in the paper)
- anything that changes the content (their first language for language goals; their stream/background; the tools they have; vegetarian or not for cooking)
Do NOT ask about hours per week, deadline, budget or level labels like beginner/intermediate: those are asked separately.
Each question has 3 to 6 short, concrete options a real person would pick. The student can also type their own answer.

Return JSON:
{
  "archetype": "${ARCHETYPES.join('|')}",
  "fieldTitle": "<clean short name of what they are learning, e.g. Spoken English for job interviews>",
  "questions": [
    { "id": "<short_snake_case>", "question": "<question>", "options": ["<option>", "..."], "multi": false }
  ]
}`,
    },
  ];
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function parseQuestions(raw: string, goal: string): GoalQuestions {
  let j: any = null;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    j = null;
  }
  const archetype = isArchetype(j?.archetype) ? j.archetype : guessArchetype(goal);
  const seen = new Set<string>();
  const questions: GoalQuestion[] = (Array.isArray(j?.questions) ? j.questions : [])
    .map((q: any, i: number) => {
      const question = clean(q?.question, 160);
      // The screen always has its own "in your own words" box, so drop the AI's "Other" options.
      const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => clean(o, 90)).filter((o: string) => o && !/^other\b/i.test(o)).slice(0, 6);
      let id = clean(q?.id, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_') || `q${i + 1}`;
      while (seen.has(id)) id = `${id}_2`;
      seen.add(id);
      return { id, question, options: Array.from(new Set(options)), multi: q?.multi === true };
    })
    .filter((q: GoalQuestion) => q.question && q.options.length >= 2)
    .slice(0, MAX_QUESTIONS);
  return { archetype, fieldTitle: clean(j?.fieldTitle, 80) || goal.slice(0, 80), questions };
}

/** Normalises answers sent from the client into question/answer pairs. */
export function parseAnswers(v: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((a: any) => ({ question: clean(a?.question, 160), answer: clean(a?.answer, 300) }))
    .filter((a) => a.question && a.answer)
    .slice(0, MAX_QUESTIONS + 2);
}
