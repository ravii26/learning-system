import type { AIMessage } from '@/lib/ai/aiClient';
import type { Archetype } from './fieldGuide';

/**
 * Daily practice sessions for practice topics (speaking, an instrument,
 * mock tests...). Each day is new, builds on the days before, brings back
 * earlier material for spaced review, and gets harder or easier depending
 * on how the learner rated recent days. Generated a few days at a time so
 * it can adapt, and because a long batch would keep the learner waiting.
 */

export const SESSION_BATCH = 3;
export const STEP_KINDS = ['warmup', 'input', 'drill', 'speak', 'write', 'do', 'review'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const RATINGS = ['easy', 'right', 'hard'] as const;
export type SessionRating = (typeof RATINGS)[number];

export interface SessionItem { text: string; answer?: string }
export interface SessionStep {
  kind: StepKind;
  title: string;
  minutes: number;
  instructions: string;
  items: SessionItem[];
  target?: string;
}
export interface SessionContent { goal: string; steps: SessionStep[]; successCheck: string }
export interface DraftSession { day: number; title: string; focus: string | null; minutes: number; content: SessionContent }

export interface SessionHistory { day: number; title: string; status: string; rating?: string | null; notes?: string | null; feedback?: string[] }

export interface SessionContext {
  archetype: Archetype;
  field: string;
  goal: string;
  level: string;
  answers: { question: string; answer: string }[];
  topicTitle: string;
  /** What this practice topic trains, in plan order. */
  competencies: { key: string; title: string; summary: string; drills: string[] }[];
  minutesPerSession: number;
  fromDay: number;
  count: number;
  history: SessionHistory[];
}

const SESSION_GUIDE: Record<Archetype, string> = {
  language: `A language practice day (about 5 days a week) usually has:
1. warmup (3-5 min): read aloud / shadow a SHORT passage you write (60-120 words, natural spoken English on their situation), with 1-2 pronunciation points to watch.
2. input (3-5 min): 5-8 useful phrases or chunks for today's focus, each with an example sentence from their life.
3. drill (5-8 min): 6-10 quick transformation or completion items WITH answers (recycle earlier days' grammar and phrases too).
4. speak (5-10 min): 1-3 timed speaking tasks with a concrete prompt from their real situation, a target (e.g. "90 seconds, use 3 of today's phrases, no pause longer than 3 seconds") and a model answer. Use techniques like 4/3/2 retelling (same talk in 4, then 3, then 2 minutes), shadowing, picture/situation description, role-play questions.
5. review (2-3 min): recall 3-5 items from earlier days (spaced repetition) and note today's own mistakes.`,
  performance: `A hands-on practice day usually has:
1. warmup (3-5 min): physical warm-up specific to the skill (finger stretches, spider exercise at 60 bpm, knife warm-up...).
2. drill (8-15 min): 1-2 technique drills with exact tempo/reps/time and a measurable target, slightly harder than the last day rated "right".
3. do (5-15 min): apply it: a specific song section/dish/game drill/piece, named, with what to focus on.
4. review (2-3 min): record yourself or check against the success criteria; one thing to fix tomorrow.
Say exactly what to do (fingers, bpm, quantities, heat, reps) and what success sounds/looks/tastes like.`,
  exam: `An exam practice day usually has:
1. warmup (3-5 min): 5 quick recall questions from earlier days' topics (with answers).
2. drill (10-20 min): a timed set of 8-15 exam-style questions on today's focus, written out in full with answers and one-line explanations. Match the exam's real question style.
3. review (5 min): error log: classify each miss (didn't know / misread / silly / time) and what to revise.
Every few days make it a longer timed sectional test.`,
  technical: `A technical practice day usually has:
1. warmup (3-5 min): recall 3 patterns/ideas from earlier days.
2. drill (15-30 min): 1-3 problems on today's pattern, fully stated with examples and expected outputs, easy → harder; include a hint and the key idea as the answer.
3. review (3-5 min): write down the pattern in one line and the mistake you made.`,
  professional: `A professional-skill practice day usually has:
1. input (3-5 min): one concrete example of good work for today's focus.
2. do (10-20 min): a realistic small work task with real numbers or a real brief, and a model answer/checklist.
3. review (3 min): self-check against the checklist; one improvement.`,
  creative: `A creative practice day usually has:
1. warmup (3-5 min): a quick loosening exercise.
2. do (10-25 min): make one small piece under a clear constraint tied to today's principle.
3. review (3-5 min): critique it against a 3-point checklist; note one thing to try tomorrow.`,
  academic: `An academic practice day usually has:
1. warmup (3 min): recall 3 ideas from earlier days.
2. drill (10-20 min): 5-10 questions/problems on today's focus with full worked answers.
3. write (5 min): explain today's idea in your own words in 3-5 sentences, with a model explanation to compare.`,
};

const SESSION_JSON = `{
  "sessions": [
    {
      "day": <number>,
      "title": "<specific, e.g. 'Past simple: telling your project story in 2 minutes'>",
      "focus": "<competency key this day mainly trains>",
      "minutes": <number>,
      "goal": "<By the end of today you can ... (measurable)>",
      "steps": [
        {
          "kind": "warmup|input|drill|speak|write|do|review",
          "title": "<short>",
          "minutes": <number>,
          "instructions": "<exactly what to do, in markdown>",
          "items": [ { "text": "<the actual sentence / phrase / question / task / passage>", "answer": "<model answer, or empty>" } ],
          "target": "<measurable target for this step, or empty>"
        }
      ],
      "successCheck": "<how the learner knows today worked>"
    }
  ]
}`;

export function buildSessionMessages(c: SessionContext): AIMessage[] {
  const history = c.history.length
    ? c.history.slice(-10).map((h) => `Day ${h.day}: ${h.title} — ${h.status}${h.rating ? `, felt ${h.rating === 'right' ? 'about right' : `too ${h.rating}`}` : ''}${h.notes ? `; their note: "${h.notes.slice(0, 200)}"` : ''}${h.feedback?.length ? `; mistakes seen: ${h.feedback.slice(0, 3).join(' | ').slice(0, 400)}` : ''}`).join('\n')
    : 'None yet: this is the start. Begin gently and build confidence.';
  const comps = c.competencies.map((x) => `- ${x.key}: ${x.title} — ${x.summary}${x.drills.length ? `\n    drills: ${x.drills.join('; ')}` : ''}`).join('\n');
  return [
    {
      role: 'system',
      content: 'You are an expert coach who writes a learner\'s daily practice sessions. Every session contains the actual material (real sentences, passages, questions, tempos, quantities), never "find a video" or "practise some sentences". Every answer you give is correct. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `LEARNER
Goal: ${c.goal} (plan: ${c.field}). Level: ${c.level}.
${c.answers.map((a) => `${a.question} → ${a.answer}`).join('\n')}

THIS PRACTICE TRACK: "${c.topicTitle}". It trains, in this order:
${comps}

WHAT A GOOD SESSION LOOKS LIKE
${SESSION_GUIDE[c.archetype]}

SESSIONS SO FAR
${history}

Write days ${c.fromDay} to ${c.fromDay + c.count - 1}, each about ${c.minutesPerSession} minutes (step minutes add up to it).
Rules:
- Progress: move through the competencies in order, spending several days on each, and build on what came before. If recent days felt too hard, consolidate at the same level with more support; if too easy, raise the challenge (longer, faster, less support, harder items).
- Spaced review: about a quarter of each day brings back earlier material, especially mistakes seen.
- Personal: use their situation (job, exam, songs, food...) for prompts and examples.
- Concrete: write out every sentence, passage, question and model answer in full. No placeholders.
- Speaking and writing steps need a clear prompt, a target and a model answer so their answer can be checked.
- Every item must be something this learner would really need to say, do or answer for their goal. No mechanical transformations that produce useless or odd results (e.g. never make an interview candidate practise "I'm not excited about this opportunity").
- Model answers use the learner's own background from their answers above (their degree, city, job, exam), or "[your ...]" slots where you don't know a detail. Never invent a different person's name or profile for them to copy.
- Return exactly ${c.count} sessions, days ${c.fromDay} to ${c.fromDay + c.count - 1}, each within 5 minutes of ${c.minutesPerSession} minutes.

Return JSON:
${SESSION_JSON}`,
    },
  ];
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Keeps only well-formed sessions for the requested days; numbers them from fromDay whatever the AI wrote. */
export function parseSessions(raw: string, fromDay: number, count: number, keys: string[], minutes: number): DraftSession[] {
  let j: any;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  const list: any[] = Array.isArray(j?.sessions) ? j.sessions : Array.isArray(j) ? j : [];
  const out: DraftSession[] = [];
  for (const s of list) {
    if (out.length >= count) break;
    const steps: SessionStep[] = (Array.isArray(s?.steps) ? s.steps : [])
      .map((st: any) => ({
        kind: (STEP_KINDS as readonly string[]).includes(st?.kind) ? st.kind : 'drill',
        title: clean(st?.title, 120) || 'Practice',
        minutes: Math.max(1, Math.min(60, Math.round(Number(st?.minutes) || 5))),
        instructions: clean(st?.instructions, 3000),
        items: (Array.isArray(st?.items) ? st.items : [])
          .map((it: any) => (typeof it === 'string' ? { text: clean(it, 1500) } : { text: clean(it?.text, 1500), ...(clean(it?.answer, 2000) ? { answer: clean(it?.answer, 2000) } : {}) }))
          .filter((it: SessionItem) => it.text)
          .slice(0, 20),
        ...(clean(st?.target, 300) ? { target: clean(st?.target, 300) } : {}),
      }))
      .filter((st: SessionStep) => st.instructions || st.items.length)
      .slice(0, 8);
    const title = clean(s?.title, 160);
    if (!title || steps.length === 0) continue;
    // A day far shorter than planned is a cut-off or lazy reply: leave it out so it's written again.
    const total = steps.reduce((m, st) => m + st.minutes, 0);
    if (total < minutes * 0.5) continue;
    const focus = clean(s?.focus, 60);
    out.push({
      day: fromDay + out.length,
      title,
      focus: keys.includes(focus) ? focus : null,
      minutes: steps.reduce((m, st) => m + st.minutes, 0) || minutes,
      content: { goal: clean(s?.goal, 400), steps, successCheck: clean(s?.successCheck, 400) },
    });
  }
  return out;
}

/** Session length from the plan's weekly hours for this item, assuming about 5 practice days a week. */
export function minutesPerSession(hoursPerWeek: number | null | undefined): number {
  const m = Math.round(((hoursPerWeek ?? 2) * 60) / 5 / 5) * 5;
  return Math.max(10, Math.min(60, m || 20));
}

/** How a finished session feeds the practice score (self-reported, like other reps). */
export const RATING_SCORE: Record<SessionRating, number> = { easy: 0.9, right: 0.75, hard: 0.55 };
