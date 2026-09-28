'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

/**
 * The topic page's secondary tools in one menu, so the header shows only
 * what you use every session (the focus timer). A count on the button tells
 * you when there are open questions or mistakes worth a look.
 */
export interface ToolItem {
  label: string;
  detail?: string;
  onSelect: () => void;
}

export default function TopicToolsMenu({ items, attention }: { items: ToolItem[]; attention?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[0.875rem] font-medium hover:border-line-hover"
      >
        Tools
        {!!attention && <span className="rounded-full bg-ink px-1.5 text-[0.72rem] font-semibold text-on-ink">{attention}</span>}
        <Icon name="chevronRight" size={14} className={`text-fg-muted transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div role="menu" className="avatar-dropdown right-0 min-w-[240px]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="avatar-dropdown-item justify-between"
              onClick={() => { setOpen(false); it.onSelect(); }}
            >
              <span>{it.label}</span>
              {it.detail && <span className="text-fg-muted">{it.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
