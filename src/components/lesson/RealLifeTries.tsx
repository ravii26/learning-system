import React from 'react';
import { REAL_LIFE_LABEL, type RealLifeTry } from '@/lib/tryInRealLife';

/**
 * "Try it in real life": what to do away from the page, as a numbered list
 * of small tasks. No colour carries meaning; the type is a plain word.
 */
export function RealLifeTries({ items }: { items: RealLifeTry[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="real-h" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="real-h" className="m-0 text-[1.15rem] font-semibold">Try it in real life</h3>
        <p className="m-0 text-[0.9rem] text-fg-muted">Reading helps. Doing it in your own day is what makes it stick.</p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex flex-col gap-1.5 rounded-xl bg-sunk p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">{REAL_LIFE_LABEL[it.type]}</span>
              {it.when && <span className="text-[0.85rem] text-fg-muted">· {it.when}</span>}
            </div>
            <p className="m-0 text-[1rem] font-semibold leading-snug">{it.task}</p>
            <p className="m-0 text-[0.95rem] leading-relaxed text-fg-secondary">{it.how}</p>
            {it.check && <p className="m-0 text-[0.9rem] leading-snug"><span className="font-semibold">You’ll know it worked when: </span>{it.check}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
