'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * In-app replacements for window.confirm / alert / prompt, callable from
 * anywhere without wiring state:
 *
 *   if (!(await confirmDialog({ title: 'Delete note?', danger: true }))) return;
 *   await alertDialog({ message: 'Saved.' });
 *   const url = await promptDialog({ title: 'Link', value: 'https://' }); // null = cancelled
 *
 * <DialogHost /> is mounted once in the root layout.
 */

type Kind = 'confirm' | 'alert' | 'prompt';
interface DialogOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  value?: string;
  placeholder?: string;
}
interface Pending extends DialogOptions {
  kind: Kind;
  resolve: (v: unknown) => void;
}

let queue: Pending[] = [];
let notify: (() => void) | null = null;

function open<T>(kind: Kind, opts: DialogOptions | string): Promise<T> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise<T>((resolve) => {
    // Fallback if the host isn't mounted (shouldn't happen).
    if (!notify) {
      if (kind === 'confirm') return resolve(window.confirm(o.message ?? o.title ?? '') as T);
      if (kind === 'prompt') return resolve(window.prompt(o.message ?? o.title ?? '', o.value) as T);
      window.alert(o.message ?? o.title ?? '');
      return resolve(undefined as T);
    }
    queue = [...queue, { ...o, kind, resolve: resolve as (v: unknown) => void }];
    notify();
  });
}

export const confirmDialog = (o: DialogOptions | string) => open<boolean>('confirm', o);
export const alertDialog = (o: DialogOptions | string) => open<void>('alert', o);
export const promptDialog = (o: DialogOptions | string) => open<string | null>('prompt', o);

export function DialogHost() {
  const [, force] = useState(0);
  const [value, setValue] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  useEffect(() => {
    notify = () => force((n) => n + 1);
    return () => {
      notify = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    setValue(current.value ?? '');
    const prevFocus = document.activeElement as HTMLElement | null;
    setTimeout(() => (current.kind === 'prompt' ? inputRef.current?.select() : confirmRef.current?.focus()), 0);
    return () => prevFocus?.focus?.();
  }, [current]);

  if (!current) return null;

  const close = (result: unknown) => {
    current.resolve(result);
    queue = queue.slice(1);
    force((n) => n + 1);
  };
  const cancel = () => close(current.kind === 'confirm' ? false : current.kind === 'prompt' ? null : undefined);
  const ok = () => close(current.kind === 'confirm' ? true : current.kind === 'prompt' ? value : undefined);

  const title = current.title ?? (current.kind === 'confirm' ? 'Are you sure?' : current.kind === 'prompt' ? 'Enter a value' : 'Notice');

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      style={{ background: 'var(--bg-overlay)', animation: 'fadeIn 0.15s ease-out' }}
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
        if (e.key === 'Enter' && current.kind === 'prompt') ok();
      }}
    >
      <div
        role={current.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-[14px] border border-line bg-surface p-6"
        style={{ boxShadow: 'var(--shadow-pop)', animation: 'slideUp 0.18s ease-out' }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="app-dialog-title" className="font-serif text-[1.25rem] font-medium text-fg">
            {title}
          </h2>
          {current.message && <p className="whitespace-pre-line text-[0.9rem] leading-relaxed text-fg-secondary">{current.message}</p>}
        </div>
        {current.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="form-input"
            value={value}
            placeholder={current.placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          {current.kind !== 'alert' && (
            <button type="button" className="btn btn-secondary h-10 py-0" onClick={cancel}>
              {current.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${current.danger ? 'btn-danger' : 'btn-primary'} h-10 py-0`}
            onClick={ok}
          >
            {current.confirmLabel ?? (current.kind === 'alert' ? 'OK' : current.danger ? 'Delete' : 'Continue')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
