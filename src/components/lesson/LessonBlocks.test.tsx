import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonBlocks } from './LessonBlocks';
import { normalizeBlocks } from '@/lib/lessonBlocks';

const blocks = normalizeBlocks([
  {
    type: 'comparison_table',
    title: 'Stacks',
    options: ['Next.js', 'Rails'],
    rows: [{ criterion: 'Cost at scale', cells: [{ text: 'spiky', rating: 1 }, { text: 'steady', rating: 3, best: true }] }],
    note: 'Verify as of Oct 2026.',
  },
  { type: 'pros_cons', title: 'Trade-offs', items: [{ option: 'Rails', pros: ['Few moving parts'], cons: ['You run the server'] }] },
  {
    type: 'decision_flow',
    title: 'Pick one',
    start: 'q',
    nodes: [{ id: 'q', question: 'Need SEO pages?', yes: 'a', no: 'b' }, { id: 'a', outcome: 'Next.js' }, { id: 'b', outcome: 'Rails' }],
  },
]);

describe('LessonBlocks', () => {
  const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} />);

  it('draws a real table with row and column headers', () => {
    expect(html).toContain('<table');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('Cost at scale');
  });

  it('carries meaning without colour: ratings, best marker, shapes, +/-', () => {
    expect(html).toContain('aria-label="3 out of 3"');
    expect(html).toContain('aria-label="best in this row"');
    expect(html).toContain('●');
    expect(html).toContain('■');
    expect(html).toContain('aria-label="Pro"');
    expect(html).toContain('aria-label="Con"');
  });

  it('shows the verify note and the flowchart branches', () => {
    expect(html).toContain('Verify as of Oct 2026.');
    expect(html).toContain('Need SEO pages?');
    expect(html).toContain('>Yes<');
    expect(html).toContain('>No<');
    expect(html).toContain('Next.js');
  });

  it('uses no colour utilities', () => {
    expect(html).not.toMatch(/text-(danger|success|warning|primary)|bg-(danger|success|warning|primary)/);
  });

  it('renders nothing for no blocks', () => {
    expect(renderToStaticMarkup(<LessonBlocks blocks={[]} />)).toBe('');
  });
});
