'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { createCapture } from '@/lib/captureClient';
import { computeAccretionStats } from '@/lib/accretionStats';
import { Button, Card, StatPill, Sparkline, Tabs } from '@/components/ui';
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
        toast.success('Captured to inbox');
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '52px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Notes</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Capture anything in 3 seconds. Process the inbox weekly — into a note, a concept, a topic, or nowhere.
        </p>
      </div>

      <form onSubmit={handleCapture} className="glass-panel" style={{ padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          placeholder="paste a URL, or jot a thought…"
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          disabled={capturing}
          style={{ fontSize: '0.9rem', padding: '8px 12px', border: 'none', background: 'transparent' }}
        />
        {captureText.trim() && (
          <button type="submit" disabled={capturing} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            {capturing ? 'Capturing…' : 'Capture ▸'}
          </button>
        )}
      </form>

      {/* Accretion dashboard — counts and growth, never a percentage */}
      {notes.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <StatPill value={stats.noteCount} label={stats.noteCount === 1 ? 'note' : 'notes'} tone="primary" />
              <StatPill value={stats.linkCount} label={stats.linkCount === 1 ? 'link' : 'links'} />
              <StatPill value={captures.length} label="in inbox" tone={captures.length > 0 ? 'warning' : 'neutral'} />
            </div>
            <div className="flex items-center gap-2">
              <Sparkline values={stats.weekly} label={`Notes added per week, last 8 weeks: ${stats.weekly.join(', ')}`} />
              <span className="text-[0.72rem] text-fg-muted">+{stats.addedThisWeek} this week</span>
            </div>
          </div>
          {(stats.densest || stats.thinnest) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.78rem] text-fg-secondary">
              {stats.densest && <span>Densest: <strong className="text-fg">#{stats.densest.tag}</strong> ({stats.densest.count})</span>}
              {stats.thinnest && <span>Thinnest: <strong className="text-fg">#{stats.thinnest.tag}</strong> ({stats.thinnest.count}) — explore here next</span>}
            </div>
          )}
        </Card>
      )}

      <details className="glass-panel px-4 py-1">
        <summary className="cursor-pointer py-2.5 text-[0.82rem] font-semibold text-fg-secondary">📱 Capture from anywhere — browser bookmarklet &amp; phone</summary>
        <div className="flex flex-col gap-3 pb-3 text-[0.8rem] text-fg-secondary">
          <div>
            <strong className="text-fg">Browser:</strong> drag this to your bookmarks bar, then click it on any page to file that page in your inbox:{' '}
            <a ref={bookmarkletRef} className="btn btn-secondary ml-1 px-2.5 py-1 text-[0.75rem]" onClick={(e) => e.preventDefault()}>⚡ Capture to Learning OS</a>
          </div>
          <div>
            <strong className="text-fg">Phone (same Wi-Fi):</strong> open <code className="text-primary-light">{origin || 'http://<your-computer-ip>:3000'}/capture</code> and add it to your home screen — a one-box capture that uses your login.
          </div>
          <div>
            <strong className="text-fg">Phone shortcut (no login):</strong> set <code>CAPTURE_TOKEN</code> in <code>.env</code>, then have iOS Shortcuts / Android HTTP Shortcuts send{' '}
            <code>POST /api/capture-hook</code> with header <code>Authorization: Bearer &lt;token&gt;</code> and JSON <code>{'{"text": "...", "url": "..."}'}</code>.
          </div>
        </div>
      </details>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'inbox', label: `Inbox (${captures.length})` },
          { key: 'notes', label: `Notes (${notes.length})` },
        ]}
      />

      {tab === 'inbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {captures.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Inbox is clear.
            </div>
          ) : (
            captures.map((c) => (
              <div key={c.id} className="glass-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{c.title || c.rawText?.slice(0, 100) || c.url}</span>
                  {c.url && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{c.url}</div>}
                  {c.rawText && c.title && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{c.rawText}</div>}
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                {suggestions[c.id] ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={processingId === c.id}
                      onClick={() => handleProcess(c.id, suggestions[c.id].action, suggestions[c.id])}
                    >
                      ✓ {suggestionLabel(suggestions[c.id])}
                    </Button>
                    <span className="flex-1 text-[0.75rem] text-fg-muted">{suggestions[c.id].reason}</span>
                    <button
                      type="button"
                      onClick={() => setShowOptions((p) => ({ ...p, [c.id]: !p[c.id] }))}
                      aria-expanded={!!showOptions[c.id]}
                      className="min-h-[32px] bg-transparent px-2 text-[0.75rem] font-medium text-fg-secondary"
                    >
                      {showOptions[c.id] ? 'Hide options' : 'Somewhere else'}
                    </button>
                  </div>
                ) : (
                  suggesting && <span className="text-[0.72rem] text-fg-muted">Finding a home…</span>
                )}
                {(!suggestions[c.id] || showOptions[c.id]) && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => handleProcess(c.id, 'note')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Note</button>
                  <select
                    value={conceptTopicChoice[c.id] || ''}
                    onChange={(e) => setConceptTopicChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="form-input"
                    style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 8px', background: 'var(--bg-surface)' }}
                  >
                    <option value="">Topic (optional for note, needed for concept)…</option>
                    {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <button onClick={() => handleProcess(c.id, 'concept')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Concept</button>
                  <button onClick={() => handleProcess(c.id, 'topic')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Topic</button>
                  <button onClick={() => handleProcess(c.id, 'archive')} disabled={processingId === c.id} style={{ padding: '4px 10px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Archive</button>
                </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link href="/notes/new" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.8rem' }}>
            + New Note
          </Link>
          {notes.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              No notes yet. Process an inbox item, or start one directly.
            </div>
          ) : (
            notes.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{n.title}</span>
                  {n.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      {n.tags.map((t) => <span key={t} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '9999px', background: 'var(--fill-3)', color: 'var(--color-text-muted)' }}>#{t}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {n._count && `${n._count.incoming} backlink${n._count.incoming === 1 ? '' : 's'}`}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
