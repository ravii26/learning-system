import { describe, expect, it } from 'vitest';
import { goalDisplayName, pickToday, planToday, rankFocus, shortGoalName, type FocusFacts } from './focusQueue';

const now = new Date('2026-06-15T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const ahead = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

const item = (id: string, over: Partial<FocusFacts> = {}): FocusFacts => ({
  id, rhythm: 'few_weekly', targetDate: null, createdAt: ago(30), lastActivityAt: ago(1),
  sessionsThisWeek: 0, doneToday: false, skippedToday: false, addedToday: false, finished: false, ...over,
});
const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);
const rank = (items: FocusFacts[]) => rankFocus(items, now);

describe('rankFocus', () => {
  it('puts close deadlines first, soonest at the top', () => {
    const r = rank([item('habit', { rhythm: 'daily' }), item('later', { rhythm: 'by_date', targetDate: ahead(9) }), item('soon', { rhythm: 'by_date', targetDate: ahead(2) })]);
    expect(ids(r)).toEqual(['soon', 'later', 'habit']);
    expect(r[0].reason).toBe('Due in 2 days');
  });

  it('keeps a far-off date below what is due now', () => {
    const r = rank([item('far', { rhythm: 'by_date', targetDate: ahead(60) }), item('habit', { rhythm: 'daily' })]);
    expect(ids(r)).toEqual(['habit', 'far']);
    expect(r[1].reason).toBe('Due in 60 days');
  });

  it('treats a rhythm that is behind as due, and a met one as optional', () => {
    const r = rank([item('met', { sessionsThisWeek: 3, lastActivityAt: ago(5) }), item('behind', { sessionsThisWeek: 1 })]);
    expect(ids(r)).toEqual(['behind', 'met']);
    expect(r[0].reason).toBe('1 of 3 times this week');
  });

  it('within a rhythm, picks what was left longest', () => {
    const r = rank([item('recent', { lastActivityAt: ago(2) }), item('neglected', { lastActivityAt: ago(9) })]);
    expect(ids(r)).toEqual(['neglected', 'recent']);
    expect(r[0].reason).toBe('Not studied in 9 days');
  });

  it('leaves "when I can" until everything else has had a turn', () => {
    const r = rank([item('spare', { rhythm: 'when_i_can', lastActivityAt: ago(40) }), item('met', { sessionsThisWeek: 5 })]);
    expect(ids(r)).toEqual(['met', 'spare']);
    expect(r[0].tier).toBe(2);
  });

  it('describes something never studied as new', () => {
    expect(rank([item('fresh', { lastActivityAt: null })])[0].reason).toBe('Not started yet');
  });

  it('counts days the way a calendar does', () => {
    const inThreeDaysPlusHours = new Date(now.getTime() + 3 * 86_400_000 + 90 * 60_000).toISOString();
    expect(rank([item('date', { targetDate: inThreeDaysPlusHours })])[0].reason).toBe('Due in 3 days');
  });

  it('flags an overdue date', () => {
    expect(rank([item('late', { targetDate: ago(2) })])[0].reason).toBe('Past its date');
  });
});

describe('shortGoalName', () => {
  it.each([
    ['Complete DSA Interview Preparation for 20 LPA+ SDE Roles: interview-ready', 'DSA Interview Preparation'],
    ['Spoken English Fluency for Everyday Conversations, Work and Interviews: fluent', 'Spoken English Fluency'],
    ['System Design: interview-ready', 'System Design'],
    ['Charismatic Communication, Public Speaking and Personal Presence: fluent', 'Charismatic Communication'],
    ['Sales and Marketing for Tech Founders: From Finding Customers', 'Sales and Marketing'],
  ])('shortens %s', (long, short) => {
    expect(shortGoalName(long)).toBe(short);
  });

  it('prefers the name you chose', () => {
    expect(goalDisplayName({ title: 'A long title for things', shortName: 'DSA' })).toBe('DSA');
    expect(goalDisplayName({ title: 'A long title for things', shortName: ' ' })).toBe('A long title');
  });
});

describe('planToday', () => {
  const items = () => rank([item('a', { doneToday: true }), item('b'), item('c')]);

  it('counts open review as a step', () => {
    expect(planToday(items(), 'deep', 0, { due: 5, reviewedToday: false })).toMatchObject({ reviewOpen: true, doneCount: 1, total: 4 });
  });

  it('counts finished review as done', () => {
    expect(planToday(items(), 'deep', 0, { due: 0, reviewedToday: true })).toMatchObject({ reviewOpen: false, doneCount: 2, total: 4 });
  });

  it('leaves review out when there was none today', () => {
    expect(planToday(items(), 'deep', 0, { due: 0, reviewedToday: false })).toMatchObject({ doneCount: 1, total: 3 });
  });
});

describe('pickToday', () => {
  const four = () => rank(['a', 'b', 'c', 'd'].map((id, i) => item(id, { lastActivityAt: ago(10 - i) })));

  it('sizes the list by how much you have today', () => {
    expect(ids(pickToday(four(), 'quick').list)).toEqual(['a']);
    expect(ids(pickToday(four(), 'normal').list)).toEqual(['a', 'b']);
    expect(ids(pickToday(four(), 'deep').list)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('counts finished items against the day', () => {
    const items = rank([item('a', { doneToday: true }), item('b'), item('c')]);
    const p = pickToday(items, 'normal');
    expect(ids(p.done)).toEqual(['a']);
    expect(p.list).toHaveLength(1);
  });

  it('ends the list when the day is full, with the rest still offered', () => {
    const items = rank([item('a', { doneToday: true }), item('b', { doneToday: true }), item('c')]);
    const p = pickToday(items, 'normal');
    expect(p.list).toEqual([]);
    expect(ids(p.others)).toEqual(['c']);
  });

  it('adds one more each time you keep going', () => {
    expect(pickToday(four(), 'quick', 1).list).toHaveLength(2);
  });

  it('brings in the next item when one is skipped', () => {
    const items = rank([item('a', { skippedToday: true, lastActivityAt: ago(9) }), item('b', { lastActivityAt: ago(5) }), item('c', { lastActivityAt: ago(2) })]);
    const p = pickToday(items, 'quick');
    expect(ids(p.list)).toEqual(['b']);
    expect(ids(p.others)).toEqual(['c']);
  });

  it('keeps what you added even past the day\'s size', () => {
    const items = rank([item('a', { lastActivityAt: ago(9) }), item('mine', { addedToday: true, rhythm: 'when_i_can' })]);
    expect(ids(pickToday(items, 'quick').list)).toEqual(['mine']);
  });

  it('leaves out finished lessons', () => {
    expect(pickToday(rank([item('a', { finished: true })]), 'normal').list).toEqual([]);
  });
});
