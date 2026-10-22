import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonBlocks } from './LessonBlocks';
import { normalizeBlocks } from '@/lib/lessonBlocks';

const blocks = normalizeBlocks([
  {
    type: 'landscape',
    title: 'Kinds of database',
    categories: [
      { name: 'Relational', summary: 'Tables with strict schemas.', items: [{ name: 'PostgreSQL', note: 'general purpose' }, { name: 'MySQL', note: '' }] },
      { name: 'Document', summary: 'JSON-like records.', items: [{ name: 'MongoDB', note: 'flexible schemas' }] },
    ],
    note: 'Verify as of Oct 2026.',
  },
  {
    type: 'timeline',
    title: 'A realistic path',
    phases: [
      { label: 'Basics', duration: 'Weeks 1-4', goal: 'Write simple queries', milestones: ['Build a to-do app', 'Join two tables'] },
      { label: 'Depth', duration: 'Weeks 5-12', goal: 'Design a schema', milestones: [] },
    ],
  },
  { type: 'case_study', title: 'A migration', basis: 'documented', situation: 'The team had X.', choice: 'They moved to Y.', reasons: ['Load grew'], outcome: 'Latency fell.', lesson: 'Match the tool to the load.' },
  { type: 'case_study', title: 'A made-up shop', situation: 'A small shop.', choice: 'Kept the monolith.', lesson: 'Stay simple.' },
]);

describe('landscape, timeline and case study', () => {
  const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} />);

  it('draws each category with its purpose and examples', () => {
    expect(html).toContain('Relational');
    expect(html).toContain('Tables with strict schemas.');
    expect(html).toContain('PostgreSQL');
    expect(html).toContain(': general purpose');
    expect(html).toContain('Verify as of Oct 2026.');
  });

  it('draws the path as an ordered list with numbered phases and checkable milestones', () => {
    expect(html).toContain('<ol');
    expect(html).toContain('Weeks 1-4');
    expect(html).toContain('Write simple queries');
    expect(html).toContain('Build a to-do app');
    expect(html).toContain('☐');
  });

  it('labels a case as documented or illustrative, and shows the lesson', () => {
    expect(html).toContain('Documented case');
    expect(html).toContain('Illustrative scenario, not a real company');
    expect(html).toContain('Match the tool to the load.');
    expect(html).toContain('What they chose');
    expect(html).toContain('Latency fell.');
  });

  it('leaves out the parts a case does not have', () => {
    const lone = renderToStaticMarkup(<LessonBlocks blocks={blocks.slice(3)} />);
    expect(lone).not.toContain('What happened');
    expect(lone).not.toContain('>Why<');
  });

  it('uses no hue', () => {
    expect(html).not.toMatch(/class="[^"]*\b(text|bg|border)-(danger|success|warning|primary|secondary|accent)\b/);
  });
});
