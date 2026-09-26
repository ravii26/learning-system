'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { createCapture } from '@/lib/captureClient';
import { computeAccretionStats } from '@/lib/accretionStats';
import { Button, Icon, Sparkline } from '@/components/ui';
import ResurfacedNote from '@/components/ResurfacedNote';
import { suggestionLabel, type CaptureSuggestion } from '@/lib/captureSuggest';

/**
 * The accretion-mode home: capture anything in 3 seconds, process the
 * inbox weekly, browse the linked-note base. Per the project plan's
 * Example C — no percentage anywhere on this page. A note base doesn't
 * have a completion state.
 */

interface CaptureRow {
  id: string;
  rawText: string | null;
  url: string | null;
  title: string | null;
  status: string;
  createdAt: string;
  tags: string[];
}

interface NoteRow {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { incoming: number; outgoing: number };
}

interface TopicOption {
  id: string;
  title: string;
}

export default function NotesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'inbox' | 'notes'>('inbox');
  const [captures, setCaptures] = useState<CaptureRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [captureText, setCaptureText] = useState('');
  const [capturing, setCapturing] = useState(false);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [conceptTopicChoice, setConceptTopicChoice] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, CaptureSuggestion>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [showOptions, setShowOptions] = useState<Record<string, boolean>>({});

  const stats = useMemo(() => computeAccretionStats(notes), [notes]);

  // The bookmarklet href is a javascript: URL, which React warns about when
  // passed as a prop — so it's set on the DOM node after mount instead.
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    const o = window.location.origin;
    setOrigin(o);
    const code = `javascript:(()=>{window.open('${o}/capture?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','width=460,height=420')})()`;
    bookmarkletRef.current?.setAttribute('href', code);
  }, [loading]); // the anchor only exists once the loading skeleton is gone

  const fetchData = useCallback(async () => {
    try {
      const [capturesRes, notesRes, topicsRes] = await Promise.all([
        fetch('/api/captures?status=inbox'),
        fetch('/api/notes'),
        fetch('/api/topics'),
      ]);
      if (capturesRes.ok) setCaptures(await capturesRes.json());
      if (notesRes.ok) setNotes(await notesRes.json());
      if (topicsRes.ok) setTopics((await topicsRes.json()).map((t: any) => ({ id: t.id, title: t.title })));
    } catch (e) {
      console.error('Failed to load notes/captures:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // A suggested home for each capture. Stored server-side, so this is only
  // slow the first time a capture is seen.
  const inboxKey = captures.map((c) => c.id).join(',');
  useEffect(() => {
    if (!inboxKey) return;
    let cancelled = false;
    setSuggesting(true);
    fetch('/api/captures/suggest', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.suggestions) setSuggestions(data.suggestions);
      })
      .catch(() => {})
      .finally(() => !cancelled && setSuggesting(false));
    return () => {
      cancelled = true;
    };
  }, [inboxKey]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = captureText.trim();
    if (!text) return;
    setCapturing(true);
    try {
      const res = await createCapture(text);

      if (res.ok) {
        setCaptureText('');
        toast.success('Captured — a suggested home is on its way');
        await fetchData();
      } else {
        toast.error('Failed to capture');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setCapturing(false);
    }
  };

  const handleProcess = async (
    captureId: string,
    action: 'note' | 'concept' | 'question' | 'topic' | 'archive',
    fromSuggestion?: CaptureSuggestion
  ) => {
    if (action === 'concept' && !conceptTopicChoice[captureId]) {
      toast.warning('Pick a topic to attach this concept to first');
      return;
    }
    setProcessingId(captureId);
    try {
      const payload = fromSuggestion
        ? { action, topicId: fromSuggestion.topicId ?? undefined, title: fromSuggestion.title, area: fromSuggestion.area ?? undefined }
        : { action, topicId: conceptTopicChoice[captureId] };
      const res = await fetch(`/api/captures/${captureId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(
          action === 'archive'
            ? 'Archived'
            : fromSuggestion
              ? `Done: ${suggestionLabel(fromSuggestion)}`
              : `Turned into a ${action}`
        );
        await fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to process');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">{[100, 56, 140, 140].map((h, i) => <div key={i} className="skeleton rounded-md" style={{ height: h }} />)}</div>
      </div>
    );
  }

  const srcLabel = (c: CaptureRow) => {
    if (!c.url) return 'Your thought';
    try {
      return new URL(c.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Link';
    }
  };

  return (
    <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-7">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Notebook</h1>
          <p className="m-0 text-[1.05rem] text-fg-secondary">
            For subjects with no syllabus. Capture anything; give each thing a home in one tap.
          </p>
        </header>

        <form onSubmit={handleCapture} className="flex h-14 items-center gap-3 rounded-[14px] border border-dashed border-line-strong pl-5 pr-2">
          <label htmlFor="notebook-capture" className="text-[0.95rem] font-semibold text-fg-secondary">Capture</label>
          <input
            id="notebook-capture"
            type="text"
            className="h-10 min-w-0 flex-1 border-none bg-transparent text-[0.95rem] text-fg outline-none"
            placeholder="Paste a link, or jot a thought"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            disabled={capturing}
          />
          {captureText.trim() && (
            <Button type="submit" size="sm" disabled={capturing}>{capturing ? 'Saving…' : 'Save'}</Button>
          )}
        </form>

        <div role="tablist" aria-label="Show" className="flex self-start rounded-xl bg-sunk p-1">
          {([
            ['inbox', `Inbox · ${captures.length}`],
            ['notes', `Notes · ${notes.length}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`h-10 rounded-[9px] px-4 text-[0.9rem] ${tab === key ? 'bg-surface font-semibold text-fg shadow-card' : 'font-medium text-fg-secondary hover:text-fg'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'inbox' && (
          captures.length === 0 ? (
            <div className="flex flex-col gap-2 py-6">
              <p className="m-0 font-serif text-[1.8rem]">Inbox clear.</p>
              <p className="m-0 text-[1rem] text-fg-secondary">Everything has a home. Press C anywhere to capture the next thing.</p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {captures.map((c) => {
                const s = suggestions[c.id];
                return (
                  <li key={c.id} className="glass-panel flex flex-col gap-3.5 px-5 py-4">
                    <div className="flex items-center gap-2 text-[0.82rem] text-fg-muted">
                      <Icon name={c.url ? 'link' : 'notebook'} size={14} />
                      <span>{srcLabel(c)} · {new Date(c.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="m-0 text-[1.05rem] leading-snug">{c.title || c.rawText || c.url}</p>
                      {c.rawText && c.title && <p className="m-0 text-[0.9rem] text-fg-secondary">{c.rawText}</p>}
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate text-[0.82rem] text-fg-muted">{c.url}</a>
                      )}
                    </div>

                    {s ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Button variant="primary" size="sm" disabled={processingId === c.id} onClick={() => handleProcess(c.id, s.action, s)}>
                          <Icon name="check" size={14} strokeWidth={2.4} /> {suggestionLabel(s)}
                        </Button>
                        <span className="min-w-[120px] flex-1 text-[0.85rem] text-fg-muted">{s.reason}</span>
                        <button
                          type="button"
                          onClick={() => setShowOptions((p) => ({ ...p, [c.id]: !p[c.id] }))}
                          aria-expanded={!!showOptions[c.id]}
                          className="h-9 rounded-md px-2.5 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg"
                        >
                          {showOptions[c.id] ? 'Hide options' : 'Somewhere else'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleProcess(c.id, 'archive')}
                          disabled={processingId === c.id}
                          aria-label="Archive this capture"
                          className="flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-fill-2 hover:text-fg"
                        >
                          <Icon name="archive" size={16} />
                        </button>
                      </div>
                    ) : (
                      suggesting && <span className="text-[0.82rem] text-fg-muted">Finding a home…</span>
                    )}

                    {(!s || showOptions[c.id]) && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        <Button size="sm" onClick={() => handleProcess(c.id, 'note')} disabled={processingId === c.id}>Keep as a note</Button>
                        <label htmlFor={`topic-${c.id}`} className="sr-only">Topic</label>
                        <select
                          id={`topic-${c.id}`}
                          value={conceptTopicChoice[c.id] || ''}
                          onChange={(e) => setConceptTopicChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className="form-input h-9 w-auto py-0 text-[0.82rem]"
                        >
                          <option value="">Topic (optional for a note)…</option>
                          {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                        <Button size="sm" onClick={() => handleProcess(c.id, 'question')} disabled={processingId === c.id || !conceptTopicChoice[c.id]} title="Needs a topic">
                          Open question
                        </Button>
                        <Button size="sm" onClick={() => handleProcess(c.id, 'topic')} disabled={processingId === c.id}>New topic</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleProcess(c.id, 'archive')} disabled={processingId === c.id}>Archive</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'notes' && (
          <div className="flex flex-col gap-4">
            <Link href="/notes/new" className="btn btn-secondary self-start no-underline hover:no-underline">
              <Icon name="plus" size={16} /> New note
            </Link>
            {notes.length === 0 ? (
              <p className="m-0 text-[1rem] text-fg-secondary">No notes yet. Keep a capture as a note, or start one here.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line py-3 no-underline hover:no-underline">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-[1rem] font-semibold text-fg">{n.title}</span>
                        {n.tags.length > 0 && <span className="text-[0.8rem] text-fg-muted">{n.tags.map((t) => `#${t}`).join('  ')}</span>}
                      </span>
                      {n._count && n._count.incoming > 0 && (
                        <span className="shrink-0 text-[0.82rem] text-fg-muted">{n._count.incoming} link{n._count.incoming === 1 ? '' : 's'} in</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-9 lg:pt-2">
        {notes.length > 0 && (
          <section aria-labelledby="growth-h" className="flex flex-col gap-3">
            <h2 id="growth-h" className="m-0 text-[0.95rem] font-semibold">Your notebook</h2>
            <div className="flex items-baseline gap-2.5">
              <span className="font-serif text-[2.2rem] leading-none">{stats.noteCount}</span>
              <span className="text-[0.875rem] text-fg-muted">notes · {stats.linkCount} links · +{stats.addedThisWeek} this week</span>
            </div>
            <Sparkline values={stats.weekly} width={240} height={32} color="var(--ink)" label={`Notes added per week, last 8 weeks: ${stats.weekly.join(', ')}`} />
            {(stats.densest || stats.thinnest) && (
              <div className="flex flex-col gap-1 text-[0.9rem] text-fg-secondary">
                {stats.densest && <span>Most notes: <strong className="font-semibold text-fg">#{stats.densest.tag}</strong> ({stats.densest.count})</span>}
                {stats.thinnest && <span>Thinnest: <strong className="font-semibold text-fg">#{stats.thinnest.tag}</strong> ({stats.thinnest.count}) — worth exploring next</span>}
              </div>
            )}
          </section>
        )}

        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-[0.95rem] font-semibold">Capture from anywhere</summary>
          <div className="mt-3 flex flex-col gap-3 text-[0.875rem] leading-relaxed text-fg-secondary">
            <div>
              <strong className="text-fg">Browser:</strong> drag this to your bookmarks bar, then click it on any page to send it here:{' '}
              <a ref={bookmarkletRef} className="btn btn-secondary mt-1 h-8 px-2.5 py-0 text-[0.8rem]" onClick={(e) => e.preventDefault()}>Capture to Learning OS</a>
            </div>
            <div>
              <strong className="text-fg">Phone (same Wi-Fi):</strong> open <code className="text-fg">{origin || 'http://<your-computer-ip>:3000'}/capture</code> and add it to your home screen.
            </div>
            <div>
              <strong className="text-fg">Phone shortcut:</strong> set <code>CAPTURE_TOKEN</code> in <code>.env</code>, then send <code>POST /api/capture-hook</code> with <code>Authorization: Bearer &lt;token&gt;</code> and JSON <code>{'{"text": "...", "url": "..."}'}</code>.
            </div>
          </div>
        </details>

        <ResurfacedNote />
      </aside>
    </div>
  );
}
