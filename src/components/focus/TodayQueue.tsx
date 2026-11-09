'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink, Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { TODAY_SIZES, ROTATION_WARNING_AT, pickToday, type TodaySize } from '@/lib/focusQueue';
import { lessonTimeLabel, paceKey, type PaceByKind } from '@/lib/pace';
import type { FocusAction, FocusApi, FocusEntry } from '@/lib/useFocus';

const SIZE_KEY = 'learning-os:today-size';
const ghost = 'h-8 rounded-lg bg-transparent px-2 text-[0.82rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg';

const timeOf = (item: FocusEntry, pace: PaceByKind) =>
  item.estimatedMinutes ? lessonTimeLabel(item.estimatedMinutes, pace[paceKey(item.lessonKind)], { short: true }) : null;

export default function TodayQueue({ focus, dueCards, reviewMinutes, pace }: { focus: FocusApi; dueCards: number; reviewMinutes: number; pace: PaceByKind }) {
  const toast = useToast();
  const [size, setSize] = useState<TodaySize>('normal');
  const [extra, setExtra] = useState(0);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIZE_KEY);
      if (saved === 'quick' || saved === 'normal' || saved === 'deep') setSize(saved);
    } catch { /* Storage may be disabled. */ }
  }, []);

  const chooseSize = (next: TodaySize) => {
    setSize(next);
    setExtra(0);
    try { localStorage.setItem(SIZE_KEY, next); } catch { /* Storage may be disabled. */ }
  };

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    if (!(await work())) toast.error('That didn’t save. Try again.');
    setBusy(false);
  };
  const act = (id: string, action: FocusAction) => run(() => focus.act(id, action));
  const swap = (out: string, replacement: string) => run(async () => {
    setSwapping(null);
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

  const { list, done, others } = pickToday(focus.items, size, extra);
  const startHref = dueCards > 0 ? '/review' : list.find((i) => i.href)?.href ?? null;
  const first = list[0];
  const firstTime = dueCards === 0 && first?.href ? timeOf(first, pace) : null;
  const finishedForToday = dueCards === 0 && list.length === 0;
  const pinnedCount = focus.items.filter((i) => !i.finished).length;

  return (
    <section aria-labelledby="today-h" className="glass-panel flex flex-col gap-5 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="today-h" className="m-0 font-serif text-[1.8rem] font-medium leading-tight">{finishedForToday ? 'That’s today.' : 'Your list for today'}</h2>
        <div role="group" aria-label="How much today" className="flex rounded-xl bg-sunk p-1">
          {TODAY_SIZES.map((s) => (
            <button key={s.key} type="button" aria-pressed={size === s.key} onClick={() => chooseSize(s.key)} className={`h-8 rounded-[9px] px-3 text-[0.85rem] ${size === s.key ? 'bg-surface font-semibold text-fg shadow-card' : 'bg-transparent font-medium text-fg-secondary hover:text-fg'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {finishedForToday ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[1rem] text-fg-secondary">{others.length > 0 ? 'You’re done for today. Stop here, or take on one more.' : 'Nothing else is waiting. Everything in your Focus has had its turn today.'}</p>
          {others.length > 0 && <Button onClick={() => setExtra((n) => n + 1)}>Keep going</Button>}
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {dueCards > 0 && (
            <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunk text-[0.8rem] font-semibold text-fg-secondary">1</span>
              <Link href="/review" className="flex min-w-0 flex-1 flex-col no-underline hover:no-underline">
                <span className="text-[1.05rem] font-semibold text-fg">Review {dueCards} card{dueCards === 1 ? '' : 's'}</span>
                <span className="text-[0.85rem] text-fg-muted">Keeps what you already know</span>
              </Link>
              <span className="text-[0.85rem] text-fg-muted">about {reviewMinutes} min</span>
            </li>
          )}
          {list.map((item, index) => {
            const time = timeOf(item, pace);
            const main = item.nextStep ?? item.title;
            const context = item.nextStep ? `${item.title} · ${item.reason}` : item.reason;
            return (
              <li key={item.id} className="flex flex-col gap-2 border-b border-line py-3.5 last:border-b-0">
                <div className="flex items-start gap-x-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunk text-[0.8rem] font-semibold text-fg-secondary">{index + (dueCards > 0 ? 2 : 1)}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {item.href
                      ? <Link href={item.href} className="text-[1.05rem] font-semibold leading-snug text-fg no-underline hover:no-underline">{main}</Link>
                      : <span className="text-[1.05rem] font-semibold leading-snug text-fg">{main}</span>}
                    <span className="text-[0.85rem] text-fg-muted">{context}</span>
                  </div>
                  {time && <span className="shrink-0 whitespace-nowrap text-[0.85rem] text-fg-muted">{time}</span>}
                </div>
                <div className="flex flex-wrap gap-1 pl-11">
                  <button type="button" disabled={busy} className={ghost} onClick={() => void act(item.id, 'done')}>Done</button>
                  {others.length > 0 && <button type="button" disabled={busy} aria-expanded={swapping === item.id} className={ghost} onClick={() => setSwapping(swapping === item.id ? null : item.id)}>Swap</button>}
                  <button type="button" disabled={busy} className={ghost} onClick={() => void act(item.id, 'skip')}>Not today</button>
                </div>
                {swapping === item.id && (
                  <ul className="m-0 ml-11 flex list-none flex-col gap-1 rounded-xl bg-sunk p-2">
                    {others.map((o) => (
                      <li key={o.id}>
                        <button type="button" disabled={busy} onClick={() => void swap(item.id, o.id)} className="flex min-h-10 w-full flex-col justify-center rounded-lg bg-transparent px-2 py-1 text-left hover:bg-fill-2">
                          <span className="text-[0.92rem] font-medium text-fg">{o.nextStep ?? o.title}</span>
                          {o.nextStep && <span className="text-[0.8rem] text-fg-muted">{o.title}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {startHref && (
          <ButtonLink href={startHref} variant="primary" size="lg">
            Start{firstTime ? ` · ${firstTime}` : ''} <Icon name="arrowRight" size={16} />
          </ButtonLink>
        )}
        <Button variant="ghost" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>Add something</Button>
        <Link href="/plan" className="text-[0.88rem] text-fg-secondary">Edit Focus</Link>
      </div>

      {adding && (
        <div className="flex flex-col gap-2 rounded-xl bg-sunk p-3">
          {others.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {others.map((o) => (
                <li key={o.id}>
                  <button type="button" disabled={busy} onClick={() => void act(o.id, 'add')} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-transparent px-2 py-1 text-left hover:bg-fill-2">
                    <span className="min-w-0 truncate text-[0.92rem] font-medium text-fg">{o.nextStep ?? o.title}</span>
                    <Icon name="plus" size={15} className="shrink-0 text-fg-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addCustom} className="flex gap-2">
            <label htmlFor="today-new" className="sr-only">Something else for today</label>
            <input id="today-new" className="form-input h-10 flex-1 py-0" placeholder="Something else, like a chapter or a task" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <Button type="submit" disabled={busy || !newTitle.trim()}>Add</Button>
          </form>
        </div>
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-[0.85rem] font-semibold text-fg-secondary">Done today</span>
          {done.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 text-[0.92rem] text-fg-secondary">
              <Icon name="check" size={15} strokeWidth={2.4} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.nextStep ?? item.title}</span>
              {item.canUndo && <button type="button" disabled={busy} className={ghost} onClick={() => void act(item.id, 'undo')}>Undo</button>}
            </div>
          ))}
        </div>
      )}

      {pinnedCount > ROTATION_WARNING_AT && (
        <p className="m-0 text-[0.85rem] text-fg-muted">You’ve pinned {pinnedCount} things, so they’ll take turns across the week.</p>
      )}
    </section>
  );
}
