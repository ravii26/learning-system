'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { Icon, KnowledgeStrip } from '@/components/ui';
import type { Knowledge } from '@/lib/moduleState';

/**
 * Goal detail: the roadmap as a dependency-ordered path (GoalLinks,
 * ordered), readiness as criteria met/total with unmet criteria listed and
 * linked to the topic that closes each one — per the project plan's Fix on
 * Goal.readiness, never a bare percentage.
 */

interface LinkedTopic {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  area: string;
}

interface GoalLinkRow {
  id: string;
  order: number;
  required: boolean;
  topic: LinkedTopic | null;
}

interface ReadinessCriterion {
  topicId: string;
  label: string;
  met: boolean;
  reason?: string;
}

interface GoalDetail {
  id: string;
  title: string;
  outcome: string;
  why: string | null;
  status: string;
  targetDate: string | null;
  createdAt: string;
  links: GoalLinkRow[];
  readiness: { met: number; total: number; criteria: ReadinessCriterion[] };
}

const STATUS_OPTIONS = ['draft', 'active', 'paused', 'achieved', 'abandoned'];

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [knowledge, setKnowledge] = useState<Record<string, Knowledge[]>>({});

  useEffect(() => {
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setKnowledge(Object.fromEntries(p.topics.filter((t: any) => t.knowledge).map((t: any) => [t.id, t.knowledge.states]))))
      .catch(() => {});
  }, []);

  const fetchGoal = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals/${params.id}`);
      if (res.ok) {
        setGoal(await res.json());
      } else if (res.status === 404) {
        setGoal(null);
      }
    } catch (e) {
      console.error('Failed to load goal:', e);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  const handleStatusChange = async (status: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/goals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success('Goal updated');
        await fetchGoal();
      } else {
        toast.error('Failed to update goal');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-5">
        {[120, 220].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="mx-auto flex max-w-[860px] flex-col items-start gap-3 py-10">
        <p className="m-0 text-fg-secondary">This goal doesn’t exist, or it was deleted.</p>
        <Link href="/goals" className="btn btn-secondary">Back to Goals</Link>
      </div>
    );
  }

  const unmet = goal.readiness.criteria.filter((c) => !c.met);
  const orderedLinks = [...goal.links].sort((a, b) => a.order - b.order);
  const STATUS_WORD: Record<string, string> = { draft: 'Draft', active: 'Working on it', paused: 'Paused', achieved: 'Achieved', abandoned: 'Let go' };
  const TOPIC_WORD: Record<string, string> = { active: 'Now', queued: 'Next', inbox: 'Inbox', paused: 'Resting', maintenance: 'Keeping fresh', reference: 'Reference', dropped: 'Let go' };

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9">
      <Link href="/goals" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
        <Icon name="arrowLeft" size={16} /> Goals
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex max-w-[620px] flex-col gap-2">
          {goal.targetDate && (
            <span className="text-[0.9rem] text-fg-muted">by {new Date(goal.targetDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          )}
          <h1 className="m-0 font-serif text-[2.5rem] font-normal leading-[1.1] tracking-[-0.015em]">{goal.title}</h1>
          <p className="m-0 font-serif text-[1.2rem] italic text-fg-secondary">“{goal.outcome}”</p>
          {goal.why && <p className="m-0 text-[0.95rem] text-fg-muted">{goal.why}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-status" className="text-[0.85rem] font-semibold text-fg-secondary">Status</label>
          <select id="goal-status" value={goal.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={updatingStatus} className="form-input h-10 w-auto py-0">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_WORD[s] ?? s}</option>)}
          </select>
        </div>
      </header>

      <section aria-labelledby="ready-h" className="glass-panel flex flex-col gap-4 p-7">
        <h2 id="ready-h" className="m-0 text-[1.15rem] font-semibold">How ready you are</h2>
        {goal.readiness.total > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: goal.readiness.total }, (_, i) => (
                  <span key={i} className={`h-5 w-5 rounded-[5px] ${i < goal.readiness.met ? 'bg-ink' : 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]'}`} />
                ))}
              </span>
              <span className="text-[1.05rem] font-semibold">{goal.readiness.met} of {goal.readiness.total} ready</span>
            </div>
            {unmet.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[0.9rem] font-semibold text-fg-muted">Still to prove</span>
                {unmet.map((c) => (
                  <Link key={c.topicId} href={`/topics/${c.topicId}`} className="flex min-h-[40px] items-center justify-between gap-3 border-b border-line text-[0.95rem] text-fg no-underline last:border-b-0 hover:no-underline">
                    <span className="flex flex-col py-1.5">{c.label}{c.reason && <span className="text-[0.82rem] text-fg-muted">{c.reason}</span>}</span>
                    <Icon name="chevronRight" size={16} className="text-fg-muted" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[0.95rem] text-fg-secondary">Every topic on the path is ready. Time to mark this achieved.</p>
            )}
          </>
        ) : (
          <p className="m-0 text-[0.95rem] text-fg-muted">No required topics yet.</p>
        )}
      </section>

      <section aria-labelledby="path-h" className="flex flex-col gap-3">
        <h2 id="path-h" className="m-0 text-[1.15rem] font-semibold">The path</h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {orderedLinks.map((link, idx) =>
            link.topic ? (
              <li key={link.id}>
                <Link href={`/topics/${link.topic.id}`} className="grid min-h-[64px] items-center gap-x-5 gap-y-1.5 border-b border-line py-3 no-underline hover:no-underline md:grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)]">
                  <span className="font-serif text-[1.2rem] text-fg-muted">{idx + 1}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[1rem] font-semibold text-fg">{link.topic.title}</span>
                    <span className="text-[0.82rem] text-fg-muted">
                      {link.topic.area} · {TOPIC_WORD[link.topic.status] ?? link.topic.status}{link.required ? '' : ' · optional'}
                    </span>
                  </span>
                  {(knowledge[link.topic.id]?.length ?? 0) > 0 ? (
                    <KnowledgeStrip states={knowledge[link.topic.id]} size="sm" />
                  ) : (
                    <span className="text-[0.82rem] text-fg-muted">Not started</span>
                  )}
                </Link>
              </li>
            ) : null
          )}
        </ol>
      </section>
    </div>
  );
}
