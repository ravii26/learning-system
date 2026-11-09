'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ButtonLink, Icon } from '@/components/ui';
import { planToday, readTodaySize } from '@/lib/focusQueue';
import type { FocusApi } from '@/lib/useFocus';

/**
 * Shown when you finish something, so the day carries on without a trip back
 * to Today. Says nothing for people who don't use Focus.
 */
export default function NextUpCard({ focus, scrollTo = false }: { focus: FocusApi; scrollTo?: boolean }) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    void focus.refresh().then(() => alive && setReady(true));
    return () => { alive = false; };
    // Once each time it appears, so it reflects what you just finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && scrollTo) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [ready, scrollTo]);

  if (!ready || focus.items.length === 0) return null;

  const { list, reviewOpen } = planToday(focus.items, readTodaySize(), 0, { due: focus.dueCards, reviewedToday: focus.reviewedToday });
  const next = list[0];
  const title = reviewOpen ? `Review ${focus.dueCards} card${focus.dueCards === 1 ? '' : 's'}` : next ? next.nextStep ?? next.title : null;
  const context = !reviewOpen && next?.nextStep ? next.title : null;
  const href = reviewOpen ? '/review' : next?.href ?? '/';

  return (
    <section ref={ref} aria-label="What's next" className="glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
      {title ? (
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[0.88rem] text-fg-muted">Next on your list{context ? ` · ${context}` : ''}</span>
            <span className="font-serif text-[1.5rem] leading-tight text-fg">{title}</span>
          </div>
          <ButtonLink href={href} variant="primary">Continue <Icon name="arrowRight" size={16} /></ButtonLink>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="font-serif text-[1.5rem] leading-tight text-fg">That’s today.</span>
            <span className="text-[0.95rem] text-fg-secondary">Everything on your list is done.</span>
          </div>
          <ButtonLink href="/">Back to Today</ButtonLink>
        </>
      )}
    </section>
  );
}
