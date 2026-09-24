import React from 'react';
import { cn } from './cn';

type Accent = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'none';

const ACCENT: Record<Accent, string> = {
  primary: 'border-l-4 border-l-primary',
  accent: 'border-l-4 border-l-accent',
  success: 'border-l-4 border-l-success',
  warning: 'border-l-4 border-l-warning',
  danger: 'border-l-4 border-l-danger',
  none: '',
};

/** The glass surface every screen uses (legacy .glass-panel), with an optional left accent bar. */
export function Card({
  accent = 'none',
  className,
  children,
  as: Tag = 'div',
  ...rest
}: {
  accent?: Accent;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'form';
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn('glass-panel p-5', ACCENT[accent], className)} {...(rest as Record<string, unknown>)}>
      {children}
    </Tag>
  );
}

/** Small uppercase heading used at the top of cards ("▸ DUE REVIEWS"). */
export function CardLabel({ children, tone = 'secondary', className }: { children: React.ReactNode; tone?: 'primary' | 'secondary'; className?: string }) {
  return (
    <span className={cn('text-[0.7rem] font-bold uppercase tracking-wider', tone === 'primary' ? 'text-primary-light' : 'text-fg-secondary', className)}>
      {children}
    </span>
  );
}
