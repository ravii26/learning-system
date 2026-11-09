'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { promptDialog } from '@/components/dialogs';
import { RHYTHMS, RHYTHM_LABEL, type Rhythm } from '@/lib/focusQueue';
import type { FocusApi, FocusEntry } from '@/lib/useFocus';
import type { PathStep } from '@/lib/focusData';
import { finishLines } from '@/lib/weekPlan';
import { RhythmPicker } from './PinControl';

/** Learn answers one question: where am I in each thing I'm learning? */

const ADD_RHYTHMS = RHYTHMS.filter((r) => r.key !== 'by_date');
const STEP_LABELS = 4;
const SEGMENT: Record<PathStep['state'], string> = { done: 'bg-ink', current: 'bg-fg-muted', todo: 'bg-[var(--border-strong)]' };

/** The step you're on and those around it, so a long path stays readable. */
function nearbySteps(steps: PathStep[]): { shown: PathStep[]; more: number } {
  const current = Math.max(0, steps.findIndex((s) => s.state === 'current'));
  const start = Math.max(0, Math.min(current - 1, steps.length - STEP_LABELS));
  const shown = steps.slice(start, start + STEP_LABELS);
  return { shown, more: steps.length - start - shown.length };
}

function PathCard({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { shown, more } = nearbySteps(item.steps);

  const rename = async () => {
    if (!item.goalId) return;
    const name = await promptDialog({ title: 'What do you call this goal?', value: item.title, confirmLabel: 'Save' });
    if (name?.trim() && !(await focus.renameGoal(item.goalId, name.trim()))) toast.error('Couldn’t rename that.');
  };
  const unpin = async () => {
    if (!(await focus.unpin(item.id))) toast.error('Couldn’t unpin that.');
  };

  return (
    <li className="glass-panel flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">{item.title}</h3>
        <span className="text-[0.9rem] text-fg-muted">
          {item.lessonsTotal > 0 ? `${item.lessonsDone} of ${item.lessonsTotal} lessons` : RHYTHM_LABEL[item.rhythm]}
        </span>
      </div>

      {item.steps.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {item.steps.map((s) => <span key={s.id} className={`h-1.5 flex-1 rounded-full ${SEGMENT[s.state]}`} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.88rem]">
            {shown.map((s) => <span key={s.id} className={s.state === 'current' ? 'font-semibold text-fg' : 'text-fg-muted'}>{s.title}</span>)}
            {more > 0 && <span className="text-fg-muted">+{more} more</span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 text-[0.98rem] text-fg-secondary">{item.finished ? 'Finished' : item.nextStep ? `Next: ${item.nextStep}` : item.reason}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="h-10 rounded-lg bg-transparent px-3 text-[0.88rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg">
            {open ? 'Close' : 'See road'}
          </button>
          {item.href && !item.finished && <ButtonLink href={item.href} variant="primary">Continue</ButtonLink>}
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          {item.steps.length > 0 && (
            <ol aria-label="Your road" className="m-0 flex list-none flex-col p-0">
              {item.steps.map((s, i) => (
                <li key={s.id} className="flex items-stretch gap-3">
                  <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden="true">
                    <span className={`w-px flex-1 ${i === 0 ? 'bg-transparent' : 'bg-[var(--border-strong)]'}`} />
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.state === 'done' ? 'bg-ink text-on-ink' : s.state === 'current' ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : 'shadow-[inset_0_0_0_1.5px_var(--border-strong)]'}`}>
                      {s.state === 'done' && <Icon name="check" size={12} strokeWidth={2.8} />}
                    </span>
                    <span className={`w-px flex-1 ${i === item.steps.length - 1 ? 'bg-transparent' : 'bg-[var(--border-strong)]'}`} />
                  </span>
                  <Link href={s.href} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-4 no-underline hover:underline">
                    <span className={`min-w-0 text-[0.98rem] ${s.state === 'current' ? 'font-semibold text-fg' : s.state === 'done' ? 'text-fg-muted' : 'text-fg-secondary'}`}>
                      {s.title}{s.state === 'current' && <span className="ml-2 text-[0.82rem] font-normal text-fg-muted">You are here</span>}
                    </span>
                    {s.lessonsTotal ? <span className="shrink-0 text-[0.85rem] text-fg-muted">{s.lessonsDone}/{s.lessonsTotal}</span> : null}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {!item.finished && <RhythmPicker focus={focus} item={item} />}
            {item.goalId && <button type="button" onClick={() => void rename()} className="h-9 rounded-lg bg-transparent px-2 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg">Rename</button>}
            {item.goalId && <Link href={`/goals/${item.goalId}`} className="text-[0.85rem] font-medium text-fg-secondary">Open goal</Link>}
            <button type="button" onClick={() => void unpin()} className="h-9 rounded-lg bg-transparent px-2 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg">Move to Not now</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function FocusPaths({ focus }: { focus: FocusApi }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [rhythm, setRhythm] = useState<Rhythm>('once');
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    if (await focus.pin({ kind: 'custom', title: title.trim(), rhythm })) { setTitle(''); setAdding(false); }
    else toast.error('Couldn’t add that.');
    setSaving(false);
  };

  const items = [...focus.items.filter((i) => !i.finished), ...focus.items.filter((i) => i.finished)];

  const lines = finishLines(focus.items);

  return (
    <section aria-label="What you're working on" className="flex flex-col gap-4">
      {lines.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[1.2rem] font-semibold">Closest to done</h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
            {lines.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 no-underline hover:border-line-hover hover:no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1rem] font-semibold leading-snug text-fg">{l.title}</span>
                    {l.parent && <span className="block text-[0.82rem] text-fg-muted">{l.parent}</span>}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[var(--border-strong)]" aria-hidden="true">
                    <span className="block h-full bg-ink" style={{ width: `${Math.round((l.done / l.total) * 100)}%` }} />
                  </span>
                  <span className="text-[0.88rem] text-fg-secondary">{l.left} lesson{l.left === 1 ? '' : 's'} left</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <div className="glass-panel flex flex-col gap-1.5 p-6">
          <h2 className="m-0 font-serif text-[1.6rem] font-medium">What are you working on now?</h2>
          <p className="m-0 text-[1rem] text-fg-secondary">Start something from Not now below, and it will appear here with your progress.</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {items.map((item) => <PathCard key={item.id} focus={focus} item={item} />)}
        </ul>
      )}

      {adding ? (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <label htmlFor="focus-new" className="sr-only">Add something to work on</label>
          <input id="focus-new" className="form-input h-10 min-w-[220px] flex-1 py-0" placeholder="A book, habit, project or task" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} autoFocus />
          <label htmlFor="focus-new-rhythm" className="sr-only">How often</label>
          <select id="focus-new-rhythm" className="form-input h-10 w-auto py-0 text-[0.9rem]" value={rhythm} onChange={(e) => setRhythm(e.target.value as Rhythm)}>
            {ADD_RHYTHMS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <Button type="submit" disabled={saving || !title.trim()}>Add</Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start bg-transparent p-0 text-[0.9rem] font-medium text-fg-secondary hover:text-fg">Add a book, habit or task</button>
      )}
    </section>
  );
}
