import { describe, it, expect } from 'vitest';
import { normalizeBlocks, BLOCK_LIMITS } from './lessonBlocks';

const table = {
  type: 'comparison_table',
  title: 'Stacks',
  options: ['A', 'B'],
  rows: [{ criterion: 'Cost', cells: [{ text: 'low', rating: 3, best: true }, { text: 'high', rating: 1 }] }],
};

describe('normalizeBlocks: comparison_table', () => {
  it('keeps a valid table', () => {
    expect(normalizeBlocks([table])).toEqual([table]);
  });

  it('needs at least two options and one filled row', () => {
    expect(normalizeBlocks([{ ...table, options: ['only one'] }])).toEqual([]);
    expect(normalizeBlocks([{ ...table, rows: [] }])).toEqual([]);
    expect(normalizeBlocks([{ ...table, rows: [{ criterion: 'Cost', cells: [{ text: '' }, {}] }] }])).toEqual([]);
  });

  it('pads a short row and trims a long one to one cell per option', () => {
    const out = normalizeBlocks([{
      ...table,
      rows: [
        { criterion: 'Short', cells: [{ text: 'x' }] },
        { criterion: 'Long', cells: [{ text: '1' }, { text: '2' }, { text: '3' }] },
      ],
    }]) as any[];
    expect(out[0].rows[0].cells).toEqual([{ text: 'x' }, { text: '—' }]);
    expect(out[0].rows[1].cells).toHaveLength(2);
  });

  it('ignores ratings outside 1-3 and caps sizes', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ criterion: `c${i}`, cells: [{ text: 'a', rating: 7 }, { text: 'b' }] }));
    const out = normalizeBlocks([{ ...table, options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], rows }]) as any[];
    expect(out[0].options).toHaveLength(BLOCK_LIMITS.options);
    expect(out[0].rows).toHaveLength(BLOCK_LIMITS.rows);
    expect(out[0].rows[0].cells[0].rating).toBeUndefined();
  });
});

describe('normalizeBlocks: pros_cons', () => {
  it('drops options with nothing to say, keeps the rest', () => {
    const out = normalizeBlocks([{
      type: 'pros_cons',
      items: [{ option: 'A', pros: ['fast'], cons: [] }, { option: 'B', pros: [], cons: [] }, { option: '', pros: ['x'] }],
    }]) as any[];
    expect(out[0].items).toEqual([{ option: 'A', pros: ['fast'], cons: [] }]);
    expect(out[0].title).toBe('Strengths and weaknesses');
  });

  it('returns nothing when no option survives', () => {
    expect(normalizeBlocks([{ type: 'pros_cons', items: [] }])).toEqual([]);
  });
});

describe('normalizeBlocks: decision_flow', () => {
  const flow = {
    type: 'decision_flow',
    start: 'q1',
    nodes: [
      { id: 'q1', question: 'Team knows a stack?', yes: 'keep', no: 'q2' },
      { id: 'keep', outcome: 'Use it' },
      { id: 'q2', question: 'Need SEO?', yes: 'next', no: 'rails' },
      { id: 'next', outcome: 'Next.js' },
      { id: 'rails', outcome: 'Rails' },
    ],
  };

  it('keeps a valid tree', () => {
    const out = normalizeBlocks([flow]) as any[];
    expect(out[0].start).toBe('q1');
    expect(out[0].nodes).toHaveLength(5);
  });

  it('defaults the start to the first node', () => {
    const out = normalizeBlocks([{ ...flow, start: undefined }]) as any[];
    expect(out[0].start).toBe('q1');
  });

  it('rejects a branch pointing at a missing node', () => {
    const broken = { ...flow, nodes: flow.nodes.map((n) => (n.id === 'q2' ? { ...n, no: 'ghost' } : n)) };
    expect(normalizeBlocks([broken])).toEqual([]);
  });

  it('rejects a loop', () => {
    const loop = { ...flow, nodes: flow.nodes.map((n) => (n.id === 'q2' ? { ...n, no: 'q1' } : n)) };
    expect(normalizeBlocks([loop])).toEqual([]);
  });

  it('rejects an unknown start and a question missing a branch', () => {
    expect(normalizeBlocks([{ ...flow, start: 'nope' }])).toEqual([]);
    expect(normalizeBlocks([{ type: 'decision_flow', nodes: [{ id: 'q', question: 'Only a yes?', yes: 'o' }, { id: 'o', outcome: 'x' }] }])).toEqual([]);
  });

  it('rejects a tree that would be drawn too large', () => {
    // Every question sends both branches to the same next question: 2^n paths.
    const nodes: any[] = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, question: `q${i}?`, yes: `q${i + 1}`, no: `q${i + 1}` }));
    nodes.push({ id: 'q10', outcome: 'end' });
    expect(normalizeBlocks([{ type: 'decision_flow', start: 'q0', nodes }])).toEqual([]);
  });
});

describe('normalizeBlocks: general', () => {
  it('ignores junk and unknown block types, keeps good ones in order', () => {
    const out = normalizeBlocks(['x', null, { type: 'mystery' }, table, { type: 'pros_cons', items: [{ option: 'A', pros: ['p'] }] }]);
    expect(out.map((b) => b.type)).toEqual(['comparison_table', 'pros_cons']);
  });

  it('returns [] for non-arrays and caps the block count', () => {
    expect(normalizeBlocks(undefined)).toEqual([]);
    expect(normalizeBlocks('nope')).toEqual([]);
    expect(normalizeBlocks(Array.from({ length: 20 }, () => table))).toHaveLength(BLOCK_LIMITS.blocks);
  });
});
