'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import FocusPaths from '@/components/focus/FocusPaths';
import LaterList, { type LaterGoal, type LaterTopic } from '@/components/focus/LaterList';
import MoreMenu from '@/components/focus/MoreMenu';
import { learnList, learnSummary } from '@/lib/resumePoint';
import { useFocus } from '@/lib/useFocus';

/**
 * Learn shows everything at a glance: one bar to carry on, a card for each
 * thing you're learning now, and what's waiting for later.
 */
export default function LearnPage() {
  const focus = useFocus();
  const toast = useToast();
  const [goals, setGoals] = useState<LaterGoal[]>([]);
  const [topics, setTopics] = useState<LaterTopic[]>([]);
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

  const summary = learnSummary(learnList(focus.items));

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Learn</h1>
          {summary && <p className="m-0 mt-1 text-[0.92rem] text-fg-muted">{summary}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/learn/all" className="btn btn-secondary h-11 py-0 no-underline hover:no-underline">All lessons</Link>
          <Link href="/learn/start" className="btn btn-primary h-11 py-0 no-underline hover:no-underline">Add something new</Link>
          <MoreMenu label="More places" bordered>
            {() => (
              <>
                <Link href="/goals" className="avatar-dropdown-item no-underline">All goals</Link>
                <Link href="/learn/manage" className="avatar-dropdown-item no-underline">Manage topics</Link>
                {isOwner && <Link href="/library" className="avatar-dropdown-item no-underline">Field library</Link>}
              </>
            )}
          </MoreMenu>
        </div>
      </header>

      <FocusPaths focus={focus} />
      <LaterList focus={focus} goals={goals} topics={topics} />
    </div>
  );
}
