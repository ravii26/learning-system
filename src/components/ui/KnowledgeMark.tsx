import React from 'react';
import { cn } from './cn';
import type { Knowledge } from '@/lib/moduleState';

export const KNOWLEDGE_LABEL: Record<Knowledge, string> = {
  unseen: 'Not yet',
  learning: 'Learning',
  solid: 'Solid',
  fading: 'Fading',
};

const FILL: Record<Knowledge, string> = {
  unseen: 'bg-transparent shadow-[inset_0_0_0_1.5px_var(--k-unseen)]',
  learning: 'bg-k-learning',
  solid: 'bg-k-solid',
  fading: 'bg-k-fading',
};

const TEXT: Record<Knowledge, string> = {
  unseen: 'text-fg-muted',
  learning: 'text-fg-secondary',
  solid: 'text-k-solid',
  fading: 'text-k-fading-text',
};

/**
 * The square that says how well you know something. Colour is never the
 * only signal: `showLabel` adds the word, and `reason` becomes the tooltip
 * and accessible name.
 */
export function KnowledgeMark({ state, reason, showLabel = false, className }: {
  state: Knowledge;
  reason?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const label = KNOWLEDGE_LABEL[state];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={reason ? `${label}: ${reason}` : label}>
      <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]', FILL[state])} />
      {showLabel ? (
        <span className={cn('font-semibold', TEXT[state])}>{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
