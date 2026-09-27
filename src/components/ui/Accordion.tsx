'use client';

import React from 'react';
import { Icon } from './Icon';

/**
 * A collapsible section built on <details>/<summary>: keyboard and screen
 * reader friendly with no state to manage. `hint` is a one-line summary shown
 * in the header, so the useful fact is visible even while collapsed.
 */
export function Accordion({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-fill-1">
        <Icon name="chevronRight" size={16} className="shrink-0 text-fg-muted transition-transform group-open:rotate-90" />
        <span className="flex min-w-0 flex-col">
          <span className="text-[0.95rem] font-semibold">{title}</span>
          {hint && <span className="truncate text-[0.8rem] text-fg-muted">{hint}</span>}
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}
