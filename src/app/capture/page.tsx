'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createCapture } from '@/lib/captureClient';
import { Button, Card, CardLabel } from '@/components/ui';

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <div className="flex-between">
        <h1 className="text-xl font-bold">⚡ Capture</h1>
        <Link href="/notes" className="text-[0.8rem] text-primary-light">Inbox ▸</Link>
      </div>

      {state === 'saved' && (
        <Card accent="success" className="p-4">
          <CardLabel>Saved to inbox</CardLabel>
          <p className="mt-1 break-words text-[0.9rem]">{lastSaved}</p>
          {incoming && (
            <button onClick={() => history.back()} className="mt-3 bg-transparent p-0 text-[0.8rem] text-primary-light underline">
              ← Back to the page
            </button>
          )}
        </Card>
      )}
      {state === 'error' && (
        <Card accent="danger" className="p-4 text-[0.85rem]">
          Couldn&apos;t save. Are you logged in? <Link href="/login" className="text-primary-light underline">Log in</Link> and try again.
        </Card>
      )}

      <form onSubmit={onSubmit} className="glass-panel flex flex-col gap-3 p-4">
        <textarea
          className="form-input min-h-[120px] text-base"
          placeholder="A thought, a quote, or paste a link…"
          value={text}
          onChange={(e) => { setText(e.target.value); if (state !== 'saving') setState('idle'); }}
          autoFocus={!incoming}
        />
        <Button type="submit" variant="primary" disabled={state === 'saving' || !text.trim()}>
          {state === 'saving' ? 'Saving…' : 'Capture ▸'}
        </Button>
      </form>
      <p className="text-center text-[0.72rem] text-fg-muted">Goes to your inbox — triage it later in Notes.</p>
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
