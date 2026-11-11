'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { goalDisplayName } from '@/lib/focusQueue';
import type { FocusApi } from '@/lib/useFocus';
import { StartNow } from './PinControl';

export interface LaterGoal { id: string; title: string; shortName: string | null; status: string }
export interface LaterTopic { id: string; title: string; status: string; goal?: { id: string } | null }

const OVER = new Set(['abandoned', 'achieved']);
const ROWS_SHOWN = 8;
const TOPICS_SHOWN = 6;

/** Everything you have but aren't working on yet, in plain view. */
export default function LaterList({ focus, goals, topics }: { focus: FocusApi; goals: LaterGoal[]; topics: LaterTopic[] }) {
  const [showAll, setShowAll] = useState(false);
  const pinnedGoals = new Set(focus.items.map((i) => i.goalId).filter(Boolean));
  const pinnedTopics = new Set(focus.items.map((i) => i.topicId).filter(Boolean));
  const live = topics.filter((t) => t.status !== 'dropped');

  const rows: React.ReactNode[] = [
    ...goals.filter((g) => !OVER.has(g.status) && !pinnedGoals.has(g.id)).map((g) => {
      const inside = live.filter((t) => t.goal?.id === g.id);
      const waiting = inside.filter((t) => !pinnedTopics.has(t.id));
      const extra = waiting.length - TOPICS_SHOWN;
      return (
        <li key={g.id} className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
          <div className="min-w-0">
            <Link href={`/goals/${g.id}`} className="text-[1rem] font-semibold text-fg no-underline hover:underline">{goalDisplayName(g)}</Link>
            <span className="ml-2 text-[0.85rem] text-fg-muted">{inside.length} topic{inside.length === 1 ? '' : 's'}</span>
            {waiting.length > 0 && (
              <p className="m-0 mt-1 text-[0.88rem] text-fg-muted">
                {waiting.slice(0, TOPICS_SHOWN).map((t, i) => (
                  <React.Fragment key={t.id}>
                    {i > 0 && ' · '}
                    <Link href={`/topics/${t.id}`} className="text-fg-secondary">{t.title}</Link>
                  </React.Fragment>
                ))}
                {extra > 0 && <> · <Link href={`/goals/${g.id}`} className="text-fg-muted">{extra} more</Link></>}
              </p>
            )}
          </div>
          <StartNow focus={focus} target={{ kind: 'goal', goalId: g.id }} />
        </li>
      );
    }),
    ...live.filter((t) => !t.goal && !pinnedTopics.has(t.id)).map((t) => (
      <li key={t.id} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
        <div className="min-w-0">
          <Link href={`/topics/${t.id}`} className="text-[1rem] font-semibold text-fg no-underline hover:underline">{t.title}</Link>
          <span className="ml-2 text-[0.85rem] text-fg-muted">Topic</span>
        </div>
        <StartNow focus={focus} target={{ kind: 'topic', topicId: t.id }} />
      </li>
    )),
  ];

  if (rows.length === 0) return null;
  const hidden = showAll ? 0 : Math.max(0, rows.length - ROWS_SHOWN);

  return (
    <section aria-label="Later" className="flex flex-col gap-3">
      <h2 className="m-0 text-[1.1rem] font-semibold">Later <span className="ml-1 text-[0.9rem] font-normal text-fg-muted">{rows.length}</span></h2>
      <div className="glass-panel px-5 py-1">
        <ul className="m-0 list-none p-0">{showAll ? rows : rows.slice(0, ROWS_SHOWN)}</ul>
        {hidden > 0 && <button type="button" onClick={() => setShowAll(true)} className="my-2 bg-transparent p-0 text-[0.88rem] font-medium text-fg-secondary hover:text-fg">Show all {rows.length}</button>}
      </div>
    </section>
  );
}
