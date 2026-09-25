/**
 * Cleans an AI-generated lesson before it is cached or shown. JSON.parse
 * succeeding doesn't mean the UI can render it: a quiz question whose
 * correctIndex points outside its options breaks the quiz, a non-array
 * field breaks a .map(). Salvageable problems are fixed (bad quiz
 * questions dropped, lists coerced to string arrays); a lesson missing its
 * core teaching content returns null so the caller shows an honest failure.
 */
import { isValidQuizQuestion } from './reviewCards';

const strList = (v: unknown, max = 12): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);

export function normalizeLesson(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  if (!text(l.explanation) || !text(l.summary)) return null;

  const quiz = (Array.isArray(l.quiz) ? l.quiz : []).filter(isValidQuizQuestion).map((q) => ({
    question: q.question.trim(),
    options: q.options.map((o) => o.trim()),
    correctIndex: q.correctIndex,
    explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
  }));

  const recommendedResources = (Array.isArray(l.recommendedResources) ? l.recommendedResources : [])
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && text((r as Record<string, unknown>).title).length > 0)
    .map((r) => ({
      title: text(r.title),
      type: ['video', 'book', 'article', 'course', 'docs'].includes(text(r.type)) ? text(r.type) : 'article',
      searchQuery: text(r.searchQuery) || text(r.title),
      whyRecommended: text(r.whyRecommended),
    }))
    .slice(0, 4);

  const reviewCards = (Array.isArray(l.reviewCards) ? l.reviewCards : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({ concept: text(c.concept), prompt: text(c.prompt), answer: text(c.answer) }))
    .filter((c) => c.prompt && c.answer)
    .slice(0, 5);

  const sc = l.socraticChallenge && typeof l.socraticChallenge === 'object' ? (l.socraticChallenge as Record<string, unknown>) : null;
  const socraticChallenge = sc && text(sc.question) && text(sc.idealAnswer)
    ? { scenario: text(sc.scenario), question: text(sc.question), idealAnswer: text(sc.idealAnswer) }
    : undefined;

  return {
    ...l,
    title: text(l.title) || 'Lesson',
    summary: text(l.summary),
    explanation: text(l.explanation),
    codeOrExample: text(l.codeOrExample),
    learningObjectives: strList(l.learningObjectives),
    keyTakeaways: strList(l.keyTakeaways),
    commonMistakes: strList(l.commonMistakes),
    whenToUse: strList(l.whenToUse),
    whenNotToUse: strList(l.whenNotToUse),
    prerequisites: strList(l.prerequisites),
    quiz,
    recommendedResources,
    reviewCards,
    socraticChallenge,
  };
}
