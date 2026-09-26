'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { Icon } from '@/components/ui';

/**
 * Learn something new: name it, say how far you want to go and what kind
 * of learning it is, then (for a course) trim an AI roadmap before it's
 * created. Skipping what you already know happens on the topic page via
 * the placement check, which appears on any fresh roadmap.
 */

type Depth = 'know' | 'use' | 'build' | 'interview';
type Kind = 'syllabus' | 'practice' | 'accretion';

const DEPTHS: Array<{ key: Depth; label: string; desc: string; target: string }> = [
  { key: 'know', label: 'Know about it', desc: 'Follow conversations and articles. A short overview, no exercises.', target: 'Awareness' },
  { key: 'use', label: 'Use it', desc: 'Handle the everyday cases at work without looking things up.', target: 'Working Knowledge' },
  { key: 'build', label: 'Build with it', desc: 'Ship something real. Ends with a project you can show.', target: 'Proficiency' },
  { key: 'interview', label: 'Interview-ready', desc: 'Explain and solve it cold, under time. Practice problems included.', target: 'Deep' },
];

const KINDS: Array<{ key: Kind; label: string; desc: string; explain: string }> = [
  { key: 'syllabus', label: 'Course', desc: 'a syllabus to finish', explain: 'A roadmap of modules in order. Each one ends with a check, and what you learn comes back for review.' },
  { key: 'practice', label: 'Practice', desc: 'a skill you repeat', explain: 'No syllabus. A short daily rep, a scoring rubric, and a trend line of how you’re improving.' },
  { key: 'accretion', label: 'Collect ideas', desc: 'no finish line', explain: 'A place in your Notebook. Captures on this subject land here, and ideas worth keeping become review cards. Never a percentage.' },
];

const AREAS = ['Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];

interface DraftModule {
  title: string;
  estimatedMinutes: number;
  on: boolean;
}

export default function LearnSomethingNewPage() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [area, setArea] = useState('Tech');
  const [depth, setDepth] = useState<Depth>('use');
  const [kind, setKind] = useState<Kind>('syllabus');
  const [modules, setModules] = useState<DraftModule[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depthTarget = DEPTHS.find((d) => d.key === depth)!.target;
  const chosen = (modules ?? []).filter((m) => m.on);
  const minutes = chosen.reduce((s, m) => s + m.estimatedMinutes, 0);
  const weeks = Math.max(1, Math.ceil(minutes / (30 * 7)));

  const buildRoadmap = async () => {
    if (!title.trim()) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-curriculum', topicTitle: title.trim(), why: why.trim() || undefined, area, depthTarget }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.modules) || data.modules.length === 0) {
        setError(data?.reason || 'Couldn’t build a roadmap right now. Try again, or create the topic and add modules yourself.');
        return;
      }
      setModules(data.modules.map((m: any) => ({ title: String(m.title || 'Module'), estimatedMinutes: Number(m.estimatedMinutes) || 30, on: true })));
    } catch {
      setError('Couldn’t reach the server.');
    } finally {
      setBuilding(false);
    }
  };

  const create = async (wantNow: boolean) => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    const curriculum = kind === 'syllabus'
      ? chosen.map((m, i) => ({ id: Math.random().toString(36).slice(2, 9), order: i + 1, title: m.title, estimatedMinutes: m.estimatedMinutes, completed: false, completedAt: null, notes: '' }))
      : [];
    const body = (status: 'active' | 'queued') => JSON.stringify({
      title: title.trim(),
      area,
      mode: kind,
      status,
      depthTarget,
      why: why.trim() || `I want to learn ${title.trim()}`,
      nextAction: curriculum[0] ? `Study: ${curriculum[0].title}` : kind === 'practice' ? 'Do today’s rep' : 'Capture the first idea',
      currentStage: 'Fundamentals',
      curriculum,
    });
    try {
      let res = await fetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(wantNow ? 'active' : 'queued') });
      let queued = !wantNow;
      if (wantNow && res.status === 400) {
        const d = await res.clone().json().catch(() => ({}));
        if (/active limit/i.test(d.error || '')) {
          res = await fetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body('queued') });
          queued = true;
        }
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setError(data?.error || 'Couldn’t create the topic.');
        return;
      }
      toast.success(queued ? `“${title.trim()}” is in Next.` : `“${title.trim()}” is in Now.`);
      router.push(kind === 'accretion' ? '/notes' : `/topics/${data.id}`);
    } catch {
      setError('Couldn’t reach the server.');
    } finally {
      setCreating(false);
    }
  };

  const choice = (on: boolean) =>
    `flex flex-col items-start gap-1 rounded-xl px-4 py-3.5 text-left ${on ? 'border-2 border-ink bg-surface' : 'border-[1.5px] border-line hover:border-line-hover'}`;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-10">
      <Link href="/plan" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Learn
      </Link>

      <div className="flex flex-col gap-3">
        <label htmlFor="what" className="font-serif text-[2.4rem] font-normal leading-tight">What do you want to learn?</label>
        <input
          id="what"
          className="form-input h-14 text-[1.2rem]"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setModules(null); }}
          placeholder="e.g. Postgres internals, Investing, Spoken English"
          autoFocus
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="why" className="text-[0.9rem] font-semibold text-fg-secondary">Why now? <span className="font-normal text-fg-muted">optional — it shapes the roadmap</span></label>
            <input id="why" className="form-input h-11 py-0" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. backend interviews in June" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="area" className="text-[0.9rem] font-semibold text-fg-secondary">Area</label>
            <select id="area" className="form-input h-11 py-0" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-3 p-0 text-[1.15rem] font-semibold">What kind of learning is it?</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)} className={choice(kind === k.key)}>
              <span className="text-[1rem] font-semibold">{k.label}</span>
              <span className="text-[0.85rem] text-fg-secondary">{k.desc}</span>
            </button>
          ))}
        </div>
        <p className="m-0 text-[0.9rem] text-fg-muted">{KINDS.find((k) => k.key === kind)!.explain}</p>
      </fieldset>

      {kind === 'syllabus' && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[1.15rem] font-semibold">How far do you want to go?</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {DEPTHS.map((d) => (
              <button key={d.key} type="button" aria-pressed={depth === d.key} onClick={() => { setDepth(d.key); setModules(null); }} className={choice(depth === d.key)}>
                <span className="text-[1rem] font-semibold">{d.label}</span>
                <span className="text-[0.875rem] leading-snug text-fg-secondary">{d.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {kind === 'syllabus' && (
        <section aria-labelledby="road-h" className="glass-panel flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="road-h" className="m-0 text-[1.15rem] font-semibold">Your roadmap</h2>
            {modules && (
              <span className="text-[0.9rem] text-fg-secondary">
                {chosen.length} modules · about {Math.round(minutes / 6) / 10} hours · {weeks} week{weeks === 1 ? '' : 's'} at 30 min a day
              </span>
            )}
          </div>
          {!modules ? (
            <div className="flex flex-col items-start gap-3">
              <p className="m-0 text-[0.95rem] text-fg-secondary">A short list of modules in the order to learn them, sized to how far you want to go.</p>
              <button type="button" onClick={buildRoadmap} disabled={!title.trim() || building} className="btn btn-primary h-11 py-0">
                {building ? 'Building…' : 'Build my roadmap'}
              </button>
            </div>
          ) : (
            <>
              <p className="m-0 text-[0.9rem] text-fg-muted">Untick anything you don’t need. You can edit it later, and skip what you already know with a placement check.</p>
              <ul className="m-0 flex list-none flex-col p-0">
                {modules.map((m, i) => (
                  <li key={i} className="border-b border-line last:border-b-0">
                    <label className="flex min-h-[48px] cursor-pointer items-center gap-3.5">
                      <input
                        type="checkbox"
                        checked={m.on}
                        onChange={() => setModules((prev) => prev!.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                        className="h-5 w-5 shrink-0 accent-[var(--ink)]"
                      />
                      <span className={`flex-1 text-[1rem] ${m.on ? 'text-fg' : 'text-fg-muted line-through'}`}>{m.title}</span>
                      <span className="w-16 text-right text-[0.85rem] text-fg-muted">{m.estimatedMinutes} min</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={buildRoadmap} disabled={building} className="self-start text-[0.875rem] font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                {building ? 'Rebuilding…' : 'Build a different one'}
              </button>
            </>
          )}
        </section>
      )}

      {error && <p role="alert" className="m-0 text-[0.95rem] text-danger">{error}</p>}

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => create(true)}
            disabled={!title.trim() || creating || (kind === 'syllabus' && modules !== null && chosen.length === 0)}
            className="btn btn-primary h-12 px-6 py-0 text-[1rem]"
          >
            {creating ? 'Creating…' : 'Start now'}
          </button>
          <button type="button" onClick={() => create(false)} disabled={!title.trim() || creating} className="btn btn-secondary h-12 px-6 py-0 text-[1rem]">
            Add to Next
          </button>
        </div>
        <span className="text-[0.875rem] text-fg-muted">
          {kind === 'syllabus' && !modules ? 'Starting without a roadmap is fine — you can build one on the topic page. ' : ''}
          If both Now slots are full, it goes to Next.
        </span>
      </div>
    </div>
  );
}
