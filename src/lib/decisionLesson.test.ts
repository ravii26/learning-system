import { describe, it, expect } from 'vitest';
import { buildDecisionMessages } from './decisionLesson';
import { normalizeLesson } from './lessonNormalize';
import { lessonKindOf, isLessonKind, guessLessonKind } from './lessonKinds';

const input = {
  topicTitle: 'Web architecture',
  moduleTitle: 'Choosing a tech stack',
  area: 'Tech',
  learnerLevel: 'beginner',
  priorKnowledge: '',
  planBlock: '',
  coursePosition: '',
  weaknesses: [],
  mistakes: [],
  today: 'October 2026',
};

describe('buildDecisionMessages', () => {
  const [system, user] = buildDecisionMessages(input);

  it('is a system + user pair that names the decision and the date', () => {
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    expect(system.content).toContain('Choosing a tech stack');
    expect(system.content).toContain('October 2026');
  });

  it('forbids invented prices and asks for official sources', () => {
    expect(system.content).toMatch(/NEVER state an exact price/);
    expect(system.content).toMatch(/OFFICIAL sources/);
  });

  it('carries the contract for all three block types and the review pipeline fields', () => {
    for (const f of ['comparison_table', 'pros_cons', 'cost_chart', 'matrix_2x2', 'decision_flow', '"quiz"', '"reviewCards"', '"exercises"', '"socraticChallenge"']) {
      expect(system.content).toContain(f);
    }
  });

  it('includes the learner situation when there is one', () => {
    const [s] = buildDecisionMessages({ ...input, planBlock: 'The learner\'s goal: ship a SaaS', weaknesses: ['cost estimates'] });
    expect(s.content).toContain('ship a SaaS');
    expect(s.content).toContain('cost estimates');
  });
});

describe('the example JSON in the prompt is itself drawable', () => {
  it('survives normalizeLesson with all three blocks (guards against a broken contract)', () => {
    const [system] = buildDecisionMessages(input);
    // Pull the "blocks": [...] example back out of the prompt and check it normalizes.
    const start = system.content.indexOf('"blocks": [');
    const open = system.content.indexOf('[', start);
    let depth = 0, end = open;
    for (let i = open; i < system.content.length; i++) {
      if (system.content[i] === '[') depth++;
      if (system.content[i] === ']' && --depth === 0) { end = i; break; }
    }
    const blocks = JSON.parse(system.content.slice(open, end + 1));
    const out = normalizeLesson({ title: 'T', summary: 'S', explanation: 'E', blocks })!;
    expect((out.blocks as any[]).map((b) => b.type)).toEqual(['comparison_table', 'pros_cons', 'cost_chart', 'matrix_2x2', 'decision_flow']);
  });
});

describe('lesson kinds', () => {
  it('guesses a decision from titles that compare or choose, and nothing else', () => {
    for (const t of ['Choosing a tech stack', 'Postgres vs MongoDB', 'REST versus GraphQL', 'Difference between SQL and NoSQL', 'Should I learn Rust?', 'Compare AWS and Vercel hosting', 'Pros and cons of microservices']) {
      expect(guessLessonKind(t), t).toBe('decision');
    }
    for (const t of ['Stacks and queues', 'Closures in JavaScript', 'Binary search', 'Past perfect tense', 'Investing basics', 'Which of these is a prime number']) {
      expect(guessLessonKind(t), t).toBe('concept');
    }
  });

  it('reads anything unknown as a concept lesson', () => {
    expect(lessonKindOf('decision')).toBe('decision');
    expect(lessonKindOf('banana')).toBe('concept');
    expect(lessonKindOf(undefined)).toBe('concept');
    expect(isLessonKind('concept')).toBe(true);
    expect(isLessonKind(3)).toBe(false);
  });
});
