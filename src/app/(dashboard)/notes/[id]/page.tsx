'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
// Reused as-is from the topic detail page — a generic TipTap wrapper with
// no topic-specific coupling. Not moved/renamed, to avoid touching its
// current importer (topics/[id]/page.tsx, mid-edit elsewhere).
import RichTextEditor from '../../topics/[id]/RichTextEditor';

/**
 * Note editor: create (id === 'new') or edit an existing note. Backlinks —
 * every note that references this one via [[Title]] — are shown read-only
 * below the editor; the forward links inside the body are parsed on save
 * (src/lib/noteLinkSync.ts), not tracked interactively here.
 */

interface LinkedNoteRef {
  id: string;
  toId?: string;
  fromId?: string;
  to?: { id: string; title: string };
  from?: { id: string; title: string };
}

interface NoteDetail {
  id: string;
  title: string;
  body: string;
  tags: string[];
  outgoing: LinkedNoteRef[];
  incoming: LinkedNoteRef[];
}

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isNew = params.id === 'new';
  const attachTopicId = searchParams.get('topicId');

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNote = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await fetch(`/api/notes/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setNote(data);
        setTitle(data.title);
        setBody(data.body);
        setTagsInput(data.tags.join(', '));
      }
    } catch (e) {
      console.error('Failed to load note:', e);
    } finally {
      setLoading(false);
    }
  }, [isNew, params.id]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const parsedTags = () => tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.warning('Give the note a title first');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body, tags: parsedTags(), topicId: attachTopicId || undefined }),
      });
      if (res.ok) {
        const created = await res.json();
        toast.success('Note created');
        router.replace(`/notes/${created.id}`);
      } else {
        toast.error('Failed to create note');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (nextBody?: string) => {
    if (isNew || !note) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || note.title, body: nextBody ?? body, tags: parsedTags() }),
      });
      if (res.ok) {
        await fetchNote();
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew || !note) return;
    if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Note deleted');
        router.push('/notes');
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Connection error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '48px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '240px', borderRadius: '12px' }} />
      </div>
    );
  }

  if (!isNew && !note) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '760px' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Note not found.</p>
        <Link href="/notes" style={{ color: 'var(--color-primary-light)', fontSize: '0.85rem' }}>← Back to Notes</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '760px' }}>
      <Link href="/notes" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>← Back to Notes</Link>

      <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Note title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => !isNew && title.trim() && title !== note?.title && handleSave()}
          style={{ fontSize: '1.1rem', fontWeight: 700, padding: '8px 10px', border: 'none', background: 'transparent' }}
        />
        <input
          type="text"
          className="form-input"
          placeholder="tags, comma, separated"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={() => !isNew && handleSave()}
          style={{ fontSize: '0.78rem', padding: '6px 10px' }}
        />

        {isNew ? (
          <>
            <textarea
              className="form-input"
              placeholder="Write the note... use [[Title]] to link to another note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ width: '100%', height: '200px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
            <button onClick={handleCreate} disabled={saving} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Creating…' : 'Create Note'}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
              Use <code>[[Title]]</code> to link to another note — parsed on save.
            </p>
            <RichTextEditor
              content={body}
              onChange={(html) => { setBody(html); handleSave(html); }}
              placeholder="Write the note..."
              minHeight={220}
            />
            <button onClick={handleDelete} style={{ alignSelf: 'flex-start', fontSize: '0.72rem', color: 'var(--color-danger)' }}>
              Delete note
            </button>
          </>
        )}
      </div>

      {!isNew && note && (note.incoming.length > 0 || note.outgoing.length > 0) && (
        <div className="glass-panel" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {note.outgoing.length > 0 && (
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>LINKS TO</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {note.outgoing.map((l) => l.to && (
                  <Link key={l.id} href={`/notes/${l.to.id}`} style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary-light)', textDecoration: 'none' }}>
                    {l.to.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {note.incoming.length > 0 && (
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>BACKLINKS — NOTES THAT LINK HERE</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {note.incoming.map((l) => l.from && (
                  <Link key={l.id} href={`/notes/${l.from.id}`} style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
                    {l.from.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
