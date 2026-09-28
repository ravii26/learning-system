'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import type { Competency, CompetencyMap, Importance, TargetLevel } from '@/data/competencies';
import { TARGET_LABEL } from '@/lib/program/why';

/**
 * Edit one field's topic list and its trusted resources, and share it with a
 * friend. Saving a built-in field creates your own copy.
 */

interface FieldView {
  map: CompetencyMap;
  source: string;
  isBuiltIn: boolean;
  customised: boolean;
  sources: Array<{ title: string; url: string }> | null;
  trusted: Array<{ id: string; title: string; url: string; type: string; pricing: string; role: string }>;
  catalog: Array<{ title: string; url: string; pricing: string; role: string }>;
}

const LEVELS: TargetLevel[] = ['aware', 'use', 'build', 'interview'];
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function FieldEditorPage({ params }: { params: { key: string } }) {
  const [view, setView] = useState<FieldView | null>(null);
  const [comps, setComps] = useState<Competency[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [friends, setFriends] = useState<Array<{ id: string; name: string }>>([]);
  const [shareTo, setShareTo] = useState('');
  const [res, setRes] = useState({ title: '', url: '', type: 'ARTICLE', pricing: 'free', role: 'reference' });

  const load = useCallback(async () => {
    const r = await fetch(`/api/library/${params.key}`).catch(() => null);
    if (r?.ok) {
      const d: FieldView = await r.json();
      setView(d);
      setComps(d.map.competencies);
      setDirty(false);
    }
  }, [params.key]);

  useEffect(() => {
    load();
    fetch('/api/friends').then((r) => (r.ok ? r.json() : null)).then((d) => d && setFriends(d.friends.map((f: { user: { id: string; name: string } }) => f.user))).catch(() => {});
  }, [load]);

  const update = (i: number, patch: Partial<Competency>) => { setComps((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => {
    setComps((p) => {
      const n = [...p];
      const j = i + d;
      if (j < 0 || j >= n.length) return p;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!view) return;
    setBusy(true);
    setMessage(null);
    const r = await fetch(`/api/library/${params.key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map: { ...view.map, competencies: comps } }),
    }).catch(() => null);
    const d = r ? await r.json() : null;
    setBusy(false);
    if (r?.ok) {
      setMessage({ text: `Saved (${d.topics} topics). Your next plan for ${view.map.title} uses this list.` });
      load();
    } else setMessage({ text: [d?.error, ...(d?.problems ?? [])].filter(Boolean).join(' ') || 'Could not save.', error: true });
  };

  const reset = async () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setBusy(true);
    await fetch(`/api/library/${params.key}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    setConfirmReset(false);
    if (view?.isBuiltIn) { setMessage({ text: 'Back to the built-in list.' }); load(); }
    else window.location.href = '/library';
  };

  const addResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const r = await fetch(`/api/library/${params.key}/resources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(res) }).catch(() => null);
    const d = r ? await r.json() : null;
    setBusy(false);
    if (r?.ok) { setRes({ title: '', url: '', type: 'ARTICLE', pricing: 'free', role: 'reference' }); load(); }
    else setMessage({ text: d?.error ?? 'Could not add it.', error: true });
  };

  const removeResource = async (id: string) => {
    await fetch(`/api/library/${params.key}/resources/${id}`, { method: 'DELETE' }).catch(() => null);
    load();
  };

  const share = async () => {
    if (!shareTo) return;
    setBusy(true);
    const r = await fetch(`/api/library/${params.key}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friendId: shareTo }) }).catch(() => null);
    const d = r ? await r.json() : null;
    setBusy(false);
    setMessage(r?.ok ? { text: 'Sent. When they accept, their list becomes exactly this one.' } : { text: d?.error ?? 'Could not share.', error: true });
  };

  if (!view) return <p className="text-fg-muted">Loading…</p>;
  const groups = Array.from(new Set(comps.map((c) => c.group)));
  const small = 'form-input h-9 py-0 text-[0.85rem]';

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-8">
      <Link href="/library" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Field library
      </Link>
      <header className="flex flex-col gap-2">
        <span className="self-start rounded-md bg-fill-2 px-2 py-0.5 text-[0.78rem] font-semibold text-fg-secondary">
          {view.source === 'builtin' ? 'Built-in list: saving makes your own copy' : view.customised ? 'Your customised copy of a built-in list' : view.source === 'shared' ? 'Shared with you' : 'Your list'}
        </span>
        <h1 className="m-0 font-serif text-[2.2rem] font-normal leading-tight">{view.map.title}</h1>
        <p className="m-0 text-fg-secondary">
          {comps.length} topics · {LEVELS.map((t, i) => `${sentence(TARGET_LABEL[t])} ${comps.filter((c) => LEVELS.indexOf(c.from) <= i).length}`).join(' · ')}
        </p>
      </header>

      {message && <p role={message.error ? 'alert' : 'status'} className={`m-0 ${message.error ? 'text-danger' : 'text-fg-secondary'}`}>{message.text}</p>}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[1.15rem] font-semibold">Topics</h2>
          <span className="text-[0.82rem] text-fg-muted">“Needed from” = the lowest level a plan includes it at</span>
        </div>
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <span className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">{g}</span>
            {comps.map((c, i) => c.group !== g ? null : (
              <div key={c.key} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
                <input aria-label="Topic" className={`${small} min-w-[200px] flex-1`} value={c.title} onChange={(e) => update(i, { title: e.target.value })} />
                <select aria-label="Importance" className={`${small} w-[130px]`} value={c.importance} onChange={(e) => update(i, { importance: e.target.value as Importance })}>
                  <option value="core">Core</option><option value="supporting">Supporting</option><option value="optional">Optional</option>
                </select>
                <select aria-label="Needed from" className={`${small} w-[160px]`} value={c.from} onChange={(e) => update(i, { from: e.target.value as TargetLevel })}>
                  {LEVELS.map((t) => <option key={t} value={t}>{sentence(TARGET_LABEL[t])}</option>)}
                </select>
                <span className="flex">
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="h-9 w-8 rounded-md text-fg-muted hover:bg-fill-2">↑</button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="h-9 w-8 rounded-md text-fg-muted hover:bg-fill-2">↓</button>
                  <button type="button" aria-label={`Remove ${c.title}`} onClick={() => { setComps((p) => p.filter((_, j) => j !== i)); setDirty(true); }} className="flex h-9 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-fill-2 hover:text-danger">
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ))}
        <button type="button" className="self-start text-[0.9rem] font-medium text-fg-secondary hover:text-fg"
          onClick={() => { setComps((p) => [...p, { key: `my-topic-${Date.now().toString(36)}`, title: 'New topic', group: groups[groups.length - 1] ?? 'My additions', kind: 'concept', importance: 'supporting', from: 'use', prerequisites: [], summary: 'Added by you.' }]); setDirty(true); }}>
          + Add a topic
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !dirty} className="btn btn-primary h-10 py-0">{busy ? 'Saving…' : 'Save list'}</button>
          {(view.customised || !view.isBuiltIn) && (
            <button type="button" onClick={reset} disabled={busy} className="h-10 rounded-lg px-3 text-[0.88rem] text-fg-secondary hover:bg-fill-2">
              {confirmReset ? (view.isBuiltIn ? 'Confirm: back to built-in' : 'Confirm: delete this field') : view.isBuiltIn ? 'Reset to built-in' : 'Delete field'}
            </button>
          )}
          {dirty && <span className="text-[0.82rem] text-fg-muted">Unsaved changes</span>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[1.15rem] font-semibold">Trusted resources</h2>
        <p className="m-0 text-[0.88rem] text-fg-muted">Resources you trust for this field. Your next plans use them first. Links are checked when you add them.</p>
        {view.trusted.length > 0 && (
          <ul className="m-0 list-none p-0">
            {view.trusted.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                <span className="min-w-0"><a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium">{t.title}</a> <span className="text-[0.8rem] text-fg-muted">{t.role} · {t.pricing}</span></span>
                <button type="button" onClick={() => removeResource(t.id)} className="text-[0.85rem] text-fg-muted hover:text-danger">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addResource} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input aria-label="Title" className={small} placeholder="Title" value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} required />
          <input aria-label="Link" className={small} placeholder="https://" value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} required />
          <button type="submit" disabled={busy} className="btn btn-secondary h-9 py-0 text-[0.85rem]">Add</button>
          <select aria-label="Type" className={small} value={res.type} onChange={(e) => setRes({ ...res, type: e.target.value })}>
            {['ARTICLE', 'BOOK', 'COURSE', 'VIDEO', 'DOCS', 'PRACTICE', 'TOOL'].map((t) => <option key={t} value={t}>{sentence(t.toLowerCase())}</option>)}
          </select>
          <select aria-label="Price" className={small} value={res.pricing} onChange={(e) => setRes({ ...res, pricing: e.target.value })}>
            <option value="free">Free</option><option value="freemium">Free tier</option><option value="paid">Paid</option><option value="unknown">Not sure</option>
          </select>
          <select aria-label="Role" className={small} value={res.role} onChange={(e) => setRes({ ...res, role: e.target.value })}>
            <option value="primary">Main resource</option><option value="practice">Practice</option><option value="reference">Reference</option><option value="supplementary">Extra</option>
          </select>
        </form>
        {view.catalog.length > 0 && (
          <details className="text-[0.88rem] text-fg-secondary">
            <summary className="cursor-pointer font-semibold">Built-in curated resources ({view.catalog.length})</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {view.catalog.map((c) => <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> <span className="text-fg-muted">· {c.role} · {c.pricing}</span></li>)}
            </ul>
          </details>
        )}
        {view.sources && view.sources.length > 0 && (
          <details className="text-[0.88rem] text-fg-secondary">
            <summary className="cursor-pointer font-semibold">Course outlines this list was drafted from</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {view.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[1.15rem] font-semibold">Share with a friend</h2>
        {friends.length === 0 ? (
          <p className="m-0 text-[0.9rem] text-fg-muted">Add friends on the <Link href="/friends">Friends</Link> page to share lists.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Friend" className="form-input h-10 w-auto py-0" value={shareTo} onChange={(e) => setShareTo(e.target.value)}>
              <option value="">Choose a friend</option>
              {friends.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="button" onClick={share} disabled={!shareTo || busy || dirty} className="btn btn-secondary h-10 py-0">Share this list</button>
            <span className="text-[0.82rem] text-fg-muted">{dirty ? 'Save first.' : 'They get exactly this list and your trusted resources when they accept.'}</span>
          </div>
        )}
      </section>
    </div>
  );
}
