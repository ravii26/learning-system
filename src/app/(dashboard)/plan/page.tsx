'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import FocusPaths from '@/components/focus/FocusPaths';
import PinControl from '@/components/focus/PinControl';
import { goalDisplayName } from '@/lib/focusQueue';
import { useFocus } from '@/lib/useFocus';

/**
 * Learn answers one question: where was I? What you're working on comes
 * first; everything else is folded away below, grouped by goal.
 */

interface GoalRow {
  id: string;
  title: string;
  shortName: string | null;
  status: string;
}

interface TopicRow {
  id: string;
  title: string;
  status: string;
  goal?: { id: string } | null;
}

const OVER = new Set(['abandoned', 'achieved']);

export default function LearnPage() {
  const focus = useFocus();
  const toast = useToast();
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetch('/api/goals'), fetch('/api/topics'), fetch('/api/auth')])
      .then(async ([g, t, a]) => {
        if (!alive) return;
        if (g.ok) setGoals(await g.json());
        if (t.ok) setTopics(await t.json());
        if (a.ok) setIsOwner((await a.json()).isOwner === true);
      })
      .catch(() => toast.error('Couldn’t load your goals.'))
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
    // Again whenever your Focus changes, since that can end a goal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.items.length]);

  if (!loaded || !focus.loaded) {
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-5">
        {[80, 200, 200].map((h, i) => <div key={i} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  const pinnedGoals = new Set(focus.items.map((i) => i.goalId).filter(Boolean));
  const pinnedTopics = new Set(focus.items.map((i) => i.topicId).filter(Boolean));
  const liveTopics = topics.filter((t) => t.status !== 'dropped');
  const waitingGoals = goals.filter((g) => !OVER.has(g.status) && !pinnedGoals.has(g.id));
  const looseTopics = liveTopics.filter((t) => !t.goal && !pinnedTopics.has(t.id));

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Learn</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/learn/all" className="btn btn-secondary h-11 py-0 no-underline hover:no-underline">All lessons</Link>
          <Link href="/learn/start" className="btn btn-primary h-11 py-0 no-underline hover:no-underline">Start learning</Link>
        </div>
      </header>

      <FocusPaths focus={focus} />

      {(waitingGoals.length > 0 || looseTopics.length > 0) && (
        <details className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4">
            <span>
              <span className="text-[1.1rem] font-semibold text-fg">Not now</span>
              <span className="ml-2 text-[0.9rem] text-fg-muted">{waitingGoals.length + looseTopics.length}</span>
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-fg-muted transition-transform group-open:rotate-90" />
          </summary>
          <ul className="m-0 list-none p-0">
            {waitingGoals.map((g) => {
              const inside = liveTopics.filter((t) => t.goal?.id === g.id);
              return (
                <li key={g.id} className="border-b border-line py-1 last:border-b-0">
                  <details>
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4">
                      <span className="min-w-0">
                        <span className="text-[1.02rem] font-semibold text-fg">{goalDisplayName(g)}</span>
                        <span className="ml-2 text-[0.88rem] text-fg-muted">{inside.length} topic{inside.length === 1 ? '' : 's'}</span>
                      </span>
                      <span onClick={(e) => e.preventDefault()}><PinControl focus={focus} target={{ kind: 'goal', goalId: g.id }} label="Start" /></span>
                    </summary>
                    <ul className="m-0 flex list-none flex-col gap-1 pb-3 pl-1">
                      {inside.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 text-[0.95rem]">
                          <Link href={`/topics/${t.id}`} className="min-w-0 text-fg-secondary">{t.title}</Link>
                          <PinControl focus={focus} target={{ kind: 'topic', topicId: t.id }} label="Start" />
                        </li>
                      ))}
                      <li><Link href={`/goals/${g.id}`} className="text-[0.88rem] font-medium text-fg-muted">Open goal</Link></li>
                    </ul>
                  </details>
                </li>
              );
            })}
            {looseTopics.length > 0 && (
              <li className="py-1">
                <details>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2">
                    <span className="text-[1.02rem] font-semibold text-fg">Other topics</span>
                    <span className="text-[0.88rem] text-fg-muted">{looseTopics.length}</span>
                  </summary>
                  <ul className="m-0 flex list-none flex-col gap-1 pb-3 pl-1">
                    {looseTopics.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-[0.95rem]">
                        <Link href={`/topics/${t.id}`} className="min-w-0 text-fg-secondary">{t.title}</Link>
                        <PinControl focus={focus} target={{ kind: 'topic', topicId: t.id }} label="Start" />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        </details>
      )}

      <nav aria-label="More" className="flex flex-wrap gap-5 text-[0.9rem]">
        <Link href="/goals" className="text-fg-secondary">All goals</Link>
        <Link href="/learn/manage" className="text-fg-secondary">Manage topics</Link>
        {isOwner && <Link href="/library" className="text-fg-secondary">Field library</Link>}
      </nav>
    </div>
  );
}
