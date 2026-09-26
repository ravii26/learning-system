'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createCapture } from '@/lib/captureClient';
import { Button } from '@/components/ui';

/**
 * Capture from anywhere, outside the dashboard chrome:
 * - Bookmarklet target: /capture?url=...&title=... files the page you were
 *   on straight into the inbox (once — a reload won't duplicate it).
 * - Phone: bookmark /capture to the home screen for a one-box capture.
 * Uses your normal login; for a phone shortcut with no browser session,
 * see /api/capture-hook.
 */
function CaptureInner() {
  const params = useSearchParams();
  const sharedUrl = params.get('url') || '';
  const sharedTitle = params.get('title') || '';
  const sharedText = params.get('text') || '';
  const incoming = sharedUrl || sharedText;

  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState('');
  const autoFired = useRef(false);

  const save = async (value: string, title?: string) => {
    setState('saving');
    try {
      const res = await createCapture(value, title);
      if (!res.ok) throw new Error(String(res.status));
      setLastSaved(title || value);
      setState('saved');
      return true;
    } catch {
      setState('error');
      return false;
    }
  };

  useEffect(() => {
    if (!incoming || autoFired.current) return;
    autoFired.current = true;
    const key = `captured:${incoming}`;
    try {
      if (sessionStorage.getItem(key)) {
        setLastSaved(sharedTitle || incoming);
        setState('saved');
        return;
      }
    } catch {}
    save(incoming, sharedTitle).then((ok) => {
      if (ok) try { sessionStorage.setItem(key, '1'); } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (await save(text.trim())) setText('');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 font-serif text-[2rem] font-normal">Capture</h1>
        <Link href="/notes" className="text-[0.9rem] text-fg-secondary">Notebook</Link>
      </div>

      {state === 'saved' && (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-sunk p-4">
          <span className="text-[0.85rem] font-semibold text-fg-secondary">Saved to your inbox</span>
          <p className="m-0 break-words text-[0.95rem]">{lastSaved}</p>
          {incoming && (
            <button onClick={() => history.back()} className="mt-2 self-start text-[0.9rem] font-medium underline underline-offset-4">
              Back to the page
            </button>
          )}
        </div>
      )}
      {state === 'error' && (
        <p role="alert" className="m-0 rounded-xl border border-danger p-4 text-[0.9rem] text-danger">
          Couldn’t save. Are you signed in? <Link href="/login" className="underline">Sign in</Link> and try again.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="capture-text" className="sr-only">What to capture</label>
        <textarea
          id="capture-text"
          className="form-input min-h-[140px] text-[1.05rem]"
          placeholder="A thought, a quote, or paste a link"
          value={text}
          onChange={(e) => { setText(e.target.value); if (state !== 'saving') setState('idle'); }}
          autoFocus={!incoming}
        />
        <Button type="submit" variant="primary" size="lg" disabled={state === 'saving' || !text.trim()}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </Button>
      </form>
      <p className="m-0 text-center text-[0.85rem] text-fg-muted">It lands in your Notebook inbox with a suggested home.</p>
    </main>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureInner />
    </Suspense>
  );
}
