'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ToastProvider';
import { RHYTHMS, type Rhythm } from '@/lib/focusQueue';
import { findPin, type FocusApi, type FocusEntry, type FocusTarget } from '@/lib/useFocus';

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const noonIso = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/** How often a pinned item comes up. "By a date" waits for the date before saving. */
export function RhythmPicker({ focus, item, className = 'h-9' }: { focus: FocusApi; item: FocusEntry; className?: string }) {
  const toast = useToast();
  const [choosingDate, setChoosingDate] = useState(false);
  const showDate = choosingDate || item.rhythm === 'by_date';

  const change = async (rhythm: Rhythm) => {
    if (rhythm === 'by_date') { setChoosingDate(true); return; }
    setChoosingDate(false);
    if (!(await focus.update(item.id, { rhythm }))) toast.error('Couldn’t change that.');
  };
  const setDate = async (day: string) => {
    if (!day) return;
    setChoosingDate(false);
    if (!(await focus.update(item.id, { rhythm: 'by_date', targetDate: noonIso(day) }))) toast.error('Couldn’t save that date.');
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`rhythm-${item.id}`}>How often</label>
      <select id={`rhythm-${item.id}`} className={`form-input w-auto py-0 text-[0.85rem] ${className}`} value={showDate ? 'by_date' : item.rhythm} onChange={(e) => void change(e.target.value as Rhythm)}>
        {RHYTHMS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      {showDate && (
        <input type="date" aria-label="Date" className={`form-input w-auto py-0 text-[0.85rem] ${className}`} defaultValue={item.rhythm === 'by_date' ? dateValue(item.targetDate) : ''} onChange={(e) => void setDate(e.target.value)} />
      )}
    </span>
  );
}

/** Moves something onto Learn's "Learning now". */
export function StartNow({ focus, target, label = 'Start now' }: { focus: FocusApi; target: FocusTarget; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    if (!(await focus.pin({ ...target, rhythm: 'few_weekly' }))) toast.error('Couldn’t start that.');
    setBusy(false);
  };
  return (
    <button type="button" onClick={() => void start()} disabled={busy} className="h-9 shrink-0 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-[0.85rem] font-medium text-fg-secondary hover:border-line-hover hover:text-fg disabled:opacity-50">
      {label}
    </button>
  );
}

/** Pin anything to Focus from wherever you are, or change or remove the pin. */
export default function PinControl({ focus, target, label = 'Pin to Focus' }: { focus: FocusApi; target: FocusTarget; label?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pinned = findPin(focus.items, target);
  if (!focus.loaded) return null;

  const pin = async () => {
    setBusy(true);
    if (await focus.pin({ ...target, rhythm: target.kind === 'lesson' ? 'once' : 'few_weekly' })) toast.success('Pinned to Focus');
    else toast.error('Couldn’t pin that.');
    setBusy(false);
  };
  const unpin = async () => {
    if (!pinned) return;
    setBusy(true);
    if (!(await focus.unpin(pinned.id))) toast.error('Couldn’t unpin that.');
    setBusy(false);
  };

  if (!pinned) {
    return (
      <button type="button" onClick={() => void pin()} disabled={busy} className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 text-[0.85rem] font-medium text-fg-secondary hover:border-line-hover hover:text-fg">
        <Icon name="pin" size={15} /> {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <RhythmPicker focus={focus} item={pinned} />
      <button type="button" onClick={() => void unpin()} disabled={busy} className="h-9 rounded-lg bg-transparent px-2 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg">Unpin</button>
    </span>
  );
}
