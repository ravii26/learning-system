import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonBlocks, formatCost } from './LessonBlocks';
import { BlueprintPicker } from './BlueprintPicker';
import { normalizeBlocks } from '@/lib/lessonBlocks';
import { KIND_BLOCKS } from '@/lib/lessonKinds';

const blocks = normalizeBlocks([
  {
    type: 'cost_chart',
    title: 'Cost as you grow',
    unit: 'USD per month, rough estimate',
    scenarios: [{ label: 'Hobby', assumption: 'few visits' }, { label: 'At scale', assumption: '1M users' }],
    series: [{ option: 'Next.js', values: [0, 900] }, { option: 'Rails', values: [6, 350] }],
    note: 'Verify as of Oct 2026.',
  },
  {
    type: 'matrix_2x2',
    title: 'Ease vs control',
    xAxis: { label: 'Ease of start', low: 'Harder', high: 'Easier' },
    yAxis: { label: 'Long-term control', low: 'Less', high: 'More' },
    points: [{ option: 'Next.js', x: 8, y: 3 }, { option: 'Rails', x: 5, y: 8 }],
  },
]);

describe('cost chart and 2x2', () => {
  const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} />);

  it('shows every bar with its estimate and the scenario assumption', () => {
    expect(html).toContain('~900');
    expect(html).toContain('~350');
    expect(html).toContain('~0');
    expect(html).toContain('1M users');
    expect(html).toContain('aria-label="Rails, At scale: about 350"');
    expect(html).toContain('Rough estimates, one scale for every bar');
  });

  it('puts every bar on one scale (the biggest is full width, a small one is thin)', () => {
    expect(html).toContain('width:100%');
    expect(html).toMatch(/width:1\.5%/);
  });

  it('draws the map as an accessible svg with a text description and a legend', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('Ease of start');
    expect(html).toContain('Next.js: Ease of start 8 of 10, Long-term control 3 of 10');
    expect(html).toContain('<circle');
    expect(html).toContain('<rect');
  });

  it('uses no hue: shades of ink and shapes only', () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|hsl\(/i);
    // Class names only: the svg text colour var(--color-text-primary) is the neutral ink, not a hue.
    expect(html).not.toMatch(/class="[^"]*\b(text|bg|border)-(danger|success|warning|primary|secondary|accent)\b/);
  });
});

describe('redo buttons', () => {
  it('appear only when a handler is given, one per section', () => {
    expect(renderToStaticMarkup(<LessonBlocks blocks={blocks} />)).not.toContain('Redo this section');
    const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} onRedo={() => {}} />);
    expect(html.match(/Redo this section/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Redo the cost at different sizes section"');
  });

  it('shows which section is being rewritten and disables the others', () => {
    const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} onRedo={() => {}} redoing={0} />);
    expect(html).toContain('Rewriting…');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });
});

describe('formatCost', () => {
  it('shortens thousands and rounds', () => {
    expect(formatCost(0)).toBe('0');
    expect(formatCost(60)).toBe('60');
    expect(formatCost(1200)).toBe('1.2k');
    expect(formatCost(15000)).toBe('15k');
    expect(formatCost(349.6)).toBe('350');
  });
});

describe('BlueprintPicker', () => {
  it('lists every section, ticking the chosen ones', () => {
    const html = renderToStaticMarkup(<BlueprintPicker allowed={KIND_BLOCKS.decision} value={['comparison_table']} onChange={() => {}} />);
    expect(html).toContain('Comparison table');
    expect(html).toContain('Cost at different sizes');
    expect(html).toContain('How-to-decide flowchart');
    expect(html).not.toContain('Learning path');
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
  });

  it('offers only the sections of the lesson kind, and nothing for a single-section kind', () => {
    const survey = renderToStaticMarkup(<BlueprintPicker allowed={KIND_BLOCKS.survey} value={[...KIND_BLOCKS.survey]} onChange={() => {}} />);
    expect(survey).toContain('Map of the field');
    expect(survey).not.toContain('How-to-decide flowchart');
    expect(renderToStaticMarkup(<BlueprintPicker allowed={['timeline']} value={['timeline']} onChange={() => {}} />)).toBe('');
  });
});
