import { describe, it, expect } from 'vitest';
import { INTENTS, SIZES, guessIntent, intentByKey, planStart, sectionList, sizesFor, topicRequest, type StartPlan } from './startLearning';
import { KIND_DEFAULT_BLOCKS, KIND_MINUTES, LESSON_KINDS, isLessonKind } from './lessonKinds';

const create = (p: StartPlan) => {
  if (p.type !== 'create') throw new Error('expected a create plan');
  return p;
};
const intent = (k: string) => intentByKey(k)!;

describe('intents', () => {
  it('there are eleven, each with a real lesson kind and a distinct key', () => {
    expect(INTENTS).toHaveLength(11);
    expect(new Set(INTENTS.map((i) => i.key)).size).toBe(11);
    for (const i of INTENTS) {
      expect(isLessonKind(i.kind), i.key).toBe(true);
      expect(i.label && i.hint, i.key).toBeTruthy();
    }
  });

  it('every lesson kind is reachable from some intent', () => {
    for (const k of LESSON_KINDS) expect(INTENTS.some((i) => i.kind === k), k).toBe(true);
  });

  it('an unknown key is undefined', () => {
    expect(intentByKey('nonsense')).toBeUndefined();
  });

  it('is guessed from a title with the same free keyword guess, and not at all for plain topics', () => {
    expect(guessIntent('Postgres vs MongoDB')?.key).toBe('decide');
    expect(guessIntent('Top 30 business')?.key).toBe('map');
    expect(guessIntent('Build a URL shortener')?.key).toBe('build');
    expect(guessIntent('IELTS speaking tips')?.key).toBe('exam');
    expect(guessIntent('Binary search')).toBeUndefined();
  });
});

describe('sizes', () => {
  it('"ongoing" is offered only where the app has something open-ended for it', () => {
    expect(sizesFor(intent('practise'))).toEqual(['lesson', 'series', 'plan', 'ongoing']);
    expect(sizesFor(intent('explore'))).toContain('ongoing');
    expect(sizesFor(intent('understand'))).toContain('ongoing');
    expect(sizesFor(intent('decide'))).toEqual(['lesson', 'series', 'plan']);
    expect(sizesFor(intent('build'))).not.toContain('ongoing');
  });

  it('every size has a label and a hint', () => {
    for (const s of SIZES) expect(s.label && s.hint).toBeTruthy();
  });
});

describe('planStart: one lesson', () => {
  it('makes one module of the intent kind, with its length and a preview of the sections', () => {
    const p = create(planStart({ title: 'Choosing a tech stack', intent: intent('decide'), size: 'lesson' }));
    expect(p.mode).toBe('syllabus');
    expect(p.modules).toEqual([{ title: 'Choosing a tech stack', kind: 'decision', estimatedMinutes: KIND_MINUTES.decision }]);
    expect(p.redirect).toBe('topic');
    expect(p.nextAction).toBe('Study: Choosing a tech stack');
    expect(p.preview.join(' ')).toMatch(/comparison table/);
    expect(p.preview.join(' ')).toMatch(/quiz, exercises and review cards/);
  });

  it('trims the title', () => {
    expect(create(planStart({ title: '  Spanish verbs  ', intent: intent('memorise'), size: 'lesson' })).title).toBe('Spanish verbs');
  });

  it('a concept lesson says it is the standard lesson', () => {
    const p = create(planStart({ title: 'Closures', intent: intent('understand'), size: 'lesson' }));
    expect(p.modules[0].kind).toBe('concept');
    expect(p.preview.join(' ')).toMatch(/explanation, a worked example and the common mistakes/);
  });

  it('carries a custom choice of sections, and says so in the preview', () => {
    const p = create(planStart({ title: 'X vs Y', intent: intent('decide'), size: 'lesson', blueprint: ['comparison_table', 'cost_chart'] }));
    expect(p.modules[0].blueprint).toEqual(['comparison_table', 'cost_chart']);
    expect(p.preview.join(' ')).toMatch(/comparison table and cost at different sizes/);
    expect(p.preview.join(' ')).not.toMatch(/flowchart/);
  });

  it('works for every intent', () => {
    for (const i of INTENTS) {
      const p = create(planStart({ title: 'Anything', intent: i, size: 'lesson' }));
      expect(p.modules[0].kind).toBe(i.kind);
      expect(p.minutes).toBe(KIND_MINUTES[i.kind]);
    }
  });
});

describe('planStart: ongoing', () => {
  it('practise becomes a daily practice topic with no lessons', () => {
    const p = create(planStart({ title: 'Guitar', intent: intent('practise'), size: 'ongoing' }));
    expect(p.mode).toBe('practice');
    expect(p.modules).toEqual([]);
    expect(p.nextAction).toBe('Do today’s rep');
    expect(p.redirect).toBe('topic');
  });

  it('exploring becomes a collect-ideas topic that opens the notebook', () => {
    const p = create(planStart({ title: 'Black holes', intent: intent('explore'), size: 'ongoing' }));
    expect(p.mode).toBe('accretion');
    expect(p.redirect).toBe('notes');
    expect(p.modules).toEqual([]);
  });
});

describe('planStart: series and plan hand over to the existing builders', () => {
  it('a series goes to the course builder with the title and what each lesson should be', () => {
    const p = planStart({ title: 'Cloud choices', intent: intent('decide'), size: 'series', why: 'for work' });
    expect(p.type).toBe('handoff');
    if (p.type !== 'handoff') return;
    const url = new URL(p.href, 'http://x');
    expect(url.pathname).toBe('/learn/new');
    expect(url.searchParams.get('title')).toBe('Cloud choices');
    expect(url.searchParams.get('kind')).toBe('syllabus');
    expect(url.searchParams.get('moduleKind')).toBe('decision');
    expect(url.searchParams.get('why')).toBe('for work');
  });

  it('a series of plain concept lessons passes no lesson kind', () => {
    const p = planStart({ title: 'Closures', intent: intent('understand'), size: 'series' });
    if (p.type !== 'handoff') throw new Error('expected handoff');
    expect(new URL(p.href, 'http://x').searchParams.has('moduleKind')).toBe(false);
  });

  it('special characters in the title survive the address', () => {
    const p = planStart({ title: 'C++ & Rust: which? 100%', intent: intent('decide'), size: 'series' });
    if (p.type !== 'handoff') throw new Error('expected handoff');
    expect(new URL(p.href, 'http://x').searchParams.get('title')).toBe('C++ & Rust: which? 100%');
  });

  it('a plan goes to the plan wizard with the goal', () => {
    const p = planStart({ title: 'Become a data engineer', intent: intent('path'), size: 'plan' });
    expect(p.type).toBe('handoff');
    if (p.type !== 'handoff') return;
    const url = new URL(p.href, 'http://x');
    expect(url.pathname).toBe('/learn/program');
    expect(url.searchParams.get('goal')).toBe('Become a data engineer');
  });
});

describe('sectionList', () => {
  it('joins names in plain words', () => {
    expect(sectionList('memorise')).toBe('things to memorise');
    expect(sectionList('exam_prep')).toBe('map of the field and how it is asked');
    expect(sectionList('decision')).toMatch(/^comparison table, pros and cons, cost at different sizes, trade-off map \(2×2\) and how-to-decide flowchart$/);
    expect(sectionList('concept')).toMatch(/explanation/);
  });

  it('every kind with sections can be described', () => {
    for (const k of LESSON_KINDS) if (KIND_DEFAULT_BLOCKS[k].length) expect(sectionList(k).length).toBeGreaterThan(3);
  });
});

describe('topicRequest', () => {
  const plan = create(planStart({ title: 'Choosing a stack', intent: intent('decide'), size: 'lesson', blueprint: ['comparison_table', 'decision_flow'] }));
  let n = 0;
  const body = topicRequest(plan, { area: 'Tech', why: ' for the new app ', status: 'active', newId: () => `id${++n}` });

  it('has the fields the topic API takes, like the older page sends', () => {
    expect(body).toMatchObject({
      title: 'Choosing a stack', area: 'Tech', mode: 'syllabus', status: 'active', depthTarget: 'Working Knowledge',
      why: 'for the new app', nextAction: 'Study: Choosing a stack', currentStage: 'Fundamentals',
    });
  });

  it('puts the lesson in the syllabus with its kind and sections', () => {
    expect(body.curriculum).toEqual([{
      id: 'id1', order: 1, title: 'Choosing a stack', estimatedMinutes: 20, completed: false, completedAt: null, notes: '',
      kind: 'decision', blueprint: ['comparison_table', 'decision_flow'],
    }]);
  });

  it('writes a concept lesson exactly as before kinds existed (no kind key)', () => {
    const c = topicRequest(create(planStart({ title: 'Closures', intent: intent('understand'), size: 'lesson' })), { area: 'Tech', status: 'queued' });
    expect(c.curriculum[0]).not.toHaveProperty('kind');
    expect(c.curriculum[0]).not.toHaveProperty('blueprint');
    expect(c.status).toBe('queued');
  });

  it('gives a default reason when none is given, and no lessons for an open-ended topic', () => {
    const o = topicRequest(create(planStart({ title: 'Guitar', intent: intent('practise'), size: 'ongoing' })), { area: 'Creative', status: 'queued' });
    expect(o.why).toBe('I want to learn Guitar');
    expect(o.curriculum).toEqual([]);
    expect(o.mode).toBe('practice');
  });
});
