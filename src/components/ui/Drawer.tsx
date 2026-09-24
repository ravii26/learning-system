'use client';

import React, { useEffect } from 'react';

/**
 * Right-hand slide-over. Closes on Esc, backdrop click, or the Close
 * button; full-width on phones. Renders nothing while closed.
 */
export function Drawer({ open, onClose, title, label, children }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  label: string;
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
    <div onClick={onClose} className="fixed inset-0 z-[60] flex justify-end bg-black/55">
      <aside
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[min(680px,100vw)] flex-col gap-6 overflow-y-auto border-l border-line bg-[#0f0f15] px-6 py-5"
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
