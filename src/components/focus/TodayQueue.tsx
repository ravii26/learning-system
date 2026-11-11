'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { confirmDialog } from '@/components/dialogs';
import { readTodaySize, type TodaySize } from '@/lib/focusQueue';
import { lessonTimeLabel, paceKey, type PaceByKind } from '@/lib/pace';
import type { FocusAction, FocusApi, FocusEntry } from '@/lib/useFocus';
import { addDays, dayName, isUnresolved, perDayFor, planDayView, suggestWeek } from '@/lib/weekPlan';
import WeekPlanner from './WeekPlanner';

/**
 * Your week and your day. The week strip shows what you've planned; the day
 * below it leads with one next step. Planning is optional: with no plan the
 * app suggests a day, and anything unfinished rolls forward on its own.
 */

const quiet = 'h-9 rounded-lg bg-transparent px-2.5 text-[0.88rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg disabled:opacity-50';
const DISMISS_KEY = 'learning-os:plan-prompt-dismissed';

const timeOf = (item: FocusEntry, pace: PaceByKind) =>
  item.estimatedMinutes ? lessonTimeLabel(item.estimatedMinutes, pace[paceKey(item.lessonKind)], { short: true }) : null;
const labelOf = (item: FocusEntry) => (item.nextStep ? `${item.title}: ${item.nextStep}` : item.title);

export default function TodayQueue({ focus, dueCards, reviewMinutes, pace, weeklyTargetMinutes }: {
  focus: FocusApi;
  dueCards: number;
  reviewMinutes: number;
  pace: PaceByKind;
  weeklyTargetMinutes: number | null;
}) {
  const toast = useToast();
  const [size, setSize] = useState<TodaySize>('normal');
  const [extra, setExtra] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(null);

  useEffect(() => {
    setSize(readTodaySize());
    try { setDismissedWeek(localStorage.getItem(DISMISS_KEY)); } catch { /* Storage may be disabled. */ }
  }, [plannerOpen]);

  const { today, days, entries } = focus.plan;
  const day = selected ?? today;
  const byId = new Map(focus.items.map((i) => [i.id, i]));
  const view = planDayView(focus.items, focus.plan, { size, extra, review: { due: dueCards, reviewedToday: focus.reviewedToday } });
  const { list, done, others, reviewOpen, doneCount, total, carriedFrom, suggested } = view;
  const editable = days.filter((d) => d >= today);
  const weekHasPlan = entries.some((e) => days.includes(e.day));

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    if (!(await work())) toast.error('That didn’t save. Try again.');
    setBusy(false);
  };
  const act = (id: string, action: FocusAction) => run(() => focus.act(id, action));
  const moveTo = (id: string, to: string, from?: string) => run(() => focus.moveItem(id, to, from));
  const drop = async (item: FocusEntry) => {
    const sure = await confirmDialog({ title: `Drop ${item.title}?`, message: 'It leaves your Focus and your plan. Goals and lessons are kept, under Later.', confirmLabel: 'Drop', danger: true });
    if (sure) void run(() => focus.unpin(item.id));
  };
  const acceptDraft = () => run(() => focus.savePlan(suggestWeek(focus.items, editable, perDayFor(size))));
  const dismissPrompt = () => {
    setDismissedWeek(days[0]);
    try { localStorage.setItem(DISMISS_KEY, days[0]); } catch { /* Storage may be disabled. */ }
  };
  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    void run(async () => {
      const ok = await focus.pin({ kind: 'custom', title, rhythm: 'once', addToday: true });
      if (ok) { setNewTitle(''); setAdding(false); }
      return ok;
    });
  };

  const moveOptions = (from: string) => [
    ...editable.filter((d) => d !== from).map((d) => ({ value: d, label: d === addDays(today, 1) ? 'Tomorrow' : d === today ? 'Today' : dayName(d, 'long') })),
    { value: 'later', label: 'Later' },
    { value: 'drop', label: 'Drop' },
  ];
  const onMoveChoice = (item: FocusEntry, value: string, from?: string) => {
    if (value === 'drop') void drop(item);
    else if (value) void moveTo(item.id, value, from);
  };

  const hero = reviewOpen ? null : list[0] ?? null;
  const then = reviewOpen ? list : list.slice(1);
  const finished = !reviewOpen && list.length === 0;
  const heroTime = hero ? timeOf(hero, pace) : null;
  const heroWhy = hero ? (carriedFrom[hero.id] ? `Carried over from ${dayName(carriedFrom[hero.id], 'long')}` : hero.reason) : '';

  const dayEntries = (d: string) => entries.filter((e) => e.day === d && byId.has(e.focusItemId)).sort((a, b) => a.position - b.position);
  const isDoneOn = (id: string, d: string) => (byId.get(id)?.doneDays ?? []).some((x) => x >= d);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Your week" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[1.05rem] font-semibold">Your week</h2>
          <div className="flex items-center gap-4">
            {total > 0 && <span className="text-[0.88rem] text-fg-secondary">Today: {doneCount} of {total} done</span>}
            <button type="button" onClick={() => setPlannerOpen(true)} className="bg-transparent p-0 text-[0.9rem] font-semibold text-fg underline underline-offset-2">{weekHasPlan ? 'Edit plan' : 'Plan week'}</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const items = dayEntries(d);
            const isToday = d === today;
            const isSelected = d === day;
            const count = isToday ? list.length + done.length + (reviewOpen ? 1 : 0) : items.length;
            const filled = isToday ? done.length : items.filter((e) => d < today && isDoneOn(e.focusItemId, d)).length;
            return (
              <button key={d} type="button" aria-pressed={isSelected} aria-label={`${dayName(d, 'long')}, ${count} planned`} onClick={() => setSelected(d)} className={`flex min-h-[64px] flex-col items-center gap-1.5 rounded-xl px-1 py-2 ${isSelected ? 'bg-sunk' : 'bg-transparent hover:bg-fill-2'} ${isToday ? 'shadow-[inset_0_0_0_1.5px_var(--ink)]' : ''}`}>
                <span className={`text-[0.8rem] ${isToday ? 'font-bold text-fg' : d < today ? 'text-fg-muted' : 'font-medium text-fg-secondary'}`}>{dayName(d, 'short')}</span>
                <span className="flex h-2 flex-wrap justify-center gap-0.5" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 5) }, (_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < filled ? 'bg-ink' : 'bg-[var(--border-strong)]'}`} />)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {!weekHasPlan && dismissedWeek !== days[0] && day === today && (
        <section aria-label="Plan your week" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunk px-5 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-[1rem] font-semibold text-fg">Plan your week?</span>
            <span className="text-[0.9rem] text-fg-secondary">There’s a draft ready from what you’re working on.</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary" disabled={busy} onClick={() => void acceptDraft()}>Use the draft</Button>
            <button type="button" className={quiet} onClick={() => setPlannerOpen(true)}>Adjust</button>
            <button type="button" className={quiet} onClick={dismissPrompt}>Not now</button>
          </div>
        </section>
      )}

      {day !== today ? (
        <section aria-label={dayName(day, 'long')} className="glass-panel flex flex-col gap-3 p-6">
          <h1 className="m-0 font-serif text-[1.8rem] font-normal">{dayName(day, 'long')}</h1>
          {dayEntries(day).length === 0 ? (
            <p className="m-0 text-[1rem] text-fg-secondary">Nothing planned.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {dayEntries(day).map((e) => {
                const item = byId.get(e.focusItemId) as FocusEntry;
                const past = day < today;
                const wasDone = past && isDoneOn(e.focusItemId, day);
                return (
                  <li key={e.focusItemId} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                    <span className={`min-w-0 text-[1rem] ${wasDone ? 'text-fg-muted' : 'text-fg'}`}>{wasDone && <Icon name="check" size={14} strokeWidth={2.4} className="mr-1.5 inline" />}{item.title}</span>
                    {!past && (
                      <select aria-label={`Move ${item.title}`} value="" disabled={busy} onChange={(ev) => onMoveChoice(item, ev.target.value, day)} className="form-input h-9 w-auto py-0 text-[0.85rem]">
                        <option value="">Move</option>
                        {moveOptions(day).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    {past && !wasDone && !isUnresolved(e, item, today) && <span className="shrink-0 text-[0.85rem] text-fg-muted">Moved on</span>}
                    {past && isUnresolved(e, item, today) && <span className="shrink-0 text-[0.85rem] text-fg-muted">Carried to today</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="self-start bg-transparent p-0 text-[0.9rem] font-medium text-fg-secondary hover:text-fg" onClick={() => setSelected(null)}>Back to today</button>
        </section>
      ) : (
        <>
          {finished ? (
            <section aria-labelledby="today-h" className="glass-panel flex flex-col items-start gap-3 p-8">
              <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-tight">{done.length > 0 || focus.reviewedToday ? 'That’s today.' : 'Nothing planned today.'}</h1>
              <p className="m-0 text-[1.05rem] text-fg-secondary">{others.length > 0 ? 'You can stop here, or take on one more.' : 'Nothing else is planned for today.'}</p>
              {others.length > 0 && <Button onClick={() => setExtra((n) => n + 1)}>Keep going</Button>}
            </section>
          ) : (
            <section aria-labelledby="today-h" className="glass-panel flex flex-col gap-5 p-8">
              {hero ? (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-[0.95rem] text-fg-muted">{suggested ? 'Suggested' : 'Up next'} · {[hero.title, hero.position].filter(Boolean).join(' · ')}</span>
                    <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-[1.15]">{hero.nextStep ?? hero.title}</h1>
                    <p className="m-0 text-[1rem] text-fg-secondary">{heroWhy}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hero.href ? (
                      <ButtonLink href={hero.href} variant="primary" size="lg" className="mr-2">Continue{heroTime ? ` · ${heroTime}` : ''} <Icon name="arrowRight" size={16} /></ButtonLink>
                    ) : (
                      <Button variant="primary" size="lg" className="mr-2" disabled={busy} onClick={() => void act(hero.id, 'done')}>Mark done</Button>
                    )}
                    {hero.href && <button type="button" disabled={busy} className={quiet} onClick={() => void act(hero.id, 'done')}>Done</button>}
                    <button type="button" disabled={busy} className={quiet} onClick={() => void moveTo(hero.id, addDays(today, 1))}>Tomorrow</button>
                    <button type="button" disabled={busy} className={quiet} onClick={() => void moveTo(hero.id, 'later')}>Later</button>
                    <button type="button" disabled={busy} className={quiet} onClick={() => void drop(hero)}>Drop</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-[0.95rem] text-fg-muted">Up next</span>
                    <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-[1.15]">Review {dueCards} card{dueCards === 1 ? '' : 's'}</h1>
                    <p className="m-0 text-[1rem] text-fg-secondary">Keeps what you already know.</p>
                  </div>
                  <ButtonLink href="/review" variant="primary" size="lg" className="self-start">Continue · about {reviewMinutes} min <Icon name="arrowRight" size={16} /></ButtonLink>
                </>
              )}
            </section>
          )}

          {(then.length > 0 || done.length > 0) && (
            <section aria-label="The rest of today" className="flex flex-col">
              {then.length > 0 && <h2 className="m-0 mb-1 text-[0.9rem] font-semibold text-fg-muted">Then</h2>}
              <ul className="m-0 list-none p-0">
                {then.map((item) => {
                  const time = timeOf(item, pace);
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                      {item.href
                        ? <Link href={item.href} className="min-w-0 flex-1 text-[1rem] text-fg no-underline hover:underline">{labelOf(item)}</Link>
                        : <span className="min-w-0 flex-1 text-[1rem] text-fg">{labelOf(item)}</span>}
                      {time && <span className="hidden shrink-0 whitespace-nowrap text-[0.88rem] text-fg-muted sm:inline">{time}</span>}
                      <select aria-label={`Move ${item.title}`} value="" disabled={busy} onChange={(ev) => onMoveChoice(item, ev.target.value)} className="form-input h-9 w-auto shrink-0 py-0 text-[0.85rem]">
                        <option value="">Move</option>
                        {moveOptions(today).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </li>
                  );
                })}
                {done.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 border-b border-line py-3 text-[0.98rem] text-fg-muted last:border-b-0">
                    <Icon name="check" size={15} strokeWidth={2.4} className="shrink-0" />
                    <span className="min-w-0 flex-1">{item.title}</span>
                    {item.canUndo && <button type="button" disabled={busy} className={quiet} onClick={() => void act(item.id, 'undo')}>Undo</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-2">
            <button type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)} className="self-start bg-transparent p-0 text-[0.9rem] font-medium text-fg-secondary hover:text-fg">Add something for today</button>
            {adding && (
              <div className="flex flex-col gap-2 rounded-xl bg-sunk p-3">
                {others.map((o) => (
                  <button key={o.id} type="button" disabled={busy} onClick={() => void moveTo(o.id, today)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-transparent px-2 py-1 text-left hover:bg-fill-2">
                    <span className="min-w-0 text-[0.95rem] text-fg">{labelOf(o)}</span>
                    <Icon name="plus" size={15} className="shrink-0 text-fg-muted" />
                  </button>
                ))}
                <form onSubmit={addCustom} className="flex gap-2">
                  <label htmlFor="today-new" className="sr-only">Something else for today</label>
                  <input id="today-new" className="form-input h-10 flex-1 py-0" placeholder="Something else, like a chapter or a task" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                  <Button type="submit" disabled={busy || !newTitle.trim()}>Add</Button>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      <WeekPlanner focus={focus} open={plannerOpen} onClose={() => setPlannerOpen(false)} pace={pace} weeklyTargetMinutes={weeklyTargetMinutes} />
    </div>
  );
}
