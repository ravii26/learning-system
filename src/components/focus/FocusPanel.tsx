'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { ROTATION_WARNING_AT, RHYTHMS, type Rhythm } from '@/lib/focusQueue';
import type { FocusApi } from '@/lib/useFocus';
import { RhythmPicker } from './PinControl';

const ghost = 'h-9 rounded-lg bg-transparent px-2 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg';
// A date needs its own picker, which appears once the item exists.
const ADD_RHYTHMS = RHYTHMS.filter((r) => r.key !== 'by_date');

/** The top of Learn: what you're working on now, and how much is waiting. */
export default function FocusPanel({ focus, notNow, everythingOpen, onToggleEverything }: {
  focus: FocusApi;
  notNow: { goals: number; topics: number };
  everythingOpen: boolean;
  onToggleEverything: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [rhythm, setRhythm] = useState<Rhythm>('once');
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    if (await focus.pin({ kind: 'custom', title: title.trim(), rhythm })) setTitle('');
    else toast.error('Couldn’t add that.');
    setSaving(false);
  };
  const unpin = async (id: string) => {
    if (!(await focus.unpin(id))) toast.error('Couldn’t unpin that.');
  };

  const active = focus.items.filter((i) => !i.finished);
  const finished = focus.items.filter((i) => i.finished);

  return (
    <section aria-labelledby="focus-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="focus-h" className="m-0 text-[1.2rem] font-semibold">Focus <span className="font-normal text-fg-muted">{active.length}</span></h2>
        {active.length > ROTATION_WARNING_AT && <span className="text-[0.85rem] text-fg-muted">They’ll take turns across the week.</span>}
      </div>

      {focus.items.length === 0 ? (
        <p className="m-0 rounded-xl bg-sunk px-5 py-4 text-[0.95rem] text-fg-secondary">Nothing pinned yet. Pin any goal or topic below, or add something here, and Today will be made from these.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {[...active, ...finished].map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
              <div className="flex min-w-[200px] flex-1 flex-col">
                {item.href
                  ? <Link href={item.href} className="truncate text-[1rem] font-semibold text-fg">{item.title}</Link>
                  : <span className="truncate text-[1rem] font-semibold text-fg">{item.title}</span>}
                <span className="truncate text-[0.85rem] text-fg-muted">{item.finished ? 'Finished' : item.nextStep ? `Next: ${item.nextStep}` : item.reason}</span>
              </div>
              {!item.finished && <RhythmPicker focus={focus} item={item} />}
              <button type="button" className={ghost} onClick={() => void unpin(item.id)}>Unpin</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <label htmlFor="focus-new" className="sr-only">Add something to Focus</label>
        <input id="focus-new" className="form-input h-10 min-w-[220px] flex-1 py-0" placeholder="Add a book, habit, project or task" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        <label htmlFor="focus-new-rhythm" className="sr-only">How often</label>
        <select id="focus-new-rhythm" className="form-input h-10 w-auto py-0 text-[0.9rem]" value={rhythm} onChange={(e) => setRhythm(e.target.value as Rhythm)}>
          {ADD_RHYTHMS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <button type="submit" disabled={saving || !title.trim()} className="btn btn-secondary h-10 py-0">Add</button>
      </form>

      {focus.items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunk px-4 py-3">
          <span className="text-[0.92rem] text-fg-secondary">
            <strong className="font-semibold text-fg">Not now:</strong> {notNow.goals} goal{notNow.goals === 1 ? '' : 's'} · {notNow.topics} topic{notNow.topics === 1 ? '' : 's'}
          </span>
          <button type="button" aria-expanded={everythingOpen} onClick={onToggleEverything} className="bg-transparent p-0 text-[0.9rem] font-semibold text-fg underline underline-offset-2">
            {everythingOpen ? 'Hide everything else' : 'See everything'}
          </button>
        </div>
      )}
    </section>
  );
}
