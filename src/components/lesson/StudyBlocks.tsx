'use client';

import React, { useState } from 'react';
import type { KeyIdeasBlock, MemoryListBlock, QuestionPatternsBlock, RoutineBlock, StepsBlock, StudyGuideBlock } from '@/lib/lessonBlocks';

/**
 * The sections for learning by doing, memorising, preparing and exploring.
 * Like every lesson section they use no colour: structure, weight and
 * numbering carry the meaning.
 */

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-[1.15rem] font-semibold">{children}</h3>;
}

function Note({ children }: { children?: string }) {
  return children ? <p className="m-0 text-[0.85rem] text-fg-muted">{children}</p> : null;
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">{children}</span>;
}

function Questions({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <SmallLabel>{label}</SmallLabel>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.95rem] leading-snug">
        {items.map((q, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="shrink-0 text-fg-muted">?</span><span>{q}</span></li>)}
      </ul>
    </div>
  );
}

export function Steps({ block }: { block: StepsBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <ol className="m-0 flex list-none flex-col p-0">
        {block.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[2rem_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink text-[0.8rem] font-semibold">{i + 1}</span>
              {i < block.steps.length - 1 && <span aria-hidden="true" className="w-px flex-1 bg-line-strong" />}
            </div>
            <div className="flex flex-col gap-1.5 pb-6">
              <p className="m-0 text-[1rem] font-semibold">{s.title}</p>
              <p className="m-0 text-[0.95rem] leading-relaxed">{s.instruction}</p>
              {s.check && <p className="m-0 text-[0.9rem] leading-snug text-fg-secondary"><span className="font-semibold">You will know it worked when: </span>{s.check}</p>}
              {s.snag && <p className="m-0 text-[0.9rem] leading-snug text-fg-secondary"><span className="font-semibold">If it goes wrong: </span>{s.snag}</p>}
            </div>
          </li>
        ))}
      </ol>
      <Note>{block.note}</Note>
    </section>
  );
}

const SHADE = [1, 0.7, 0.5, 0.35, 0.22, 0.15];

export function Routine({ block }: { block: RoutineBlock }) {
  const total = block.parts.reduce((n, p) => n + p.minutes, 0);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <Heading>{block.title}</Heading>
        <span className="text-[0.9rem] text-fg-secondary">about {total} minutes</span>
      </div>
      {/* The session at a glance: each part's share of the time, told apart by shade and number. */}
      <div className="flex h-3 w-full overflow-hidden rounded-sm" role="img" aria-label={block.parts.map((p) => `${p.label}, ${p.minutes} minutes`).join('; ')}>
        {block.parts.map((p, i) => <div key={i} className="h-full bg-ink" style={{ width: `${(p.minutes / total) * 100}%`, opacity: SHADE[i % SHADE.length], borderRight: i < block.parts.length - 1 ? '2px solid var(--bg-base)' : undefined }} />)}
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {block.parts.map((p, i) => (
          <li key={i} className="flex flex-col gap-1 rounded-xl border border-line p-4">
            <p className="m-0 text-[1rem] font-semibold">
              <span aria-hidden="true" className="mr-2 text-fg-muted">{i + 1}.</span>{p.label}
              <span className="ml-2 text-[0.85rem] font-normal text-fg-muted">{p.minutes} min</span>
            </p>
            <p className="m-0 text-[0.95rem] leading-relaxed">{p.instruction}</p>
            {p.target && <p className="m-0 text-[0.9rem] text-fg-secondary"><span className="font-semibold">Target: </span>{p.target}</p>}
          </li>
        ))}
      </ol>
      <Note>{block.note}</Note>
    </section>
  );
}

export function MemoryList({ block }: { block: MemoryListBlock }) {
  const [hidden, setHidden] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const toggleHidden = () => { setHidden(!hidden); setShown(new Set()); };
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>{block.title}</Heading>
        <button type="button" onClick={toggleHidden} aria-pressed={hidden} className="h-8 rounded-full border border-line px-3 text-[0.85rem] font-medium hover:border-line-hover">
          {hidden ? 'Show the answers' : 'Hide the answers to test yourself'}
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {block.items.map((it, i) => {
          const covered = hidden && !shown.has(i);
          return (
            <li key={i} className="grid gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[minmax(120px,32%)_1fr]">
              <span className="text-[0.95rem] font-semibold">{it.term}</span>
              <div className="flex flex-col gap-0.5">
                {covered ? (
                  <button type="button" onClick={() => setShown(new Set(shown).add(i))} className="w-fit text-left text-[0.9rem] text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                    Recall it, then tap to check
                  </button>
                ) : (
                  <>
                    <span className="text-[0.95rem] leading-snug">{it.meaning}</span>
                    {it.hook && <span className="text-[0.85rem] italic text-fg-secondary">Memory aid: {it.hook}</span>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Note>{block.note}</Note>
    </section>
  );
}

export function QuestionPatterns({ block }: { block: QuestionPatternsBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        {block.patterns.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <h4 className="m-0 text-[1rem] font-semibold">{p.name}</h4>
            <p className="m-0 text-[0.92rem] leading-snug">{p.asked}</p>
            {p.trap && <p className="m-0 text-[0.88rem] leading-snug text-fg-secondary"><span className="font-semibold">Trap: </span>{p.trap}</p>}
            {p.tip && <p className="m-0 text-[0.88rem] leading-snug text-fg-secondary"><span className="font-semibold">Tip: </span>{p.tip}</p>}
          </div>
        ))}
      </div>
      <Note>{block.note}</Note>
    </section>
  );
}

const RESOURCE_WORD: Record<StudyGuideBlock['resource']['kind'], string> = { book: 'Book', course: 'Course', video: 'Video', article: 'Article', other: 'Resource' };

export function StudyGuide({ block }: { block: StudyGuideBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="flex flex-wrap items-center gap-3 text-[0.9rem]">
        <span><span className="font-semibold">{RESOURCE_WORD[block.resource.kind]}: </span>{block.resource.title}</span>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[0.75rem] text-fg-secondary">
          {block.basis === 'real_structure' ? 'Based on its real structure' : 'Split by position: its exact chapters are not known here'}
        </span>
      </div>
      <Questions label="Before you start" items={block.before} />
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {block.parts.map((p, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <p className="m-0 text-[1rem] font-semibold"><span aria-hidden="true" className="mr-2 text-fg-muted">{i + 1}.</span>{p.label}</p>
            <p className="m-0 text-[0.95rem] leading-snug"><span className="font-semibold">Focus: </span>{p.focus}</p>
            <Questions label="Answer as you go" items={p.questions} />
          </li>
        ))}
      </ol>
      <Questions label="When you finish" items={block.after} />
      <Note>{block.note}</Note>
    </section>
  );
}

export function KeyIdeas({ block }: { block: KeyIdeasBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        {block.ideas.map((it, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
            <h4 className="m-0 text-[1rem] font-semibold">{it.idea}</h4>
            <p className="m-0 text-[0.92rem] leading-snug text-fg-secondary">{it.why}</p>
          </div>
        ))}
      </div>
      <Questions label="Things to wonder about" items={block.wonder} />
      <Note>{block.note}</Note>
    </section>
  );
}
