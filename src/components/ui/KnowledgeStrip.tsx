import React from 'react';
import { cn } from './cn';
import { KNOWLEDGE_LABEL } from './KnowledgeMark';
import type { Knowledge } from '@/lib/moduleState';

const CELL: Record<Knowledge, string> = {
  solid: 'bg-k-solid',
  learning: 'bg-k-learning',
  fading: 'bg-k-fading',
  unseen: 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]',
};

const ORDER: Knowledge[] = ['solid', 'fading', 'learning', 'unseen'];

/** "4 solid · 1 fading · 1 learning · 8 to go" — the words behind the colours. */
export function knowledgeSummary(states: Knowledge[]): string {
  const counts = states.reduce<Record<Knowledge, number>>((acc, s) => ((acc[s] += 1), acc), { solid: 0, fading: 0, learning: 0, unseen: 0 });
  return ORDER.filter((s) => counts[s] > 0)
    .map((s) => (s === 'unseen' ? `${counts[s]} to go` : `${counts[s]} ${KNOWLEDGE_LABEL[s].toLowerCase()}`))
    .join(' · ');
}

/**
 * One square per module (or idea), coloured by how well you know it. The
 * summary sentence is always available to screen readers, and `showSummary`
 * prints it — colour is never the only way to read it.
 */
export function KnowledgeStrip({ states, current, size = 'md', showSummary = false, className }: {
  states: Knowledge[];
  /** Index to outline, e.g. the module you're about to study. */
  current?: number;
  size?: 'sm' | 'md' | 'lg';
  showSummary?: boolean;
  className?: string;
}) {
  if (states.length === 0) return null;
  const summary = knowledgeSummary(states);
  const cell = size === 'lg' ? 'h-6 w-6 rounded-[5px]' : size === 'sm' ? 'h-2 flex-1 rounded-[2px]' : 'h-2.5 w-7 rounded-[3px]';
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className={cn('flex flex-wrap', size === 'sm' ? 'gap-1' : 'gap-1.5')} role="img" aria-label={summary}>
        {states.map((s, i) => (
          <span
            key={i}
            className={cn('block', cell, CELL[s], i === current && 'outline outline-2 outline-offset-2 outline-[var(--ink)]')}
          />
        ))}
      </div>
      {showSummary && <span className="text-[0.82rem] text-fg-muted">{summary}</span>}
    </div>
  );
}
