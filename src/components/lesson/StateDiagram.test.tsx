import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { LessonBlocks } from './LessonBlocks';
import { normalizeBlocks } from '@/lib/lessonBlocks';
import { normalizeLesson } from '@/lib/lessonNormalize';
import { extractJson } from '@/lib/ai/manual';
import { BLOCK_LABEL } from '@/lib/lessonBlocks';

const blocks = normalizeBlocks([{
  type: 'state_diagram',
  title: 'Order lifecycle',
  states: [
    { id: 'placed', label: 'Placed', detail: 'Waiting for payment', col: 0, row: 0, start: true },
    { id: 'paid', label: 'Paid', col: 1, row: 0, style: 'main' },
    { id: 'shipped', label: 'Shipped', col: 2, row: 0 },
    { id: 'refunded', label: 'Refunded', col: 0, row: 2, style: 'restricted' },
    { id: 'held', label: 'On hold', col: 1, row: 1, style: 'temporary' },
  ],
  transitions: [
    { from: 'placed', to: 'paid', label: 'payment received' },
    { from: 'paid', to: 'shipped', label: 'dispatched' },
    { from: 'paid', to: 'held', label: 'address check fails' },
    { from: 'held', to: 'paid', label: 'address fixed' },
    { from: 'paid', to: 'refunded', label: 'refund requested' }, // two rows apart: cannot be drawn
  ],
  note: 'Illustrative.',
}]);

describe('StateDiagram', () => {
  const html = renderToStaticMarkup(<LessonBlocks blocks={blocks} />);

  it('draws boxes, arrows, an arrowhead and labels', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('marker-end="url(#sd-arrow)"');
    expect(html).toContain('payment received');
    expect(html).toContain('Waiting for payment');
  });

  it('shows what kind of state it is by border, never by colour', () => {
    expect(html).toContain('stroke-dasharray="7 4"'); // temporary
    expect(html).toContain('stroke-width="3"'); // main
    expect(html).toContain('Thick border: the main state');
    expect(html).toContain('Dashed border: temporary');
    expect(html).toContain('Double border: restricted');
    expect(html).toContain('Dot: where it starts');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}|rgb\(|hsl\(/i);
  });

  it('lists every transition as text, and says which ones are not drawn', () => {
    expect(html).toContain('Placed → Paid: payment received');
    expect(html).toContain('Paid → Refunded: refund requested (not drawn above)');
    expect(html).not.toContain('Placed → Paid: payment received (not drawn above)');
  });

  it('is operable from the keyboard and described for screen readers', () => {
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('<desc>');
    expect(html).toContain('aria-live="polite"');
  });

  it('only explains the border styles that are used', () => {
    const plain = normalizeBlocks([{
      type: 'state_diagram',
      states: [{ id: 'a', label: 'A', col: 0, row: 0 }, { id: 'b', label: 'B', col: 1, row: 0 }, { id: 'c', label: 'C', col: 2, row: 0 }],
      transitions: [{ from: 'a', to: 'b', label: 'x' }, { from: 'b', to: 'c', label: 'y' }, { from: 'c', to: 'a', label: 'z' }],
    }]);
    const h = renderToStaticMarkup(<LessonBlocks blocks={plain} />);
    expect(h).not.toContain('Thick border');
    expect(h).not.toContain('Dot: where it starts');
  });

  it('gets a redo button and a readable name like every other section', () => {
    expect(BLOCK_LABEL.state_diagram).toBe('Lifecycle diagram');
    expect(renderToStaticMarkup(<LessonBlocks blocks={blocks} onRedo={() => {}} />)).toContain('aria-label="Redo the lifecycle diagram section"');
  });
});

describe('the ready-made test replies', () => {
  const dir = path.resolve(__dirname, '../../../docs/lesson-test-replies');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(`${file} is accepted whole, nothing dropped`, () => {
      const found = extractJson(fs.readFileSync(path.join(dir, file), 'utf8'));
      expect(found.ok).toBe(true);
      const raw = (found as { value: { blocks: unknown[]; quiz: unknown[]; reviewCards: unknown[]; exercises: unknown[] } }).value;
      const out = normalizeLesson(raw)!;
      expect(out).not.toBeNull();
      expect((out.blocks as unknown[]).length).toBe(raw.blocks.length);
      expect((out.quiz as unknown[]).length).toBe(raw.quiz.length);
      expect((out.reviewCards as unknown[]).length).toBe(raw.reviewCards.length);
      expect((out.exercises as unknown[]).length).toBe(raw.exercises.length);
    });
  }
});
