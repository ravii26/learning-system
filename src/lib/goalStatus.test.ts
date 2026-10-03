import { describe, expect, it } from 'vitest';
import { planGoalTransition, targetStatus, type GoalTopic } from './goalStatus';

const topic = (id: string, status: string, extra: Partial<GoalTopic> = {}): GoalTopic => ({
  id, status, mode: 'syllabus', started: status !== 'inbox', heldByOtherGoal: false, ...extra,
});

describe('targetStatus', () => {
  it('pausing rests what is in play and leaves the rest', () => {
    expect(targetStatus('paused', 'active', { mode: 'syllabus', started: true })).toBe('paused');
    expect(targetStatus('paused', 'queued', { mode: 'syllabus', started: false })).toBe('paused');
    expect(targetStatus('paused', 'maintenance', { mode: 'practice', started: true })).toBe('paused');
    expect(targetStatus('paused', 'maintenance', { mode: 'syllabus', started: true })).toBe('maintenance');
    expect(targetStatus('paused', 'inbox', { mode: 'syllabus', started: false })).toBe('inbox');
  });

  it('achieving keeps studied topics fresh and files unstarted ones', () => {
    expect(targetStatus('achieved', 'active', { mode: 'syllabus', started: true })).toBe('maintenance');
    expect(targetStatus('achieved', 'inbox', { mode: 'syllabus', started: false })).toBe('reference');
    expect(targetStatus('achieved', 'maintenance', { mode: 'practice', started: true })).toBe('paused');
  });

  it('letting go archives everything; not started sends topics to the Inbox', () => {
    expect(targetStatus('abandoned', 'maintenance', { mode: 'syllabus', started: true })).toBe('dropped');
    expect(targetStatus('draft', 'active', { mode: 'syllabus', started: true })).toBe('inbox');
  });
});

describe('planGoalTransition', () => {
  it('pause then resume puts every topic back where it was', () => {
    const topics = [topic('a', 'active'), topic('b', 'queued'), topic('c', 'inbox')];
    const paused = planGoalTransition({ to: 'paused', topics, snapshot: null, slotsFree: 0 });
    expect(paused.updates).toEqual([{ id: 'a', status: 'paused' }, { id: 'b', status: 'paused' }]);

    const after = topics.map((t) => ({ ...t, status: paused.updates.find((u) => u.id === t.id)?.status ?? t.status }));
    const resumed = planGoalTransition({ to: 'active', topics: after, snapshot: paused.snapshot, slotsFree: 2 });
    expect(resumed.updates).toEqual([{ id: 'a', status: 'active' }, { id: 'b', status: 'queued' }]);
    expect(resumed.snapshot).toBeNull();
  });

  it('a topic moved by hand while paused is left alone on resume', () => {
    const paused = planGoalTransition({ to: 'paused', topics: [topic('a', 'active')], snapshot: null, slotsFree: 0 });
    const resumed = planGoalTransition({ to: 'active', topics: [topic('a', 'dropped')], snapshot: paused.snapshot, slotsFree: 2 });
    expect(resumed.updates).toEqual([]);
  });

  it('restores to Next when Now is full', () => {
    const paused = planGoalTransition({ to: 'paused', topics: [topic('a', 'active')], snapshot: null, slotsFree: 0 });
    const resumed = planGoalTransition({ to: 'active', topics: [topic('a', 'paused')], snapshot: paused.snapshot, slotsFree: 0 });
    expect(resumed.updates).toEqual([{ id: 'a', status: 'queued' }]);
  });

  it('paused → let go → working on it still remembers the original status', () => {
    const p = planGoalTransition({ to: 'paused', topics: [topic('a', 'active')], snapshot: null, slotsFree: 0 });
    const g = planGoalTransition({ to: 'abandoned', topics: [topic('a', 'paused')], snapshot: p.snapshot, slotsFree: 0 });
    expect(g.updates).toEqual([{ id: 'a', status: 'dropped' }]);
    expect(g.snapshot).toEqual({ a: { before: 'active', set: 'dropped' } });
    const back = planGoalTransition({ to: 'active', topics: [topic('a', 'dropped')], snapshot: g.snapshot, slotsFree: 1 });
    expect(back.updates).toEqual([{ id: 'a', status: 'active' }]);
  });

  it('skips topics another active goal still needs', () => {
    const plan = planGoalTransition({ to: 'abandoned', topics: [topic('a', 'active', { heldByOtherGoal: true })], snapshot: null, slotsFree: 0 });
    expect(plan.updates).toEqual([]);
  });
});

describe('areaForPlan', async () => {
  const { areaForPlan } = await import('./program/persist');
  it('types plans from what they are about', () => {
    expect(areaForPlan('Spoken English for interviews', 'language', false)).toBe('Personal');
    expect(areaForPlan('Personal finance and investing', 'academic', false)).toBe('Finance');
    expect(areaForPlan('Backend engineering', undefined, true)).toBe('Tech');
    expect(areaForPlan('Guitar basics using chords', 'performance', false)).toBe('Creative');
    expect(areaForPlan('Using history to pass the exam', 'exam', false)).toBe('Other');
  });
});
