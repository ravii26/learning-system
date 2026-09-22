import { describe, it, expect } from 'vitest';
import { generateSessionPlan, type Topic } from './sessionHeuristics';

const topic = (over: Partial<Topic> = {}): Topic => ({
  id: 't1',
  title: 'DSA Patterns',
  area: 'Tech',
  status: 'active',
  why: 'interviews',
  depthTarget: 'Proficiency',
  nextAction: 'Solve 2 mediums',
  activeSlotType: 'primary',
  ...over,
});

const primary = topic();
const secondary = topic({ id: 't2', title: 'System Design', activeSlotType: 'secondary' });

/** Every duration bucket the heuristic branches on, with both energy levels. */
const MATRIX: Array<{ time: number; energy: 'low' | 'normal' | 'high'; mistakes: number }> = [
  { time: 5, energy: 'low', mistakes: 0 },
  { time: 5, energy: 'low', mistakes: 3 },
  { time: 5, energy: 'normal', mistakes: 0 },
  { time: 5, energy: 'normal', mistakes: 3 },
  { time: 15, energy: 'low', mistakes: 0 },
  { time: 15, energy: 'high', mistakes: 2 },
  { time: 30, energy: 'low', mistakes: 0 },
  { time: 30, energy: 'normal', mistakes: 1 },
  { time: 60, energy: 'low', mistakes: 0 },
  { time: 60, energy: 'high', mistakes: 4 },
  { time: 120, energy: 'normal', mistakes: 0 },
  { time: 240, energy: 'high', mistakes: 9 },
];

describe('generateSessionPlan', () => {
  describe('universal invariants', () => {
    it('step durations always sum to totalDurationMin', () => {
      for (const { time, energy, mistakes } of MATRIX) {
        const plan = generateSessionPlan(time, energy, 'desk', [primary, secondary], 5, mistakes);
        const sum = plan.steps.reduce((acc, s) => acc + s.durationMin, 0);
        expect(sum, `time=${time} energy=${energy} mistakes=${mistakes}`).toBe(plan.totalDurationMin);
      }
    });

    it('always returns at least one step, each with a positive duration', () => {
      for (const { time, energy, mistakes } of MATRIX) {
        const plan = generateSessionPlan(time, energy, 'desk', [primary, secondary], 5, mistakes);
        expect(plan.steps.length).toBeGreaterThan(0);
        for (const step of plan.steps) {
          expect(step.durationMin, `${plan.title} / ${step.label}`).toBeGreaterThan(0);
        }
      }
    });

    it('always explains itself — title, subtitle and reason are non-empty', () => {
      for (const { time, energy, mistakes } of MATRIX) {
        const plan = generateSessionPlan(time, energy, 'desk', [primary, secondary], 5, mistakes);
        expect(plan.title.length).toBeGreaterThan(0);
        expect(plan.subtitle.length).toBeGreaterThan(0);
        expect(plan.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('topic targeting', () => {
    it('prefers the primary slot', () => {
      const plan = generateSessionPlan(30, 'normal', 'desk', [secondary, primary], 0, 0);
      expect(plan.topicId).toBe('t1');
      expect(plan.topicTitle).toBe('DSA Patterns');
    });

    it('falls back to the first topic when no slot is marked primary', () => {
      const a = topic({ id: 'a', title: 'A', activeSlotType: null });
      const b = topic({ id: 'b', title: 'B', activeSlotType: null });
      expect(generateSessionPlan(30, 'normal', 'desk', [a, b], 0, 0).topicId).toBe('a');
    });

    it('degrades to "all" when there are no active topics', () => {
      const plan = generateSessionPlan(30, 'normal', 'desk', [], 0, 0);
      expect(plan.topicId).toBe('all');
      expect(plan.topicTitle).toBe('All Active Interests');
    });

    it('does not crash on an empty topic list in any bucket', () => {
      for (const { time, energy, mistakes } of MATRIX) {
        expect(() => generateSessionPlan(time, energy, 'desk', [], 0, mistakes)).not.toThrow();
      }
    });
  });

  describe('branch selection', () => {
    it('uses the mistake bank for a 5-minute window when mistakes exist and energy is not low', () => {
      const plan = generateSessionPlan(5, 'normal', 'desk', [primary], 0, 3);
      expect(plan.title).toBe('Mistake Bank Quick-Fire');
    });

    it('falls back to spaced recall at 5 minutes when energy is low', () => {
      const plan = generateSessionPlan(5, 'low', 'desk', [primary], 0, 3);
      expect(plan.title).toBe('Spaced Recall Flash');
      expect(plan.topicId).toBe('all');
    });

    it('falls back to spaced recall at 5 minutes when there are no mistakes', () => {
      expect(generateSessionPlan(5, 'high', 'desk', [primary], 0, 0).title).toBe('Spaced Recall Flash');
    });

    it('routes low energy away from problem solving at 30 minutes', () => {
      const low = generateSessionPlan(30, 'low', 'desk', [primary], 0, 0);
      const normal = generateSessionPlan(30, 'normal', 'desk', [primary], 0, 0);
      expect(low.title).not.toBe(normal.title);
      expect(low.steps.some((s) => s.type === 'practice')).toBe(false);
      expect(normal.steps.some((s) => s.type === 'practice')).toBe(true);
    });

    it('reserves project work for long blocks only', () => {
      for (const time of [5, 15, 30, 60]) {
        const plan = generateSessionPlan(time, 'high', 'desk', [primary], 0, 0);
        expect(plan.steps.some((s) => s.type === 'project'), `time=${time}`).toBe(false);
      }
      const long = generateSessionPlan(120, 'high', 'desk', [primary], 0, 0);
      expect(long.steps.some((s) => s.type === 'project')).toBe(true);
    });
  });

  describe('boundaries', () => {
    it('treats bucket edges as inclusive', () => {
      expect(generateSessionPlan(5, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(5);
      expect(generateSessionPlan(15, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(15);
      expect(generateSessionPlan(30, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(30);
      expect(generateSessionPlan(60, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(60);
    });

    it('scales the project block with the time given', () => {
      expect(generateSessionPlan(90, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(90);
      expect(generateSessionPlan(240, 'high', 'desk', [primary], 0, 0).totalDurationMin).toBe(240);
    });

    it('keeps every step positive just past the 60-minute boundary', () => {
      // The long-block branch computes `timeMin - 35` for the project step, so
      // anything at or below 35 minutes here would go non-positive. Guards the
      // narrowest surviving window.
      const plan = generateSessionPlan(61, 'high', 'desk', [primary], 0, 0);
      for (const step of plan.steps) {
        expect(step.durationMin).toBeGreaterThan(0);
      }
    });
  });
});
