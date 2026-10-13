'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { Icon } from '@/components/ui';
import { BlueprintPicker } from '@/components/lesson/BlueprintPicker';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, isDefaultBlueprint, type LessonKind } from '@/lib/lessonKinds';
import type { BlockType } from '@/lib/lessonBlocks';
import { INTENTS, SIZES, guessIntent, intentByKey, planStart, sizesFor, topicRequest, type SizeKey } from '@/lib/startLearning';

/**
 * Start learning: what, what for, how big. The page shows what you would get
 * before anything is created, then either creates it (one lesson, or an
 * open-ended topic) or hands over to the course builder or the plan wizard
 * with your answers filled in.
 */

const AREAS = ['Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];

const choice = (on: boolean) =>
  `flex flex-col items-start gap-1 rounded-xl px-4 py-3.5 text-left ${on ? 'border-2 border-ink bg-surface' : 'border-[1.5px] border-line hover:border-line-hover'}`;

export interface StartLearningInitial {
  title?: string;
  why?: string;
  area?: string;
  pickedIntent?: string | null;
  pickedSize?: SizeKey;
}

/** `initial` only seeds the form (used by tests and previews); the page passes nothing. */
export function StartLearning({ initial }: { initial?: StartLearningInitial } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [why, setWhy] = useState(initial?.why ?? '');
  const [area, setArea] = useState(initial?.area ?? 'Tech');
  const [pickedIntent, setPickedIntent] = useState<string | null>(initial?.pickedIntent ?? null);
  const [pickedSize, setPickedSize] = useState<SizeKey>(initial?.pickedSize ?? 'lesson');
  const [bp, setBp] = useState<{ kind: LessonKind; value: BlockType[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until you choose a purpose yourself, the title suggests one.
  const suggested = guessIntent(title);
  const intent = (pickedIntent ? intentByKey(pickedIntent) : undefined) ?? suggested;
  const sizes = intent ? sizesFor(intent) : [];
  const size: SizeKey = sizes.includes(pickedSize) ? pickedSize : 'lesson';

  const kind = intent?.kind;
  const sectionChoice: BlockType[] = kind ? (bp && bp.kind === kind ? bp.value : [...KIND_DEFAULT_BLOCKS[kind]]) : [];
  const customSections = kind && size === 'lesson' && sectionChoice.length > 0 && !isDefaultBlueprint(kind, sectionChoice);

  const plan = intent && title.trim() ? planStart({ title, intent, size, why: why.trim() || undefined, blueprint: customSections ? sectionChoice : undefined }) : null;

  const create = async (wantNow: boolean) => {
    if (!plan || plan.type !== 'create') return;
    setCreating(true);
    setError(null);
    const send = (status: 'active' | 'queued') =>
      fetch('/api/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(topicRequest(plan, { area, why, status })) });
    try {
      let res = await send(wantNow ? 'active' : 'queued');
      let queued = !wantNow;
      if (wantNow && res.status === 400) {
        const d = await res.clone().json().catch(() => ({}));
        if (/active limit/i.test(d.error || '')) {
          res = await send('queued');
          queued = true;
        }
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setError(data?.error || 'Couldn’t create it.');
        return;
      }
      toast.success(queued ? `“${plan.title}” is in Next.` : `“${plan.title}” is in Now.`);
      router.push(plan.redirect === 'notes' ? '/notes' : `/topics/${data.id}`);
    } catch {
      setError('Couldn’t reach the server.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="learn-flow mx-auto flex max-w-[760px] flex-col gap-10">
      <Link href="/plan" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Learn
      </Link>

      <div className="flex flex-col gap-3">
        <label htmlFor="what" className="font-serif text-[2.4rem] font-normal leading-tight">What do you want to learn?</label>
        <input id="what" className="form-input h-14 text-[1.2rem]" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Choosing a tech stack, Spanish verbs, Build a URL shortener" autoFocus />
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="why" className="text-[0.9rem] font-semibold text-fg-secondary">Why now? <span className="font-normal text-fg-muted">optional</span></label>
            <input id="why" className="form-input h-11 py-0" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. a decision I need to make this month" />
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
        <legend className="mb-3 p-0 text-[1.15rem] font-semibold">What for?</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {INTENTS.map((i) => (
            <button key={i.key} type="button" aria-pressed={intent?.key === i.key} onClick={() => { setPickedIntent(i.key); setBp(null); }} className={choice(intent?.key === i.key)}>
              <span className="text-[1rem] font-semibold">{i.label}</span>
              <span className="text-[0.85rem] text-fg-secondary">{i.hint}</span>
            </button>
          ))}
        </div>
        {!pickedIntent && suggested && title.trim() && (
          <p className="m-0 text-[0.9rem] text-fg-muted">That reads like “{suggested.label}”, so we picked it. Change it if not.</p>
        )}
      </fieldset>

      {intent && (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[1.15rem] font-semibold">How big?</legend>
          <div className={`grid gap-2.5 ${sizes.length > 3 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {SIZES.filter((s) => sizes.includes(s.key)).map((s) => (
              <button key={s.key} type="button" aria-pressed={size === s.key} onClick={() => setPickedSize(s.key)} className={choice(size === s.key)}>
                <span className="text-[1rem] font-semibold">{s.key === 'ongoing' && intent.ongoing === 'practice' ? 'Daily practice' : s.key === 'ongoing' ? 'Collect ideas' : s.label}</span>
                <span className="text-[0.85rem] text-fg-secondary">{s.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {plan && kind && (
        <section aria-labelledby="get-h" className="glass-panel flex flex-col gap-4 p-6">
          <h2 id="get-h" className="m-0 text-[1.15rem] font-semibold">What you will get</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[0.98rem] leading-relaxed">
            {plan.preview.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          {size === 'lesson' && <BlueprintPicker allowed={KIND_BLOCKS[kind]} value={sectionChoice} onChange={(value) => setBp({ kind, value })} />}
        </section>
      )}

      {error && <p role="alert" className="m-0 text-[0.95rem] text-danger">{error}</p>}

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        {plan?.type === 'handoff' ? (
          <div className="flex flex-wrap gap-3">
            <Link href={plan.href} className="btn btn-primary h-12 px-6 py-0 text-[1rem] no-underline hover:no-underline">Continue</Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => create(true)} disabled={!plan || creating} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
              {creating ? 'Creating…' : 'Start now'}
            </button>
            <button type="button" onClick={() => create(false)} disabled={!plan || creating} className="btn btn-secondary h-12 px-6 py-0 text-[1rem]">Add to Next</button>
          </div>
        )}
        <span className="text-[0.875rem] text-fg-muted">
          {!title.trim() ? 'Type what you want to learn to see what you would get. ' : !intent ? 'Choose what it is for. ' : ''}
          If both Now slots are full, it goes to Next.{' '}
          <Link href="/learn/all" className="underline underline-offset-2">See everything you are learning</Link>
          {' · '}
          <Link href="/learn/program" className="underline underline-offset-2">Already know your goal? Go to the plan builder</Link>
          {" · "}
          <Link href="/learn/new" className="underline underline-offset-2">Use the older picker</Link>
        </span>
      </div>
    </div>
  );
}
