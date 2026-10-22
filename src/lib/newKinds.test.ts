import { describe, it, expect } from 'vitest';
import { normalizeBlocks, normalizeBlueprint, BLOCK_TYPES, BLOCK_LABEL } from './lessonBlocks';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, KIND_MINUTES, LESSON_KINDS, LESSON_KIND_BADGE, LESSON_KIND_LABEL, guessLessonKind } from './lessonKinds';
import { buildKindMessages } from './kindLessons';
import { BLOCK_EXAMPLE, BLOCK_RULES } from './decisionLesson';

const input = {
  topicTitle: 'Guitar', moduleTitle: 'Open chords', area: 'Creative', learnerLevel: 'beginner',
  priorKnowledge: '', planBlock: '', coursePosition: '', weaknesses: [], mistakes: [], today: 'October 2026',
};

describe('steps', () => {
  const steps = { type: 'steps', title: 'How', steps: [{ title: 'Set up', instruction: 'Do X', check: 'See Y', snag: 'Z fails' }, { title: 'Go', instruction: 'Do Q' }] };
  it('keeps steps and defaults the optional parts', () => {
    const [b] = normalizeBlocks([steps]) as any[];
    expect(b.steps).toHaveLength(2);
    expect(b.steps[1]).toEqual({ title: 'Go', instruction: 'Do Q', check: '', snag: '' });
  });
  it('needs a title and an instruction per step, and at least two steps', () => {
    expect(normalizeBlocks([{ ...steps, steps: [steps.steps[0], { title: 'No instruction' }] }])).toEqual([]);
    expect(normalizeBlocks([{ ...steps, steps: [steps.steps[0]] }])).toEqual([]);
  });
  it('caps the number of steps', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `s${i}`, instruction: 'do' }));
    expect((normalizeBlocks([{ type: 'steps', steps: many }])[0] as any).steps).toHaveLength(12);
  });
});

describe('routine', () => {
  const routine = { type: 'routine', title: 'Today', parts: [{ label: 'Warm-up', minutes: 5, instruction: 'Easy', target: '10 reps' }, { label: 'Main', minutes: 15, instruction: 'Hard' }] };
  it('keeps timed parts', () => {
    expect((normalizeBlocks([routine])[0] as any).parts).toHaveLength(2);
  });
  it('drops a part without a believable duration, so the total stays honest', () => {
    const out = normalizeBlocks([{ ...routine, parts: [...routine.parts, { label: 'Zero', minutes: 0, instruction: 'x' }, { label: 'Huge', minutes: 9999, instruction: 'x' }, { label: 'Text', minutes: 'ten', instruction: 'x' }] }]) as any[];
    expect(out[0].parts.map((p: any) => p.label)).toEqual(['Warm-up', 'Main']);
  });
  it('rounds minutes and needs two parts', () => {
    const out = normalizeBlocks([{ ...routine, parts: [{ label: 'A', minutes: 4.6, instruction: 'x' }, { label: 'B', minutes: 10, instruction: 'x' }] }]) as any[];
    expect(out[0].parts[0].minutes).toBe(5);
    expect(normalizeBlocks([{ ...routine, parts: [routine.parts[0]] }])).toEqual([]);
  });
});

describe('memory_list', () => {
  const list = { type: 'memory_list', items: [{ term: 'A', meaning: 'a', hook: 'h' }, { term: 'B', meaning: 'b' }, { term: 'C', meaning: 'c' }] };
  it('keeps items with an optional hook', () => {
    const [b] = normalizeBlocks([list]) as any[];
    expect(b.items).toHaveLength(3);
    expect(b.items[1].hook).toBe('');
  });
  it('drops duplicates (ignoring case) and items without a meaning, and needs three', () => {
    const out = normalizeBlocks([{ ...list, items: [...list.items, { term: 'a', meaning: 'dup' }, { term: 'D' }] }]) as any[];
    expect(out[0].items.map((i: any) => i.term)).toEqual(['A', 'B', 'C']);
    expect(normalizeBlocks([{ ...list, items: list.items.slice(0, 2) }])).toEqual([]);
  });
  it('caps at 30 items', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ term: `t${i}`, meaning: 'm' }));
    expect((normalizeBlocks([{ type: 'memory_list', items: many }])[0] as any).items).toHaveLength(30);
  });
});

describe('question_patterns', () => {
  const qp = { type: 'question_patterns', patterns: [{ name: 'Statements', asked: 'Which are correct?', trap: 'One word flips it', tip: 'Eliminate' }, { name: 'Match', asked: 'Pair the lists' }] };
  it('keeps patterns, needing a name and how it is asked', () => {
    expect((normalizeBlocks([qp])[0] as any).patterns).toHaveLength(2);
    expect(normalizeBlocks([{ ...qp, patterns: [qp.patterns[0], { name: 'No ask' }] }])).toEqual([]);
  });
});

describe('study_guide', () => {
  const guide = {
    type: 'study_guide', resource: { title: 'Atomic Habits', kind: 'book' }, basis: 'real_structure',
    before: ['Why this book?'], after: ['What do you recall?'],
    parts: [{ label: 'First third', focus: 'Habit loop', questions: ['What is a cue?'] }, { label: 'Last third', focus: 'Identity' }],
  };
  it('keeps the guide', () => {
    const [b] = normalizeBlocks([guide]) as any[];
    expect(b.basis).toBe('real_structure');
    expect(b.parts).toHaveLength(2);
  });
  it('shows anything but an explicit claim of real chapters as a split by position', () => {
    expect((normalizeBlocks([{ ...guide, basis: 'sure' }])[0] as any).basis).toBe('by_position');
    expect((normalizeBlocks([{ ...guide, basis: undefined }])[0] as any).basis).toBe('by_position');
  });
  it('needs the resource title and two parts, and tolerates an unknown resource kind', () => {
    expect(normalizeBlocks([{ ...guide, resource: { kind: 'book' } }])).toEqual([]);
    expect(normalizeBlocks([{ ...guide, parts: [guide.parts[0]] }])).toEqual([]);
    expect((normalizeBlocks([{ ...guide, resource: { title: 'X', kind: 'scroll' } }])[0] as any).resource.kind).toBe('other');
  });
});

describe('key_ideas', () => {
  const ki = { type: 'key_ideas', ideas: [{ idea: 'A', why: 'a' }, { idea: 'B', why: 'b' }, { idea: 'C', why: 'c' }], wonder: ['What if?'] };
  it('keeps ideas with their reason, and needs three', () => {
    expect((normalizeBlocks([ki])[0] as any).ideas).toHaveLength(3);
    expect(normalizeBlocks([{ ...ki, ideas: [...ki.ideas.slice(0, 2), { idea: 'no why' }] }])).toEqual([]);
  });
});

describe('the new kinds', () => {
  const NEW = ['drill', 'memorise', 'exam_prep', 'project', 'resource', 'explore'] as const;

  it('all have labels, badges, minutes, and only known sections', () => {
    for (const k of NEW) {
      expect(LESSON_KINDS).toContain(k);
      expect(LESSON_KIND_LABEL[k]).toBeTruthy();
      expect(LESSON_KIND_BADGE[k]).toBeTruthy();
      expect(KIND_MINUTES[k]).toBeGreaterThan(0);
      expect(KIND_DEFAULT_BLOCKS[k].length).toBeGreaterThan(0);
      for (const t of KIND_BLOCKS[k]) expect(BLOCK_TYPES).toContain(t);
      for (const t of KIND_DEFAULT_BLOCKS[k]) expect(KIND_BLOCKS[k]).toContain(t);
    }
  });

  it('every section type has a label, a prompt example and prompt rules', () => {
    for (const t of BLOCK_TYPES) {
      expect(BLOCK_LABEL[t], t).toBeTruthy();
      expect(BLOCK_EXAMPLE[t], t).toContain(`"type": "${t}"`);
      expect(BLOCK_RULES[t], t).toBeTruthy();
    }
  });

  it('every prompt example is itself valid, so a model that copies it loses nothing', () => {
    for (const t of BLOCK_TYPES) {
      const raw = BLOCK_EXAMPLE[t].replace('"documented | illustrative"', '"documented"');
      const out = normalizeBlocks([JSON.parse(raw)]);
      expect(out.map((b) => b.type), t).toEqual([t]);
    }
  });

  it('each prompt asks for its own sections and keeps the core fields', () => {
    for (const k of NEW) {
      const [s, u] = buildKindMessages(k, { ...input, moduleTitle: 'M' });
      for (const t of KIND_DEFAULT_BLOCKS[k]) expect(s.content, `${k}: ${t}`).toContain(`"type": "${t}"`);
      for (const f of ['"quiz"', '"reviewCards"', '"exercises"', '"socraticChallenge"', '"summary"', '"explanation"']) expect(s.content, `${k} ${f}`).toContain(f);
      expect(u.content).toContain('"M"');
    }
  });

  it('a blueprint keeps to the kind: optional sections can be added, foreign ones cannot', () => {
    expect(normalizeBlueprint(['steps', 'timeline', 'cost_chart'], KIND_BLOCKS.project)).toEqual(['timeline', 'steps']);
    const [s] = buildKindMessages('memorise', { ...input, blueprint: ['memory_list', 'comparison_table'] });
    expect(s.content).toContain('"type": "comparison_table"');
    const [only] = buildKindMessages('memorise', { ...input, blueprint: ['cost_chart'] });
    expect(only.content).not.toContain('"type": "cost_chart"');
    expect(only.content).toContain('"type": "memory_list"');
  });

  it('honesty rules are in the prompts that need them', () => {
    expect(buildKindMessages('resource', input)[0].content).toMatch(/Do not invent its contents/);
    expect(buildKindMessages('resource', input)[0].content).toMatch(/by_position/);
    expect(buildKindMessages('exam_prep', input)[0].content).toMatch(/Never invent past questions/);
    expect(buildKindMessages('memorise', input)[0].content).toMatch(/Never invent an item/);
    expect(buildKindMessages('memorise', input)[0].content).toMatch(/8 to 12 cards/);
    expect(buildKindMessages('project', input)[0].content).toMatch(/Use only tools/i);
    expect(buildKindMessages('explore', input)[0].content).toMatch(/NO QUIZ PRESSURE/);
    expect(buildKindMessages('drill', input)[0].content).toMatch(/SAFETY/);
  });

  it('only the project prompt asks for code', () => {
    expect(buildKindMessages('project', input)[0].content).toMatch(/key code listing/);
    expect(buildKindMessages('drill', input)[0].content).toContain('leave as "".');
  });

  it('the guess recognises each of them from a plain title', () => {
    expect(guessLessonKind('Build a URL shortener')).toBe('project');
    expect(guessLessonKind('Flashcards for the periodic table')).toBe('memorise');
    expect(guessLessonKind('IELTS speaking tips')).toBe('exam_prep');
    expect(guessLessonKind('Notes from the CS50 course')).toBe('resource');
    expect(guessLessonKind('Daily typing practice')).toBe('drill');
    expect(guessLessonKind('Fun facts about the ocean')).toBe('explore');
  });
});
