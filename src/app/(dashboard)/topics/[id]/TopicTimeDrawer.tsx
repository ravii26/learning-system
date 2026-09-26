'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Drawer, DrawerSection, Field, Input, Select, StatPill } from '@/components/ui';
import { formatDuration } from '@/lib/timeSummary';

interface TimeEntry {
  id: string;
  moduleId: string | null;
  startedAt: string;
  seconds: number;
  source: 'auto' | 'away' | 'manual';
  note: string | null;
}

const SOURCE_LABEL: Record<TimeEntry['source'], { label: string; tone: 'primary' | 'warning' | 'neutral' }> = {
  auto: { label: 'tracked', tone: 'primary' },
  away: { label: 'away', tone: 'warning' },
  manual: { label: 'logged', tone: 'neutral' },
};

const todayInput = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * Every minute counted for this topic, and the controls to correct it:
 * log time spent away from the app (a book, a course video), fix a span
 * the tracker got wrong, or delete one.
 */
export default function TopicTimeDrawer({ open, onClose, topicId, modules, onChanged }: {
  open: boolean;
  onClose: () => void;
  topicId: string;
  modules: Array<{ id: string; title: string }>;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [minutes, setMinutes] = useState('30');
  const [date, setDate] = useState(todayInput());
  const [moduleId, setModuleId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMinutes, setEditMinutes] = useState('');
  const [editNote, setEditNote] = useState('');

  const moduleTitle = (id: string | null) => (id ? modules.find((m) => m.id === id)?.title : null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/time?topicId=${topicId}&limit=100`).catch(() => null);
    if (res?.ok) setEntries(await res.json());
    setLoading(false);
  }, [topicId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const addManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins < 1) {
      setError('Enter the minutes you studied.');
      return;
    }
    setSaving(true);
    // Noon local time on the chosen day, so it lands on that day in every view.
    const startedAt = new Date(`${date}T12:00:00`).toISOString();
    const res = await fetch('/api/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, moduleId: moduleId || undefined, minutes: mins, startedAt, note, source: 'manual' }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || 'Could not save');
      return;
    }
    setNote('');
    await load();
    onChanged();
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/time/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: Number(editMinutes), note: editNote }),
    }).catch(() => null);
    if (res?.ok) {
      setEditingId(null);
      await load();
      onChanged();
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/time/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      await load();
      onChanged();
    }
  };

  const total = entries.reduce((s, e) => s + e.seconds, 0);

  return (
    <Drawer open={open} onClose={onClose} title="⏱ Study time" label="Study time for this topic">
      <p className="text-[0.82rem] text-fg-secondary">
        Time is tracked automatically while you study here (tab open and you&apos;re active). Log anything you did away from the app — a book, a course, practice on paper.
      </p>

      <DrawerSection title="Log time manually">
        <form onSubmit={addManual} className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Minutes">
              <Input type="number" min={1} max={720} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
            <Field label="Day">
              <Input type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {modules.length > 0 && (
            <Field label="Module (optional)">
              <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                <option value="">Whole topic</option>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </Select>
            </Field>
          )}
          <Field label="What did you do? (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Read chapter 3 of the book" />
          </Field>
          {error && <p className="text-[0.78rem] text-danger">{error}</p>}
          <Button type="submit" variant="primary" disabled={saving} className="self-start">{saving ? 'Saving…' : '+ Log time'}</Button>
        </form>
      </DrawerSection>

      <DrawerSection title={`History — ${formatDuration(total)} in the last ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}>
        {loading && entries.length === 0 ? (
          <p className="text-[0.8rem] text-fg-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-[0.8rem] text-fg-muted">No time recorded yet. Open a module and study — it starts counting on its own.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.map((e) => {
              const src = SOURCE_LABEL[e.source] ?? SOURCE_LABEL.manual;
              const isEditing = editingId === e.id;
              return (
                <div key={e.id} className="rounded-sm border border-line bg-sunk px-3 py-2 text-[0.8rem]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-fg">{formatDuration(e.seconds)}</span>
                      <StatPill label={src.label} tone={src.tone} />
                      <span className="text-fg-muted">{new Date(e.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      {moduleTitle(e.moduleId) && <span className="truncate text-fg-secondary">· {moduleTitle(e.moduleId)}</span>}
                    </div>
                    {!isEditing && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="bg-transparent px-1.5 text-[0.75rem] text-primary-light"
                          onClick={() => { setEditingId(e.id); setEditMinutes(String(Math.max(1, Math.round(e.seconds / 60)))); setEditNote(e.note || ''); }}
                        >
                          Edit
                        </button>
                        <button className="bg-transparent px-1.5 text-[0.75rem] text-danger" onClick={() => remove(e.id)} title="Delete this entry">✕</button>
                      </div>
                    )}
                  </div>
                  {e.note && !isEditing && <p className="mt-1 text-fg-muted">{e.note}</p>}
                  {isEditing && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Field label="Minutes" className="w-24">
                        <Input type="number" min={1} max={720} value={editMinutes} onChange={(ev) => setEditMinutes(ev.target.value)} />
                      </Field>
                      <Field label="Note" className="min-w-[160px] flex-1">
                        <Input value={editNote} onChange={(ev) => setEditNote(ev.target.value)} />
                      </Field>
                      <Button size="sm" variant="primary" onClick={() => saveEdit(e.id)}>Save</Button>
                      <Button size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DrawerSection>
    </Drawer>
  );
}
