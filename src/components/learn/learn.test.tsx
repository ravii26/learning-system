import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { StartLearning } from './StartLearning';
import { AllLessons } from './AllLessons';
import { INTENTS } from '@/lib/startLearning';
import { LESSON_KINDS, LESSON_KIND_LABEL } from '@/lib/lessonKinds';
import { buildOverview } from '@/lib/lessonOverview';

const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

describe('Start learning', () => {
  it('starts empty: asks the question, lists every purpose, and shows nothing to create yet', () => {
    const html = render(<StartLearning />);
    expect(html).toContain('What do you want to learn?');
    for (const i of INTENTS) expect(html, i.key).toContain(i.label);
    expect(html).not.toContain('What you will get');
    expect(html).not.toContain('How big?');
    expect(html).toContain('Type what you want to learn to see what you would get');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start now<\/button>/);
  });

  it('a title that reads like a decision picks that purpose and shows what you would get', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Postgres vs MongoDB' }} />));
    expect(html).toContain('That reads like “Choose between options”');
    expect(html).toContain('How big?');
    expect(html).toContain('What you will get');
    expect(html).toContain('comparison table');
    expect(html).toContain('Sections in this lesson');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Start now<\/button>/);
  });

  it('a purpose you choose yourself wins over the guess, and the guess note goes away', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Postgres vs MongoDB', pickedIntent: 'memorise' }} />));
    expect(html).not.toContain('That reads like');
    expect(html).toContain('things to memorise');
    // Its own sections are offered (the list, plus an optional comparison table), not the decision ones.
    expect(html).toContain('Sections in this lesson');
    expect(html).toContain('Things to memorise');
    expect(html).toContain('Comparison table');
    expect(html).not.toContain('How-to-decide flowchart');
  });

  it('a plain title defaults to an understanding lesson', () => {
    const html = render(<StartLearning initial={{ title: 'Binary search' }} />);
    expect(html).toContain('Format: Understand it');
    expect(html).toContain('What you will get');
  });

  it('ongoing is offered for practising and shows the daily-practice preview', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Guitar', pickedIntent: 'practise', pickedSize: 'ongoing' }} />));
    expect(html).toContain('Daily practice');
    expect(html).toContain('A daily practice topic');
    expect(html).toContain('Start now');
  });

  it('ongoing is not offered for a decision, and a stale choice falls back to one lesson', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Choosing a stack', pickedIntent: 'decide', pickedSize: 'ongoing' }} />));
    expect(html).not.toContain('Collect ideas');
    expect(html).not.toContain('Daily practice');
    expect(html).toContain('1 lesson, about 20 minutes');
  });

  it('a series hands over to the course builder with your answers in the address', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Cloud choices', pickedIntent: 'decide', pickedSize: 'series', why: 'for work' }} />));
    expect(html).toContain('href="/learn/new?title=Cloud+choices&kind=syllabus');
    expect(html).toContain('moduleKind=decision');
    expect(html).toContain('>Continue<');
    expect(html).not.toContain('>Start now<');
  });

  it('a plan hands over to the plan wizard with the goal', () => {
    const html = decode(render(<StartLearning initial={{ title: 'Become a data engineer', pickedIntent: 'path', pickedSize: 'plan' }} />));
    expect(html).toContain('href="/learn/program?goal=Become+a+data+engineer"');
  });

  it('links to the overview without exposing the older picker, and uses no colour', () => {
    const html = render(<StartLearning />);
    expect(html).toContain('href="/learn/all"');
    expect(html).not.toContain('href="/learn/new"');
    expect(html).not.toMatch(/class="[^"]*\b(text|bg|border)-(success|warning|primary|accent)\b/);
  });
});

describe('All lessons', () => {
  const rows = buildOverview(
    [
      { topicId: 'a', topicTitle: 'Web architecture', topicStatus: 'active', topicMode: 'syllabus', legacyId: 'm1', title: 'Choosing a stack', order: 1, kind: 'decision', blueprint: null, completed: false, estimatedMinutes: 20 },
      { topicId: 'a', topicTitle: 'Web architecture', topicStatus: 'active', topicMode: 'syllabus', legacyId: 'm2', title: 'Hosting', order: 2, kind: 'concept', blueprint: null, completed: true, estimatedMinutes: 30 },
      { topicId: 'b', topicTitle: 'Guitar', topicStatus: 'queued', topicMode: 'syllabus', legacyId: 'g1', title: 'Chord changes', order: 1, kind: 'drill', blueprint: null, completed: false, estimatedMinutes: 25 },
    ],
    [{ topicId: 'a', moduleId: 'm1', content: { kind: 'concept' } }, { topicId: 'a', moduleId: 'm2', content: {} }],
  );

  it('groups lessons by topic with a plain summary, kind badges and state', () => {
    const html = decode(render(<AllLessons initialRows={rows} />));
    expect(html).toContain('All lessons');
    expect(html).toContain('3 lessons · 2 written · 1 needs regenerating');
    expect(html).toContain('Web architecture');
    expect(html).toContain('Guitar');
    expect(html).toContain('Choosing a stack');
    expect(html).toContain('Decision');
    expect(html).toContain('Practice');
    expect(html).toContain('Not written yet');
    expect(html).toContain('Finished');
  });

  it('flags a lesson changed after it was written, and explains that the old version stays', () => {
    const html = decode(render(<AllLessons initialRows={rows} />));
    expect(html).toContain('Needs regenerating');
    expect(html).toContain('Written as “understand a concept”, now set to “make a decision”');
    expect(html).toContain('stays readable until you regenerate');
    expect(html).toContain('1 lesson was changed after being written');
  });

  it('links each lesson to its place in the topic', () => {
    const html = render(<AllLessons initialRows={rows} />);
    expect(html).toContain('href="/topics/a?module=m1"');
    expect(html).toContain('href="/topics/b?module=g1"');
  });

  it('offers a filter for every kind and every state', () => {
    const html = render(<AllLessons initialRows={rows} />);
    for (const k of LESSON_KINDS) expect(html, k).toContain(LESSON_KIND_LABEL[k]);
    for (const s of ['Not written yet', 'Written', 'Needs regenerating', 'Finished']) expect(html).toContain(s);
  });

  it('an empty list invites you to start learning', () => {
    const html = render(<AllLessons initialRows={[]} />);
    expect(html).toContain('You have no lessons yet.');
    expect(html).toContain('href="/learn/start"');
  });

  it('shows a loading summary before the list has arrived', () => {
    expect(render(<AllLessons />)).toContain('Loading…');
  });
});
