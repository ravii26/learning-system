'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

/** A "⋯" button that opens a small panel. Children get a way to close it. */
export default function MoreMenu({ label, bordered = false, children }: { label: string; bordered?: boolean; children: (close: () => void) => React.ReactNode }) {
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

  const look = bordered ? 'h-11 w-11 border border-line bg-surface hover:border-line-hover' : 'h-9 w-9 bg-transparent hover:bg-fill-2';
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`flex items-center justify-center rounded-lg text-fg-muted hover:text-fg ${look}`}>
        <Icon name="more" size={18} strokeWidth={2.6} />
      </button>
      {open && <div className="avatar-dropdown min-w-[220px]">{children(() => setOpen(false))}</div>}
    </div>
  );
}
