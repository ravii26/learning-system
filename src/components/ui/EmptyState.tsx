import React from 'react';
import { cn } from './cn';

/** An empty state that teaches: what's missing and the one next action. */
export function EmptyState({ icon, title, children, action, className }: {
  icon?: string;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('glass-panel flex flex-col items-center gap-2 px-6 py-8 text-center', className)}>
      {icon && <span className="text-3xl" aria-hidden>{icon}</span>}
      {title && <div className="text-sm font-bold text-fg">{title}</div>}
      {children && <div className="max-w-md text-[0.85rem] text-fg-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
