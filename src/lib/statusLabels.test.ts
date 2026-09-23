import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, statusLabel } from './statusLabels';

const DB_STATUSES = ['inbox', 'queued', 'active', 'paused', 'maintenance', 'reference', 'dropped'];

describe('statusLabels', () => {
  it('has a label for every status the API accepts (VALID_STATUSES)', () => {
    for (const s of DB_STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it('every label is distinct — no two statuses collapse to the same word', () => {
    const labels = Object.values(STATUS_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('falls back to the raw value for an unknown status rather than showing blank', () => {
    expect(statusLabel('some_future_status')).toBe('some_future_status');
  });

  it('maps the ones called out explicitly in the plan', () => {
    expect(statusLabel('active')).toBe('Now');
    expect(statusLabel('paused')).toBe('Resting');
    expect(statusLabel('dropped')).toBe('Archived');
  });
});
