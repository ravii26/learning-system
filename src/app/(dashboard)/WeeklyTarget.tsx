'use client';

import React, { useState } from 'react';
import { useToast } from '@/components/ToastProvider';

const linkClass = 'self-start bg-transparent p-0 text-[0.85rem] text-fg-secondary underline underline-offset-2 hover:text-fg';

export default function WeeklyTarget({ minutes, onSaved }: { minutes: number | null; onSaved: (minutes: number | null) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (value: number | null) => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/weekly-target', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast.error(data?.error || 'Couldn’t save your target.'); return; }
      onSaved(data.weeklyTargetMinutes);
      setEditing(false);
    } catch {
      toast.error('Couldn’t reach the server.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className={linkClass} onClick={() => { setHours(minutes ? String(minutes / 60) : ''); setEditing(true); }}>
        {minutes ? 'Change weekly target' : 'Set a weekly target'}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); const n = Number(hours); if (hours.trim() && Number.isFinite(n)) void save(n); }}
    >
      <label htmlFor="weekly-target" className="sr-only">Weekly target in hours</label>
      <input id="weekly-target" type="number" min={0.5} max={80} step={0.5} className="form-input h-9 w-20 py-0" value={hours} onChange={(e) => setHours(e.target.value)} autoFocus />
      <span className="text-[0.85rem] text-fg-muted">hours</span>
      <button type="submit" disabled={saving || !hours.trim()} className="btn btn-secondary h-9 py-0 text-[0.85rem]">Save</button>
      {minutes !== null && <button type="button" disabled={saving} className={linkClass} onClick={() => void save(null)}>Remove</button>}
      <button type="button" className={linkClass} onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}
