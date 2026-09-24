'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardLabel, StatPill } from '@/components/ui';

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
    <Card accent="success" className="flex flex-col gap-2">
      <div className="flex-between gap-2">
        <CardLabel>▸ Resurfaced note</CardLabel>
        <span className="text-[0.7rem] text-fg-muted">written {ageDays} day{ageDays === 1 ? '' : 's'} ago</span>
      </div>
      <Link href={`/notes/${note.id}`} className="text-base font-bold text-fg">{note.title}</Link>
      {text && <p className="text-[0.84rem] leading-relaxed text-fg-secondary">{text}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {note.topic && <StatPill label={note.topic.title} tone="primary" />}
        {note.tags.map((t) => <StatPill key={t} label={`#${t}`} />)}
      </div>
      <p className="text-[0.75rem] text-fg-muted">Still true? Still how you&apos;d say it? Reading it again is the point.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={async () => { await markSeen(); setNote(null); }}>Still holds ✓</Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={async () => { await markSeen(); router.push(`/notes/${note.id}`); }}>Revise it ▸</Button>
      </div>
    </Card>
  );
}
