'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ButtonLink, KNOWLEDGE_LABEL, KnowledgeStrip, Sparkline, knowledgeSummary } from '@/components/ui';
import { formatDuration } from '@/lib/timeSummary';
import type { Knowledge } from '@/lib/moduleState';

/**
 * Where you stand. Answers three questions from evidence only — nothing
 * here is typed in by hand, and there's no score without its reason:
 *   what do I know solidly, what's slipping, and what hasn't landed yet?
 * Course topics are shown per module, collected-idea topics per idea,
 * practice topics as a trend. Nothing without a finish line gets a %.
 */

interface Item {
  id: string;
  title: string;
  state: Knowledge;
  reason: string;
}

interface TopicProgress {
  id: string;
  title: string;
  area: string;
  status: string;
  mode: string;
  seconds30: number;
  secondsAll: number;
  quizAvg: number | null;
  quizCount: number;
  cardsDue: number;
  problems: { cold: number; hint: number; stuck: number };
  knowledge: { unit: 'module' | 'idea'; counts: Record<Knowledge, number>; states: Knowledge[]; items: Item[] } | null;
  practice: { reps: number; recentScores: number[] };
}

interface Goal {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  readinessMet: number;
  readinessTotal: number;
  /** The criteria list itself (lib/goalReadinessRecompute.ts stores it as an array). */
  readinessBreakdown: Array<{ topicId: string; label: string; met: boolean }> | null;
}

interface TimeSummary {
  totalSeconds: number;
  daily: Array<{ date: string; seconds: number }>;
  byTopic: Array<{ topicId: string; seconds: number }>;
}

const STATUS_WORD: Record<string, string> = {
  active: 'Now',
  queued: 'Next',
  paused: 'Resting',
  maintenance: 'Keeping fresh',
  reference: 'Reference',
  inbox: 'Inbox',
};

const KIND: Record<string, string> = {
  syllabus: 'Course',
  accretion: 'Ideas you collect',
  practice: 'Daily practice',
  reference: 'Reference',
};

const LEGEND: Array<{ state: Knowledge; text: string }> = [
  { state: 'solid', text: 'passed a check and recalled at spaced intervals' },
  { state: 'learning', text: 'studied, not proven yet' },
  { state: 'fading', text: 'known once, now slipping' },
  { state: 'unseen', text: 'still ahead' },
];

const SWATCH: Record<Knowledge, string> = {
  solid: 'bg-k-solid',
  learning: 'bg-k-learning',
  fading: 'bg-k-fading',
  unseen: 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]',
};

const HEAT = ['var(--bg-sunk)', 'var(--fill-4)', 'var(--border-strong)', 'var(--color-text-muted)', 'var(--ink)'];
const heatLevel = (seconds: number) => {
  const m = seconds / 60;
  return m === 0 ? 0 : m < 25 ? 1 : m < 50 ? 2 : m < 80 ? 3 : 4;
};

const isShaky = (i: Item) => i.state === 'learning' && /^Last (quiz|explanation)/.test(i.reason);

export default function WhereYouStandPage() {
  const [topics, setTopics] = useState<TopicProgress[] | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [time, setTime] = useState<TimeSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    Promise.all([
      fetch('/api/progress').then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`/api/time/summary?days=84&tz=${tz}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/goals').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([p, t, g]) => {
        setTopics(p.topics);
        setTime(t);
        setGoals(Array.isArray(g) ? g.filter((x: Goal) => x.status === 'active') : []);
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 py-10">
        <h1 className="m-0 font-serif text-[2.2rem] font-normal">Couldn’t load where you stand.</h1>
        <p className="m-0 text-fg-secondary">Refresh the page to try again.</p>
      </div>
    );
  }
  if (!topics) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
        {[120, 40, 260, 220].map((h, i) => <div key={i} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  const all = topics.flatMap((t) => t.knowledge?.states ?? []);
  const counts = all.reduce<Record<Knowledge, number>>((acc, s) => ((acc[s] += 1), acc), { solid: 0, learning: 0, fading: 0, unseen: 0 });
  const withEvidence = topics.filter(
    (t) => t.status === 'active' || t.secondsAll > 0 || (t.knowledge?.states.length ?? 0) > 0 || t.practice.reps > 0
  );

  const byArea = new Map<string, TopicProgress[]>();
  for (const t of withEvidence) byArea.set(t.area, [...(byArea.get(t.area) ?? []), t]);
  const areas = Array.from(byArea.entries()).sort((a, b) => b[1].length - a[1].length);

  const slipping = topics.flatMap((t) => (t.knowledge?.items ?? []).filter((i) => i.state === 'fading').map((i) => ({ ...i, topic: t })));
  const shaky = topics.flatMap((t) => (t.knowledge?.items ?? []).filter(isShaky).map((i) => ({ ...i, topic: t })));

  const daily = time?.daily ?? [];
  const weeks: Array<typeof daily> = [];
  for (let i = 0; i < daily.length; i += 7) weeks.push(daily.slice(i, i + 7));
  const studyDays = daily.filter((d) => d.seconds > 0).length;
  const areaOf = new Map(topics.map((t) => [t.id, t.area]));
  const areaSeconds = new Map<string, number>();
  for (const b of time?.byTopic ?? []) {
    const a = areaOf.get(b.topicId) ?? 'Other';
    areaSeconds.set(a, (areaSeconds.get(a) ?? 0) + b.seconds);
  }
  const areaTime = Array.from(areaSeconds.entries()).sort((a, b) => b[1] - a[1]);
  const areaTotal = areaTime.reduce((s, [, v]) => s + v, 0);

  const sentence = all.length === 0 ? null : (
    <>
      You know <span className="font-semibold text-k-solid">{counts.solid} thing{counts.solid === 1 ? '' : 's'} solidly</span>
      , are building <span className="font-semibold text-fg">{counts.learning}</span>
      {counts.fading > 0 && (
        <>
          , and <span className="font-semibold text-k-fading-text">{counts.fading} {counts.fading === 1 ? 'is' : 'are'} starting to fade</span>
        </>
      )}
      .{counts.unseen > 0 && ` ${counts.unseen} ${counts.unseen === 1 ? 'is' : 'are'} still ahead.`}
    </>
  );

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-12">
      <header className="flex flex-col gap-3.5">
        <h1 className="m-0 font-serif text-[2.8rem] font-normal leading-[1.08] tracking-[-0.02em]">Where you stand</h1>
        <p className="m-0 max-w-[760px] font-serif text-[1.45rem] leading-relaxed text-fg-secondary">
          {sentence ?? 'Nothing measured yet. Study a module, take its check, and review its cards — this page fills in from what you actually do.'}
        </p>
      </header>

      {all.length > 0 && (
        <section aria-label="Everything you’re learning, by state" className="flex flex-col gap-3.5">
          <div className="flex h-5 gap-[3px] overflow-hidden rounded-md" aria-hidden="true">
            {(['solid', 'learning', 'fading', 'unseen'] as Knowledge[]).map((s) =>
              counts[s] ? <span key={s} className={`block ${SWATCH[s]}`} style={{ flexGrow: counts[s] }} /> : null
            )}
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2 text-[0.875rem] text-fg-secondary">
            {LEGEND.map((l) => (
              <span key={l.state} className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-[3px] ${SWATCH[l.state]}`} aria-hidden="true" />
                <strong className="font-semibold text-fg">{KNOWLEDGE_LABEL[l.state]}</strong> {l.text}
              </span>
            ))}
          </div>
        </section>
      )}

      {areas.length > 0 ? (
        <section aria-labelledby="map-h" className="flex flex-col gap-8">
          <h2 id="map-h" className="m-0 text-[1.25rem] font-semibold">Your map</h2>
          {areas.map(([area, list]) => (
            <div key={area} className="flex flex-col">
              <h3 className="m-0 border-b border-line pb-2.5 font-serif text-[1.5rem] font-medium">{area}</h3>
              {list.map((t) => {
                const k = t.knowledge;
                const isPractice = t.mode === 'practice';
                const status = isPractice
                  ? `${t.practice.reps} rep${t.practice.reps === 1 ? '' : 's'}`
                  : k && k.states.length
                    ? knowledgeSummary(k.states)
                    : t.mode === 'syllabus'
                      ? 'No roadmap yet'
                      : 'No ideas in review yet';
                const extra = [
                  t.problems.cold ? `${t.problems.cold} solved cold` : null,
                  t.quizCount ? `quizzes avg ${Math.round((t.quizAvg ?? 0) * 100)}%` : null,
                  t.seconds30 ? `${formatDuration(t.seconds30)} this month` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <div key={t.id} className="grid items-center gap-x-6 gap-y-2 border-b border-line py-4 md:grid-cols-[220px_minmax(0,1fr)_200px]">
                    <div className="flex flex-col">
                      <Link href={`/topics/${t.id}`} className="text-[1rem] font-semibold text-fg">{t.title}</Link>
                      <span className="text-[0.82rem] text-fg-muted">{KIND[t.mode] ?? 'Topic'} · {STATUS_WORD[t.status] ?? t.status}</span>
                    </div>
                    <div className="min-w-0">
                      {isPractice ? (
                        t.practice.recentScores.length > 1 ? (
                          <Sparkline
                            values={t.practice.recentScores.map((v) => Math.round(v * 100))}
                            width={260}
                            height={32}
                            color="var(--ink)"
                            label={`Practice scores, last ${t.practice.recentScores.length} reps`}
                          />
                        ) : (
                          <span className="text-[0.875rem] text-fg-muted">A trend appears after a couple of reps.</span>
                        )
                      ) : k && k.states.length ? (
                        <KnowledgeStrip states={k.states} size="lg" />
                      ) : (
                        <span className="text-[0.875rem] text-fg-muted">
                          {t.mode === 'syllabus' ? 'Build a roadmap to start measuring.' : 'Ideas you keep from your Notebook show up here.'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col text-[0.875rem]">
                      <span className="text-fg-secondary">{status}</span>
                      {extra && <span className="text-[0.8rem] text-fg-muted">{extra}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ) : (
        <section className="flex flex-col items-start gap-3">
          <p className="m-0 text-fg-secondary">No topics with study yet.</p>
          <ButtonLink href="/?new=1">Learn something new</ButtonLink>
        </section>
      )}

      {(slipping.length > 0 || shaky.length > 0) && (
        <div className="grid gap-8 md:grid-cols-2">
          <section aria-labelledby="slip-h" className="glass-panel flex flex-col gap-4 p-7">
            <div className="flex flex-col gap-1">
              <h2 id="slip-h" className="m-0 text-[1.15rem] font-semibold">Slipping away</h2>
              <p className="m-0 text-[0.95rem] text-fg-secondary">You knew these once. A few minutes now saves relearning them later.</p>
            </div>
            {slipping.length === 0 ? (
              <p className="m-0 text-[0.95rem] text-fg-muted">Nothing is slipping.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {slipping.slice(0, 6).map((i) => (
                  <li key={`${i.topic.id}-${i.id}`} className="flex min-h-[52px] items-center gap-3 border-b border-line last:border-b-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-k-fading" aria-hidden="true" />
                    <span className="flex-1 text-[0.95rem] font-medium">{i.title}</span>
                    <span className="text-[0.82rem] text-fg-muted">{i.topic.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {slipping.length > 0 && (
              <ButtonLink href="/review" variant="primary" size="lg" className="self-start">
                Review {slipping.length > 6 ? 'them' : `these ${slipping.length}`}
              </ButtonLink>
            )}
          </section>

          <section aria-labelledby="shaky-h" className="glass-panel flex flex-col gap-4 p-7">
            <div className="flex flex-col gap-1">
              <h2 id="shaky-h" className="m-0 text-[1.15rem] font-semibold">Shaky ground</h2>
              <p className="m-0 text-[0.95rem] text-fg-secondary">You studied these, but your quiz or explanation says they haven’t landed yet.</p>
            </div>
            {shaky.length === 0 ? (
              <p className="m-0 text-[0.95rem] text-fg-muted">Nothing shaky right now.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {shaky.slice(0, 6).map((i) => (
                  <li key={`${i.topic.id}-${i.id}`} className="flex min-h-[60px] items-center gap-3 border-b border-line last:border-b-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[0.95rem] font-medium">{i.title}</span>
                      <span className="truncate text-[0.82rem] text-fg-muted">{i.topic.title} · {i.reason}</span>
                    </div>
                    <ButtonLink href={`/topics/${i.topic.id}?module=${encodeURIComponent(i.id)}`} size="sm">Restudy</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-10 md:grid-cols-2">
        {time && (
          <section aria-labelledby="time-h" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 id="time-h" className="m-0 text-[1.15rem] font-semibold">Time you gave</h2>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-serif text-[2.4rem] leading-none">{formatDuration(time.totalSeconds)}</span>
                <span className="text-[0.875rem] text-fg-muted">over 12 weeks, on {studyDays} day{studyDays === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className="flex gap-1" role="img" aria-label={`Study time per day over the last 12 weeks; ${studyDays} days with study`}>
              {weeks.map((w, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {w.map((d) => (
                    <span
                      key={d.date}
                      title={`${new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${formatDuration(d.seconds)}`}
                      className="block h-[18px] w-[18px] rounded-[4px]"
                      style={{ background: HEAT[heatLevel(d.seconds)] }}
                    />
                  ))}
                </div>
              ))}
            </div>
            {areaTotal > 0 && (
              <div className="flex flex-col gap-2.5">
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                  {areaTime.map(([a, v], i) => (
                    <span key={a} className="block" style={{ flexGrow: v, background: HEAT[Math.max(1, 4 - i)] }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem] text-fg-secondary">
                  {areaTime.map(([a, v], i) => (
                    <span key={a} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEAT[Math.max(1, 4 - i)] }} aria-hidden="true" />
                      {a} <strong className="font-semibold text-fg">{formatDuration(v)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="goals-h" className="flex flex-col gap-4">
          <h2 id="goals-h" className="m-0 text-[1.15rem] font-semibold">Goals</h2>
          {goals.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="m-0 text-[0.95rem] text-fg-secondary">A goal ties topics together — “pass a backend interview” — and shows what’s left to prove.</p>
              <ButtonLink href="/goals" size="sm">Set a goal</ButtonLink>
            </div>
          ) : (
            goals.map((g) => {
              const unmet = (Array.isArray(g.readinessBreakdown) ? g.readinessBreakdown : []).filter((c) => !c.met);
              return (
                <Link key={g.id} href={`/goals/${g.id}`} className="glass-panel flex flex-col gap-3.5 p-6 no-underline hover:no-underline">
                  <div className="flex flex-col gap-0.5">
                    {g.targetDate && (
                      <span className="text-[0.82rem] text-fg-muted">
                        by {new Date(g.targetDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                      </span>
                    )}
                    <span className="font-serif text-[1.5rem] font-medium text-fg">{g.title}</span>
                  </div>
                  {g.readinessTotal > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="flex gap-1" aria-hidden="true">
                        {Array.from({ length: g.readinessTotal }, (_, i) => (
                          <span key={i} className={`h-[18px] w-[18px] rounded-[4px] ${i < g.readinessMet ? 'bg-ink' : 'shadow-[inset_0_0_0_1.5px_var(--k-unseen)]'}`} />
                        ))}
                      </span>
                      <span className="text-[0.95rem] font-semibold text-fg">{g.readinessMet} of {g.readinessTotal} ready</span>
                    </div>
                  )}
                  {unmet.length > 0 && (
                    <div className="flex flex-col gap-1 text-[0.9rem] text-fg-secondary">
                      <span className="font-semibold text-fg-muted">Still to prove</span>
                      {unmet.slice(0, 4).map((c) => <span key={c.topicId}>{c.label}</span>)}
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </section>
      </div>

      <p className="m-0 text-[0.85rem] text-fg-muted">
        Looking for the skill tree? It’s still <Link href="/skills" className="underline underline-offset-2">here</Link>.
      </p>
    </div>
  );
}
