import React from 'react';
import { cn } from './cn';

/** Underlined tab row. Controlled: the caller owns which key is active. */
export function Tabs<K extends string>({ tabs, active, onChange, className }: {
  tabs: Array<{ key: K; label: React.ReactNode }>;
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-2 border-b border-line pb-0.5', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'border-b-2 bg-transparent px-3.5 py-2 text-[0.82rem] font-semibold transition-colors',
            active === t.key ? 'border-b-primary text-primary-light' : 'border-b-transparent text-fg-secondary hover:text-fg'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
