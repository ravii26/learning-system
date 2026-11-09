'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { ROTATION_WARNING_AT, TODAY_SIZES, TODAY_SIZE_KEY, planToday, readTodaySize, type TodaySize } from '@/lib/focusQueue';
import { lessonTimeLabel, paceKey, type PaceByKind } from '@/lib/pace';
import type { FocusAction, FocusApi, FocusEntry } from '@/lib/useFocus';

/**
 * Today answers one question: what do I do now? One next step gets all the
 * attention, and everything else is a quiet line under it.
 */

const quiet = 'h-9 rounded-lg bg-transparent px-2.5 text-[0.88rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg disabled:opacity-50';

const timeOf = (item: FocusEntry, pace: PaceByKind) =>
  item.estimatedMinutes ? lessonTimeLabel(item.estimatedMinutes, pace[paceKey(item.lessonKind)], { short: true }) : null;

export default function TodayQueue({ focus, dueCards, reviewMinutes, pace }: { focus: FocusApi; dueCards: number; reviewMinutes: number; pace: PaceByKind }) {
  const toast = useToast();
  const [size, setSize] = useState<TodaySize>('normal');
  const [extra, setExtra] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSize(readTodaySize()); }, []);

  const chooseSize = (next: TodaySize) => {
    setSize(next);
    setExtra(0);
    try { localStorage.setItem(TODAY_SIZE_KEY, next); } catch { /* Storage may be disabled. */ }
  };

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    if (!(await work())) toast.error('That didn’t save. Try again.');
    setBusy(false);
  };
  const act = (id: string, action: FocusAction) => run(() => focus.act(id, action));
  const swap = (out: string, replacement: string) => run(async () => {
    setSwapping(false);
    return (await focus.act(replacement, 'add')) && focus.act(out, 'skip');
  });
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

  const { list, done, others, reviewOpen, doneCount, total } = planToday(focus.items, size, extra, { due: dueCards, reviewedToday: focus.reviewedToday });
  const hero = reviewOpen ? null : list[0] ?? null;
  const then = reviewOpen ? list : list.slice(1);
  const finished = !reviewOpen && list.length === 0;
  const pinnedCount = focus.items.filter((i) => !i.finished).length;
  const heroTime = hero ? timeOf(hero, pace) : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.95rem] text-fg-muted">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <div className="flex items-center gap-4">
          {total > 0 && (
            <span className="flex items-center gap-2 text-[0.88rem] text-fg-secondary">
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i < doneCount ? 'bg-ink' : 'bg-[var(--border-strong)]'}`} />)}
              </span>
              {doneCount} of {total} done
            </span>
          )}
          <label className="sr-only" htmlFor="today-size">How much today</label>
          <select id="today-size" value={size} onChange={(e) => chooseSize(e.target.value as TodaySize)} className="form-input h-9 w-auto py-0 text-[0.85rem]">
            {TODAY_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {finished ? (
        <section aria-labelledby="today-h" className="glass-panel flex flex-col items-start gap-3 p-8">
          <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-tight">That’s today.</h1>
          <p className="m-0 text-[1.05rem] text-fg-secondary">{others.length > 0 ? 'You can stop here, or take on one more.' : 'Everything in your Focus has had its turn.'}</p>
          {others.length > 0 && <Button onClick={() => setExtra((n) => n + 1)}>Keep going</Button>}
        </section>
      ) : (
        <section aria-labelledby="today-h" className="glass-panel flex flex-col gap-5 p-8">
          {hero ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[0.95rem] text-fg-muted">Up next · {[hero.title, hero.position].filter(Boolean).join(' · ')}</span>
                <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-[1.15]">{hero.nextStep ?? hero.title}</h1>
                <p className="m-0 text-[1rem] text-fg-secondary">{hero.reason}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {hero.href ? (
                  <ButtonLink href={hero.href} variant="primary" size="lg" className="mr-2">
                    Continue{heroTime ? ` · ${heroTime}` : ''} <Icon name="arrowRight" size={16} />
                  </ButtonLink>
                ) : (
                  <Button variant="primary" size="lg" className="mr-2" disabled={busy} onClick={() => void act(hero.id, 'done')}>Mark done</Button>
                )}
                {hero.href && <button type="button" disabled={busy} className={quiet} onClick={() => void act(hero.id, 'done')}>Done</button>}
                {others.length > 0 && <button type="button" disabled={busy} aria-expanded={swapping} className={quiet} onClick={() => setSwapping((v) => !v)}>Swap</button>}
                <button type="button" disabled={busy} className={quiet} onClick={() => void act(hero.id, 'skip')}>Not today</button>
              </div>
              {swapping && (
                <ul className="m-0 flex list-none flex-col gap-1 rounded-xl bg-sunk p-2">
                  {others.map((o) => (
                    <li key={o.id}>
                      <button type="button" disabled={busy} onClick={() => void swap(hero.id, o.id)} className="flex min-h-11 w-full flex-col justify-center rounded-lg bg-transparent px-3 py-1 text-left hover:bg-fill-2">
                        <span className="text-[0.95rem] font-medium text-fg">{o.nextStep ?? o.title}</span>
                        {o.nextStep && <span className="text-[0.8rem] text-fg-muted">{o.title}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[0.95rem] text-fg-muted">Up next</span>
                <h1 id="today-h" className="m-0 font-serif text-[2.4rem] font-normal leading-[1.15]">Review {dueCards} card{dueCards === 1 ? '' : 's'}</h1>
                <p className="m-0 text-[1rem] text-fg-secondary">Keeps what you already know.</p>
              </div>
              <ButtonLink href="/review" variant="primary" size="lg" className="self-start">
                Continue · about {reviewMinutes} min <Icon name="arrowRight" size={16} />
              </ButtonLink>
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
              const label = item.nextStep ? `${item.title}: ${item.nextStep}` : item.title;
              return (
                <li key={item.id} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
                  {item.href
                    ? <Link href={item.href} className="min-w-0 text-[1rem] text-fg no-underline hover:underline">{label}</Link>
                    : <span className="min-w-0 text-[1rem] text-fg">{label}</span>}
                  {time && <span className="shrink-0 whitespace-nowrap text-[0.88rem] text-fg-muted">{time}</span>}
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
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" aria-expanded={adding} onClick={() => setAdding((v) => !v)} className="bg-transparent p-0 text-[0.9rem] font-medium text-fg-secondary hover:text-fg">Add something for today</button>
          {pinnedCount > ROTATION_WARNING_AT && <span className="text-[0.85rem] text-fg-muted">{pinnedCount} things pinned, so they take turns.</span>}
        </div>
        {adding && (
          <div className="flex flex-col gap-2 rounded-xl bg-sunk p-3">
            {others.map((o) => (
              <button key={o.id} type="button" disabled={busy} onClick={() => void act(o.id, 'add')} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-transparent px-2 py-1 text-left hover:bg-fill-2">
                <span className="min-w-0 text-[0.95rem] text-fg">{o.nextStep ? `${o.title}: ${o.nextStep}` : o.title}</span>
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
    </div>
  );
}
