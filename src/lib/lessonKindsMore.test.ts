import { describe, it, expect } from 'vitest';
import { normalizeBlocks, normalizeBlueprint, BLOCK_TYPES } from './lessonBlocks';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, isDefaultBlueprint, LESSON_KINDS, LESSON_KIND_BADGE, LESSON_KIND_LABEL, guessLessonKind } from './lessonKinds';
import { buildKindMessages } from './kindLessons';
import { buildBlockMessages } from './decisionLesson';

const input = {
  topicTitle: 'Databases',
  moduleTitle: 'Types of databases',
  area: 'Tech',
  learnerLevel: 'beginner',
  priorKnowledge: '',
  planBlock: '',
  coursePosition: '',
  weaknesses: [],
  mistakes: [],
  today: 'October 2026',
};

describe('landscape', () => {
  const landscape = {
    type: 'landscape',
    title: 'Kinds of database',
    categories: [
      { name: 'Relational', summary: 'Tables with strict schemas.', items: [{ name: 'PostgreSQL', note: 'general purpose' }, { name: 'MySQL', note: '' }] },
      { name: 'Document', summary: 'JSON-like records.', items: [{ name: 'MongoDB', note: 'flexible schemas' }] },
    ],
  };

  it('keeps a valid map', () => {
    expect(normalizeBlocks([landscape])).toEqual([landscape]);
  });

  it('drops categories that have no purpose or no examples, and needs two to survive', () => {
    const out = normalizeBlocks([{ ...landscape, categories: [...landscape.categories, { name: 'Empty', summary: 's', items: [] }, { name: 'NoPurpose', summary: '', items: [{ name: 'x' }] }] }]) as any[];
    expect(out[0].categories.map((c: any) => c.name)).toEqual(['Relational', 'Document']);
    expect(normalizeBlocks([{ ...landscape, categories: [landscape.categories[0]] }])).toEqual([]);
  });
});

describe('timeline', () => {
  const timeline = {
    type: 'timeline',
    title: 'Path',
    phases: [
      { label: 'Basics', duration: 'Weeks 1-4', goal: 'Write simple queries', milestones: ['Build a to-do app'] },
      { label: 'Depth', duration: 'Weeks 5-12', goal: 'Design a schema', milestones: [] },
    ],
  };

  it('keeps ordered phases', () => {
    expect(normalizeBlocks([timeline])).toEqual([timeline]);
  });

  it('needs a label and a goal per phase and at least two phases', () => {
    const out = normalizeBlocks([{ ...timeline, phases: [...timeline.phases, { label: 'No goal' }, { goal: 'No label' }] }]) as any[];
    expect(out[0].phases).toHaveLength(2);
    expect(normalizeBlocks([{ ...timeline, phases: [timeline.phases[0]] }])).toEqual([]);
  });

  it('caps milestones and phases', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `P${i}`, goal: 'g', milestones: Array.from({ length: 9 }, (_, j) => `m${j}`) }));
    const out = normalizeBlocks([{ type: 'timeline', phases: many }]) as any[];
    expect(out[0].phases).toHaveLength(8);
    expect(out[0].phases[0].milestones).toHaveLength(5);
  });
});

describe('case_study', () => {
  const base = { type: 'case_study', title: 'A migration', situation: 'The team had X.', choice: 'They moved to Y.', lesson: 'Match the tool to the load.' };

  it('keeps a case and labels anything not explicitly documented as illustrative', () => {
    expect((normalizeBlocks([{ ...base, basis: 'documented' }]) as any[])[0].basis).toBe('documented');
    expect((normalizeBlocks([{ ...base, basis: 'true story' }]) as any[])[0].basis).toBe('illustrative');
    expect((normalizeBlocks([base]) as any[])[0].basis).toBe('illustrative');
  });

  it('needs the situation, the choice and the lesson', () => {
    for (const k of ['situation', 'choice', 'lesson']) expect(normalizeBlocks([{ ...base, [k]: '' }]), k).toEqual([]);
  });

  it('allows several cases in one lesson', () => {
    expect(normalizeBlocks([base, { ...base, title: 'Another' }])).toHaveLength(2);
  });
});

describe('kinds and blueprints', () => {
  it('every kind has labels, a badge and only known sections', () => {
    for (const k of LESSON_KINDS) {
      expect(LESSON_KIND_LABEL[k]).toBeTruthy();
      expect(LESSON_KIND_BADGE[k]).toBeTruthy();
      for (const t of KIND_BLOCKS[k]) expect(BLOCK_TYPES).toContain(t);
    }
    expect(KIND_BLOCKS.concept).toEqual([]);
  });

  it('a blueprint is limited to what its kind can have', () => {
    expect(normalizeBlueprint(['timeline', 'cost_chart', 'decision_flow'], KIND_BLOCKS.roadmap)).toEqual(['timeline', 'decision_flow']);
    expect(normalizeBlueprint(['cost_chart'], KIND_BLOCKS.roadmap)).toEqual([]);
  });

  it('guesses the kind from a title, free, with decision taking priority', () => {
    expect(guessLessonKind('Types of databases')).toBe('survey');
    expect(guessLessonKind('The cloud ecosystem')).toBe('survey');
    expect(guessLessonKind('Backend developer roadmap')).toBe('roadmap');
    expect(guessLessonKind('How to become a data engineer')).toBe('roadmap');
    expect(guessLessonKind('Case study: how Discord migrated to Cassandra')).toBe('case_study');
    expect(guessLessonKind('Postmortem of a failed launch')).toBe('case_study');
    expect(guessLessonKind('Postgres vs MongoDB roadmap')).toBe('decision');
    expect(guessLessonKind('Binary search')).toBe('concept');
    expect(guessLessonKind('Stacks and queues')).toBe('concept');
  });
});

describe('buildKindMessages', () => {
  it('survey: asks for a landscape split by purpose, with the survey sections only', () => {
    const [s, u] = buildKindMessages('survey', input);
    expect(s.content).toMatch(/MAP of a field/);
    expect(s.content).toContain('"type": "landscape"');
    expect(s.content).toContain('"type": "comparison_table"');
    expect(s.content).toContain('"type": "matrix_2x2"');
    expect(s.content).not.toContain('"type": "timeline"');
    expect(s.content).toMatch(/columns are the CATEGORIES/);
    expect(u.content).toContain('Types of databases');
  });

  it('roadmap: realistic pace, observable milestones, no promises', () => {
    const [s] = buildKindMessages('roadmap', input);
    expect(s.content).toContain('"type": "timeline"');
    expect(s.content).toMatch(/about 6 hours a week/);
    expect(s.content).toMatch(/do not promise jobs/i);
  });

  it('case_study: documented only when sure, never invented figures', () => {
    const [s] = buildKindMessages('case_study', input);
    expect(s.content).toContain('"type": "case_study"');
    expect(s.content).toMatch(/ILLUSTRATIVE/);
    expect(s.content).toMatch(/Never invent figures, quotes, dates/);
  });

  it('respects the blueprint within the kind and falls back to all of the kind\'s sections', () => {
    const [only] = buildKindMessages('survey', { ...input, blueprint: ['landscape', 'cost_chart'] });
    expect(only.content).toContain('"type": "landscape"');
    expect(only.content).not.toContain('"type": "comparison_table"');
    expect(only.content).not.toContain('"type": "cost_chart"');
    const [none] = buildKindMessages('roadmap', { ...input, blueprint: ['cost_chart'] });
    expect(none.content).toContain('"type": "timeline"');
    expect(none.content).toContain('"type": "decision_flow"');
  });

  it('every kind keeps the core fields the review pipeline reads', () => {
    for (const k of ['decision', 'survey', 'roadmap', 'case_study'] as const) {
      const [s] = buildKindMessages(k, input);
      for (const f of ['"quiz"', '"reviewCards"', '"exercises"', '"socraticChallenge"', '"summary"', '"explanation"']) expect(s.content, `${k} ${f}`).toContain(f);
    }
  });

  it('the example JSON for each kind survives the checker', () => {
    for (const k of ['survey', 'roadmap', 'case_study'] as const) {
      const [s] = buildKindMessages(k, input);
      const start = s.content.indexOf('"blocks": [');
      const open = s.content.indexOf('[', start);
      let depth = 0, end = open;
      for (let i = open; i < s.content.length; i++) {
        if (s.content[i] === '[') depth++;
        if (s.content[i] === ']' && --depth === 0) { end = i; break; }
      }
      const raw = s.content.slice(open, end + 1).replace('"documented | illustrative"', '"documented"');
      const blocks = normalizeBlocks(JSON.parse(raw));
      // Every example the prompt shows must itself pass the checker, or a model that copies it loses the section.
      expect(blocks.map((b) => b.type), k).toEqual([...KIND_DEFAULT_BLOCKS[k]]);
    }
  });

  it('a single-section rewrite names the kind it belongs to', () => {
    const [timeline, other] = normalizeBlocks([
      { type: 'timeline', phases: [{ label: 'A', goal: 'g' }, { label: 'B', goal: 'g' }] },
      { type: 'decision_flow', start: 'q', nodes: [{ id: 'q', question: 'Q?', yes: 'a', no: 'b' }, { id: 'a', outcome: 'A' }, { id: 'b', outcome: 'B' }] },
    ]);
    const [s] = buildBlockMessages({ kind: 'roadmap', topicTitle: 'T', moduleTitle: 'M', learnerLevel: 'beginner', today: 'October 2026', current: timeline, others: [other] });
    expect(s.content).toMatch(/about a learning path/);
    expect(s.content).toContain('THE SECTION TO WRITE: Learning path');
  });
});
