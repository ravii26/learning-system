'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { MAX_QUOTE_LENGTH, cleanSelectedText } from '@/lib/noteQuote';

/**
 * Appears when you select text in a lesson. Floats above the selection with a
 * mouse; on touch screens it sits at the bottom so it doesn't fight the
 * phone's own copy menu.
 */

interface LessonSelectionMenuProps {
  rootRef: React.RefObject<HTMLElement>;
  onAdd: (quote: string) => Promise<void>;
  onOpenNotes: () => void;
  onAsk: (text: string) => void;
  onSimpler: (text: string) => void;
  onMakeCard: (text: string) => void;
}

interface Selected {
  text: string;
  top: number;
  left: number;
}

const MENU_HALF_WIDTH = 210;
const ADDED_VISIBLE_MS = 4000;

const isTyping = (el: Element | null) => !!el?.closest('input, textarea, [contenteditable="true"]');

function readSelection(root: HTMLElement): Selected | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || isTyping(document.activeElement)) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = cleanSelectedText(selection.toString());
  if (!text) return null;
  const rect = range.getBoundingClientRect();
  const left = Math.min(window.innerWidth - MENU_HALF_WIDTH, Math.max(MENU_HALF_WIDTH, rect.left + rect.width / 2));
  const top = rect.top > 72 ? rect.top - 52 : rect.bottom + 10;
  return { text, top, left };
}

const itemClass = 'flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-transparent px-3 text-[0.875rem] font-semibold text-on-ink hover:opacity-80 disabled:opacity-60';

export default function LessonSelectionMenu({ rootRef, onAdd, onOpenNotes, onAsk, onSimpler, onMakeCard }: LessonSelectionMenuProps) {
  const toast = useToast();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);
  const [coarse, setCoarse] = useState(false);
  // While saving or confirming, the menu stays put even though the selection is gone.
  const holding = useRef(false);
  holding.current = saving || added;

  useEffect(() => {
    setCoarse(window.matchMedia('(pointer: coarse)').matches);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (holding.current || !rootRef.current) return;
      setSelected(readSelection(rootRef.current));
    };
    // Waits for a drag to settle, so the menu doesn't chase the pointer.
    const onSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [rootRef]);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => {
      setAdded(false);
      setSelected(null);
    }, ADDED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [added]);

  if (!selected) return null;

  const add = async () => {
    if (selected.text.length > MAX_QUOTE_LENGTH) {
      toast.error('That selection is too long. Select a shorter passage.');
      return;
    }
    setSaving(true);
    try {
      await onAdd(selected.text);
      setAdded(true);
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Couldn’t add that to your notes.');
    } finally {
      setSaving(false);
    }
  };

  const handOff = (action: (text: string) => void) => {
    const { text } = selected;
    setSelected(null);
    window.getSelection()?.removeAllRanges();
    action(text);
  };

  const openNotes = () => {
    setAdded(false);
    setSelected(null);
    onOpenNotes();
  };

  return createPortal(
    <div
      role="toolbar"
      aria-label="Selected text"
      // Keeps the text selected when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      className={`fixed z-[150] flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-0.5 rounded-xl bg-ink p-1 shadow-card ${coarse ? 'bottom-[calc(env(safe-area-inset-bottom)+84px)] left-1/2 -translate-x-1/2' : '-translate-x-1/2'}`}
      style={coarse ? undefined : { top: selected.top, left: selected.left }}
    >
      {added ? (
        <>
          <span role="status" className="flex h-9 items-center gap-2 whitespace-nowrap px-3 text-[0.875rem] font-semibold text-on-ink">
            <Icon name="check" size={16} strokeWidth={2.4} /> Added to notes
          </span>
          <button type="button" onClick={openNotes} className={`${itemClass} underline underline-offset-2`}>Open</button>
        </>
      ) : (
        <>
          <button type="button" onClick={add} disabled={saving} className={itemClass}>
            <Icon name="notebook" size={16} /> {saving ? 'Adding…' : 'Add to notes'}
          </button>
          <button type="button" onClick={() => handOff(onAsk)} disabled={saving} className={itemClass}>Ask</button>
          <button type="button" onClick={() => handOff(onSimpler)} disabled={saving} className={itemClass}>Simpler</button>
          <button type="button" onClick={() => handOff(onMakeCard)} disabled={saving} className={itemClass}>Make card</button>
        </>
      )}
    </div>,
    document.body,
  );
}
