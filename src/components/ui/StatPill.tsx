import React from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

// Explicit rgba tints: theme colors are CSS variables, which Tailwind's
// `/15`-style opacity modifiers can't blend (they'd emit no rule at all).
const TONE: Record<Tone, string> = {
  neutral: 'bg-fill-2 text-fg-secondary',
  primary: 'bg-[var(--fill-3)] text-primary-light',
  success: 'bg-[var(--success-tint)] text-success',
  warning: 'bg-[var(--warning-tint)] text-warning',
  danger: 'bg-[var(--danger-tint)] text-danger',
};

/** A compact "label value" pill — e.g. "47 notes", "streak 6". */
export function StatPill({ label, value, tone = 'neutral', className }: {
  label: React.ReactNode;
  value?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold', TONE[tone], className)}>
      {value !== undefined && <span className="font-bold">{value}</span>}
      <span>{label}</span>
    </span>
  );
}
