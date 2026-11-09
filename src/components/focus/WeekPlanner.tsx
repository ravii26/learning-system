'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Drawer } from '@/components/ui/Drawer';
import { useToast } from '@/components/ToastProvider';
import { TODAY_SIZES, readTodaySize, TODAY_SIZE_KEY, type TodaySize } from '@/lib/focusQueue';
import type { PaceByKind } from '@/lib/pace';
import type { FocusApi } from '@/lib/useFocus';
import { dayLooksFull, dayName, perDayFor, suggestWeek, type PlanCell } from '@/lib/weekPlan';

const key = (c: PlanCell) => `${c.focusItemId}|${c.day}`;

/** Tap the days each thing belongs on. It starts from a draft, never a blank page. */
export default function WeekPlanner({ focus, open, onClose, pace, weeklyTargetMinutes }: {
  focus: FocusApi;
  open: boolean;
  onClose: () => void;
  pace: PaceByKind;
  weeklyTargetMinutes: number | null;
}) {
  const toast = useToast();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [size, setSize] = useState<TodaySize>('normal');
  const [saving, setSaving] = useState(false);

  const { days, today, entries } = focus.plan;
  const editable = days.filter((d) => d >= today);
  const items = focus.items.filter((i) => !i.finished);

  const draft = (nextSize: TodaySize) => new Set(suggestWeek(items, editable, perDayFor(nextSize)).map(key));

  useEffect(() => {
    if (!open) return;
    const startSize = readTodaySize();
    setSize(startSize);
    const existing = entries.filter((e) => editable.includes(e.day));
    setChosen(existing.length ? new Set(existing.map(key)) : draft(startSize));
    // Starts fresh each time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (cell: PlanCell) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(key(cell))) next.delete(key(cell)); else next.add(key(cell));
    return next;
  });

  const changeSize = (next: TodaySize) => {
    setSize(next);
    try { localStorage.setItem(TODAY_SIZE_KEY, next); } catch { /* Storage may be disabled. */ }
    setChosen(draft(next));
  };

  const save = async () => {
    setSaving(true);
    const cells = Array.from(chosen).map((k) => {
      const [focusItemId, day] = k.split('|');
      return { focusItemId, day };
    });
    if (await focus.savePlan(cells)) onClose();
    else toast.error('Couldn’t save your plan.');
    setSaving(false);
  };

  const plannedDays = editable.filter((d) => items.some((i) => chosen.has(key({ focusItemId: i.id, day: d })))).length;
  const fullDays = editable.filter((d) => dayLooksFull(items.filter((i) => chosen.has(key({ focusItemId: i.id, day: d }))), pace, weeklyTargetMinutes, plannedDays));

  return (
    <Drawer open={open} onClose={onClose} label="Plan your week" title="Plan your week" width={640}>
      <p className="m-0 text-[0.95rem] text-fg-secondary">Tap the days each thing belongs on. This is a draft, so change anything.</p>

      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0">
            <span className="text-[1rem] font-semibold text-fg">{item.title}</span>
            <div className="flex gap-1.5">
              {days.map((d) => {
                const cell = { focusItemId: item.id, day: d };
                const on = chosen.has(key(cell));
                const past = d < today;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={past}
                    aria-pressed={on}
                    aria-label={`${item.title} on ${dayName(d, 'long')}`}
                    onClick={() => toggle(cell)}
                    className={`h-10 flex-1 rounded-lg text-[0.82rem] font-medium ${on ? 'bg-ink text-on-ink' : 'bg-sunk text-fg-secondary hover:text-fg'} ${past ? 'opacity-30' : ''}`}
                  >
                    {dayName(d, 'narrow')}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {fullDays.length > 0 && (
        <p className="m-0 text-[0.9rem] text-fg-secondary">{fullDays.map((d) => dayName(d, 'long')).join(', ')} {fullDays.length === 1 ? 'looks' : 'look'} like too much, going by how long these usually take you.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save plan'}</Button>
        <Button variant="ghost" disabled={saving} onClick={() => setChosen(draft(size))}>Start over from a draft</Button>
        <span className="flex-1" />
        <label htmlFor="plan-size" className="text-[0.85rem] text-fg-muted">Draft size</label>
        <select id="plan-size" value={size} onChange={(e) => changeSize(e.target.value as TodaySize)} className="form-input h-9 w-auto py-0 text-[0.85rem]">
          {TODAY_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
    </Drawer>
  );
}
