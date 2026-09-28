'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';

/**
 * Field library: the topic lists your plans are built from. Built-in lists,
 * your own versions (approved AI drafts, customised built-ins, shared ones),
 * and lists friends have sent you.
 */

interface Summary {
  builtIn: Array<{ key: string; title: string; topics: number; customised: boolean }>;
  mine: Array<{ key: string; title: string; source: string; basedOn: string | null; topics: number; updatedAt: string }>;
  incoming: Array<{ id: string; title: string; fieldKey: string; from: string }>;
}

const SOURCE: Record<string, string> = { ai: 'Drafted by AI, approved by you', edited: 'Customised by you', shared: 'Shared with you' };

export default function LibraryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/library').catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const answer = async (id: string, action: 'accept' | 'decline') => {
    setBusy(id);
    await fetch(`/api/library/shares/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(null);
    load();
  };

  if (!data) return <p className="text-fg-muted">Loading…</p>;
  const row = 'flex min-h-[56px] items-center justify-between gap-3 border-b border-line py-2.5 no-underline last:border-b-0 hover:no-underline';

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9">
      <Link href="/plan" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Learn
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-serif text-[2.4rem] font-normal leading-tight">Field library</h1>
        <p className="m-0 max-w-[640px] text-fg-secondary">
          The topic lists your plans are built from. Edit any of them and your next plan for that field uses your version. Your changes are yours alone, unless you share a list and a friend accepts it.
        </p>
      </header>

      {data.incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[1.15rem] font-semibold">Shared with you</h2>
          <ul className="m-0 list-none p-0">
            {data.incoming.map((s) => (
              <li key={s.id} className={row}>
                <span><strong>{s.title}</strong> <span className="text-[0.88rem] text-fg-muted">from {s.from}</span></span>
                <span className="flex gap-1">
                  <button type="button" disabled={busy === s.id} onClick={() => answer(s.id, 'accept')} className="btn btn-secondary h-9 py-0 text-[0.85rem]">Accept</button>
                  <button type="button" disabled={busy === s.id} onClick={() => answer(s.id, 'decline')} className="h-9 rounded-lg px-3 text-[0.85rem] text-fg-secondary hover:bg-fill-2">Decline</button>
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[0.82rem] text-fg-muted">Accepting replaces your list for that field with exactly theirs, including their trusted resources.</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[1.15rem] font-semibold">Your fields <span className="font-normal text-fg-muted">{data.mine.length}</span></h2>
        {data.mine.length === 0 ? (
          <p className="m-0 text-[0.95rem] text-fg-muted">
            None yet. When you approve an AI-drafted topic list in <Link href="/learn/program">Build a learning plan</Link>, or customise a built-in one below, it appears here.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {data.mine.map((m) => (
              <li key={m.key}>
                <Link href={`/library/${m.key}`} className={row}>
                  <span className="flex flex-col">
                    <span className="font-semibold text-fg">{m.title}</span>
                    <span className="text-[0.82rem] text-fg-muted">{SOURCE[m.source] ?? m.source} · {m.topics} topics</span>
                  </span>
                  <span className="text-[0.85rem] text-fg-secondary">Edit →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[1.15rem] font-semibold">Built-in fields</h2>
        <p className="m-0 text-[0.88rem] text-fg-muted">Hand-reviewed lists with curated resources. Editing one makes your own copy; the original stays as it is.</p>
        <ul className="m-0 list-none p-0">
          {data.builtIn.map((b) => (
            <li key={b.key}>
              <Link href={`/library/${b.key}`} className={row}>
                <span className="flex flex-col">
                  <span className="font-semibold text-fg">{b.title}</span>
                  <span className="text-[0.82rem] text-fg-muted">{b.topics} topics{b.customised ? ' · you have a customised copy' : ''}</span>
                </span>
                <span className="text-[0.85rem] text-fg-secondary">{b.customised ? 'Edit →' : 'View →'}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
