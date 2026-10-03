'use client';

import React, { useEffect } from 'react';

/**
 * Right-hand slide-over. Closes on Esc, backdrop click, or the Close
 * button; full-width on phones. Renders nothing while closed.
 */
export function Drawer({ open, onClose, title, label, width = 680, children }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  label: string;
  /** Max width in px; narrow drawers keep the page beside them in view. */
  width?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end bg-black/25">
      <aside
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 100vw)` }}
        className="flex h-full flex-col gap-6 overflow-y-auto border-l border-line bg-surface shadow-pop px-6 py-5"
      >
        <div className="flex-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn btn-secondary px-3 py-1 text-[0.8rem]">Close ✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** A titled block inside a Drawer. */
export function DrawerSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[0.75rem] font-bold uppercase tracking-wider text-fg-secondary">{title}</h3>
      {children}
    </section>
  );
}
