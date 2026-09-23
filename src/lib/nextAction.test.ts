import { describe, it, expect } from 'vitest';
import { pickNextAction, type TopicForNextAction } from './nextAction';

const NOW = new Date('2026-01-15T12:00:00Z');

const topic = (over: Partial<TopicForNextAction> = {}): TopicForNextAction => ({
  id: 't1',
  title: 'DSA Patterns',
  nextAction: 'Solve 2 mediums',
  activeSlotType: 'primary',
  lastTouchedDate: '2026-01-13T12:00:00Z', // 2 days before NOW
  status: 'active',
  ...over,
});

describe('pickNextAction', () => {
  describe('eligibility', () => {
    it('returns null with no topics', () => {
      expect(pickNextAction([], NOW)).toBeNull();
    });

    it('ignores non-active topics', () => {
      expect(pickNextAction([topic({ status: 'paused' })], NOW)).toBeNull();
      expect(pickNextAction([topic({ status: 'queued' })], NOW)).toBeNull();
    });

    it('ignores topics with no nextAction', () => {
      expect(pickNextAction([topic({ nextAction: null })], NOW)).toBeNull();
      expect(pickNextAction([topic({ nextAction: '' })], NOW)).toBeNull();
      expect(pickNextAction([topic({ nextAction: '   ' })], NOW)).toBeNull();
    });

    it('ignores generic placeholder next actions, case-insensitively', () => {
      for (const val of ['nothing', 'Nothing', 'N/A', 'none', 'TBD']) {
        expect(pickNextAction([topic({ nextAction: val })], NOW)).toBeNull();
      }
    });

    it('picks a topic with a real next action', () => {
      const pick = pickNextAction([topic()], NOW);
      expect(pick?.topicId).toBe('t1');
      expect(pick?.nextAction).toBe('Solve 2 mediums');
    });
  });

  describe('slot preference', () => {
    it('prefers primary over secondary', () => {
      const primary = topic({ id: 'p', activeSlotType: 'primary', lastTouchedDate: NOW });
      const secondary = topic({ id: 's', activeSlotType: 'secondary', lastTouchedDate: '2020-01-01T00:00:00Z' });
      // secondary is far staler, but primary still wins
      expect(pickNextAction([secondary, primary], NOW)?.topicId).toBe('p');
    });

    it('falls back to secondary when primary has no usable next action', () => {
      const primary = topic({ id: 'p', activeSlotType: 'primary', nextAction: 'nothing' });
      const secondary = topic({ id: 's', activeSlotType: 'secondary', nextAction: 'Draft outline' });
      expect(pickNextAction([primary, secondary], NOW)?.topicId).toBe('s');
    });
  });

  describe('staleness tie-break and reporting', () => {
    it('among same-slot candidates, prefers the one untouched longest', () => {
      const older = topic({ id: 'old', lastTouchedDate: '2026-01-01T00:00:00Z' });
      const newer = topic({ id: 'new', lastTouchedDate: '2026-01-14T00:00:00Z' });
      expect(pickNextAction([newer, older], NOW)?.topicId).toBe('old');
    });

    it('flags isStale at 7+ days untouched', () => {
      const stale = topic({ lastTouchedDate: '2026-01-01T00:00:00Z' }); // 14 days
      const fresh = topic({ lastTouchedDate: '2026-01-14T00:00:00Z' }); // 1 day
      expect(pickNextAction([stale], NOW)?.isStale).toBe(true);
      expect(pickNextAction([fresh], NOW)?.isStale).toBe(false);
    });

    it('reports 0 days and "touched today" when touched today', () => {
      const pick = pickNextAction([topic({ lastTouchedDate: NOW })], NOW);
      expect(pick?.daysSinceTouched).toBe(0);
      expect(pick?.reason).toContain('touched today');
    });

    it('always returns a non-empty reason', () => {
      const pick = pickNextAction([topic()], NOW);
      expect(pick?.reason.length).toBeGreaterThan(0);
    });

    it('reason mentions the slot', () => {
      expect(pickNextAction([topic({ activeSlotType: 'primary' })], NOW)?.reason).toContain('primary slot');
      expect(pickNextAction([topic({ activeSlotType: 'secondary' })], NOW)?.reason).toContain('secondary slot');
    });
  });

  describe('does not mutate input', () => {
    it('leaves the input array order untouched', () => {
      const a = topic({ id: 'a', lastTouchedDate: '2026-01-01T00:00:00Z' });
      const b = topic({ id: 'b', lastTouchedDate: '2026-01-14T00:00:00Z' });
      const arr = [a, b];
      pickNextAction(arr, NOW);
      expect(arr).toEqual([a, b]);
    });
  });
});
