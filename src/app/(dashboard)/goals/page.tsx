'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import RoadmapWizard from '../RoadmapWizard';
import { Icon } from '@/components/ui';

/**
 * Goals: an outcome you want ("pass a backend interview"), broken into the
 * topics that get you there. Readiness is always "met of total", never a
 * percentage — see src/lib/goalReadiness.ts.
 */

interface GoalRow {
  id: string;
  title: string;
  outcome: string;
  status: string;
  targetDate: string | null;
  readinessMet: number;
  readinessTotal: number;
  _count?: { links: number };
}

const STATUS_WORD: Record<string, string> = {
  draft: 'Draft',
  active: 'Working on it',
  achieved: 'Achieved',
  abandoned: 'Let go',
  paused: 'Paused',
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) setGoals(await res.json());
    } catch (e) {
      console.error('Failed to load goals:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Goals</h1>
          <p className="m-0 max-w-[560px] text-[1.05rem] text-fg-secondary">
            An outcome you want, broken into the topics that get you there — and how many of them are ready.
          </p>
        </div>
        <button type="button" onClick={() => setWizard(true)} className="btn btn-primary h-11 py-0">
          <Icon name="plus" size={16} /> Start a goal
        </button>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">{[110, 110].map((h, i) => <div key={i} className="skeleton rounded-md" style={{ height: h }} />)}</div>
      ) : goals.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl bg-sunk p-7">
          <h2 className="m-0 font-serif text-[1.6rem] font-normal">No goals yet</h2>
          <p className="m-0 max-w-[520px] text-[1rem] text-fg-secondary">
            Describe where you want to be — “pass a senior backend interview by June”. You’ll get a roadmap of topics to learn, each tracked on its own.
          </p>
          <button type="button" onClick={() => setWizard(true)} className="btn btn-secondary">Start a goal</button>
        </section>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {goals.map((g) => (
            <li key={g.id}>
              <Link href={`/goals/${g.id}`} className="glass-panel flex flex-col gap-3 p-6 no-underline hover:border-line-hover hover:no-underline">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-serif text-[1.5rem] font-medium leading-tight text-fg">{g.title}</span>
                  <span className="text-[0.85rem] text-fg-muted">
                    {STATUS_WORD[g.status] ?? g.status}
                    {g.targetDate && ` · by ${new Date(g.targetDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
                  </span>
                </div>
                {g.outcome && <p className="m-0 text-[0.95rem] text-fg-secondary">{g.outcome}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  {g.readinessTotal > 0 ? (
                    <>
                      <span className="flex gap-1" aria-hidden="true">
                        {Array.from({ length: g.readinessTotal }, (_, i) => (
                          <span key={i} className={`h-4 w-4 rounded-[4px] ${i < g.readinessMet ? 'bg-ink' : 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]'}`} />
                        ))}
                      </span>
                      <span className="text-[0.9rem] font-semibold text-fg">{g.readinessMet} of {g.readinessTotal} ready</span>
                    </>
                  ) : (
                    <span className="text-[0.9rem] text-fg-muted">No topics linked yet</span>
                  )}
                  {g._count && g._count.links > 0 && <span className="text-[0.85rem] text-fg-muted">· {g._count.links} topics</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {wizard && (
        <RoadmapWizard
          onClose={() => setWizard(false)}
          onComplete={() => {
            setWizard(false);
            fetchGoals();
          }}
        />
      )}
    </div>
  );
}
