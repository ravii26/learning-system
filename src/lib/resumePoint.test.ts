import { describe, expect, it } from 'vitest';
import { deadlineLabel, lastTouch, learnList, learnSummary, nearbySteps, pickTopic, progressLabel, resumeLesson, whenLabel, type LessonFacts } from './resumePoint';

describe('nearbySteps', () => {
  const path = (states: string[]) => states.map((state, id) => ({ id, state }));
  const ids = (steps: Array<{ id: number }>) => steps.map((s) => s.id);

  it('keeps a short path whole', () => {
    expect(ids(nearbySteps(path(['done', 'current']), 5))).toEqual([0, 1]);
  });

  it('starts one step before where you are', () => {
    expect(ids(nearbySteps(path(['done', 'done', 'done', 'current', 'todo', 'todo', 'todo', 'todo']), 3))).toEqual([2, 3, 4]);
  });

  it('stays inside the path near the end', () => {
    expect(ids(nearbySteps(path(['done', 'done', 'done', 'done', 'current']), 3))).toEqual([2, 3, 4]);
  });

  it('falls back to the first unfinished step, then the end', () => {
    expect(ids(nearbySteps(path(['done', 'done', 'todo', 'todo', 'todo']), 2))).toEqual([1, 2]);
    expect(ids(nearbySteps(path(['done', 'done', 'done', 'done']), 2))).toEqual([2, 3]);
  });
});

describe('learnSummary', () => {
  const item = (kind: string, lessonsDone = 0, lessonsTotal = 0, finished = false) => ({ kind, lessonsDone, lessonsTotal, finished });

  it('counts goals, topics and lessons', () => {
    expect(learnSummary([item('goal', 3, 10), item('goal', 1, 2), item('topic', 2, 8)])).toBe('2 goals and 1 topic in progress, 6 of 20 lessons done');
  });

  it('leaves out finished things, habits and empty lesson counts', () => {
    expect(learnSummary([item('topic'), item('custom'), item('goal', 5, 5, true)])).toBe('1 topic in progress');
  });

  it('says nothing when nothing is in progress', () => {
    expect(learnSummary([item('custom')])).toBeNull();
  });
});

const at = (day: number) => new Date(2026, 10, day, 12);
const lesson = (legacyId: string, completedDay?: number): LessonFacts => ({ legacyId, completed: completedDay !== undefined, completedAt: completedDay !== undefined ? at(completedDay) : null });

describe('lastTouch', () => {
  it('finds the latest visit or finished lesson', () => {
    const lessons = [lesson('a', 2), lesson('b')];
    expect(lastTouch(lessons, [{ moduleId: 'b', at: at(5) }])).toEqual({ lessonId: 'b', at: at(5) });
    expect(lastTouch(lessons, [{ moduleId: 'b', at: at(1) }])).toEqual({ lessonId: 'a', at: at(2) });
  });

  it('keeps the date of a visit outside any lesson but the place of the last lesson', () => {
    expect(lastTouch([lesson('a', 2)], [{ moduleId: null, at: at(8) }])).toEqual({ lessonId: 'a', at: at(8) });
  });

  it('ignores lessons that no longer exist', () => {
    expect(lastTouch([lesson('a')], [{ moduleId: 'gone', at: at(5) }])).toEqual({ lessonId: null, at: at(5) });
  });

  it('is empty when nothing has happened', () => {
    expect(lastTouch([lesson('a')], [])).toEqual({ lessonId: null, at: null });
  });
});

describe('resumeLesson', () => {
  const touch = (lessonId: string | null) => ({ lessonId, at: at(5) });

  it('starts at the first lesson if you have not begun', () => {
    expect(resumeLesson([lesson('a'), lesson('b')], touch(null))?.legacyId).toBe('a');
  });

  it('returns to a lesson you were part way through', () => {
    expect(resumeLesson([lesson('a'), lesson('b'), lesson('c')], touch('b'))?.legacyId).toBe('b');
  });

  it('moves past a skipped lesson when you went ahead', () => {
    expect(resumeLesson([lesson('a', 1), lesson('b'), lesson('c'), lesson('d', 4), lesson('e')], touch('d'))?.legacyId).toBe('e');
  });

  it('comes back for skipped lessons at the end', () => {
    expect(resumeLesson([lesson('a'), lesson('b', 4)], touch('b'))?.legacyId).toBe('a');
  });

  it('is empty when everything is done', () => {
    expect(resumeLesson([lesson('a', 1)], touch('a'))).toBeNull();
  });
});

describe('pickTopic', () => {
  type T = { id: string; status: string; left: boolean; lessons: boolean; touched: Date | null };
  const t = (id: string, over: Partial<T> = {}): T => ({ id, status: 'inbox', left: true, lessons: true, touched: null, ...over });
  const pick = (topics: T[]) => pickTopic(topics, (x) => x.left, (x) => x.lessons, (x) => x.touched);

  it('goes to the topic you studied last, not the first active one', () => {
    const r = pick([t('one', { status: 'active' }), t('two'), t('three', { touched: at(5) })]);
    expect(r.topic?.id).toBe('three');
    expect(r.movedOnFrom).toBeNull();
  });

  it('uses the most recent of several', () => {
    expect(pick([t('one', { touched: at(2) }), t('two', { touched: at(6) })]).topic?.id).toBe('two');
  });

  it('moves to the next topic once one is finished, and says so', () => {
    const r = pick([t('one', { left: false, touched: at(5) }), t('two')]);
    expect(r.topic?.id).toBe('two');
    expect(r.movedOnFrom?.id).toBe('one');
  });

  it('wraps back to anything left when the last topic was the end', () => {
    expect(pick([t('one'), t('two', { left: false, touched: at(5) })]).topic?.id).toBe('one');
  });

  it('skips a paused topic you studied last', () => {
    expect(pick([t('one', { status: 'paused', touched: at(5) }), t('two', { touched: at(2) })]).topic?.id).toBe('two');
  });

  it('starts with an active topic when nothing was studied, then the first', () => {
    expect(pick([t('one'), t('two', { status: 'active' })]).topic?.id).toBe('two');
    expect(pick([t('one'), t('two')]).topic?.id).toBe('one');
  });

  it('falls back to a topic with no lessons yet', () => {
    expect(pick([t('one', { left: false }), t('two', { left: false, lessons: false })]).topic?.id).toBe('two');
  });

  it('is empty when everything is finished', () => {
    expect(pick([t('one', { left: false, touched: at(5) })]).topic).toBeNull();
    expect(pick([]).topic).toBeNull();
  });
});

describe('labels', () => {
  it('counts up early and down near the end', () => {
    expect(progressLabel(0, 4)).toBe('4 lessons');
    expect(progressLabel(1, 12)).toBe('1 of 12 done');
    expect(progressLabel(6, 12)).toBe('6 lessons left');
    expect(progressLabel(3, 4)).toBe('1 lesson left');
    expect(progressLabel(4, 4)).toBe('Finished');
    expect(progressLabel(0, 0)).toBeNull();
  });

  it('says when in plain words', () => {
    const now = at(20);
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    expect(whenLabel(null, now)).toBeNull();
    expect([0, 1, 3, 8, 21, 90].map((d) => whenLabel(ago(d), now))).toEqual(['Today', 'Yesterday', '3 days ago', 'Last week', '3 weeks ago', '3 months ago']);
  });

  it('mentions a deadline only when close', () => {
    const now = at(10);
    expect(deadlineLabel(null, now)).toBeNull();
    expect(deadlineLabel(new Date(2026, 11, 20).toISOString(), now)).toBeNull();
    expect(deadlineLabel(at(14).toISOString(), now)).toBe('Due in 4 days');
    expect(deadlineLabel(at(11).toISOString(), now)).toBe('Due tomorrow');
    expect(deadlineLabel(at(10).toISOString(), now)).toBe('Due today');
    expect(deadlineLabel(at(8).toISOString(), now)).toBe('Deadline passed');
  });
});

describe('learnList', () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: 'topic', topicId: id, finished: false, doneToday: false, lastActivityAt: null as string | null, steps: [] as Array<{ id: string }>, ...over });

  it('does not lead with a book you just ticked off', () => {
    const list = learnList([item('book', { kind: 'custom', topicId: null, doneToday: true, lastActivityAt: at(9).toISOString() }), item('topic', { lastActivityAt: at(2).toISOString() })]);
    expect(list.map((i) => i.id)).toEqual(['topic', 'book']);
  });

  it('puts the most recent first and finished last', () => {
    const list = learnList([item('never'), item('done', { finished: true, lastActivityAt: at(9).toISOString() }), item('old', { lastActivityAt: at(2).toISOString() }), item('new', { lastActivityAt: at(6).toISOString() })]);
    expect(list.map((i) => i.id)).toEqual(['new', 'old', 'never', 'done']);
  });

  it('shows a topic once when its goal is also pinned', () => {
    const goal = item('g', { kind: 'goal', topicId: null, steps: [{ id: 't1' }] });
    const list = learnList([goal, item('t1'), item('t2')]);
    expect(list.map((i) => i.id).sort()).toEqual(['g', 't2']);
  });

  it('keeps custom items', () => {
    expect(learnList([item('c', { kind: 'custom', topicId: null })])).toHaveLength(1);
  });
});
