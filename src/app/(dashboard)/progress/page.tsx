'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ButtonLink, Card, CardLabel, EmptyState, KnowledgeMark, KNOWLEDGE_LABEL, Sparkline, StatPill } from '@/components/ui';
import type { Knowledge } from '@/lib/moduleState';
import { formatDuration } from '@/lib/timeSummary';

interface TopicProgress {
  id: string;
  title: string;
  area: string;
  status: string;
  mode: string;
  seconds30: number;
  secondsAll: number;
  modulesTotal: number;
  modulesDone: number;
  quizCount: number;
  quizAvg: number | null;
  challenges: { correct: number; partial: number; incorrect: number };
  cardsTotal: number;
  cardsDue: number;
  lastActivity: string | null;
  problems: { cold: number; hint: number; stuck: number };
  knowledge: {
    unit: 'module' | 'idea';
    counts: Record<Knowledge, number>;
    states: Knowledge[];
  } | null;
}

const STATE_ORDER: Knowledge[] = ['solid', 'learning', 'fading', 'unseen'];
const CELL: Record<Knowledge, string> = {
  solid: 'bg-k-solid',
  learning: 'bg-k-learning',
  fading: 'bg-k-fading',
  unseen: 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]',
};

interface TimeMonth {
  totalSeconds: number;
  allTimeSeconds: number;
  daily: Array<{ date: string; seconds: number }>;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Now',
  queued: 'Next',
  paused: 'Resting',
  maintenance: 'Maintaining',
  reference: 'Reference',
  inbox: 'Inbox',
};

/**
 * Progress from evidence only: time you actually gave, modules finished,
 * quiz scores, challenge verdicts, and what's in review. Nothing here is
 * typed in by hand.
 */
export default function ProgressPage() {
  const [topics, setTopics] = useState<TopicProgress[] | null>(null);
  const [time, setTime] = useState<TimeMonth | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    Promise.all([
      fetch('/api/progress').then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`/api/time/summary?days=30&tz=${tz}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, t]) => {
        setTopics(p.topics);
        setTime(t);
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <EmptyState title="Could not load progress">Refresh the page to try again.</EmptyState>;
  }
  if (!topics) {
    return (
      <div className="flex max-w-[900px] flex-col gap-4">
        {[90, 140, 140].map((h, i) => <div key={i} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  const withEvidence = topics.filter(
    (t) => t.secondsAll > 0 || t.modulesDone > 0 || t.quizCount > 0 || t.cardsTotal > 0 || t.problems.cold + t.problems.hint + t.problems.stuck > 0 || t.status === 'active'
  );
  const quiet = topics.length - withEvidence.length;
  const minutesPerDay = time?.daily.map((d) => Math.round(d.seconds / 60)) ?? [];
  const activeDays = minutesPerDay.filter((m) => m > 0).length;

  return (
    <div className="flex max-w-[900px] flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="mt-1 text-[0.85rem] text-fg-secondary">
          Built only from what you did: time studied, modules finished, quiz and challenge results, and cards in review.
        </p>
      </div>

      {time && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardLabel>▸ Last 30 days</CardLabel>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-bold">{formatDuration(time.totalSeconds)}</span>
              <span className="text-[0.82rem] text-fg-secondary">on {activeDays} day{activeDays === 1 ? '' : 's'}</span>
              <span className="text-[0.82rem] text-fg-muted">all time {formatDuration(time.allTimeSeconds)}</span>
            </div>
          </div>
          <Sparkline
            values={minutesPerDay}
            width={220}
            height={36}
            label={`Minutes studied per day, last 30 days: ${minutesPerDay.join(', ')}`}
          />
        </Card>
      )}

      {withEvidence.length === 0 ? (
        <EmptyState title="No evidence yet" action={<ButtonLink href="/">Go to Today</ButtonLink>}>
          Open a topic, study a module, take its quiz or challenge — results collect here automatically.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {withEvidence.map((t) => {
            const modulePct = t.modulesTotal ? Math.round((t.modulesDone / t.modulesTotal) * 100) : 0;
            const verdicts = t.challenges.correct + t.challenges.partial + t.challenges.incorrect;
            return (
              <Link key={t.id} href={`/topics/${t.id}`} className="glass-card flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[0.95rem] font-bold">{t.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`badge badge-${t.area.toLowerCase()} text-[0.65rem]`}>{t.area}</span>
                      <StatPill label={STATUS_LABEL[t.status] ?? t.status} tone={t.status === 'active' ? 'primary' : 'neutral'} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[0.95rem] font-bold">{formatDuration(t.seconds30)}</div>
                    <div className="text-[0.68rem] text-fg-muted">30 days · {formatDuration(t.secondsAll)} total</div>
                  </div>
                </div>

                {t.knowledge && t.knowledge.states.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="flex flex-wrap gap-1"
                      role="img"
                      aria-label={`${t.knowledge.unit === 'module' ? 'Modules' : 'Ideas'}: ${STATE_ORDER.filter((s) => t.knowledge!.counts[s]).map((s) => `${t.knowledge!.counts[s]} ${KNOWLEDGE_LABEL[s].toLowerCase()}`).join(', ')}`}
                    >
                      {t.knowledge.states.map((s, i) => (
                        <span key={i} className={`h-3.5 w-3.5 rounded-[3px] ${CELL[s]}`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[0.72rem] text-fg-secondary">
                      {STATE_ORDER.filter((s) => t.knowledge!.counts[s] > 0).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5">
                          <KnowledgeMark state={s} />
                          {t.knowledge!.counts[s]} {KNOWLEDGE_LABEL[s].toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {t.problems.cold + t.problems.hint + t.problems.stuck > 0 && (
                  <div className="text-[0.75rem] text-fg-secondary">
                    Problems: <strong className="text-fg">{t.problems.cold}</strong> solved cold · {t.problems.hint} with a hint · {t.problems.stuck} stuck
                  </div>
                )}

                {t.modulesTotal > 0 && (
                  <div>
                    <div className="mb-1 flex justify-between text-[0.75rem] text-fg-secondary">
                      <span>Modules</span>
                      <span>{t.modulesDone}/{t.modulesTotal}</span>
                    </div>
                    <div className="progress-bar-mini">
                      <div className="progress-bar-mini-fill" style={{ width: `${Math.max(modulePct, 2)}%` }} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center text-[0.72rem]">
                  <div className="rounded-sm bg-sunk px-2 py-1.5">
                    <div className="text-[0.9rem] font-bold text-fg">
                      {t.quizAvg === null ? '—' : `${Math.round(t.quizAvg * 100)}%`}
                    </div>
                    <div className="text-fg-muted">{t.quizCount ? `avg of ${t.quizCount} quiz${t.quizCount === 1 ? '' : 'zes'}` : 'no quizzes'}</div>
                  </div>
                  <div className="rounded-sm bg-sunk px-2 py-1.5">
                    <div className="text-[0.9rem] font-bold">
                      {verdicts === 0 ? '—' : (
                        <>
                          <span className="text-success">{t.challenges.correct}</span>
                          <span className="text-fg-muted"> / </span>
                          <span className="text-warning">{t.challenges.partial}</span>
                          <span className="text-fg-muted"> / </span>
                          <span className="text-danger">{t.challenges.incorrect}</span>
                        </>
                      )}
                    </div>
                    <div className="text-fg-muted">{verdicts ? 'challenges ✓ / ~ / ✗' : 'no challenges'}</div>
                  </div>
                  <div className="rounded-sm bg-sunk px-2 py-1.5">
                    <div className="text-[0.9rem] font-bold text-fg">{t.cardsTotal}</div>
                    <div className={t.cardsDue > 0 ? 'text-warning' : 'text-fg-muted'}>
                      {t.cardsDue > 0 ? `${t.cardsDue} due now` : 'review cards'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {quiet > 0 && (
        <p className="text-[0.78rem] text-fg-muted">
          {quiet} other topic{quiet === 1 ? '' : 's'} with no study recorded yet — see the <Link href="/plan" className="text-primary-light">board</Link>.
        </p>
      )}
    </div>
  );
}
