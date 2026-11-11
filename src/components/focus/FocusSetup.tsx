'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { RHYTHMS, type Rhythm } from '@/lib/focusQueue';
import type { FocusApi, FocusTarget } from '@/lib/useFocus';

/**
 * First-time setup: choose what matters now and how often. Your current
 * topics are suggested, nothing is changed until you save, and skipping
 * leaves everything exactly as it was.
 */

export interface SetupTopic {
  id: string;
  title: string;
  status: string;
  mode: string;
  goal?: { id: string; title: string } | null;
}

interface Row {
  key: string;
  label: string;
  target: FocusTarget;
  on: boolean;
  rhythm: Rhythm;
}

// "By a date" and "Just once" need more than a checkbox, so they're set later from Focus.
const SETUP_RHYTHMS = RHYTHMS.filter((r) => r.key !== 'by_date' && r.key !== 'once');

function buildRows(goals: Array<{ id: string; title: string; status: string }>, topics: SetupTopic[]): Row[] {
  const active = topics.filter((t) => t.status === 'active');
  const goalRows = goals
    .filter((g) => g.status !== 'achieved' && g.status !== 'abandoned')
    .map((g): Row => {
      const current = active.filter((t) => t.goal?.id === g.id);
      return {
        key: `goal:${g.id}`,
        label: g.title,
        target: { kind: 'goal', goalId: g.id },
        on: current.length > 0,
        rhythm: current.some((t) => t.mode === 'practice') ? 'daily' : 'few_weekly',
      };
    });
  const topicRows = topics
    .filter((t) => !t.goal && (t.status === 'active' || t.status === 'queued'))
    .map((t): Row => ({
      key: `topic:${t.id}`,
      label: t.title,
      target: { kind: 'topic', topicId: t.id },
      on: t.status === 'active',
      rhythm: t.mode === 'practice' ? 'daily' : 'few_weekly',
    }));
  return [...goalRows, ...topicRows];
}

export default function FocusSetup({ focus, topics }: { focus: FocusApi; topics: SetupTopic[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/goals')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((goals) => { if (!cancelled) setRows(buildRows(goals, topics)); });
    return () => { cancelled = true; };
  }, [topics]);

  if (!rows || rows.length === 0) return null;

  const change = (key: string, patch: Partial<Row>) => setRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const finish = async (chosen: Row[]) => {
    setSaving(true);
    const ok = await focus.finishSetup(chosen.map((r) => ({ ...r.target, rhythm: r.rhythm })));
    if (!ok) toast.error('Couldn’t save that. Try again.');
    setSaving(false);
  };
  const chosen = rows.filter((r) => r.on);

  return (
    <section aria-labelledby="setup-h" className="glass-panel flex flex-col gap-4 p-7">
      <div className="flex flex-col gap-1.5">
        <h2 id="setup-h" className="m-0 font-serif text-[1.8rem] font-medium leading-tight">What matters right now?</h2>
        <p className="m-0 text-[0.95rem] text-fg-secondary">Pick what you’re working on and how often it should come up. Today’s list will be made from these. Everything else waits under Later, and nothing is deleted.</p>
      </div>
      <ul className="m-0 flex max-h-[420px] list-none flex-col overflow-y-auto p-0">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
            <label className="flex min-w-[200px] flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={r.on} onChange={(e) => change(r.key, { on: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--ink)]" />
              <span className="min-w-0 text-[0.98rem] text-fg">{r.label}</span>
            </label>
            {r.on && (
              <>
                <label className="sr-only" htmlFor={`setup-${r.key}`}>How often for {r.label}</label>
                <select id={`setup-${r.key}`} className="form-input h-9 w-auto py-0 text-[0.85rem]" value={r.rhythm} onChange={(e) => change(r.key, { rhythm: e.target.value as Rhythm })}>
                  {SETUP_RHYTHMS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={saving || chosen.length === 0} onClick={() => void finish(chosen)}>
          {saving ? 'Saving…' : `Save my Focus${chosen.length ? ` · ${chosen.length}` : ''}`}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => void finish([])}>Skip for now</Button>
      </div>
    </section>
  );
}
