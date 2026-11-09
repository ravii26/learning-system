'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { promptDialog } from '@/components/dialogs';
import { RHYTHMS, RHYTHM_LABEL, type Rhythm } from '@/lib/focusQueue';
import type { FocusApi, FocusEntry } from '@/lib/useFocus';
import type { OffFocusResume, PathStep } from '@/lib/focusData';
import { AWAY_DAYS, canLead, daysSince, deadlineLabel, learnList, progressLabel, whenLabel } from '@/lib/resumePoint';
import PinControl, { RhythmPicker } from './PinControl';

/** Learn answers one question: where was I? Everything opens right at that spot. */

const ADD_RHYTHMS = RHYTHMS.filter((r) => r.key !== 'by_date');
const quiet = 'h-9 rounded-lg bg-transparent px-2.5 text-[0.88rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg disabled:opacity-50';

const SETUP_LABEL = { no_topics: 'Add a first topic', no_lessons: 'Build lessons' } as const;
const finishedGoal = (item: FocusEntry) => item.finished && item.kind === 'goal' && !!item.goalId;

/** Where you are in this item, in a few words. */
function whereYouAre(item: FocusEntry): string {
  if (item.finished) return 'Finished';
  if (item.setup === 'no_topics') return 'No topics yet';
  if (item.setup === 'no_lessons') return item.currentTopic && item.currentTopic.title !== item.title ? `${item.currentTopic.title} · no lessons yet` : 'No lessons yet';
  if (item.currentTopic) {
    const progress = progressLabel(item.currentTopic.lessonsDone, item.currentTopic.lessonsTotal);
    const parts = item.currentTopic.title === item.title ? [progress] : [item.currentTopic.title, progress];
    return parts.filter(Boolean).join(' · ');
  }
  if (item.kind === 'custom') return RHYTHM_LABEL[item.rhythm];
  return item.nextStep ?? '';
}

/** The action for things that can't simply be opened and continued. */
function DirectAction({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    if (!(await work())) toast.error('That didn’t save. Try again.');
    setBusy(false);
  };

  if (finishedGoal(item)) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <Link href={`/goals/${item.goalId}`} className="px-2 text-[0.88rem] font-medium text-fg-secondary">Add more</Link>
        <Button disabled={busy} onClick={() => void run(() => focus.achieveGoal(item.id, item.goalId as string))}>Mark achieved</Button>
      </span>
    );
  }
  if (item.doneToday) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[0.88rem] text-fg-muted">
        <Icon name="check" size={14} strokeWidth={2.4} /> Done today
        {item.canUndo && <button type="button" disabled={busy} className={quiet} onClick={() => void run(() => focus.act(item.id, 'undo'))}>Undo</button>}
      </span>
    );
  }
  return <Button disabled={busy} className="shrink-0" onClick={() => void run(() => focus.act(item.id, 'done'))}>Mark done</Button>;
}

const hasDirectAction = (item: FocusEntry) => !item.href || finishedGoal(item);

function RoadDot({ state }: { state: PathStep['state'] }) {
  const ring = state === 'current' ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : state === 'todo' || state === 'skipped' ? 'shadow-[inset_0_0_0_1.5px_var(--border-strong)]' : '';
  if (state === 'started') {
    return <span className="h-5 w-5 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--ink)]" style={{ background: 'linear-gradient(90deg, var(--ink) 50%, transparent 50%)' }} />;
  }
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${state === 'done' ? 'bg-ink text-on-ink' : ''} ${ring}`}>
      {state === 'done' && <Icon name="check" size={12} strokeWidth={2.8} />}
    </span>
  );
}

const STEP_NOTE: Partial<Record<PathStep['state'], string>> = { current: 'You are here', skipped: 'Skipped' };

function Road({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const toast = useToast();
  const rename = async () => {
    if (!item.goalId) return;
    const name = await promptDialog({ title: 'What do you call this goal?', value: item.title, confirmLabel: 'Save' });
    if (name?.trim() && !(await focus.renameGoal(item.goalId, name.trim()))) toast.error('Couldn’t rename that.');
  };
  const unpin = async () => {
    if (!(await focus.unpin(item.id))) toast.error('Couldn’t move that.');
  };

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      {item.steps.length > 0 && (
        <ol aria-label="Your road" className="m-0 flex list-none flex-col p-0">
          {item.steps.map((s, i) => (
            <li key={s.id} className="flex items-stretch gap-3">
              <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden="true">
                <span className={`w-px flex-1 ${i === 0 ? 'bg-transparent' : 'bg-[var(--border-strong)]'}`} />
                <RoadDot state={s.state} />
                <span className={`w-px flex-1 ${i === item.steps.length - 1 ? 'bg-transparent' : 'bg-[var(--border-strong)]'}`} />
              </span>
              <Link href={s.href} className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-4 no-underline hover:underline">
                <span className={`min-w-0 text-[0.98rem] ${s.state === 'current' ? 'font-semibold text-fg' : s.state === 'done' ? 'text-fg-muted' : 'text-fg-secondary'}`}>
                  {s.title}{STEP_NOTE[s.state] && <span className="ml-2 text-[0.82rem] font-normal text-fg-muted">{STEP_NOTE[s.state]}</span>}
                </span>
                {s.lessonsTotal ? <span className="shrink-0 text-[0.85rem] text-fg-muted">{s.lessonsDone}/{s.lessonsTotal}</span> : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!item.finished && <RhythmPicker focus={focus} item={item} />}
        {item.goalId && <button type="button" onClick={() => void rename()} className={quiet}>Rename</button>}
        {item.goalId && <Link href={`/goals/${item.goalId}`} className="text-[0.85rem] font-medium text-fg-secondary">Open goal</Link>}
        <button type="button" onClick={() => void unpin()} className={quiet}>Move to Not now</button>
      </div>
    </div>
  );
}

function ResumeCard({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const [open, setOpen] = useState(false);
  const studied = whenLabel(item.lastActivityAt);
  const deadline = deadlineLabel(item.targetDate);
  const away = (daysSince(item.lastActivityAt) ?? 0) >= AWAY_DAYS;
  const heading = item.setup ? item.title : item.nextStep ?? item.title;
  const where = item.movedOnFrom && item.currentTopic ? `${item.movedOnFrom} finished. Next: ${item.currentTopic.title}` : whereYouAre(item);
  const details = [where, studied ? `studied ${studied.toLowerCase()}` : null, deadline].filter(Boolean).join(' · ');
  const showContext = item.kind !== 'custom' && !item.setup && heading !== item.title;

  return (
    <section aria-label="Where you left off" className="glass-panel flex flex-col gap-4 p-7">
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.92rem] text-fg-muted">{item.lastActivityAt ? 'Pick up where you left off' : 'Start here'}{showContext ? ` · ${item.title}` : ''}</span>
        <h2 className="m-0 font-serif text-[2rem] font-normal leading-[1.15]">{heading}</h2>
        <p className="m-0 text-[0.98rem] text-fg-secondary">{details}</p>
      </div>
      {away && item.previousLesson && (
        <p className="m-0 text-[0.95rem] text-fg-secondary">
          Welcome back. A quick refresher first? <Link href={item.previousLesson.href} className="font-medium text-fg">Reread {item.previousLesson.title}</Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {hasDirectAction(item)
          ? <DirectAction focus={focus} item={item} />
          : <ButtonLink href={item.href as string} variant="primary" size="lg">{item.setup ? SETUP_LABEL[item.setup] : 'Continue'} <Icon name="arrowRight" size={16} /></ButtonLink>}
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={quiet}>{open ? 'Close' : item.steps.length > 0 ? 'See road' : 'Options'}</button>
      </div>
      {open && <Road focus={focus} item={item} />}
    </section>
  );
}

function OffFocusCard({ focus, resume }: { focus: FocusApi; resume: OffFocusResume }) {
  const progress = progressLabel(resume.lessonsDone, resume.lessonsTotal);
  const studied = whenLabel(resume.lastStudiedAt);
  return (
    <section aria-label="Where you left off" className="glass-panel flex flex-col gap-4 p-7">
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.92rem] text-fg-muted">Pick up where you left off · Not in your Focus</span>
        <h2 className="m-0 font-serif text-[2rem] font-normal leading-[1.15]">{resume.nextStep}</h2>
        <p className="m-0 text-[0.98rem] text-fg-secondary">{[resume.title, progress, studied ? `studied ${studied.toLowerCase()}` : null].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={resume.href} variant="primary" size="lg">Continue <Icon name="arrowRight" size={16} /></ButtonLink>
        <PinControl focus={focus} target={{ kind: 'topic', topicId: resume.topicId }} label="Add to Focus" />
      </div>
    </section>
  );
}

function Row({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const [open, setOpen] = useState(false);
  const direct = hasDirectAction(item);
  const when = deadlineLabel(item.targetDate) ?? whenLabel(item.lastActivityAt);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.02rem] font-semibold text-fg">{item.title}</span>
        <span className="block text-[0.9rem] text-fg-secondary">{whereYouAre(item)}</span>
      </span>
      {item.setup && !item.finished
        ? <span className="shrink-0 text-[0.88rem] font-medium text-fg-secondary">{SETUP_LABEL[item.setup]}</span>
        : when && !direct && <span className="hidden shrink-0 text-[0.85rem] text-fg-muted sm:inline">{when}</span>}
    </>
  );

  return (
    <li className="flex flex-col gap-3 border-b border-line py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        {direct
          ? <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3">{body}</div>
          : <Link href={item.href as string} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 no-underline hover:no-underline">{body}</Link>}
        {direct && <DirectAction focus={focus} item={item} />}
        <button type="button" aria-expanded={open} aria-label={`${open ? 'Close' : 'See'} the road for ${item.title}`} onClick={() => setOpen((v) => !v)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-transparent text-fg-muted hover:bg-fill-2 hover:text-fg">
          <Icon name="chevronRight" size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {open && <Road focus={focus} item={item} />}
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

  const items = learnList(focus.items);
  const newest = items[0]?.lastActivityAt ?? null;
  const offFocus = focus.offFocus && (!newest || focus.offFocus.lastStudiedAt > newest) ? focus.offFocus : null;
  const lead = !offFocus && items[0] && canLead(items[0]) ? items[0] : null;
  const rest = lead ? items.slice(1) : items;

  return (
    <section aria-label="What you're working on" className="flex flex-col gap-6">
      {offFocus && <OffFocusCard focus={focus} resume={offFocus} />}
      {lead && <ResumeCard focus={focus} item={lead} />}

      {items.length === 0 && !offFocus && (
        <div className="glass-panel flex flex-col gap-1.5 p-6">
          <h2 className="m-0 font-serif text-[1.6rem] font-medium">What are you working on now?</h2>
          <p className="m-0 text-[1rem] text-fg-secondary">Start something from Not now below, and it will appear here with your progress.</p>
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col">
          <h2 className="m-0 mb-1 text-[1.1rem] font-semibold">{lead || offFocus ? 'Also working on' : 'Your Focus'}</h2>
          <ul className="m-0 list-none p-0">
            {rest.map((item) => <Row key={item.id} focus={focus} item={item} />)}
          </ul>
        </div>
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
