import { LESSON_KINDS, guessLessonKind, isLessonKind, type LessonKind } from './lessonKinds';

/**
 * Which shape each lesson of a new goal or plan should have. The AI labels
 * every lesson when it lists them; anything it gets wrong or leaves out falls
 * back to the free keyword guess (guessLessonKind), and then to "concept",
 * which is how every lesson was written before kinds existed.
 */

/** One line per kind for the lesson-listing prompts: what the lesson lets the learner do. */
const KIND_PURPOSE: Record<LessonKind, string> = {
  concept: 'explain how or why something works',
  decision: 'compare options and choose between them',
  survey: 'map a field: what exists and where to start',
  roadmap: 'a path: what to learn, in what order',
  case_study: 'learn from a real example or case',
  drill: 'practise a skill with repetitions',
  memorise: 'facts, words or formulas to recall',
  exam_prep: 'how an exam or interview asks it, the traps and the strategy',
  project: 'build something, step by step',
  resource: 'work through one book, course or paper',
  explore: 'open-ended browsing of a topic',
};

/** Prompt text: the allowed kinds and how to choose. */
export const KIND_PROMPT_GUIDE = `Lesson kinds (use exactly these words):
${LESSON_KINDS.map((k) => `- ${k}: ${KIND_PURPOSE[k]}`).join('\n')}
Choose the kind by what the lesson makes the learner able to DO. Most lessons are "concept"; pick another kind only when the lesson clearly has that purpose (for example "Choosing a database: SQL vs NoSQL" is "decision"). Never vary kinds just for variety.`;

/** Accepts "decision", "Decision", "case study", "case-study", "Exam prep". */
export function parseKindName(v: unknown): LessonKind | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return isLessonKind(k) ? k : null;
}

/** The AI's label if it is a real kind, else the free keyword guess, else "concept". */
export function resolveModuleKind(aiKind: unknown, title: string): LessonKind {
  return parseKindName(aiKind) ?? guessLessonKind(title);
}

/**
 * From lesson items that are either plain titles or `{ title, kind }`,
 * the labels the AI gave, keyed by title. Keyed by title (not position) so
 * a learner who edits, renames or reorders lessons keeps the right labels
 * on the lessons they did not touch, and the rest fall back.
 */
export function kindsByTitle(items: unknown, cleanTitle: (t: string) => string = (t) => t): Record<string, LessonKind> {
  const out: Record<string, LessonKind> = {};
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const kind = parseKindName(o.kind);
    const title = typeof o.title === 'string' ? cleanTitle(o.title) : '';
    if (kind && title) out[title] = kind;
  }
  return out;
}

/** A stored `{ title: kind }` record with anything invalid dropped. */
export function kindsFromRecord(v: unknown): Record<string, LessonKind> {
  const out: Record<string, LessonKind> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [title, kind] of Object.entries(v as Record<string, unknown>)) {
    const k = parseKindName(kind);
    if (k) out[title] = k;
  }
  return out;
}
