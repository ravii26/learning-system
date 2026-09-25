/**
 * Turns what you studied into Daily Review cards (Concept rows with a
 * prompt and answer). Two sources:
 *  - completing a module: the lesson's own reviewCards if the AI produced
 *    them, else its quiz questions (asked as open recall — no options),
 *    else its key takeaways as "why is this true?" prompts;
 *  - a checked quiz: every question you got wrong, so it comes back soon.
 * Pure; the API route handles persistence and de-duplication by prompt.
 */

export interface ReviewCardDraft {
  title: string; // short label shown in lists
  prompt: string; // the question you answer from memory
  answer: string; // what you check yourself against
  sourceKind: 'lesson_card' | 'quiz' | 'takeaway' | 'quiz_miss';
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

const MAX_CARDS = 5;
const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const shortTitle = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export function isValidQuizQuestion(q: unknown): q is QuizQuestion {
  if (!q || typeof q !== 'object') return false;
  const x = q as Record<string, unknown>;
  return (
    clean(x.question).length > 0 &&
    Array.isArray(x.options) &&
    x.options.length >= 2 &&
    x.options.every((o) => clean(o).length > 0) &&
    Number.isInteger(x.correctIndex) &&
    (x.correctIndex as number) >= 0 &&
    (x.correctIndex as number) < x.options.length
  );
}

function quizToCard(q: QuizQuestion, sourceKind: 'quiz' | 'quiz_miss'): ReviewCardDraft {
  const correct = clean(q.options[q.correctIndex]);
  const why = clean(q.explanation);
  return {
    title: shortTitle(clean(q.question)),
    prompt: clean(q.question),
    answer: why ? `${correct} — ${why}` : correct,
    sourceKind,
  };
}

export function buildModuleReviewCards(lesson: unknown, moduleTitle: string): ReviewCardDraft[] {
  const l = (lesson && typeof lesson === 'object' ? lesson : {}) as Record<string, unknown>;

  const fromCards = (Array.isArray(l.reviewCards) ? l.reviewCards : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .filter((c) => clean(c.prompt) && clean(c.answer))
    .map((c) => ({
      title: shortTitle(clean(c.concept) || clean(c.prompt)),
      prompt: clean(c.prompt),
      answer: clean(c.answer),
      sourceKind: 'lesson_card' as const,
    }));
  if (fromCards.length > 0) return dedupe(fromCards).slice(0, MAX_CARDS);

  const fromQuiz = (Array.isArray(l.quiz) ? l.quiz : []).filter(isValidQuizQuestion).map((q) => quizToCard(q, 'quiz'));
  if (fromQuiz.length > 0) return dedupe(fromQuiz).slice(0, MAX_CARDS);

  const fromTakeaways = (Array.isArray(l.keyTakeaways) ? l.keyTakeaways : [])
    .map(clean)
    .filter(Boolean)
    .map((t) => ({
      title: shortTitle(t),
      prompt: `${moduleTitle}: explain why this is true, with an example — "${t}"`,
      answer: t,
      sourceKind: 'takeaway' as const,
    }));
  return dedupe(fromTakeaways).slice(0, MAX_CARDS);
}

/** Cards for every quiz question answered wrong. `selections` maps question index -> chosen option index. */
export function buildQuizMissCards(quiz: unknown, selections: Record<number, number>): ReviewCardDraft[] {
  const qs = Array.isArray(quiz) ? quiz : [];
  const cards: ReviewCardDraft[] = [];
  qs.forEach((q, i) => {
    if (!isValidQuizQuestion(q)) return;
    const chosen = selections[i];
    if (chosen === undefined || chosen === q.correctIndex) return;
    cards.push(quizToCard(q, 'quiz_miss'));
  });
  return dedupe(cards);
}

export function normalizePromptKey(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dedupe(cards: ReviewCardDraft[]): ReviewCardDraft[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const k = normalizePromptKey(c.prompt);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
