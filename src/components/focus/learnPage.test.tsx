import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ error: () => {}, success: () => {} }) }));

import FocusPaths from './FocusPaths';
import LaterList from './LaterList';
import type { FocusApi, FocusEntry } from '@/lib/useFocus';

const entry = (over: Partial<FocusEntry>): FocusEntry => ({
  id: 'x', kind: 'topic', goalId: null, topicId: 't', moduleId: null, title: 'Item', nextStep: null, href: '/topics/t',
  estimatedMinutes: null, lessonKind: null, canUndo: false, position: null, steps: [], lessonsDone: 0, lessonsTotal: 0,
  currentTopic: null, setup: null, movedOnFrom: null, previousLesson: null, rhythm: 'few_weekly', targetDate: null,
  createdAt: '2026-11-01T00:00:00.000Z', lastActivityAt: null, sessionsThisWeek: 0, doneToday: false, skippedToday: false,
  addedToday: false, finished: false, tier: 1, reason: '', ...over,
});

const focusOf = (items: FocusEntry[]) => ({ items, offFocus: null, loaded: true }) as unknown as FocusApi;

const goal = entry({
  id: 'g', kind: 'goal', goalId: 'g1', topicId: null, title: 'Web developer', nextStep: 'Closures', href: '/topics/js?module=c',
  lastActivityAt: new Date().toISOString(), lessonsDone: 9, lessonsTotal: 30, currentTopic: { title: 'JavaScript', lessonsDone: 9, lessonsTotal: 16 },
  steps: [
    { id: 'html', title: 'HTML', state: 'done', href: '/topics/html', lessonsDone: 14, lessonsTotal: 14 },
    { id: 'js', title: 'JavaScript', state: 'current', href: '/topics/js', lessonsDone: 9, lessonsTotal: 16 },
  ],
});

describe('Learn page', () => {
  it('shows every step of a goal without opening anything', () => {
    const html = renderToStaticMarkup(<FocusPaths focus={focusOf([goal])} />);
    expect(html).toContain('Learning now');
    expect(html).toContain('HTML');
    expect(html).toContain('Next: Closures');
    expect(html).toContain('role="progressbar"');
  });

  it('leads with something to study, never a habit', () => {
    const habit = entry({ id: 'h', kind: 'custom', topicId: null, href: null, title: 'Read 20 pages', lastActivityAt: new Date(Date.now() + 1000).toISOString() });
    const html = renderToStaticMarkup(<FocusPaths focus={focusOf([habit, goal])} />);
    expect(html.indexOf('Closures')).toBeLessThan(html.indexOf('Read 20 pages'));
    expect(html).toContain('Mark done');
  });

  it('folds a long path around where you are', () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, title: `Lesson ${i}`, state: i < 8 ? 'done' as const : i === 8 ? 'current' as const : 'todo' as const, href: `/l${i}` }));
    const html = renderToStaticMarkup(<FocusPaths focus={focusOf([entry({ steps, lessonsDone: 8, lessonsTotal: 12 })])} />);
    expect(html).toContain('Lesson 8');
    expect(html).not.toContain('Lesson 0<');
    expect(html).toContain('Show all 12');
  });

  it('lists waiting goals and topics, leaving out what you already started', () => {
    const topics = [
      { id: 't1', title: 'Neural nets', status: 'active', goal: { id: 'ml' } },
      { id: 't2', title: 'Pinned one', status: 'active', goal: { id: 'ml' } },
      { id: 't3', title: 'Loose topic', status: 'active', goal: null },
      { id: 't4', title: 'Dropped one', status: 'dropped', goal: null },
    ];
    const goals = [
      { id: 'ml', title: 'Machine learning', shortName: null, status: 'active' },
      { id: 'old', title: 'Old goal', shortName: null, status: 'achieved' },
    ];
    const html = renderToStaticMarkup(<LaterList focus={focusOf([entry({ topicId: 't2' })])} goals={goals} topics={topics} />);
    expect(html).toContain('Machine learning');
    expect(html).toContain('Neural nets');
    expect(html).toContain('Loose topic');
    expect(html).not.toContain('Pinned one');
    expect(html).not.toContain('Dropped one');
    expect(html).not.toContain('Old goal');
  });

  it('draws nothing when nothing is waiting', () => {
    expect(renderToStaticMarkup(<LaterList focus={focusOf([])} goals={[]} topics={[]} />)).toBe('');
  });
});
