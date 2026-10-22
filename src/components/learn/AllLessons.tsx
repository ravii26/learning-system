'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { Icon } from '@/components/ui';
import { BlueprintPicker } from '@/components/lesson/BlueprintPicker';
import type { BlockType } from '@/lib/lessonBlocks';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, LESSON_KINDS, LESSON_KIND_BADGE, LESSON_KIND_LABEL, isDefaultBlueprint, type LessonKind } from '@/lib/lessonKinds';
import { STATE_LABEL, filterOverview, groupByTopic, summarize, type OverviewRow, type OverviewState } from '@/lib/lessonOverview';

/**
 * Everything you are learning in one list: every lesson of every topic, with
 * what it is meant to be and whether it has been written. Changing what a
 * lesson is meant to be never deletes a written lesson; the lesson page then
 * offers to regenerate it.
 */

const pill = 'rounded-full border border-line-strong px-2.5 py-0.5 text-[0.75rem] text-fg-secondary';

function Row({ row, onChanged }: { row: OverviewRow; onChanged: (next: OverviewRow) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<LessonKind>(row.kind);
  const [sections, setSections] = useState<BlockType[] | null>(null);
  const [saving, setSaving] = useState(false);

  const shown: BlockType[] = sections ?? (row.kind === kind && row.blueprint.length ? row.blueprint : [...KIND_DEFAULT_BLOCKS[kind]]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/topics/${row.topicId}/modules/${encodeURIComponent(row.moduleId)}/kind`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Nothing is stored for the default set of sections.
        body: JSON.stringify({ kind, blueprint: isDefaultBlueprint(kind, shown) ? [] : shown }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Couldn’t change it.'); return; }
      onChanged({ ...row, kind: data.kind, blueprint: data.blueprint, needsRegenerate: !!data.needsRegenerate });
      setEditing(false);
      setSections(null);
      toast.success(data.needsRegenerate ? 'Changed. Open the lesson and regenerate it to match.' : 'Changed.');
    } catch {
      toast.error('Couldn’t reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-line py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link href={`/topics/${row.topicId}?module=${encodeURIComponent(row.moduleId)}`} className={`text-[1rem] font-medium text-fg ${row.completed ? 'line-through opacity-70' : ''}`}>{row.title}</Link>
        <span className={pill}>{LESSON_KIND_BADGE[row.kind]}</span>
        {row.needsRegenerate && <span className={`${pill} font-semibold text-fg`}>Needs regenerating</span>}
        {!row.written && <span className="text-[0.8rem] text-fg-muted">Not written yet</span>}
        {row.completed && <span className="text-[0.8rem] text-fg-muted">Finished</span>}
        <span className="ml-auto text-[0.82rem] tabular-nums text-fg-muted">about {row.minutes} min</span>
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className="text-[0.85rem] font-medium text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
          {editing ? 'Cancel' : 'Change'}
        </button>
      </div>

      {row.needsRegenerate && row.writtenKind && (
        <p className="m-0 text-[0.85rem] text-fg-muted">
          Written as “{LESSON_KIND_LABEL[row.writtenKind].toLowerCase()}”, now set to “{LESSON_KIND_LABEL[row.kind].toLowerCase()}”. The old version stays readable until you regenerate.
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-3 rounded-xl bg-sunk p-4">
          <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-fg-secondary">
            What is this lesson for?
            <select className="form-input h-11 py-0 font-normal" value={kind} onChange={(e) => { setKind(e.target.value as LessonKind); setSections(null); }}>
              {LESSON_KINDS.map((k) => <option key={k} value={k}>{LESSON_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <BlueprintPicker allowed={KIND_BLOCKS[kind]} value={shown} onChange={setSections} />
          {row.written && <p className="m-0 text-[0.85rem] text-fg-muted">This does not delete the lesson you have. Regenerate it afterwards to get the new shape.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary h-10 py-0">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => { setEditing(false); setKind(row.kind); setSections(null); }} className="btn btn-secondary h-10 py-0">Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

/** `initialRows` skips the fetch (used by tests and previews); the page passes nothing. */
export function AllLessons({ initialRows }: { initialRows?: OverviewRow[] } = {}) {
  const [rows, setRows] = useState<OverviewRow[] | null>(initialRows ?? null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<LessonKind | 'all'>('all');
  const [state, setState] = useState<OverviewState>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/learning/overview');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.rows)) { setError(data?.error || 'Couldn’t load your lessons.'); return; }
      setRows(data.rows);
    } catch {
      setError('Couldn’t reach the server.');
    }
  }, []);
  useEffect(() => { if (!initialRows) load(); }, [load, initialRows]);

  const update = (next: OverviewRow) => setRows((prev) => (prev ?? []).map((r) => (r.topicId === next.topicId && r.moduleId === next.moduleId ? next : r)));
  const visible = useMemo(() => filterOverview(rows ?? [], { kind, state }), [rows, kind, state]);
  const groups = useMemo(() => groupByTopic(visible), [visible]);
  const stale = (rows ?? []).filter((r) => r.needsRegenerate).length;

  return (
    <div className="learn-flow mx-auto flex max-w-[860px] flex-col gap-8">
      <Link href="/plan" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Learn
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-serif text-[2.4rem] font-normal leading-tight">All lessons</h1>
          <p className="m-0 text-[0.95rem] text-fg-secondary">{rows ? summarize(rows) : 'Loading…'}</p>
        </div>
        <Link href="/learn/start" className="btn btn-primary h-11 py-0 no-underline hover:no-underline">Start learning</Link>
      </header>

      {stale > 0 && state !== 'needs_regenerate' && (
        <p className="m-0 rounded-xl border border-line px-4 py-3 text-[0.92rem]">
          {stale} lesson{stale === 1 ? ' was' : 's were'} changed after being written.{' '}
          <button type="button" onClick={() => setState('needs_regenerate')} className="font-semibold underline underline-offset-2">Show {stale === 1 ? 'it' : 'them'}</button>
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[0.8rem] font-semibold text-fg-secondary">
          Kind
          <select className="form-input h-10 py-0 font-normal" value={kind} onChange={(e) => setKind(e.target.value as LessonKind | 'all')}>
            <option value="all">Every kind</option>
            {LESSON_KINDS.map((k) => <option key={k} value={k}>{LESSON_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.8rem] font-semibold text-fg-secondary">
          State
          <select className="form-input h-10 py-0 font-normal" value={state} onChange={(e) => setState(e.target.value as OverviewState)}>
            {(Object.keys(STATE_LABEL) as OverviewState[]).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="m-0 text-[0.95rem] text-danger">{error}</p>}

      {rows && rows.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-sunk p-6">
          <p className="m-0 text-[1rem] text-fg-secondary">You have no lessons yet.</p>
          <Link href="/learn/start" className="btn btn-primary h-11 py-0 no-underline hover:no-underline">Start learning</Link>
        </div>
      )}

      {rows && rows.length > 0 && groups.length === 0 && <p className="m-0 text-[0.95rem] text-fg-muted">No lessons match these filters.</p>}

      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.topicId} aria-label={g.topicTitle} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="m-0 text-[1.15rem] font-semibold"><Link href={`/topics/${g.topicId}`} className="text-fg">{g.topicTitle}</Link></h2>
              <span className="text-[0.85rem] text-fg-muted">{g.topicStatus} · {summarize(g.rows)}</span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {g.rows.map((r) => <Row key={`${r.topicId}:${r.moduleId}`} row={r} onChanged={update} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
