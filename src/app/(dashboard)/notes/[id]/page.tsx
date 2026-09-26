'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
// Reused as-is from the topic detail page — a generic TipTap wrapper with
// no topic-specific coupling. Not moved/renamed, to avoid touching its
// current importer (topics/[id]/page.tsx, mid-edit elsewhere).
import { Icon } from '@/components/ui';
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
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        {[56, 280].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  if (!isNew && !note) {
    return (
      <div className="mx-auto flex max-w-[760px] flex-col items-start gap-3 py-10">
        <p className="m-0 text-fg-secondary">This note doesn’t exist, or it was deleted.</p>
        <Link href="/notes" className="btn btn-secondary">Back to Notebook</Link>
      </div>
    );
  }

  const chip = 'rounded-full border border-line bg-surface px-3 py-1 text-[0.85rem] text-fg no-underline hover:border-line-hover hover:no-underline';

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7">
      <Link href="/notes" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Notebook
      </Link>

      <div className="flex flex-col gap-2">
        <label htmlFor="note-title" className="sr-only">Title</label>
        <input
          id="note-title"
          type="text"
          placeholder="Untitled note"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => !isNew && title.trim() && title !== note?.title && handleSave()}
          className="w-full border-none bg-transparent p-0 font-serif text-[2.4rem] font-normal leading-tight text-fg outline-none placeholder:text-fg-muted"
        />
        <label htmlFor="note-tags" className="sr-only">Tags</label>
        <input
          id="note-tags"
          type="text"
          placeholder="Tags, separated by commas"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onBlur={() => !isNew && handleSave()}
          className="w-full border-none bg-transparent p-0 text-[0.95rem] text-fg-secondary outline-none placeholder:text-fg-muted"
        />
      </div>

      {isNew ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="note-body" className="sr-only">Note</label>
          <textarea
            id="note-body"
            className="form-input min-h-[240px] resize-y font-serif text-[1.1rem] leading-relaxed"
            placeholder="Write the note. Use [[Title]] to link to another note."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button onClick={handleCreate} disabled={saving} className="btn btn-primary h-11 self-start py-0">
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <RichTextEditor
            content={body}
            onChange={(html) => { setBody(html); handleSave(html); }}
            placeholder="Write the note…"
            minHeight={260}
          />
          <p className="m-0 text-[0.85rem] text-fg-muted">
            Type <code>[[Title]]</code> to link to another note. Links update when it saves.
          </p>
        </div>
      )}

      {!isNew && note && (note.incoming.length > 0 || note.outgoing.length > 0) && (
        <section aria-label="Linked notes" className="flex flex-col gap-4 border-t border-line pt-6">
          {note.outgoing.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[0.9rem] font-semibold text-fg-secondary">Links to</span>
              <div className="flex flex-wrap gap-2">
                {note.outgoing.map((l) => l.to && <Link key={l.id} href={`/notes/${l.to.id}`} className={chip}>{l.to.title}</Link>)}
              </div>
            </div>
          )}
          {note.incoming.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[0.9rem] font-semibold text-fg-secondary">Linked from</span>
              <div className="flex flex-wrap gap-2">
                {note.incoming.map((l) => l.from && <Link key={l.id} href={`/notes/${l.from.id}`} className={chip}>{l.from.title}</Link>)}
              </div>
            </div>
          )}
        </section>
      )}

      {!isNew && (
        <button onClick={handleDelete} className="self-start text-[0.875rem] font-medium text-danger underline-offset-4 hover:underline">
          Delete note
        </button>
      )}
    </div>
  );
}
