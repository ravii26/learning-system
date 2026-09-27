'use client';

import React from 'react';
import Link from 'next/link';
import type { ProgramView } from '@/lib/program/load';
import type { EvidenceStatus } from '@/lib/program/evidence';
import { describeRequirement, SHAPE_LABEL } from '@/lib/program/describe';
import { TARGET_LABEL } from '@/lib/program/why';
import type { Shape } from '@/lib/program/types';

/**
 * A goal's learning program: phases, their items (each an ordinary topic),
 * and for every checkpoint which competencies are proven and what evidence
 * is still missing. Never a percentage of "mastery".
 */

const STATUS: Record<EvidenceStatus, { label: string; cls: string }> = {
  ready: { label: 'Ready', cls: 'bg-ink text-on-ink' },
  in_progress: { label: 'In progress', cls: 'bg-fill-3 text-fg' },
  not_started: { label: 'Not started', cls: 'bg-fill-1 text-fg-muted' },
};
const TOPIC_WORD: Record<string, string> = { active: 'Now', queued: 'Next', inbox: 'Later', paused: 'Resting', maintenance: 'Ongoing', reference: 'Reference', dropped: 'Let go' };
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Chip({ status }: { status: EvidenceStatus }) {
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[0.75rem] font-semibold ${STATUS[status].cls}`}>{STATUS[status].label}</span>;
}

export default function ProgramPanel({ view }: { view: ProgramView }) {
  const { program, items, checkpoints, matrix, history } = view;
  const phases = Array.from(new Set(items.map((i) => i.phase))).sort((a, b) => a - b);
  const core = matrix.filter((r) => r.importance === 'core');
  const coreReady = core.filter((r) => r.status === 'ready').length;
  const current = checkpoints.find((c) => c.status !== 'ready')?.phase ?? null;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="stand-h" className="glass-panel flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stand-h" className="m-0 text-[1.15rem] font-semibold">Where you stand</h2>
          <span className="text-[0.85rem] text-fg-muted">
            {sentence(TARGET_LABEL[program.intake.target])} · {program.hoursPerWeek} h/week · about {program.totalWeeks} weeks · plan v{program.version}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex flex-wrap gap-1" aria-hidden="true">
            {core.map((r) => (
              <span key={r.key} title={r.title} className={`h-4 w-4 rounded-[4px] ${r.status === 'ready' ? 'bg-ink' : r.status === 'in_progress' ? 'bg-fill-4' : 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]'}`} />
            ))}
          </span>
          <span className="font-semibold">{coreReady} of {core.length} core topics proven</span>
        </div>
        <p className="m-0 text-[0.9rem] text-fg-secondary">
          {current ? <>You’re in <strong>Phase {current}</strong>. A topic counts as proven only when its evidence is in: quizzes, recall days later, problems solved cold, explanations, projects or practice.</>
            : <>Every checkpoint is met. Your evidence meets the “{TARGET_LABEL[program.intake.target]}” bar.</>}
        </p>
        <details>
          <summary className="cursor-pointer text-[0.9rem] font-semibold text-fg-secondary">Why this plan</summary>
          <p className="m-0 mt-2 text-[0.92rem] leading-relaxed text-fg-secondary">{program.whyThisPlan}</p>
        </details>
      </section>

      {phases.map((phase) => {
        const cp = checkpoints.find((c) => c.phase === phase);
        const phaseItems = items.filter((i) => i.phase === phase);
        const rows = matrix.filter((r) => cp?.competencyKeys.includes(r.key));
        return (
          <section key={phase} aria-labelledby={`phase-${phase}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`phase-${phase}`} className="m-0 text-[1.15rem] font-semibold">Phase {phase}: {phaseItems[0]?.phaseTitle}</h2>
              {cp && <Chip status={cp.status} />}
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {phaseItems.map((it) => (
                <li key={it.id} className="border-b border-line last:border-b-0">
                  {it.topic ? (
                    <Link href={`/topics/${it.topic.id}`} className="flex min-h-[56px] items-center justify-between gap-3 py-2.5 no-underline hover:no-underline">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold text-fg">{it.title}</span>
                        <span className="text-[0.82rem] text-fg-muted">
                          {SHAPE_LABEL[it.shape as Shape]} · {it.hoursPerWeek} h/week · {TOPIC_WORD[it.topic.status] ?? it.topic.status}
                        </span>
                      </span>
                      <span className="text-[0.85rem] text-fg-secondary">Open →</span>
                    </Link>
                  ) : (
                    <span className="flex min-h-[56px] flex-col justify-center py-2.5 text-fg-muted">{it.title} <span className="text-[0.82rem]">topic deleted</span></span>
                  )}
                </li>
              ))}
            </ul>
            {cp && rows.length > 0 && (
              <details className="rounded-xl bg-sunk px-4 py-3" open={phase === current}>
                <summary className="cursor-pointer text-[0.88rem] font-semibold">
                  Checkpoint: {rows.filter((r) => r.status === 'ready').length} of {rows.length} proven
                  {cp.metAt && <span className="font-normal text-fg-muted"> · met {new Date(cp.metAt).toLocaleDateString()}</span>}
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                  {rows.map((r) => (
                    <li key={r.key} className="flex flex-col gap-1">
                      <span className="flex items-center justify-between gap-2 text-[0.92rem]">
                        <span className="min-w-0">{r.title}</span>
                        <Chip status={r.status} />
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8rem]">
                        {r.required.map((req, i) => {
                          const ok = r.met.includes(req.kind);
                          return <span key={i} className={ok ? 'text-fg-secondary' : 'text-fg-muted'}>{ok ? '✓' : '○'} {describeRequirement(req)}</span>;
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}

      {history.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-[1rem] font-semibold text-fg-secondary">Plan history · {history.length} version{history.length === 1 ? '' : 's'}</summary>
          <ol className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {history.slice().reverse().map((h) => (
              <li key={h.version} className="text-[0.9rem]">
                <span className="font-semibold">v{h.version}</span>
                <span className="text-fg-muted"> · {new Date(h.createdAt).toLocaleDateString()}</span>
                <span className="text-fg-secondary"> · {h.reason}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
