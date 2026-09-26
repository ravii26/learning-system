import React from 'react';
import { cn } from './cn';

type Accent = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'none';

// Coloured left edges are gone in the redesign (colour only means
// knowledge state). The prop stays so existing callers keep compiling;
// 'danger' keeps a full border because it marks something destructive.
const ACCENT: Record<Accent, string> = {
  primary: '',
  accent: '',
  success: '',
  warning: '',
  danger: 'border-danger',
  none: '',
};

/** The surface every screen uses (legacy .glass-panel). */
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

/** Small sentence-case heading at the top of a card ("Due for review"). */
export function CardLabel({ children, tone = 'secondary', className }: { children: React.ReactNode; tone?: 'primary' | 'secondary'; className?: string }) {
  return (
    <span className={cn('text-[0.875rem] font-semibold', tone === 'primary' ? 'text-fg' : 'text-fg-secondary', className)}>
      {children}
    </span>
  );
}
