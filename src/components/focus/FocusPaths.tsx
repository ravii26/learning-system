'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { confirmDialog, promptDialog } from '@/components/dialogs';
import { RHYTHMS, RHYTHM_LABEL, type Rhythm } from '@/lib/focusQueue';
import type { FocusApi, FocusEntry } from '@/lib/useFocus';
import type { OffFocusResume, PathStep } from '@/lib/focusData';
import { AWAY_DAYS, canLead, daysSince, deadlineLabel, learnList, nearbySteps, progressLabel, whenLabel } from '@/lib/resumePoint';
import MoreMenu from './MoreMenu';
import { RhythmPicker, StartNow } from './PinControl';

/** Learn shows everything you're working on at a glance, and one bar to carry on. */

const ADD_RHYTHMS = RHYTHMS.filter((r) => r.key !== 'by_date');
const quiet = 'h-9 rounded-lg bg-transparent px-2.5 text-[0.88rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg disabled:opacity-50';

const SETUP_LABEL = { no_topics: 'Add a first topic', no_lessons: 'Build lessons' } as const;
const finishedGoal = (item: FocusEntry) => item.finished && item.kind === 'goal' && !!item.goalId;
const hasDirectAction = (item: FocusEntry) => !item.href || finishedGoal(item);

/** Where you are in this item, in a few words. */
function whereYouAre(item: FocusEntry): string {
  if (item.finished) return 'Finished';
  if (item.setup === 'no_topics') return 'No topics yet';
  if (item.setup === 'no_lessons') return item.currentTopic && item.currentTopic.title !== item.title ? `${item.currentTopic.title} · no lessons yet` : 'No lessons yet';
  return '';
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

/** Rename, how often, and taking it off the list. */
function ItemMenu({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const toast = useToast();
  const custom = item.kind === 'custom';
  const rename = async () => {
    if (!item.goalId) return;
    const name = await promptDialog({ title: 'What do you call this goal?', value: item.title, confirmLabel: 'Save' });
    if (name?.trim() && !(await focus.renameGoal(item.goalId, name.trim()))) toast.error('Couldn’t rename that.');
  };
  const remove = async () => {
    if (custom && !(await confirmDialog({ title: `Remove ${item.title}?`, confirmLabel: 'Remove', danger: true }))) return;
    if (!(await focus.unpin(item.id))) toast.error('Couldn’t move that.');
  };

  return (
    <MoreMenu label={`More options for ${item.title}`}>
      {(close) => (
        <>
          {!item.finished && (
            <div className="flex flex-col gap-1 px-3 pb-2 pt-1.5">
              <span className="text-[0.8rem] text-fg-muted">How often</span>
              <RhythmPicker focus={focus} item={item} />
            </div>
          )}
          {item.goalId && <button type="button" className="avatar-dropdown-item bg-transparent" onClick={() => { close(); void rename(); }}>Rename</button>}
          {item.goalId && <Link href={`/goals/${item.goalId}`} className="avatar-dropdown-item no-underline">Open goal</Link>}
          <button type="button" className="avatar-dropdown-item bg-transparent" onClick={() => { close(); void remove(); }}>{custom ? 'Remove' : 'Move to Later'}</button>
        </>
      )}
    </MoreMenu>
  );
}

function StepDot({ state }: { state: PathStep['state'] }) {
  if (state === 'current') return <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-fg"><Icon name="play" size={14} strokeWidth={2.2} /></span>;
  if (state === 'started') return <span className="h-[18px] w-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--ink)]" style={{ background: 'linear-gradient(90deg, var(--ink) 50%, transparent 50%)' }} />;
  if (state === 'done') return <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-on-ink"><Icon name="check" size={11} strokeWidth={2.8} /></span>;
  return <span className="h-[18px] w-[18px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--border-strong)]" />;
}

function StepRow({ step, next }: { step: PathStep; next: string | null }) {
  const current = step.state === 'current';
  return (
    <li>
      <Link href={step.href} className="flex min-h-9 items-center gap-2.5 py-1 no-underline hover:underline">
        <StepDot state={step.state} />
        <span className={`min-w-0 flex-1 text-[0.92rem] ${current ? 'font-semibold text-fg' : step.state === 'done' ? 'text-fg-muted' : 'text-fg-secondary'}`}>
          {step.title}
          {step.state === 'skipped' && <span className="ml-2 text-[0.8rem] font-normal text-fg-muted">Skipped</span>}
          {next && <span className="block text-[0.82rem] font-normal text-fg-secondary">Next: {next}</span>}
        </span>
        {step.lessonsTotal ? <span className="shrink-0 text-[0.8rem] text-fg-muted">{step.lessonsDone}/{step.lessonsTotal}</span> : null}
      </Link>
    </li>
  );
}

function PathCard({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? item.steps : nearbySteps(item.steps);
  const hidden = item.steps.length - shown.length;
  const studied = whenLabel(item.lastActivityAt);
  const place = whereYouAre(item) || (item.lessonsTotal > 0 ? `${item.lessonsDone} of ${item.lessonsTotal} lessons` : null);
  const meta = [place, deadlineLabel(item.targetDate), studied ? `studied ${studied.toLowerCase()}` : null].filter(Boolean).join(' · ');
  const percent = item.lessonsTotal > 0 ? Math.round((item.lessonsDone / item.lessonsTotal) * 100) : null;
  const titleHref = item.kind === 'goal' ? `/goals/${item.goalId}` : `/topics/${item.topicId}`;
  const nextInGoal = item.kind === 'goal' && !item.setup ? item.nextStep : null;

  return (
    <article className="glass-panel flex flex-col gap-2.5 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[1.08rem] font-semibold"><Link href={titleHref} className="text-fg no-underline hover:underline">{item.title}</Link></h3>
          {meta && <p className="m-0 mt-0.5 text-[0.84rem] text-fg-muted">{meta}</p>}
        </div>
        <ItemMenu focus={focus} item={item} />
      </div>
      {percent !== null && (
        <div role="progressbar" aria-label={`Progress in ${item.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 overflow-hidden rounded-full bg-fill-3">
          <div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
        </div>
      )}
      {shown.length > 0 && (
        <ol aria-label={`Steps in ${item.title}`} className="m-0 flex list-none flex-col p-0">
          {shown.map((s) => <StepRow key={s.id} step={s} next={s.state === 'current' && nextInGoal !== s.title ? nextInGoal : null} />)}
        </ol>
      )}
      {hidden > 0 && <button type="button" onClick={() => setShowAll(true)} className="self-start bg-transparent p-0 text-[0.85rem] font-medium text-fg-secondary hover:text-fg">Show all {item.steps.length}</button>}
      {item.steps.length === 0 && item.nextStep && item.href && !item.setup && !item.finished && (
        <Link href={item.href} className="flex min-h-9 items-center gap-2.5 text-[0.92rem] font-semibold text-fg no-underline hover:underline"><StepDot state="current" /> Next: {item.nextStep}</Link>
      )}
      {item.setup && !item.finished && item.href && <Link href={item.href} className="text-[0.88rem] font-medium text-fg">{SETUP_LABEL[item.setup]}</Link>}
      {hasDirectAction(item) && <div><DirectAction focus={focus} item={item} /></div>}
    </article>
  );
}

function HabitsCard({ focus, items }: { focus: FocusApi; items: FocusEntry[] }) {
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

  return (
    <article className="glass-panel flex flex-col gap-1.5 px-5 py-4">
      <h3 className="m-0 text-[1.08rem] font-semibold">Habits and tasks</h3>
      {items.length > 0 && (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] text-fg">{item.title}</span>
                <span className="block text-[0.8rem] text-fg-muted">{deadlineLabel(item.targetDate) ?? RHYTHM_LABEL[item.rhythm]}</span>
              </span>
              <DirectAction focus={focus} item={item} />
              <ItemMenu focus={focus} item={item} />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="flex flex-col gap-2 pt-1">
          <label htmlFor="focus-new" className="sr-only">Add something to work on</label>
          <input id="focus-new" className="form-input h-10 w-full py-0" placeholder="A book, habit, project or task" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} autoFocus />
          <div className="flex flex-wrap gap-2">
            <label htmlFor="focus-new-rhythm" className="sr-only">How often</label>
            <select id="focus-new-rhythm" className="form-input h-10 w-auto py-0 text-[0.9rem]" value={rhythm} onChange={(e) => setRhythm(e.target.value as Rhythm)}>
              {ADD_RHYTHMS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <Button type="submit" disabled={saving || !title.trim()}>Add</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start bg-transparent p-0 pt-1 text-[0.88rem] font-medium text-fg-secondary hover:text-fg">Add a book, habit or task</button>
      )}
    </article>
  );
}

function ContinueBar({ label, title, context, note, children }: { label: string; title: string; context?: string | null; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label="Continue" className="glass-panel flex flex-col gap-2 border-line-strong px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="m-0 text-[0.84rem] text-fg-muted">{label}</p>
          <p className="m-0 text-[1.08rem] font-semibold text-fg">{title}{context && <span className="ml-1.5 text-[0.92rem] font-normal text-fg-secondary">in {context}</span>}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      </div>
      {note}
    </section>
  );
}

function LeadBar({ focus, item }: { focus: FocusApi; item: FocusEntry }) {
  const studied = whenLabel(item.lastActivityAt);
  const away = (daysSince(item.lastActivityAt) ?? 0) >= AWAY_DAYS;
  const title = item.setup ? item.title : item.nextStep ?? item.title;
  const within = item.currentTopic && item.currentTopic.title !== title ? item.currentTopic.title : item.title;
  const resume = item.lastActivityAt ? `Continue where you stopped${studied ? `, ${studied.toLowerCase()}` : ''}` : 'Start here';
  const label = item.movedOnFrom ? `${item.movedOnFrom} finished. ${resume}` : resume;

  return (
    <ContinueBar
      label={label}
      title={title}
      context={!item.setup && within !== title ? within : null}
      note={away && item.previousLesson ? <p className="m-0 text-[0.9rem] text-fg-secondary">Been a while? <Link href={item.previousLesson.href} className="font-medium text-fg">Reread {item.previousLesson.title}</Link></p> : null}
    >
      {hasDirectAction(item)
        ? <DirectAction focus={focus} item={item} />
        : <ButtonLink href={item.href as string} variant="primary">{item.setup ? SETUP_LABEL[item.setup] : 'Continue'} <Icon name="arrowRight" size={16} /></ButtonLink>}
    </ContinueBar>
  );
}

function OffFocusBar({ focus, resume }: { focus: FocusApi; resume: OffFocusResume }) {
  const progress = progressLabel(resume.lessonsDone, resume.lessonsTotal);
  const studied = whenLabel(resume.lastStudiedAt);
  const label = [studied ? `Continue where you stopped, ${studied.toLowerCase()}` : 'Continue where you stopped', progress].filter(Boolean).join(' · ');
  return (
    <ContinueBar label={label} title={resume.nextStep} context={resume.title}>
      <StartNow focus={focus} target={{ kind: 'topic', topicId: resume.topicId }} label="Add to Learning now" />
      <ButtonLink href={resume.href} variant="primary">Continue <Icon name="arrowRight" size={16} /></ButtonLink>
    </ContinueBar>
  );
}

export default function FocusPaths({ focus }: { focus: FocusApi }) {
  const items = learnList(focus.items);
  const paths = items.filter((i) => i.kind !== 'custom');
  const habits = items.filter((i) => i.kind === 'custom');
  const first = paths.find(canLead) ?? null;
  const offFocus = focus.offFocus && (!first?.lastActivityAt || focus.offFocus.lastStudiedAt > first.lastActivityAt) ? focus.offFocus : null;
  const lead = offFocus ? null : first;

  return (
    <div className="flex flex-col gap-7">
      {offFocus && <OffFocusBar focus={focus} resume={offFocus} />}
      {lead && <LeadBar focus={focus} item={lead} />}

      <section aria-label="Learning now" className="flex flex-col gap-3">
        <h2 className="m-0 text-[1.1rem] font-semibold">Learning now</h2>
        {paths.length === 0 && <p className="m-0 text-[0.98rem] text-fg-secondary">Nothing here yet. Start something from Later, or add something new.</p>}
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {paths.map((item) => <PathCard key={item.id} focus={focus} item={item} />)}
          <HabitsCard focus={focus} items={habits} />
        </div>
      </section>
    </div>
  );
}
