'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { COLD_TARGET, OUTCOME_LABEL, PROBLEM_OUTCOMES, type ProblemOutcome } from '@/lib/problems';

interface Problem {
  id: string;
  title: string;
  url: string | null;
  difficulty: string | null;
  outcome: ProblemOutcome;
  minutes: number | null;
  notes: string | null;
  attemptedAt: string;
}

const OUTCOME_TONE: Record<ProblemOutcome, string> = {
  cold: 'text-k-solid',
  hint: 'text-fg-secondary',
  stuck: 'text-k-fading-text',
};

/**
 * Practice problems for one module: log each one in a few seconds, see how
 * many you've solved cold. Needing help plus a written key idea turns the
 * problem into a review card.
 */
export default function ProblemLog({ topicId, moduleId, onChanged }: { topicId: string; moduleId: string; onChanged?: () => void }) {
  const toast = useToast();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [outcome, setOutcome] = useState<ProblemOutcome>('cold');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/topics/${topicId}/problems?moduleId=${encodeURIComponent(moduleId)}`).catch(() => null);
    if (res?.ok) setProblems((await res.json()).problems);
  }, [topicId, moduleId]);

  useEffect(() => {
    load();
    setOpen(false);
  }, [load]);

  const reset = () => {
    setTitle('');
    setUrl('');
    setMinutes('');
    setNotes('');
    setOutcome('cold');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/topics/${topicId}/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, url, difficulty, outcome, minutes: minutes || undefined, notes, moduleId }),
    }).catch(() => null);
    setSaving(false);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      toast.error(data?.error || 'Could not save the problem');
      return;
    }
    toast.success(data.cardsAdded > 0 ? 'Logged — its key idea comes back in Daily Review in 3 days' : 'Problem logged');
    reset();
    setOpen(false);
    await load();
    onChanged?.();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/problems/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      await load();
      onChanged?.();
    }
  };

  const counts = { cold: 0, hint: 0, stuck: 0 } as Record<ProblemOutcome, number>;
  for (const p of problems) counts[p.outcome] += 1;
  const toGo = Math.max(0, COLD_TARGET - counts.cold);

  return (
    <section aria-labelledby="problems-h" className="glass-panel flex flex-col gap-3.5 px-6 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="problems-h" className="m-0 text-base font-bold text-fg">Problems solved</h3>
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Log a problem
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-5 text-[0.85rem] text-fg-muted">
        {PROBLEM_OUTCOMES.map((o) => (
          <span key={o}>
            <strong className="text-lg text-fg">{counts[o]}</strong> {OUTCOME_LABEL[o].toLowerCase()}
          </span>
        ))}
        <span className="text-[0.78rem]">
          {toGo === 0 ? `${COLD_TARGET}+ solved cold — interview-ready on this one` : `${toGo} more solved cold to call this interview-ready`}
        </span>
      </div>

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-line bg-black/20 p-4">
          <div className="grid grid-cols-[2fr_1fr] gap-2.5">
            <Field label="Problem" htmlFor="pl-title">
              <Input id="pl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Minimum window substring" autoFocus />
            </Field>
            <Field label="Difficulty" htmlFor="pl-diff">
              <Select id="pl-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
          </div>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="form-label mb-1 text-[0.72rem] uppercase tracking-wide">How did it go?</legend>
            <div className="flex flex-wrap gap-2">
              {PROBLEM_OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={outcome === o}
                  onClick={() => setOutcome(o)}
                  className={`min-h-[40px] rounded-md border px-3.5 text-[0.85rem] font-semibold ${outcome === o ? 'border-fg bg-white/10 text-fg' : 'border-line bg-transparent text-fg-secondary'}`}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-[2fr_1fr] gap-2.5">
            <Field label="Link (optional)" htmlFor="pl-url">
              <Input id="pl-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="leetcode.com/problems/…" />
            </Field>
            <Field label="Minutes (optional)" htmlFor="pl-min">
              <Input id="pl-min" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Key idea, in your words"
            htmlFor="pl-notes"
            hint={outcome === 'cold' ? undefined : 'If you write it, this becomes a review card so the idea sticks.'}
          >
            <Input id="pl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Expand right until valid, then shrink left while it stays valid" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          </div>
        </form>
      )}

      {problems.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {problems.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-line py-2.5 text-[0.85rem] last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="truncate font-medium text-fg">{p.title} ↗</a>
                ) : (
                  <span className="truncate font-medium text-fg">{p.title}</span>
                )}
                <span className="text-[0.75rem] text-fg-muted">
                  <span className={OUTCOME_TONE[p.outcome]}>{OUTCOME_LABEL[p.outcome]}</span>
                  {p.difficulty && ` · ${p.difficulty}`}
                  {p.minutes && ` · ${p.minutes} min`}
                  {` · ${new Date(p.attemptedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                </span>
              </div>
              <button type="button" onClick={() => remove(p.id)} aria-label={`Delete ${p.title}`} className="min-h-[36px] bg-transparent px-2 text-fg-muted">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
