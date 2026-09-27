'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import {
  matchMap, competenciesForTarget, requiredEvidence,
  type CompetencyMap, type TargetLevel, type Importance,
} from '@/data/competencies';
import type { Budget, ResourceFormat } from '@/data/resources';
import { inferTarget } from '@/lib/program/intake';
import { TARGET_LABEL } from '@/lib/program/why';
import { SHAPE_LABEL, describeRequirements, resourceBadges } from '@/lib/program/describe';
import type { Adjustments } from '@/lib/program/adapt';
import type { CurrentLevel, Intake, ProgramDraft } from '@/lib/program/types';

/**
 * Build a learning plan: goal → (topic list review for new fields) → draft →
 * approve. The server builds and rebuilds the plan; this page only collects
 * answers, shows the draft and sends back the learner's decisions.
 */

const LEVELS: { key: CurrentLevel; label: string; desc: string }[] = [
  { key: 'beginner', label: 'New to it', desc: 'Little or no experience' },
  { key: 'intermediate', label: 'Some experience', desc: 'Know the basics, gaps elsewhere' },
  { key: 'advanced', label: 'Experienced', desc: 'Filling specific gaps' },
];
const TARGETS: { key: TargetLevel; desc: string }[] = [
  { key: 'aware', desc: 'Follow conversations and articles' },
  { key: 'use', desc: 'Handle everyday cases without looking things up' },
  { key: 'build', desc: 'Ship real work with it' },
  { key: 'interview', desc: 'Solve and explain it cold, under time' },
];
const BUDGETS: { key: Budget; label: string }[] = [
  { key: 'free_only', label: 'Free only' },
  { key: 'free_preferred', label: 'Free preferred' },
  { key: 'any', label: 'Paid is fine' },
];
const FORMATS: { key: ResourceFormat; label: string }[] = [
  { key: 'read', label: 'Reading' },
  { key: 'watch', label: 'Videos' },
  { key: 'do', label: 'Hands-on' },
];
const DONE_EXAMPLES: Record<string, string> = {
  'system-design': 'e.g. solve design interview questions on my own',
  dsa: 'e.g. solve most medium problems in 30 minutes',
  frontend: 'e.g. build and deploy a React app people use',
  backend: 'e.g. ship an API with auth, a database and tests',
  dbms: 'e.g. design a schema and fix slow queries myself',
  os: 'e.g. explain scheduling, memory and concurrency in an interview',
  networking: 'e.g. explain what happens when I type a URL, in depth',
};

type Stage = 'intake' | 'review_map' | 'draft';
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type Mark = 'strong' | 'weak' | undefined;

export default function BuildProgramPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('intake');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Intake
  const [goal, setGoal] = useState('');
  const [serious, setSerious] = useState(false);
  const [level, setLevel] = useState<CurrentLevel>('beginner');
  const [hours, setHours] = useState(5);
  const [target, setTarget] = useState<TargetLevel | null>(null);
  const [why, setWhy] = useState('');
  const [doneMeans, setDoneMeans] = useState('');
  const [deadline, setDeadline] = useState('');
  const [formats, setFormats] = useState<ResourceFormat[]>([]);
  const [budget, setBudget] = useState<Budget>('free_only');
  const [bookTitle, setBookTitle] = useState('');
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  // Results
  const [customMap, setCustomMap] = useState<CompetencyMap | null>(null);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const matched = useMemo(() => (goal.trim().length > 2 ? matchMap(goal) : null), [goal]);
  const effectiveTarget = target ?? inferTarget(goal);

  const intakeBody = (): Partial<Intake> & Record<string, unknown> => ({
    goal, path: serious ? 'serious' : 'quick', currentLevel: level, hoursPerWeek: hours,
    target: effectiveTarget, budget,
    ...(serious ? {
      why: why || undefined,
      doneMeans: doneMeans || undefined,
      deadlineWeeks: deadline ? Number(deadline) : undefined,
      formats: formats.length ? formats : undefined,
      bookTitle: bookTitle || undefined,
      placement: {
        strong: Object.keys(marks).filter((k) => marks[k] === 'strong'),
        weak: Object.keys(marks).filter((k) => marks[k] === 'weak'),
      },
    } : {}),
  });

  const requestDraft = async (mapOverride?: CompetencyMap) => {
    setBusy(mapOverride ? 'Building your plan from your topic list…' : 'Building your plan…');
    setError(null);
    try {
      const res = await fetch('/api/programs/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...intakeBody(), ...(mapOverride ? { customMap: mapOverride } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build a plan.');
      if (data.stage === 'review_map') {
        setCustomMap(data.map);
        setStage('review_map');
      } else {
        setDraft(data.draft);
        setAdjustments(data.adjustments);
        setRemoved(new Set());
        setStage('draft');
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!draft) return;
    setBusy('Creating your plan…');
    setError(null);
    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intake: draft.intake,
          field: draft.field,
          ...(draft.mapQuality === 'approved_draft' ? { customMap: draft.map } : {}),
          adjustments,
          removedItemIds: Array.from(removed),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the plan.');
      router.push(`/goals/${data.goalId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
      setBusy(null);
    }
  };

  const choice = (on: boolean) =>
    `flex flex-col items-start gap-1 rounded-xl px-4 py-3 text-left ${on ? 'border-2 border-ink bg-surface' : 'border-[1.5px] border-line hover:border-line-hover'}`;
  const chip = (on: boolean) =>
    `h-10 rounded-lg px-3.5 text-[0.9rem] font-medium ${on ? 'bg-ink text-on-ink' : 'border-[1.5px] border-line text-fg-secondary hover:border-line-hover'}`;
  const back = (
    <Link href="/plan" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
      <Icon name="arrowLeft" size={16} /> Learn
    </Link>
  );

  // ---------------------------------------------------------------- intake
  if (stage === 'intake') {
    const selfCheck = serious && matched ? competenciesForTarget(matched, effectiveTarget) : [];
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-9">
        {back}
        <div className="flex flex-col gap-3">
          <label htmlFor="goal" className="font-serif text-[2.4rem] font-normal leading-tight">What do you want to achieve?</label>
          <input
            id="goal"
            className="form-input h-14 text-[1.15rem]"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. become interview-ready in system design"
            autoFocus
          />
          {goal.trim().length > 2 && (
            <p className="m-0 text-[0.9rem] text-fg-secondary">
              {matched
                ? <>We have a reviewed topic list for <strong>{matched.title}</strong>: your plan is built on it.</>
                : <>No reviewed list for this yet: the AI will draft one and you’ll check it before anything is built.</>}
            </p>
          )}
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[1.1rem] font-semibold">Where are you now?</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button key={l.key} type="button" aria-pressed={level === l.key} onClick={() => setLevel(l.key)} className={choice(level === l.key)}>
                <span className="font-semibold">{l.label}</span>
                <span className="text-[0.85rem] text-fg-secondary">{l.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[1.1rem] font-semibold">How many hours a week can you give it?</legend>
          <div className="flex flex-wrap items-center gap-2">
            {[3, 5, 7, 10, 15].map((h) => (
              <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)} className={chip(hours === h)}>{h} h</button>
            ))}
            <label className="sr-only" htmlFor="hours">Hours per week</label>
            <input id="hours" type="number" min={1} max={60} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="form-input h-10 w-20 py-0" />
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[1.1rem] font-semibold">How far do you want to go?</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TARGETS.map((t) => (
              <button key={t.key} type="button" aria-pressed={effectiveTarget === t.key} onClick={() => setTarget(t.key)} className={choice(effectiveTarget === t.key)}>
                <span className="font-semibold">{sentence(TARGET_LABEL[t.key])}</span>
                <span className="text-[0.85rem] text-fg-secondary">{t.desc}</span>
              </button>
            ))}
          </div>
          {!target && goal.trim() && <p className="m-0 text-[0.85rem] text-fg-muted">Guessed from your goal. Tap to change.</p>}
        </fieldset>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-4 py-3.5">
          <input type="checkbox" checked={serious} onChange={(e) => setSerious(e.target.checked)} className="h-5 w-5 accent-[var(--ink)]" />
          <span className="flex flex-col">
            <span className="font-semibold">Build me a serious plan</span>
            <span className="text-[0.85rem] text-fg-secondary">A few more questions: what “done” means, deadline, budget and what you already know.</span>
          </span>
        </label>

        {serious && (
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="done" className="font-semibold">What does “done” mean to you?</label>
              <input id="done" className="form-input h-11 py-0" value={doneMeans} onChange={(e) => setDoneMeans(e.target.value)}
                placeholder={(matched && DONE_EXAMPLES[matched.key]) || 'e.g. hold a 15-minute conversation comfortably'} />
              <span className="text-[0.82rem] text-fg-muted">This becomes your plan’s finish line.</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="why" className="font-semibold">Why? <span className="font-normal text-fg-muted">optional</span></label>
                <input id="why" className="form-input h-11 py-0" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. switching jobs in spring" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="deadline" className="font-semibold">Deadline <span className="font-normal text-fg-muted">weeks, optional</span></label>
                <input id="deadline" type="number" min={1} max={104} className="form-input h-11 py-0" value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. 12" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold">Budget for resources</span>
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((b) => <button key={b.key} type="button" aria-pressed={budget === b.key} onClick={() => setBudget(b.key)} className={chip(budget === b.key)}>{b.label}</button>)}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold">How do you like to learn? <span className="font-normal text-fg-muted">optional</span></span>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => {
                  const on = formats.includes(f.key);
                  return <button key={f.key} type="button" aria-pressed={on} onClick={() => setFormats((p) => (on ? p.filter((x) => x !== f.key) : [...p, f.key]))} className={chip(on)}>{f.label}</button>;
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="book" className="font-semibold">Learning from a specific book? <span className="font-normal text-fg-muted">optional</span></label>
              <input id="book" className="form-input h-11 py-0" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="e.g. The Intelligent Investor" />
            </div>
            {selfCheck.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-semibold">What do you already know? <span className="font-normal text-fg-muted">optional self-check</span></span>
                <span className="text-[0.85rem] text-fg-muted">Mark topics you know well (less time) or feel shaky on (more time). The course’s placement check can confirm later.</span>
                <ul className="m-0 flex list-none flex-col p-0">
                  {selfCheck.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                      <span className="min-w-0 text-[0.95rem]">{c.title}</span>
                      <span className="flex shrink-0 gap-1">
                        {(['strong', 'weak'] as const).map((m) => (
                          <button key={m} type="button" aria-pressed={marks[c.key] === m}
                            onClick={() => setMarks((p) => ({ ...p, [c.key]: p[c.key] === m ? undefined : m }))}
                            className={`h-8 rounded-md px-2.5 text-[0.8rem] font-medium ${marks[c.key] === m ? 'bg-ink text-on-ink' : 'text-fg-muted hover:bg-fill-2'}`}>
                            {m === 'strong' ? 'Know it' : 'Shaky'}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {error && <p role="alert" className="m-0 text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" onClick={() => requestDraft()} disabled={goal.trim().length < 3 || !!busy} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
            {busy ?? 'Build my plan'}
          </button>
          <span className="text-[0.85rem] text-fg-muted">Nothing is saved until you approve the plan.</span>
        </div>
        <p className="m-0 text-[0.85rem] text-fg-muted">
          Just want to add one topic? <Link href="/learn/new">Add a single topic</Link>
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------ review map
  if (stage === 'review_map' && customMap) {
    const update = (i: number, patch: Partial<CompetencyMap['competencies'][number]>) =>
      setCustomMap((m) => m && { ...m, competencies: m.competencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-7">
        <button type="button" onClick={() => setStage('intake')} className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary hover:text-fg">
          <Icon name="arrowLeft" size={16} /> Your answers
        </button>
        <header className="flex flex-col gap-2">
          <span className="self-start rounded-md bg-fill-2 px-2 py-0.5 text-[0.78rem] font-semibold text-fg-secondary">Drafted by AI · unreviewed</span>
          <h1 className="m-0 font-serif text-[2.2rem] font-normal leading-tight">Check the topic list for {customMap.title}</h1>
          <p className="m-0 text-fg-secondary">There’s no reviewed list for this field yet, so the AI drafted one. Your plan will be built only from what you approve here: rename, remove or add topics until it looks right.</p>
        </header>
        <ul className="m-0 flex list-none flex-col p-0">
          {customMap.competencies.map((c, i) => (
            <li key={c.key} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`t-${c.key}`}>Topic name</label>
                <input id={`t-${c.key}`} className="form-input h-10 flex-1 py-0" value={c.title} onChange={(e) => update(i, { title: e.target.value })} />
                <label className="sr-only" htmlFor={`i-${c.key}`}>Importance</label>
                <select id={`i-${c.key}`} className="form-input h-10 w-auto py-0" value={c.importance} onChange={(e) => update(i, { importance: e.target.value as Importance })}>
                  <option value="core">Core</option><option value="supporting">Supporting</option><option value="optional">Optional</option>
                </select>
                <button type="button" aria-label={`Remove ${c.title}`} className="h-10 rounded-lg px-2 text-fg-muted hover:bg-fill-2 hover:text-fg"
                  onClick={() => setCustomMap((m) => m && { ...m, competencies: m.competencies.filter((_, j) => j !== i) })}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              <span className="text-[0.85rem] text-fg-muted">{c.group} · {c.summary}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="self-start text-[0.9rem] font-medium text-fg-secondary hover:text-fg"
          onClick={() => setCustomMap((m) => m && { ...m, competencies: [...m.competencies, { key: `my-topic-${m.competencies.length + 1}`, title: 'New topic', group: 'My additions', kind: 'concept', importance: 'supporting', from: 'aware', prerequisites: [], summary: 'Added by you.' }] })}>
          + Add a topic
        </button>
        {error && <p role="alert" className="m-0 text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" onClick={() => requestDraft(customMap)} disabled={customMap.competencies.length < 3 || !!busy} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
            {busy ?? 'Looks right: build the plan'}
          </button>
          {customMap.competencies.length < 3 && <span className="text-[0.85rem] text-fg-muted">Keep at least 3 topics.</span>}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ draft
  if (stage === 'draft' && draft) {
    const title = (k: string) => draft.map.competencies.find((c) => c.key === k)?.title ?? k;
    const kindOf = (k: string) => draft.map.competencies.find((c) => c.key === k)?.kind ?? 'concept';
    const uncovered = draft.coverage.filter((c) => c.importance === 'core' && c.itemIds.every((id) => removed.has(id)));
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-8">
        <button type="button" onClick={() => setStage(draft.mapQuality === 'approved_draft' ? 'review_map' : 'intake')} className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary hover:text-fg">
          <Icon name="arrowLeft" size={16} /> {draft.mapQuality === 'approved_draft' ? 'Topic list' : 'Your answers'}
        </button>

        <header className="flex flex-col gap-2">
          <span className="text-[0.85rem] font-semibold uppercase tracking-wide text-fg-muted">Draft plan · not saved yet</span>
          <h1 className="m-0 font-serif text-[2.4rem] font-normal leading-tight">{draft.map.title}</h1>
          <p className="m-0 text-[1.05rem] text-fg-secondary">
            {sentence(TARGET_LABEL[draft.intake.target])} · {draft.hoursPerWeek} h/week · about {draft.totalWeeks} weeks · {draft.phases.length} phases
          </p>
          {draft.intake.doneMeans && <p className="m-0 text-[0.95rem]">Finish line: <strong>{draft.intake.doneMeans}</strong></p>}
        </header>

        <section aria-labelledby="why-h" className="glass-panel flex flex-col gap-2 p-5">
          <h2 id="why-h" className="m-0 text-[1rem] font-semibold">Why this plan</h2>
          <p className="m-0 leading-relaxed text-fg-secondary">{draft.whyThisPlan}</p>
        </section>

        {(draft.warnings.length > 0 || uncovered.length > 0) && (
          <ul className="m-0 flex list-none flex-col gap-1.5 rounded-xl border-[1.5px] border-line p-4">
            {draft.warnings.map((w, i) => <li key={i} className="text-[0.92rem] text-fg-secondary">⚠ {w}</li>)}
            {uncovered.length > 0 && <li className="text-[0.92rem] text-fg-secondary">⚠ Not covered after your edits: {uncovered.map((c) => c.title).join(', ')}.</li>}
          </ul>
        )}

        {draft.phases.map((p) => (
          <section key={p.phase} aria-labelledby={`ph-${p.phase}`} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`ph-${p.phase}`} className="m-0 text-[1.2rem] font-semibold">Phase {p.phase}: {p.title}</h2>
              <span className="shrink-0 text-[0.9rem] text-fg-muted">{p.weeks} week{p.weeks === 1 ? '' : 's'}</span>
            </div>
            {p.items.map((it) => {
              const off = removed.has(it.id);
              return (
                <div key={it.id} className={`glass-panel flex flex-col gap-3 p-5 ${off ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[0.8rem] font-semibold text-fg-muted">{SHAPE_LABEL[it.shape]} · {it.hoursPerWeek} h/week</span>
                      <span className={`text-[1.05rem] font-semibold ${off ? 'line-through' : ''}`}>{it.title}</span>
                    </div>
                    <button type="button" className="shrink-0 text-[0.85rem] font-medium text-fg-muted hover:text-fg"
                      onClick={() => setRemoved((prev) => { const n = new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>
                      {off ? 'Keep' : 'Remove'}
                    </button>
                  </div>
                  {it.focus && <p className="m-0 text-[0.92rem] text-fg-secondary">{it.focus}</p>}
                  {it.shape !== 'practice' && it.shape !== 'project' && (
                    <p className="m-0 text-[0.88rem] text-fg-muted">{it.competencyKeys.map(title).join(' · ')}</p>
                  )}
                  {it.resources.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {it.resources.map((r) => (
                        <li key={r.url} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9rem]">
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium">{r.title}</a>
                          {resourceBadges(r).map((b) => <span key={b} className="rounded-md bg-fill-2 px-1.5 py-0.5 text-[0.72rem] font-semibold text-fg-secondary">{b}</span>)}
                          <span className="text-[0.78rem] text-fg-muted">{r.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <div className="rounded-xl bg-sunk px-4 py-3">
              <span className="text-[0.85rem] font-semibold">Checkpoint: what proves Phase {p.phase}</span>
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
                {p.checkpoint.competencyKeys.map((k) => (
                  <li key={k} className="text-[0.85rem] text-fg-secondary">
                    <span className="text-fg">{title(k)}</span>: {describeRequirements(requiredEvidence(kindOf(k), draft.intake.target))}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        {error && <p role="alert" className="m-0 text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" onClick={approve} disabled={!!busy || removed.size === draft.phases.flatMap((p) => p.items).length} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
            {busy ?? 'Approve plan'}
          </button>
          <button type="button" onClick={() => requestDraft(draft.mapQuality === 'approved_draft' ? draft.map : undefined)} disabled={!!busy} className="btn btn-secondary h-12 px-5 py-0">
            Build a different version
          </button>
          <span className="text-[0.85rem] text-fg-muted">Phase 1 goes to Now, the rest waits its turn.</span>
        </div>
      </div>
    );
  }

  return null;
}
