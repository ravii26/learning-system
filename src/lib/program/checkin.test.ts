import { describe, it, expect } from 'vitest';
import { getMap } from '@/data/competencies';
import {
  detectSignals, expectedPhase, parseProposal, fallbackProposal, resolveDecisions, applyChanges,
  type WeekSummary, type VersionState, type Change,
} from './checkin';

const week = (over: Partial<WeekSummary> = {}): WeekSummary => ({
  windowStart: '2026-10-01', windowEnd: '2026-10-08', plannedMinutes: 420, actualMinutes: 400,
  modulesCompleted: [], quizzes: [], problems: { cold: 0, hint: 0, stuck: 0, stuckKeys: [] },
  lapses: [], practiceReps: 0, currentPhase: 1, expectedPhase: 1, ...over,
});

describe('signals', () => {
  it('an on-track week produces none (so no AI call and no proposal)', () => {
    expect(detectSignals(week())).toEqual([]);
  });

  it('flags low time, being behind schedule, and weak topics with their reasons', () => {
    const s = detectSignals(week({
      actualMinutes: 200, currentPhase: 1, expectedPhase: 2,
      quizzes: [{ key: 'sd-caching', title: 'Caching', score: 0.5 }],
      lapses: [{ key: 'sd-caching', title: 'Caching', count: 3 }, { key: 'sd-queues', title: 'Queues', count: 1 }],
    }));
    expect(s.map((x) => x.id)).toEqual(['time', 'schedule', 'weak:sd-caching']);
    expect(s[2].text).toBe('Caching: quiz 50%, forgot 3 review cards.');
  });

  it('knows where the schedule expects you', () => {
    expect(expectedPhase([3, 4, 2], 0)).toBe(1);
    expect(expectedPhase([3, 4, 2], 3)).toBe(2);
    expect(expectedPhase([3, 4, 2], 99)).toBe(3);
  });
});

describe('proposal parsing', () => {
  const signals = [{ id: 'time', text: 't' }, { id: 'weak:sd-caching', text: 'w' }];
  const keys = ['sd-caching', 'sd-databases'];

  it('keeps valid, cited changes; clamps numbers; drops uncited, unknown and extra ones', () => {
    const raw = JSON.stringify({ changes: [
      { type: 'set_hours', hoursPerWeek: 500, reason: 'Match reality.', evidence: ['time'] },
      { type: 'emphasize', competencyKey: 'sd-caching', factor: 9, reason: 'Weak quiz.', evidence: ['weak:sd-caching', 'made-up'] },
      { type: 'emphasize', competencyKey: 'sd-databases', factor: 1.2, reason: 'No evidence cited.', evidence: [] },
      { type: 'delete_phase', reason: 'x', evidence: ['time'] },
      { type: 'focus', competencyKey: 'nope', text: 'x', reason: 'r', evidence: ['time'] },
      { type: 'focus', competencyKey: 'sd-caching', text: 'Redo the cache-aside drill.', reason: 'Weak.', evidence: ['weak:sd-caching'] },
      { type: 'set_hours', hoursPerWeek: 3, reason: 'Fourth change.', evidence: ['time'] },
    ] });
    const out = parseProposal(raw, signals, keys);
    expect(out).toEqual([
      { type: 'set_hours', hoursPerWeek: 60, reason: 'Match reality.', evidence: ['time'] },
      { type: 'emphasize', competencyKey: 'sd-caching', factor: 1.5, reason: 'Weak quiz.', evidence: ['weak:sd-caching'] },
      { type: 'focus', competencyKey: 'sd-caching', text: 'Redo the cache-aside drill.', reason: 'Weak.', evidence: ['weak:sd-caching'] },
    ]);
  });

  it('falls back to conservative changes without the AI', () => {
    const out = fallbackProposal(week({ actualMinutes: 120 }), signals);
    expect(out[0]).toMatchObject({ type: 'set_hours', hoursPerWeek: 4 }); // 60% of 7h, not below what you did
    expect(out[1]).toMatchObject({ type: 'emphasize', competencyKey: 'sd-caching' });
  });
});

describe('decisions and applying them', () => {
  const sd = getMap('system-design')!;
  const state: VersionState = {
    intake: { goal: 'sd', path: 'quick', currentLevel: 'beginner', hoursPerWeek: 7, target: 'use', budget: 'free_only' },
    map: sd, emphasis: {}, focus: {},
    items: [
      { id: 'a', phase: 1, shape: 'course', competencyKeys: ['sd-scalability', 'sd-caching'], hoursPerWeek: 7, weeks: 2, focus: null },
      { id: 'b', phase: 2, shape: 'course', competencyKeys: ['sd-databases'], hoursPerWeek: 7, weeks: 2, focus: null },
    ],
  };
  const proposal: Change[] = [
    { type: 'set_hours', hoursPerWeek: 4, reason: 'r', evidence: ['time'] },
    { type: 'emphasize', competencyKey: 'sd-caching', factor: 1.3, reason: 'r', evidence: ['weak:sd-caching'] },
    { type: 'focus', competencyKey: 'sd-caching', text: 'Do the drill.', reason: 'r', evidence: ['weak:sd-caching'] },
  ];

  it('applies accepts and modifies, skips declines', () => {
    const out = resolveDecisions(proposal, [
      { index: 0, action: 'modify', value: 5 },
      { index: 1, action: 'decline' },
      { index: 2, action: 'accept' },
    ]);
    expect(out).toEqual([{ ...proposal[0], hoursPerWeek: 5 }, proposal[2]]);
  });

  it('keeps the same items and topics, stretches phases for fewer hours, carries focus to the right item', () => {
    const next = applyChanges(state, [proposal[0], proposal[1], proposal[2]]);
    expect(next.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(next.intake.hoursPerWeek).toBe(4);
    const before = applyChanges(state, []);
    expect(next.totalWeeks).toBeGreaterThan(before.totalWeeks);
    expect(next.items[0].focus).toBe('Do the drill.');
    expect(next.items[1].focus).toBeNull();
    expect(next.emphasis['sd-caching']).toBe(1.3);
    for (const it of next.items) expect(it.hoursPerWeek).toBeLessThanOrEqual(4 + 0.5);
  });
});

describe('citations', () => {
  const signals = [
    { id: 'time', text: 'Studied 2h of 7h planned (29%).' },
    { id: 'weak:sd-requirements', text: 'Requirements and estimation: forgot 2 review cards.' },
  ];
  it('maps quoted fact text and [id] to the fact id, but never invents one', () => {
    const out = parseProposal(JSON.stringify({ changes: [
      { type: 'set_hours', hoursPerWeek: 5, reason: 'r', evidence: ['Studied 2h of 7h planned (29%)'] },
      { type: 'emphasize', competencyKey: 'sd-requirements', factor: 1.5, reason: 'r', evidence: ['forgot 2 review cards'] },
      { type: 'emphasize', competencyKey: 'sd-requirements', factor: 1.2, reason: 'r', evidence: ['[weak:sd-requirements]'] },
      { type: 'set_hours', hoursPerWeek: 3, reason: 'r', evidence: ['the learner seems tired'] },
    ] }), signals, ['sd-requirements']);
    expect(out.map((c) => c.evidence)).toEqual([['time'], ['weak:sd-requirements'], ['weak:sd-requirements']]);
  });
});
