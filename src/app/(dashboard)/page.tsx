'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { pickNextAction, type NextActionPick, type TopicForNextAction } from '@/lib/nextAction';
import { createCapture } from '@/lib/captureClient';
import { Button, ButtonLink, Icon, KnowledgeStrip, knowledgeSummary, type IconName } from '@/components/ui';
import { formatDuration } from '@/lib/timeSummary';
import type { Knowledge } from '@/lib/moduleState';
import ResurfacedNote from '@/components/ResurfacedNote';

/**
 * Today — the front door. It answers "what do I do now?" by deciding for
 * you and always saying why (lib/nextAction.ts): one session to start, the
 * review that protects what you already know, and a couple of optional
 * small things. Everything else is one click away in Learn, Review,
 * Notebook or You.
 */

interface Topic extends TopicForNextAction {
  area: string;
  mode: string;
  curriculum?: Array<{ id: string; order: number; title: string; completed: boolean }> | null;
}

interface TimeWeek {
  totalSeconds: number;
  todaySeconds: number;
  allTimeSeconds: number;
  daily: Array<{ date: string; seconds: number }>;
}

interface DueCard {
  lastRecalledAt: string | null;
}

interface TopicKnowledge {
  id: string;
  knowledge: { unit: 'module' | 'idea'; states: Knowledge[] } | null;
}

const WEEKLY_GOAL_SECONDS = 5 * 60 * 60;

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
}

function nextModule(topic: Topic | undefined) {
  const modules = [...(topic?.curriculum ?? [])].sort((a, b) => a.order - b.order);
  const index = modules.findIndex((m) => !m.completed);
  return index === -1 ? null : { module: modules[index], index, total: modules.length };
}

export default function TodayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [due, setDue] = useState<DueCard[]>([]);
  const [knowledge, setKnowledge] = useState<Record<string, Knowledge[]>>({});
  const [repLoggedToday, setRepLoggedToday] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [time, setTime] = useState<TimeWeek | null>(null);
  const [loading, setLoading] = useState(true);

  const [captureTitle, setCaptureTitle] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [quickStartTitle, setQuickStartTitle] = useState('');
  const [quickStarting, setQuickStarting] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [topicsRes, spacedRes, inboxRes, timeRes, progressRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/review/spaced'),
        fetch('/api/captures?status=inbox'),
        fetch(`/api/time/summary?days=7&tz=${new Date().getTimezoneOffset()}`),
        fetch('/api/progress'),
      ]);
      if (timeRes.ok) setTime(await timeRes.json());
      if (inboxRes.ok) {
        const inbox = await inboxRes.json();
        setInboxCount(Array.isArray(inbox) ? inbox.length : 0);
      }
      if (spacedRes.ok) setDue((await spacedRes.json()).dueConcepts ?? []);
      if (progressRes.ok) {
        const p: { topics: TopicKnowledge[] } = await progressRes.json();
        setKnowledge(Object.fromEntries(p.topics.filter((t) => t.knowledge).map((t) => [t.id, t.knowledge!.states])));
      }
      let allTopics: Topic[] = [];
      if (topicsRes.ok) {
        allTopics = await topicsRes.json();
        setTopics(allTopics);
      }
      if (allTopics.some((t) => t.mode === 'practice')) {
        const repsRes = await fetch('/api/practice-reps');
        if (repsRes.ok) {
          const reps: Array<{ occurredAt: string }> = await repsRes.json();
          const todayKey = new Date().toISOString().slice(0, 10);
          setRepLoggedToday(reps.some((r) => r.occurredAt.slice(0, 10) === todayKey));
        }
      }
    } catch (e) {
      console.error('Failed to load Today screen data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The global `C` hotkey (wired in HeaderToolbar) focuses the capture
  // input: a custom event when already here, ?focus=capture when arriving.
  useEffect(() => {
    const onFocusCapture = () => document.getElementById('quick-capture-input')?.focus();
    window.addEventListener('learning-os:focus-capture', onFocusCapture);
    return () => window.removeEventListener('learning-os:focus-capture', onFocusCapture);
  }, []);

  // The inputs only exist once loading is done, so wait for it.
  useEffect(() => {
    if (loading) return;
    if (searchParams.get('focus') === 'capture') {
      document.getElementById('quick-capture-input')?.focus();
      router.replace('/');
    } else if (searchParams.get('new') === '1') {
      const el = document.getElementById('learn-new-input');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      router.replace('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;
    setCapturing(true);
    try {
      const res = await createCapture(title);
      if (res.ok) {
        setCaptureTitle('');
        toast.success('Captured. It’s in your Notebook inbox with a suggested home.');
        await fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Couldn’t capture that');
      }
    } catch {
      toast.error('Couldn’t reach the server');
    } finally {
      setCapturing(false);
    }
  };

  const handleQuickStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickStartTitle.trim();
    if (!title) return;
    setQuickStarting(true);
    try {
      const create = (status: 'active' | 'queued') =>
        fetch('/api/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            area: 'Tech',
            status,
            depthTarget: 'Proficiency',
            why: `I want to learn ${title}`,
            nextAction: `Start studying ${title}`,
            currentStage: 'Fundamentals',
            mode: 'syllabus',
          }),
        });
      let res = await create('active');
      let queued = false;
      // Both "Now" slots taken: still create it and open it — just in Next.
      if (res.status === 400) {
        const data = await res.clone().json().catch(() => ({}));
        if (/active limit/i.test(data.error || '')) {
          res = await create('queued');
          queued = true;
        }
      }
      if (res.ok) {
        const created = await res.json();
        toast.success(queued ? `"${title}" added to Next — both Now slots are full. Building its roadmap…` : `Building a roadmap for "${title}"…`);
        setQuickStartTitle('');
        router.push(`/topics/${created.id}?autostart=1`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Couldn’t create the topic');
      }
    } catch {
      toast.error('Couldn’t reach the server');
    } finally {
      setQuickStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          {[96, 280, 96].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
        </div>
        <div className="hidden flex-col gap-6 lg:flex">
          {[200, 160].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
        </div>
      </div>
    );
  }

  const now = new Date();
  const activeTopics = topics.filter((t) => t.status === 'active');
  const pick: NextActionPick | null = pickNextAction(activeTopics);
  const pickTopic = topics.find((t) => t.id === pick?.topicId);
  const next = nextModule(pickTopic);
  const pickStates = pick ? knowledge[pick.topicId] ?? [] : [];
  const alternatives = activeTopics.filter((t) => t.id !== pick?.topicId);
  const slipping = due.filter((c) => c.lastRecalledAt).length;
  const reviewMinutes = Math.max(1, Math.ceil(due.length * 0.7));
  const hasPracticeTopic = topics.some((t) => t.mode === 'practice');

  const subline = pick && due.length
    ? 'One session and a short review make today count. Everything else is optional.'
    : pick
      ? 'One focused session makes today count.'
      : due.length
        ? 'A short review keeps what you already know.'
        : topics.length
          ? 'Nothing is due. Pick something from Learn, or capture what’s on your mind.'
          : 'Start with one thing you want to learn.';

  const extras: Array<{ title: string; meta: string; action: string; href: string; icon: IconName }> = [];
  if (hasPracticeTopic && !repLoggedToday) {
    extras.push({ title: '2-minute speaking rep', meta: 'Today’s prompt comes from what you’re studying', action: 'Start', href: '/practice', icon: 'mic' });
  }
  if (inboxCount > 0) {
    extras.push({
      title: `Sort ${inboxCount} capture${inboxCount === 1 ? '' : 's'}`,
      meta: `About ${Math.max(1, Math.ceil(inboxCount * 0.5))} min · each one already has a suggested home`,
      action: 'Sort',
      href: '/notes',
      icon: 'inbox',
    });
  }

  const week = time?.daily ?? [];
  const maxDay = Math.max(1, ...week.map((d) => d.seconds));

  return (
    <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-7">
        <header className="flex flex-col gap-2">
          <div className="text-[0.9rem] text-fg-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em] text-fg">{greeting(now)}</h1>
          <p className="m-0 text-[1.05rem] leading-relaxed text-fg-secondary">{subline}</p>
        </header>

        {topics.length === 0 && (
          <section aria-labelledby="first-h" className="glass-panel flex flex-col gap-4 p-7">
            <h2 id="first-h" className="m-0 font-serif text-[1.8rem] font-medium leading-tight">What do you want to learn?</h2>
            <p className="m-0 text-[0.95rem] text-fg-secondary">
              Type a subject — a technology, a field, a skill. You’ll get a roadmap you can trim, and you can skip anything you already know.
            </p>
            <form onSubmit={handleQuickStart} className="flex flex-col gap-2.5 sm:flex-row">
              <label htmlFor="learn-new-input" className="sr-only">Subject to learn</label>
              <input
                id="learn-new-input"
                type="text"
                className="form-input h-12 flex-1 text-[1rem]"
                placeholder="e.g. System design, Investing, Spoken English"
                value={quickStartTitle}
                onChange={(e) => setQuickStartTitle(e.target.value)}
                disabled={quickStarting}
                autoFocus
              />
              <Button type="submit" variant="primary" size="lg" disabled={quickStarting || !quickStartTitle.trim()}>
                {quickStarting ? 'Building…' : 'Build my roadmap'}
              </Button>
            </form>
            <p className="m-0 text-[0.85rem] text-fg-muted">
              Or <Link href="/goals" className="underline underline-offset-2">start from a goal</Link>, like “pass a backend interview”.
            </p>
          </section>
        )}

        {pick ? (
          <section aria-labelledby="next-h" className="glass-panel flex flex-col gap-6 p-7">
            <div className="flex flex-col gap-2.5">
              <div className="text-[0.9rem] text-fg-muted">
                Your next session · {pick.topicTitle}
                {next ? `, module ${next.index + 1} of ${next.total}` : ''}
              </div>
              <h2 id="next-h" className="m-0 font-serif text-[2.1rem] font-medium leading-[1.15] tracking-[-0.01em]">
                {next ? next.module.title : pick.nextAction}
              </h2>
              <p className={`m-0 text-[0.95rem] leading-relaxed ${pick.isStale ? 'text-k-fading-text' : 'text-fg-secondary'}`}>
                Picked because: {pick.reason}.
              </p>
            </div>
            {pickStates.length > 0 && <KnowledgeStrip states={pickStates} current={next?.index} showSummary />}
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={`/topics/${pick.topicId}`} variant="primary" size="lg">
                Start a 25-minute session <Icon name="arrowRight" size={16} />
              </ButtonLink>
              {alternatives.length > 0 && (
                <Button variant="ghost" onClick={() => setShowAlternatives((v) => !v)} aria-expanded={showAlternatives}>
                  {showAlternatives ? 'Hide other options' : 'Pick something else'}
                </Button>
              )}
            </div>
            {showAlternatives && (
              <ul className="m-0 flex list-none flex-col border-t border-line p-0 pt-2">
                {alternatives.map((t) => (
                  <li key={t.id}>
                    <Link href={`/topics/${t.id}`} className="flex min-h-[52px] items-center justify-between gap-3 text-[0.95rem] no-underline hover:no-underline">
                      <span className="font-semibold text-fg">{t.title}</span>
                      <span className="truncate text-[0.85rem] text-fg-muted">next: {nextModule(t)?.module.title ?? t.nextAction}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          topics.length > 0 && (
            <section className="glass-panel flex flex-col gap-3 p-7">
              <h2 className="m-0 text-[1.1rem] font-semibold">Nothing lined up to study</h2>
              <p className="m-0 text-[0.95rem] text-fg-secondary">
                None of your topics in Now has a next step. Open one in Learn, or move a topic from Next into Now.
              </p>
              <ButtonLink href="/plan" className="self-start">Open Learn</ButtonLink>
            </section>
          )
        )}

        {due.length > 0 ? (
          <section aria-labelledby="rev-h" className="glass-panel flex flex-wrap items-center gap-6 px-7 py-6">
            <div className="relative h-16 w-14 shrink-0" aria-hidden="true">
              <span className="absolute left-2.5 top-0 h-14 w-11 rounded-lg border border-line bg-sunk" />
              <span className="absolute left-1.5 top-1 h-14 w-11 rounded-lg border border-line bg-sunk" />
              <span className={`absolute left-0 top-2 h-14 w-11 rounded-lg border ${slipping ? 'border-k-fading bg-[var(--fill-2)]' : 'border-line bg-surface'}`} />
            </div>
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <h2 id="rev-h" className="m-0 text-[1.1rem] font-semibold">
                {due.length} card{due.length === 1 ? '' : 's'} to review · about {reviewMinutes} min
              </h2>
              <p className="m-0 text-[0.95rem] text-fg-secondary">
                {slipping > 0 ? (
                  <>
                    {slipping} {slipping === 1 ? 'is' : 'are'} <span className="font-semibold text-k-fading-text">slipping</span> — the most overdue go first.
                  </>
                ) : (
                  'Recalling them now is what makes them stick.'
                )}
              </p>
            </div>
            <ButtonLink href="/review">Review</ButtonLink>
          </section>
        ) : (
          topics.length > 0 && <p className="m-0 text-[0.95rem] text-fg-muted">No cards due. You’re keeping up with what you’ve learned.</p>
        )}

        {extras.length > 0 && (
          <section aria-labelledby="extra-h" className="flex flex-col">
            <h2 id="extra-h" className="m-0 mb-1 text-[0.95rem] font-semibold text-fg-secondary">If you have a few more minutes</h2>
            {extras.map((x) => (
              <Link key={x.title} href={x.href} className="flex min-h-[64px] items-center gap-4 border-b border-line no-underline last:border-b-0 hover:no-underline">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sunk text-fg">
                  <Icon name={x.icon} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[1rem] font-semibold text-fg">{x.title}</span>
                  <span className="truncate text-[0.875rem] text-fg-muted">{x.meta}</span>
                </span>
                <span className="text-[0.9rem] font-semibold text-fg-secondary">{x.action}</span>
              </Link>
            ))}
          </section>
        )}

        {topics.length > 0 && (
          <form onSubmit={handleQuickStart} className="flex flex-col gap-2">
            <label htmlFor="learn-new-input" className="text-[0.95rem] font-semibold text-fg-secondary">Learn something new</label>
            <div className="flex gap-2.5">
              <input
                id="learn-new-input"
                type="text"
                className="form-input h-11 flex-1"
                placeholder="A subject or skill — you’ll get a roadmap to trim"
                value={quickStartTitle}
                onChange={(e) => setQuickStartTitle(e.target.value)}
                disabled={quickStarting}
              />
              <Button type="submit" disabled={quickStarting || !quickStartTitle.trim()}>
                {quickStarting ? 'Building…' : 'Start'}
              </Button>
            </div>
          </form>
        )}

        <form onSubmit={handleCapture} className="flex h-14 items-center gap-3 rounded-[14px] border border-dashed border-line-strong pl-5 pr-2">
          <label htmlFor="quick-capture-input" className="text-[0.95rem] font-semibold text-fg-secondary">Capture</label>
          <input
            id="quick-capture-input"
            type="text"
            className="h-10 min-w-0 flex-1 border-none bg-transparent text-[0.95rem] text-fg outline-none"
            placeholder="A thought, a link, a question — sort it later"
            value={captureTitle}
            onChange={(e) => setCaptureTitle(e.target.value)}
            disabled={capturing}
          />
          {captureTitle.trim() ? (
            <Button type="submit" size="sm" disabled={capturing}>{capturing ? 'Saving…' : 'Save'}</Button>
          ) : (
            <kbd className="hidden rounded bg-sunk px-2 py-0.5 text-[0.7rem] text-fg-secondary sm:inline">C</kbd>
          )}
        </form>
      </div>

      <aside className="flex flex-col gap-9 lg:pt-2">
        {time && (
          <section aria-labelledby="week-h" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 id="week-h" className="m-0 text-[0.95rem] font-semibold">This week</h2>
              <Link href="/progress" className="text-[0.875rem] text-fg-secondary">All time</Link>
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-serif text-[2.4rem] leading-none">{formatDuration(time.totalSeconds)}</span>
              <span className="text-[0.875rem] text-fg-muted">of {formatDuration(WEEKLY_GOAL_SECONDS)} · today {formatDuration(time.todaySeconds)}</span>
            </div>
            {week.length > 0 && (
              <div
                className="flex h-28 items-end gap-2.5"
                role="img"
                aria-label={`Minutes studied each day this week: ${week.map((d) => Math.round(d.seconds / 60)).join(', ')}`}
              >
                {week.map((d, i) => {
                  const isToday = i === week.length - 1;
                  const label = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                      <span
                        className={`block w-full rounded-[5px] ${d.seconds === 0 ? 'bg-sunk' : isToday ? 'bg-ink' : 'bg-[var(--border-strong)]'}`}
                        style={{ height: `${Math.max(6, Math.round((d.seconds / maxDay) * 84))}px` }}
                      />
                      <span className={`text-[0.75rem] ${isToday ? 'font-bold text-fg' : 'text-fg-muted'}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTopics.length > 0 && (
          <section aria-labelledby="now-h" className="flex flex-col gap-5">
            <h2 id="now-h" className="m-0 text-[0.95rem] font-semibold">Now</h2>
            {activeTopics.map((t) => {
              const states = knowledge[t.id] ?? [];
              const n = nextModule(t);
              return (
                <Link key={t.id} href={`/topics/${t.id}`} className="flex flex-col gap-2 no-underline hover:no-underline">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[1rem] font-semibold text-fg">{t.title}</span>
                    {states.length > 0 && (
                      <span className="shrink-0 text-[0.8rem] text-fg-muted">
                        {states.filter((s) => s === 'solid').length} of {states.length} solid
                      </span>
                    )}
                  </div>
                  {states.length > 0 && <KnowledgeStrip states={states} size="sm" />}
                  <span className="text-[0.875rem] text-fg-secondary">
                    {t.mode === 'syllabus' ? `Next: ${n?.module.title ?? t.nextAction ?? 'set a next step'}` : knowledgeSummary(states) || 'No finish line — keep collecting'}
                  </span>
                </Link>
              );
            })}
          </section>
        )}

        <ResurfacedNote />
      </aside>
    </div>
  );
}
