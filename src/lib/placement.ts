import type { AIMessage } from './ai/aiClient';
import type { ReviewCardDraft } from './reviewCards';

/**
 * The placement check: a short quiz across a syllabus before you start, so
 * modules you already know begin as solid instead of making you relearn
 * them. A module passes only when every one of its questions is right.
 * Passed modules get review cards seeded as "recalled once, a week of
 * stability" — they show solid now, come due in 7 days to confirm the
 * claim, and fade if that review is skipped.
 */

export const MAX_QUESTIONS = 14;
/** Days until a placed-out module's cards come due. */
export const PLACEMENT_STABILITY_DAYS = 7;

export interface PlacementModule {
  id: string;
  title: string;
}

export interface PlacementQuestion {
  moduleId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** Two questions per module when the syllabus is short, one when it's long; never more than MAX_QUESTIONS. */
export function questionsPerModule(moduleCount: number): number {
  if (moduleCount <= 0) return 0;
  return moduleCount * 2 <= MAX_QUESTIONS ? 2 : 1;
}

/** Modules to test, in syllabus order, capped so the check stays short. */
export function planPlacement(modules: PlacementModule[]): { modules: PlacementModule[]; perModule: number } {
  const perModule = questionsPerModule(modules.length);
  const capped = perModule === 1 ? modules.slice(0, MAX_QUESTIONS) : modules;
  return { modules: capped, perModule };
}

export function buildPlacementMessages(
  topicTitle: string,
  depthTarget: string | null,
  plan: { modules: PlacementModule[]; perModule: number }
): AIMessage[] {
  const list = plan.modules.map((m) => `- id=${m.id} | ${m.title}`).join('\n');
  const system = `You write a placement check: a short multiple-choice test that tells whether a learner already knows each module of a course, so they can skip what they know.
Rules:
- Exactly ${plan.perModule} question${plan.perModule === 1 ? '' : 's'} per module, testing the core idea of that module, not trivia or wording.
- Each question needs real understanding to answer: a scenario, a "why", or a prediction. Someone who only skimmed the module should get it wrong.
- 4 options each, one clearly correct, three plausible mistakes a learner would actually make. Vary the position of the correct option.
- explanation: one sentence saying why the correct option is right.
- Use the module ids exactly as given.
Return JSON only: {"questions":[{"moduleId":"…","question":"…","options":["…","…","…","…"],"correctIndex":0,"explanation":"…"}]}`;
  const user = `Course: ${topicTitle}${depthTarget ? `\nTarget depth: ${depthTarget}` : ''}\nModules:\n${list}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Keeps only well-formed questions for the planned modules, at most perModule each, in syllabus order. */
export function parsePlacement(raw: string, plan: { modules: PlacementModule[]; perModule: number }): PlacementQuestion[] {
  let list: unknown[] = [];
  try {
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
  } catch {
    return [];
  }
  const allowed = new Set(plan.modules.map((m) => m.id));
  const byModule = new Map<string, PlacementQuestion[]>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const moduleId = clean(q.moduleId);
    const question = clean(q.question);
    const options = Array.isArray(q.options) ? q.options.map(clean).filter(Boolean) : [];
    const correctIndex = Number(q.correctIndex);
    if (!allowed.has(moduleId) || !question || options.length < 2 || options.length > 6) continue;
    if (new Set(options).size !== options.length) continue;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue;
    const bucket = byModule.get(moduleId) ?? [];
    if (bucket.length >= plan.perModule) continue;
    bucket.push({ moduleId, question, options, correctIndex, explanation: clean(q.explanation) });
    byModule.set(moduleId, bucket);
  }
  return plan.modules.flatMap((m) => byModule.get(m.id) ?? []);
}

export interface ModulePlacementResult {
  moduleId: string;
  correct: number;
  total: number;
  passed: boolean;
}

/** `answers[i]` is the option chosen for question i; unanswered counts as wrong. */
export function gradePlacement(questions: PlacementQuestion[], answers: Record<number, number>): ModulePlacementResult[] {
  const results = new Map<string, ModulePlacementResult>();
  questions.forEach((q, i) => {
    const r = results.get(q.moduleId) ?? { moduleId: q.moduleId, correct: 0, total: 0, passed: false };
    r.total += 1;
    if (answers[i] === q.correctIndex) r.correct += 1;
    results.set(q.moduleId, r);
  });
  return Array.from(results.values()).map((r) => ({ ...r, passed: r.total > 0 && r.correct === r.total }));
}

export function placementCard(q: PlacementQuestion): ReviewCardDraft {
  const answer = q.options[q.correctIndex];
  return {
    title: q.question.length > 70 ? `${q.question.slice(0, 69).trimEnd()}…` : q.question,
    prompt: q.question,
    answer: q.explanation ? `${answer}. ${q.explanation}` : answer,
    sourceKind: 'placement',
  };
}
