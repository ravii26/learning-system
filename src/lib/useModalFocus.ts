'use client';

import { useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
let previousOverflow = '';

/** Keep keyboard navigation inside the topmost drawer and restore its trigger. */
export function useModalFocus<T extends HTMLElement = HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialogs.push(panel);
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    )).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    const onKey = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length || index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] ?? panel : items[0] ?? panel).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const wasTop = dialogs[dialogs.length - 1] === panel;
      dialogs.splice(dialogs.indexOf(panel), 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (wasTop && trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return ref;
}
