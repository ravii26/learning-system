import type { Archetype } from './fieldGuide';

/**
 * How one lesson should teach, per kind of learning. A grammar lesson needs
 * many correct/incorrect examples and sentences to transform; a guitar
 * lesson needs finger-by-finger steps and a timed routine; a UPSC lesson
 * needs facts, PYQ-style questions and memory hooks. Used by the lesson
 * generator together with its general teaching rules.
 */
export const LESSON_GUIDE: Record<Archetype, string> = {
  language: `This is a LANGUAGE lesson. The learner learns by seeing many correct examples in real situations and then producing the language themselves.
- Teach the form with a simple pattern (e.g. "He/She/It + verb-s: She works in Pune."), then 6-10 example sentences from the learner's real situations (their job, interviews, daily life in India), not textbook filler about dogs and cats.
- Show correct vs incorrect pairs for the mistakes speakers of Indian languages actually make (e.g. "I am having two brothers" → "I have two brothers"; "He don't" → "He doesn't"; missing articles; "discuss about"). Explain WHY in one line each.
- Grammar terms must be exactly right. Check every label you use (subject, object, prepositional phrase, auxiliary, tense name). If unsure, describe it in plain words instead of labelling it.
- Include useful ready-made phrases/chunks the learner can reuse immediately.
- For pronunciation topics: describe mouth/tongue/lip position concretely, give minimal pairs, and simple respelling (e.g. "very = VEH-ree, upper teeth on lower lip").
- For speaking topics: give a model answer to copy the structure of, then a template with blanks.
- Exercises: at least 6: transform sentences, fix the mistake, fill the gap, turn an idea from their own situation into English, and at least 2 "say" tasks with a clear target ("Say it aloud 3 times, then without looking, in under 20 seconds").`,

  performance: `This is a HANDS-ON SKILL lesson (instrument, cooking, sport, drawing...). The learner learns by doing precise physical steps, slowly, with feedback.
- Give exact step-by-step instructions: which finger/hand/tool, where, how much, how long, at what heat/tempo. Use numbers (60 bpm, 2 tablespoons, medium flame for 3 minutes, frets 1-3).
- Describe what success looks, sounds, feels, smells or tastes like, and what each common failure looks like and how to fix it ("buzzing = finger too far from the fret, move it just behind the fret wire").
- Include safety notes where relevant (knives, hot oil, strain).
- End with a practice routine for today: warm-up, main drill with reps/tempo/time, and a short "real" application (a song section, a dish, a game drill).
- codeOrExample: a worked routine or recipe card with quantities/timings, or a tab/chord diagram in text.
- Exercises: "do" tasks with a measurable check (e.g. "Switch G→C 20 times in a minute without buzzing", "Dice one onion; pieces should be about 5 mm"), plus 2-3 "write" questions about diagnosing a problem.`,

  exam: `This is an EXAM-PREPARATION lesson. The learner must remember exact facts and apply them to exam-style questions.
- Teach the syllabus content with accurate facts: articles, dates, names, definitions, numbers, as a well-regarded standard source would. Never invent facts, statistics or case names; if something may have changed recently, say "verify the latest figure".
- Organise facts so they can be recalled: tables, comparisons, timelines, lists, and one memory hook where natural.
- Show how this topic is asked in the exam: typical question patterns and traps (e.g. "statement-based questions where one word makes it false").
- Exercises: 6-10 exam-style questions (statement MCQs for prelims, short-answer or numerical where the exam has them) with the answer and the reasoning/elimination.`,

  technical: `This is a TECHNICAL lesson. The learner learns by understanding the mechanism, tracing an example, then solving problems themselves.
- Explain the mechanism precisely and trace a concrete example step by step with real values.
- codeOrExample: correct, runnable code in the most suitable language, with input/output.
- Exercises: 4-6 problems of increasing difficulty ("solve" tasks with a precise expected output or complexity), plus 1-2 "predict the output / find the bug" tasks.`,

  professional: `This is a PROFESSIONAL-SKILL lesson. The learner learns by applying a framework to realistic work with real numbers and tools.
- Name the framework/metric exactly and show the formula or steps.
- Use a realistic Indian-market scenario with numbers (budgets in ₹, realistic CTRs, prices) and walk through the decision.
- Show what a good vs weak piece of work looks like (e.g. a weak ad headline vs a strong one, and why).
- Exercises: "write"/"do" tasks that produce real work output (write 3 ad headlines for X, calculate ROAS for these numbers, set up Y in the tool), with a model answer.`,

  creative: `This is a CREATIVE-SKILL lesson. The learner learns by studying the principle in real examples, then making something under a constraint.
- Explain the principle and show it in 2-3 concrete described examples (a described photo, a short passage written by you, a layout).
- Give a step-by-step technique (settings, tool steps, writing moves).
- Exercises: 2-4 "do" tasks that make something small with a clear constraint and a self-critique checklist, plus 1-2 "write" analysis questions.`,

  academic: `This is an ACADEMIC lesson. The learner learns by building the idea from intuition to precise statement, then applying it.
- Build intuition, then the precise definition/law/formula, then worked examples (with numbers where the subject is quantitative).
- Exercises: 5-8 questions mixing explanation, application and (where relevant) numericals with full worked answers.`,
};

/** JSON the lesson prompt asks for, for its "exercises" field. */
export const EXERCISES_JSON = `"exercises": [
    {
      "type": "write | say | do | solve",
      "instruction": "What to do, e.g. 'Rewrite in the past simple' or 'Say this aloud 3 times, then from memory'",
      "prompt": "The actual item: the sentence to fix, the question, the task",
      "answer": "The model answer, or for 'do'/'say' tasks what success looks like and how to check it",
      "hint": "Optional one-line hint"
    }
  ],`;

export const EXERCISE_TYPES = ['write', 'say', 'do', 'solve'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export interface LessonExercise {
  type: ExerciseType;
  instruction: string;
  prompt: string;
  answer: string;
  hint?: string;
}

export function normalizeExercises(v: unknown): LessonExercise[] {
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
  return (Array.isArray(v) ? v : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      type: (EXERCISE_TYPES as readonly string[]).includes(text(e.type, 10)) ? (text(e.type, 10) as ExerciseType) : 'write',
      instruction: text(e.instruction, 300),
      prompt: text(e.prompt, 1500),
      answer: text(e.answer, 2000),
      ...(text(e.hint, 300) ? { hint: text(e.hint, 300) } : {}),
    }))
    .filter((e) => (e.prompt || e.instruction) && e.answer)
    .slice(0, 12);
}
