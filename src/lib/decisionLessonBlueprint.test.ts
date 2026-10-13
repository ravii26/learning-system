import { describe, it, expect } from 'vitest';
import { buildDecisionMessages, buildBlockMessages, levelGuide, optionsOf } from './decisionLesson';
import { normalizeBlocks } from './lessonBlocks';

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

describe('blueprint and level', () => {
  it('only asks for the chosen sections, in reading order', () => {
    const [s] = buildDecisionMessages({ ...input, blueprint: ['matrix_2x2', 'comparison_table'] });
    expect(s.content).toContain('"type": "comparison_table"');
    expect(s.content).toContain('"type": "matrix_2x2"');
    expect(s.content).not.toContain('"type": "cost_chart"');
    expect(s.content).not.toContain('"type": "decision_flow"');
    expect(s.content.indexOf('"type": "comparison_table"')).toBeLessThan(s.content.indexOf('"type": "matrix_2x2"'));
  });

  it('an empty blueprint means every section', () => {
    const [s] = buildDecisionMessages({ ...input, blueprint: [] });
    expect(s.content).toContain('"type": "cost_chart"');
    expect(s.content).toContain('"type": "decision_flow"');
  });

  it('only a cost chart may carry money numbers, as rough estimates', () => {
    const [s] = buildDecisionMessages(input);
    expect(s.content).toMatch(/ONLY place numbers about money are allowed is a cost_chart/);
    expect(s.content).toMatch(/ROUGH ESTIMATES/);
  });

  it('adapts depth to the learner level, defaulting to beginner', () => {
    expect(levelGuide('beginner')).toMatch(/BEGINNER/);
    expect(levelGuide('Intermediate')).toMatch(/INTERMEDIATE/);
    expect(levelGuide('advanced')).toMatch(/ADVANCED/);
    expect(levelGuide('')).toMatch(/BEGINNER/);
    const [adv] = buildDecisionMessages({ ...input, learnerLevel: 'advanced' });
    expect(adv.content).toMatch(/migration and exit costs/);
  });
});

describe('buildBlockMessages', () => {
  const [table, flow] = normalizeBlocks([
    { type: 'comparison_table', options: ['Next.js', 'Rails'], rows: [{ criterion: 'Cost', cells: [{ text: 'a' }, { text: 'b' }] }] },
    { type: 'decision_flow', start: 'q', nodes: [{ id: 'q', question: 'SEO?', yes: 'a', no: 'b' }, { id: 'a', outcome: 'Next.js' }, { id: 'b', outcome: 'Rails' }] },
  ]);
  const [system, user] = buildBlockMessages({ topicTitle: 'Web', moduleTitle: 'Choosing a stack', learnerLevel: 'beginner', today: 'October 2026', current: flow, others: [table] });

  it('asks for the one section type, keeping the same option names', () => {
    expect(system.content).toContain('THE SECTION TO WRITE: How-to-decide flowchart');
    expect(system.content).toContain('"type": "decision_flow"');
    expect(system.content).not.toContain('"type": "cost_chart"');
    expect(system.content).toContain('Next.js, Rails');
  });

  it('shows the current version and names the other sections to avoid repeating', () => {
    expect(user.content).toContain('"SEO?"');
    expect(user.content).toContain('Comparison table');
  });

  it('finds the option names from any block that lists them', () => {
    expect(optionsOf([flow, table])).toEqual(['Next.js', 'Rails']);
    expect(optionsOf([flow])).toEqual([]);
  });
});
