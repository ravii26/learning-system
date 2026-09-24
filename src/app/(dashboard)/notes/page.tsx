'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { createCapture } from '@/lib/captureClient';

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

  const handleProcess = async (captureId: string, action: 'note' | 'concept' | 'topic' | 'archive') => {
    if (action === 'concept' && !conceptTopicChoice[captureId]) {
      toast.warning('Pick a topic to attach this concept to first');
      return;
    }
    setProcessingId(captureId);
    try {
      const res = await fetch(`/api/captures/${captureId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, topicId: conceptTopicChoice[captureId] }),
      });
      if (res.ok) {
        toast.success(action === 'archive' ? 'Archived' : `Turned into a ${action}`);
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

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        <button
          onClick={() => setTab('inbox')}
          style={{
            padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent',
            color: tab === 'inbox' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
            borderBottom: tab === 'inbox' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          Inbox ({captures.length})
        </button>
        <button
          onClick={() => setTab('notes')}
          style={{
            padding: '8px 14px', fontSize: '0.82rem', fontWeight: 600, background: 'transparent',
            color: tab === 'notes' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
            borderBottom: tab === 'notes' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          Notes ({notes.length})
        </button>
      </div>

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
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => handleProcess(c.id, 'note')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Note</button>
                  <select
                    value={conceptTopicChoice[c.id] || ''}
                    onChange={(e) => setConceptTopicChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="form-input"
                    style={{ width: 'auto', fontSize: '0.72rem', padding: '4px 8px', background: '#121218' }}
                  >
                    <option value="">Topic (optional for note, needed for concept)…</option>
                    {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <button onClick={() => handleProcess(c.id, 'concept')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Concept</button>
                  <button onClick={() => handleProcess(c.id, 'topic')} disabled={processingId === c.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>→ Topic</button>
                  <button onClick={() => handleProcess(c.id, 'archive')} disabled={processingId === c.id} style={{ padding: '4px 10px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Archive</button>
                </div>
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
                      {n.tags.map((t) => <span key={t} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '9999px', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>#{t}</span>)}
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
