'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

interface ResurfacedNoteData {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  resurfaceCount: number;
  topic: { id: string; title: string } | null;
}

/** Plain-text excerpt of a note body (TipTap HTML) — rendered as text, so React escapes it. */
function excerpt(html: string, max = 220): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Accretion mode's review: one older note shown back to you (see
 * src/lib/noteResurface.ts). Renders nothing when no note is due, so it
 * never adds noise to an empty or new note base.
 */
export default function ResurfacedNote() {
  const router = useRouter();
  const [note, setNote] = useState<ResurfacedNoteData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/notes/resurface')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNote(d?.note ?? null))
      .catch(() => setNote(null));
  }, []);

  if (!note) return null;

  const markSeen = async () => {
    setBusy(true);
    await fetch(`/api/notes/${note.id}/resurface`, { method: 'POST' }).catch(() => null);
    setBusy(false);
  };

  const ageDays = Math.max(1, Math.round((Date.now() - new Date(note.createdAt).getTime()) / 86400000));
  const text = excerpt(note.body);

  return (
    <section aria-labelledby="resurface-h" className="flex flex-col gap-3 border-t border-line pt-5">
      <h2 id="resurface-h" className="m-0 text-[0.875rem] font-semibold text-fg-muted">
        From your notebook, {ageDays} day{ageDays === 1 ? '' : 's'} ago{note.topic ? ` · ${note.topic.title}` : ''}
      </h2>
      <Link href={`/notes/${note.id}`} className="text-[1rem] font-semibold text-fg">{note.title}</Link>
      {text && <p className="m-0 font-serif text-[1.15rem] italic leading-relaxed text-fg-secondary">“{text}”</p>}
      <p className="m-0 text-[0.85rem] text-fg-muted">Still true? Still how you’d put it?</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={async () => { await markSeen(); setNote(null); }}>Still holds</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await markSeen(); router.push(`/notes/${note.id}`); }}>Revise it</Button>
      </div>
    </section>
  );
}
