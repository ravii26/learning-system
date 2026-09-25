/**
 * Builds the learner context the lesson prompt already has slots for
 * (learner level, prior knowledge, weaknesses, recent mistakes) from what
 * the app actually knows, plus where the module sits in the course — so a
 * lesson builds on earlier modules instead of re-teaching them, and
 * addresses what you actually got wrong. Pure; the route loads the rows.
 */

export interface ModuleRef {
  legacyId: string;
  order: number;
  title: string;
  completed: boolean;
}

export interface AttemptRef {
  moduleId: string;
  kind: string;
  verdict: string | null;
  details: unknown;
}

export interface LessonContext {
  learnerLevel: string;
  priorKnowledge: string;
  knownWeaknesses: string[];
  recentMistakes: string[];
  coursePosition: string;
}

const MAX_ITEMS = 5;
const clip = (s: string, max = 220) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function mapLearnerLevel(contractLevel: unknown): string {
  const l = str(contractLevel).toLowerCase();
  if (l.startsWith('adv')) return 'advanced';
  if (l.startsWith('inter')) return 'intermediate';
  return 'beginner';
}

export function buildLessonContext(input: {
  modules: ModuleRef[];
  moduleId: string | undefined;
  contractLevel?: unknown;
  attempts?: AttemptRef[]; // newest first
  confusions?: Array<{ text: string; resolved: boolean }>;
  mistakes?: Array<{ mistake: string }>;
}): LessonContext {
  const modules = [...input.modules].sort((a, b) => a.order - b.order);
  const idx = modules.findIndex((m) => m.legacyId === input.moduleId);

  let coursePosition = '';
  if (idx >= 0) {
    const earlier = modules.slice(0, idx).map((m) => m.title);
    const next = modules[idx + 1]?.title;
    coursePosition = [
      `This is module ${idx + 1} of ${modules.length} in the course.`,
      earlier.length ? `Earlier modules (the learner has these as background — build on them, do not re-teach them): ${earlier.join('; ')}.` : 'This is the first module — assume no earlier modules.',
      next ? `The next module is "${next}" — do not teach it here; you may briefly point to it.` : 'This is the final module — it may tie earlier ideas together.',
    ].join('\n');
  }

  const completed = modules.filter((m) => m.completed && m.legacyId !== input.moduleId).map((m) => m.title);
  const priorKnowledge = completed.length ? `Has completed these modules in this course: ${completed.join('; ')}.` : '';

  const attempts = input.attempts ?? [];
  const challengeMisses = attempts
    .filter((a) => a.kind === 'challenge' && (a.verdict === 'partial' || a.verdict === 'incorrect'))
    .map((a) => str((a.details as Record<string, unknown> | null)?.missed))
    .filter(Boolean);
  const openConfusions = (input.confusions ?? []).filter((c) => !c.resolved).map((c) => str(c.text)).filter(Boolean);
  const knownWeaknesses = [...challengeMisses, ...openConfusions].slice(0, MAX_ITEMS).map((s) => clip(s));

  const quizMisses = attempts
    .filter((a) => a.kind === 'quiz' && Array.isArray(a.details))
    .flatMap((a) => (a.details as Array<Record<string, unknown>>).filter((d) => d && d.isCorrect === false))
    .map((d) => {
      const q = str(d.question);
      const chosen = str(d.chosen);
      return q ? (chosen ? `Answered "${chosen}" to: ${q}` : q) : '';
    })
    .filter(Boolean);
  const loggedMistakes = (input.mistakes ?? []).map((m) => str(m.mistake)).filter(Boolean);
  const recentMistakes = [...quizMisses, ...loggedMistakes].slice(0, MAX_ITEMS).map((s) => clip(s));

  return { learnerLevel: mapLearnerLevel(input.contractLevel), priorKnowledge, knownWeaknesses, recentMistakes, coursePosition };
}
