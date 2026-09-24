/**
 * Rubric templates for practice mode (project plan, Phase 9: "rubric
 * templates per skill"). A practice topic picks one (Topic.rubricTemplate);
 * reps store raw 1..5 scores per dimension plus which dimensions are
 * inverted, so the trend (practiceTrend.ts) and score rollup
 * (practiceScore.ts) work for any template without knowing its name.
 */

export interface RubricDimension {
  key: string;
  label: string;
  inverted?: boolean; // lower raw score is better (e.g. filler words)
  hint?: string;
}

export interface RubricTemplate {
  key: string;
  label: string;
  description: string;
  dimensions: RubricDimension[];
}

export const RUBRIC_TEMPLATES: RubricTemplate[] = [
  {
    key: 'spoken_english',
    label: 'Spoken English',
    description: 'Everyday speaking fluency — the default.',
    dimensions: [
      { key: 'fluency', label: 'Fluency', hint: 'Speaks without long pauses or restarts' },
      { key: 'structure', label: 'Structure', hint: 'Clear beginning, middle, point' },
      { key: 'vocabulary', label: 'Vocabulary', hint: 'Precise, varied word choice' },
      { key: 'fillers', label: 'Fillers', inverted: true, hint: 'um / uh / like — lower is better' },
    ],
  },
  {
    key: 'impromptu',
    label: 'Impromptu speaking',
    description: 'Answering on the spot — interviews, meetings.',
    dimensions: [
      { key: 'clarity', label: 'Clarity', hint: 'Main point is obvious' },
      { key: 'structure', label: 'Structure', hint: 'e.g. point → reason → example → point' },
      { key: 'confidence', label: 'Confidence', hint: 'Steady voice, no hedging' },
      { key: 'rambling', label: 'Rambling', inverted: true, hint: 'Went off-track — lower is better' },
    ],
  },
  {
    key: 'technical_explanation',
    label: 'Technical explanation',
    description: 'Explaining a technical idea to someone else.',
    dimensions: [
      { key: 'accuracy', label: 'Accuracy', hint: 'Technically correct' },
      { key: 'simplicity', label: 'Simplicity', hint: 'A non-expert could follow' },
      { key: 'examples', label: 'Examples', hint: 'Concrete example or analogy used' },
      { key: 'jargon', label: 'Unexplained jargon', inverted: true, hint: 'Lower is better' },
    ],
  },
  {
    key: 'writing',
    label: 'Writing clarity',
    description: 'Short written pieces — emails, docs, posts.',
    dimensions: [
      { key: 'clarity', label: 'Clarity', hint: 'One read is enough' },
      { key: 'concision', label: 'Concision', hint: 'No wasted words' },
      { key: 'structure', label: 'Structure', hint: 'Logical order, good headings/paragraphs' },
      { key: 'errors', label: 'Errors', inverted: true, hint: 'Grammar/spelling — lower is better' },
    ],
  },
];

export const DEFAULT_RUBRIC_KEY = 'spoken_english';

export function getRubricTemplate(key: string | null | undefined): RubricTemplate {
  return RUBRIC_TEMPLATES.find((t) => t.key === key) ?? RUBRIC_TEMPLATES.find((t) => t.key === DEFAULT_RUBRIC_KEY)!;
}

export function isValidRubricKey(key: unknown): key is string {
  return typeof key === 'string' && RUBRIC_TEMPLATES.some((t) => t.key === key);
}

/** Scores sent with a rep must match the template's dimensions exactly, each an integer 1..5. */
export function validateRubricScores(template: RubricTemplate, scores: unknown): string | null {
  if (!scores || typeof scores !== 'object') return 'rubricScores must be an object';
  const s = scores as Record<string, unknown>;
  const expected = template.dimensions.map((d) => d.key).sort();
  const got = Object.keys(s).sort();
  if (expected.join(',') !== got.join(',')) return `rubricScores must have exactly: ${expected.join(', ')}`;
  for (const k of got) {
    const v = s[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) return `${k} must be an integer from 1 to 5`;
  }
  return null;
}
