import { describe, it, expect } from 'vitest';
import { buildTopicUpdateData, TOPIC_BODY_FIELDS, type DerivedTopicFields } from './topicUpdate';

const derived: DerivedTopicFields = {
  status: 'active',
  activeSlotType: 'primary',
  startedDate: new Date('2026-01-01T00:00:00Z'),
};

describe('buildTopicUpdateData', () => {
  describe('the data-loss regression', () => {
    it('does not touch knowledgeMap when the body omits it', () => {
      // The bug: a notes autosave used to rewrite knowledgeMap with the value
      // read at the start of the request, reverting any review that landed in
      // between. An omitted key must not appear in the update at all.
      const data = buildTopicUpdateData({ notes: 'some notes' }, derived);

      expect('knowledgeMap' in data).toBe(false);
      expect(data.notes).toBe('some notes');
    });

    it('leaves every unsent Json column absent', () => {
      const data = buildTopicUpdateData({ title: 'Renamed' }, derived);

      for (const col of [
        'knowledgeMap',
        'confusions',
        'mistakes',
        'pauseHistory',
        'sessionLogs',
        'curriculum',
        'contract',
        'resources',
        'subtasks',
      ]) {
        expect(col in data, `${col} must not be written`).toBe(false);
      }
    });

    it('writes a Json column when it IS sent', () => {
      const map = { concepts: [{ id: 'c1', title: 'CAP theorem' }] };
      const data = buildTopicUpdateData({ knowledgeMap: map }, derived);
      expect(data.knowledgeMap).toEqual(map);
    });
  });

  describe('null vs undefined', () => {
    it('treats null as an intentional clear, not an omission', () => {
      const data = buildTopicUpdateData({ nextAction: null, why: null }, derived);
      expect('nextAction' in data).toBe(true);
      expect(data.nextAction).toBeNull();
      expect(data.why).toBeNull();
    });

    it('treats explicit undefined as an omission', () => {
      const data = buildTopicUpdateData({ nextAction: undefined }, derived);
      expect('nextAction' in data).toBe(false);
    });

    it('preserves falsy-but-meaningful values', () => {
      const data = buildTopicUpdateData({ progressPct: 0, notes: '' }, derived);
      expect(data.progressPct).toBe(0);
      expect(data.notes).toBe('');
    });
  });

  describe('derived status-machine fields', () => {
    it('always writes status, activeSlotType and startedDate', () => {
      const data = buildTopicUpdateData({}, derived);
      expect(data.status).toBe('active');
      expect(data.activeSlotType).toBe('primary');
      expect(data.startedDate).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it('ignores a client-supplied status in favour of the derived one', () => {
      // The route validates the transition and computes newStatus; the raw
      // body value must never reach the update directly.
      const data = buildTopicUpdateData({ status: 'dropped' } as any, derived);
      expect(data.status).toBe('active');
    });

    it('ignores a client-supplied activeSlotType', () => {
      const data = buildTopicUpdateData({ activeSlotType: 'secondary' } as any, derived);
      expect(data.activeSlotType).toBe('primary');
    });

    it('carries a null slot type and null start date through', () => {
      const data = buildTopicUpdateData({}, {
        status: 'queued',
        activeSlotType: null,
        startedDate: null,
      });
      expect(data.activeSlotType).toBeNull();
      expect(data.startedDate).toBeNull();
    });
  });

  describe('field coverage', () => {
    it('an empty body produces only the three derived fields', () => {
      expect(Object.keys(buildTopicUpdateData({}, derived)).sort()).toEqual(
        ['activeSlotType', 'startedDate', 'status']
      );
    });

    it('copies every whitelisted field when all are present', () => {
      const body: Record<string, unknown> = {};
      for (const key of TOPIC_BODY_FIELDS) body[key] = `v-${key}`;

      const data = buildTopicUpdateData(body as any, derived);
      for (const key of TOPIC_BODY_FIELDS) {
        expect((data as Record<string, unknown>)[key], key).toBe(`v-${key}`);
      }
    });

    it('drops keys that are not on the whitelist', () => {
      const data = buildTopicUpdateData(
        { title: 'ok', id: 'hacked', createdAt: 'nope', userId: 'x' } as any,
        derived
      );
      expect(data.title).toBe('ok');
      expect('id' in data).toBe(false);
      expect('createdAt' in data).toBe(false);
      expect('userId' in data).toBe(false);
    });

    it('never lets status or activeSlotType into the body whitelist', () => {
      expect(TOPIC_BODY_FIELDS).not.toContain('status');
      expect(TOPIC_BODY_FIELDS).not.toContain('activeSlotType');
    });
  });
});
