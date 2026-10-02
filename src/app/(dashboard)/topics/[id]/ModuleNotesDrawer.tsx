'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import RichTextEditor from './RichTextEditor';

interface ModuleNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  moduleOrder: number;
  moduleTitle: string;
  notes: string;
  onSaveNotes: (html: string) => Promise<void> | void;
  topicWideNotes?: string;
  onSaveTopicWideNotes?: (html: string) => Promise<void>;
}

export default function ModuleNotesDrawer({
  open,
  onClose,
  moduleId,
  moduleOrder,
  moduleTitle,
  notes,
  onSaveNotes,
  topicWideNotes,
  onSaveTopicWideNotes,
}: ModuleNotesDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock background body scrolling while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex justify-end bg-black/45 backdrop-blur-[2px] transition-opacity"
      aria-modal="true"
      role="dialog"
      aria-label={`Notes for ${moduleTitle}`}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full flex-col border-l border-line bg-surface shadow-2xl transition-all duration-200 ease-out overflow-hidden ${
          isExpanded ? 'w-[min(1080px,100vw)]' : 'w-[min(640px,100vw)]'
        }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-6 py-4 bg-base/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fill-2 text-fg">
              <Icon name="notebook" size={18} />
            </span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-fill-2 px-1.5 py-0.5 text-[0.72rem] font-semibold uppercase tracking-wider text-fg-secondary">
                  Module {moduleOrder}
                </span>
                <span className="text-[0.78rem] text-fg-muted">Study Notes</span>
              </div>
              <h2 className="m-0 truncate text-[1.05rem] font-semibold text-fg" title={moduleTitle}>
                {moduleTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary hover:bg-fill-2 hover:text-fg transition-colors"
              title={isExpanded ? 'Collapse width' : 'Expand full width'}
              aria-label={isExpanded ? 'Collapse width' : 'Expand full width'}
            >
              <Icon name={isExpanded ? 'minimize' : 'maximize'} size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.82rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg transition-colors"
              title="Close drawer (Esc)"
            >
              <Icon name="close" size={14} />
              <span>Close</span>
            </button>
          </div>
        </header>

        {/* Sub-header info bar */}
        <div className="flex items-center justify-between border-b border-line bg-surface px-6 py-2 text-[0.78rem] text-fg-muted">
          <span>Saved automatically as you type · Synced with module reviews</span>
          <span className="font-mono text-[0.72rem]">Esc to close</span>
        </div>

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          <div className="flex-1 flex flex-col">
            <RichTextEditor
              key={moduleId}
              content={notes || ''}
              onChange={onSaveNotes}
              placeholder={`Explain ${moduleTitle} in your own words. Jot down key formulas, core takeaways, mental models, or code templates...`}
              minHeight={isExpanded ? 560 : 420}
            />
          </div>

          {/* Legacy Topic-wide notes if any exist */}
          {topicWideNotes && topicWideNotes.replace(/<[^>]*>/g, '').trim() && (
            <details className="rounded-xl border border-line bg-base/40 p-4 text-[0.85rem] text-fg-secondary">
              <summary className="cursor-pointer font-semibold text-fg">
                Older topic-wide notes (view & edit)
              </summary>
              <div className="mt-3">
                <RichTextEditor
                  content={topicWideNotes}
                  onChange={onSaveTopicWideNotes || (() => {})}
                  placeholder="Older topic notes..."
                  minHeight={150}
                />
              </div>
            </details>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-line bg-base/50 px-6 py-3.5">
          <span className="text-[0.8rem] text-fg-muted">
            Tip: Press <kbd className="rounded bg-fill-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-fg-secondary">Alt + N</kbd> anytime to toggle notes.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary h-8 px-4 py-0 text-[0.82rem]"
          >
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
