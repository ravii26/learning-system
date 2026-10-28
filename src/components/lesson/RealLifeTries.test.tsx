import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RealLifeTries } from './RealLifeTries';

describe('RealLifeTries', () => {
  it('draws nothing when the lesson has none', () => {
    expect(renderToStaticMarkup(<RealLifeTries items={[]} />)).toBe('');
  });
  it('shows each task with its type, timing and how to tell it worked, without colour classes', () => {
    const h = renderToStaticMarkup(
      <RealLifeTries items={[{ type: 'habit', task: 'Speak first in one meeting', how: 'Prepare one sentence beforehand.', when: 'This week', check: 'You spoke within the first five minutes' }]} />,
    );
    expect(h).toContain('Try it in real life');
    expect(h).toContain('Change a habit');
    expect(h).toContain('This week');
    expect(h).toContain('Speak first in one meeting');
    expect(h).toContain('You’ll know it worked when:');
    expect(h).not.toMatch(/text-(red|green|blue|amber)|bg-(red|green|blue|amber)/);
  });
});
