'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { pickNextAction, type NextActionPick, type TopicForNextAction } from '@/lib/nextAction';
import { createCapture } from '@/lib/captureClient';
import { Button, ButtonLink, Card, CardLabel, EmptyState } from '@/components/ui';
import ResurfacedNote from '@/components/ResurfacedNote';

/**
 * The Today screen — the front door as of Phase 4 (see the plan's Fix 2).
 *
 * The old dashboard (the full kanban board, prioritization portal, AI
 * roadmap wizard, knowledge graph — all of it, unchanged) moved to /plan.
 * This screen answers one question: what do I do in the next 25 minutes?
 * It picks for you and always says why (src/lib/nextAction.ts) — a pick
 * with no visible reason isn't trustworthy.
 *
 * The daily rep card below (Phase 9) only shows once a practice-mode topic
 * exists — see /practice, which is also where "start one" lives; this
 * screen doesn't offer topic creation for a mode it can't configure.
 */

interface Topic extends TopicForNextAction {
  area: string;
  progressPct: number;
  currentStage: string;
  depthTarget: string | null;
  why: string | null;
  mode: string;
}

export default function TodayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [repLoggedToday, setRepLoggedToday] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [captureTitle, setCaptureTitle] = useState('');
  const [capturing, setCapturing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [topicsRes, spacedRes, inboxRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/review/spaced'),
        fetch('/api/captures?status=inbox'),
      ]);
      if (inboxRes.ok) {
        const inbox = await inboxRes.json();
        setInboxCount(Array.isArray(inbox) ? inbox.length : 0);
      }
      let allTopics: Topic[] = [];
      if (topicsRes.ok) {
        allTopics = await topicsRes.json();
        setTopics(allTopics);
      }
      if (spacedRes.ok) {
        const spaced = await spacedRes.json();
        setDueCount(spaced.dueConcepts?.length || 0);
      }

      const hasPracticeTopic = allTopics.some((t) => t.mode === 'practice');
      if (hasPracticeTopic) {
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

  // The global `C` hotkey (wired in HeaderToolbar) focuses this input.
  // Same-page: a custom event, since HeaderToolbar and this page are both
  // already mounted. Cross-page: HeaderToolbar navigates here with
  // ?focus=capture instead, since a same-tick event would have no listener
  // yet on the page it's navigating to.
  useEffect(() => {
    const onFocusCapture = () => {
      document.getElementById('quick-capture-input')?.focus();
    };
    window.addEventListener('learning-os:focus-capture', onFocusCapture);
    return () => window.removeEventListener('learning-os:focus-capture', onFocusCapture);
  }, []);

  // ?focus=capture arriving from HeaderToolbar's cross-page navigation: the
  // input doesn't exist yet while `loading` is true (this component renders
  // a skeleton with no form until fetchData() resolves), so this must wait
  // for loading to finish rather than firing once on mount.
  useEffect(() => {
    if (loading || searchParams.get('focus') !== 'capture') return;
    document.getElementById('quick-capture-input')?.focus();
    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;
    setCapturing(true);
    try {
      // Same inbox as /notes: a capture is triaged later into a note, a
      // concept, a topic, or nothing — it no longer becomes a board topic
      // the moment it's typed.
      const res = await createCapture(title);
      if (res.ok) {
        setCaptureTitle('');
        toast.success('Captured — triage it later in Notes › Inbox');
        await fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to capture');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setCapturing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex max-w-[760px] flex-col gap-5">
        {[52, 110, 64, 160].map((h) => (
          <div key={h} className="skeleton rounded-md" style={{ height: h }} />
        ))}
      </div>
    );
  }

  const activeTopics = topics.filter((t) => t.status === 'active');
  const pick: NextActionPick | null = pickNextAction(activeTopics);
  const hasPracticeTopic = topics.some((t) => t.mode === 'practice');
  const linkCls = 'text-primary-light';

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      {/* Capture — always present, works from anywhere (Fix 5) */}
      <form onSubmit={handleCapture} className="glass-panel flex items-center gap-2.5 px-[18px] py-3.5">
        <span className="whitespace-nowrap text-[0.85rem] font-semibold text-fg-muted">C ▸</span>
        <input
          id="quick-capture-input"
          type="text"
          className="form-input border-none bg-transparent px-3 py-2 text-[0.9rem]"
          placeholder="capture a thought or paste a link…"
          value={captureTitle}
          onChange={(e) => setCaptureTitle(e.target.value)}
          disabled={capturing}
        />
        {captureTitle.trim() && (
          <Button type="submit" size="sm" disabled={capturing}>
            {capturing ? 'Capturing…' : 'Capture ▸'}
          </Button>
        )}
        {inboxCount > 0 && (
          <Link href="/notes" className="whitespace-nowrap text-[0.75rem] text-primary-light">Inbox ({inboxCount}) ▸</Link>
        )}
        <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[0.72rem] text-primary-light">⌘K</kbd>
      </form>

      {topics.length === 0 && (
        <Card accent="success" className="flex flex-col gap-3">
          <div className="text-base font-bold">👋 Start here</div>
          <ol className="m-0 flex flex-col gap-2 pl-[18px] text-[0.85rem] leading-snug text-fg-secondary">
            <li>
              <strong className="text-white">Have a goal?</strong> (&quot;Crack a backend interview by June&quot;){' '}
              <Link href="/goals" className={linkCls}>Goals</Link> turns it into a roadmap of topics.
            </li>
            <li>
              <strong className="text-white">Just a subject?</strong> Add it on the{' '}
              <Link href="/plan" className={linkCls}>Plan</Link> board, then open it and pick how you learn it in <em>Setup</em>:
              Syllabus (DSA, React), Practice (spoken English), Accretion (investing, politics) or Reference.
            </li>
            <li>
              <strong className="text-white">Only 2 topics can be active at once.</strong> Activate the ones you&apos;re studying now; this screen then picks your next 25 minutes.
            </li>
            <li>
              <strong className="text-white">Came across something?</strong> Type it in the box above — it waits in the inbox until you decide what it is.
            </li>
          </ol>
        </Card>
      )}

      {/* Next 25 minutes — the one choice */}
      <Card accent="primary">
        <CardLabel tone="primary">▸ Next 25 minutes</CardLabel>
        {pick ? (
          <div className="mt-2.5 flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-bold">{pick.topicTitle}</div>
              <div className="mt-0.5 text-[0.85rem] text-fg-secondary">→ {pick.nextAction}</div>
              <div className={`mt-2 text-[0.72rem] ${pick.isStale ? 'text-danger' : 'text-fg-muted'}`}>why this: {pick.reason}</div>
            </div>
            <Button variant="primary" onClick={() => router.push(`/topics/${pick.topicId}`)}>Start ▸</Button>
          </div>
        ) : (
          <div className="mt-2.5 text-[0.85rem] text-fg-muted">
            No active topic has a concrete next action queued.{' '}
            <Link href="/plan" className={linkCls}>Open the board</Link> to set one.
          </div>
        )}
      </Card>

      {/* Due reviews + pomodoro + daily rep — link out, one choice each */}
      <div className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 ${hasPracticeTopic ? 'lg:grid-cols-3' : ''}`}>
        <Card className="flex items-center justify-between gap-3 px-[18px] py-4">
          <div>
            <CardLabel>▸ Due reviews</CardLabel>
            <div className="mt-1 text-[0.9rem]">
              {dueCount > 0 ? `${dueCount} concept${dueCount === 1 ? '' : 's'} · ~${Math.max(1, Math.ceil(dueCount * 0.7))} min` : 'Queue is clear'}
            </div>
          </div>
          <ButtonLink href="/review">Review ▸</ButtonLink>
        </Card>

        <Card className="flex items-center justify-between gap-3 px-[18px] py-4">
          <div>
            <CardLabel>▸ Focus timer</CardLabel>
            <div className="mt-1 text-[0.9rem]">25-minute pomodoro block</div>
          </div>
          <ButtonLink href="/review">Start ▸</ButtonLink>
        </Card>

        {hasPracticeTopic && (
          <Card className="flex items-center justify-between gap-3 px-[18px] py-4">
            <div>
              <CardLabel>▸ Daily rep</CardLabel>
              <div className="mt-1 text-[0.9rem]">{repLoggedToday ? 'Logged today ✓' : '2-min impromptu'}</div>
            </div>
            <ButtonLink href="/practice">{repLoggedToday ? 'View ▸' : 'Record ▸'}</ButtonLink>
          </Card>
        )}
      </div>

      {/* Accretion review: one older note shown back to you (renders nothing if none is due) */}
      <ResurfacedNote />

      {/* NOW — the WIP-limited active slots */}
      <div>
        <div className="mb-2.5"><CardLabel>Now ({activeTopics.length}/2)</CardLabel></div>
        {activeTopics.length === 0 ? (
          <EmptyState title="No active topics">
            <Link href="/plan" className={linkCls}>Open the board</Link> to activate one, or open a topic and use Setup › Save &amp; make active.
          </EmptyState>
        ) : (
          <div className={`grid grid-cols-1 gap-3.5 ${activeTopics.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {activeTopics.map((t) => (
              <Link
                key={t.id}
                href={`/topics/${t.id}`}
                className={`glass-card flex flex-col gap-1.5 px-4 py-3.5 border-l-[3px] ${t.activeSlotType === 'primary' ? 'border-l-primary' : 'border-l-accent'}`}
              >
                <span className="text-[0.9rem] font-bold">{t.title}</span>
                <span className={`badge badge-${t.area.toLowerCase()} self-start text-[0.65rem]`}>{t.area}</span>
                {t.nextAction && <span className="text-[0.75rem] text-fg-secondary">next: {t.nextAction}</span>}
                {/* Only syllabus topics have a finish line — practice/accretion never show a % bar. */}
                {t.mode === 'syllabus' ? (
                  <div className="progress-bar-mini mt-1">
                    <div className="progress-bar-mini-fill" style={{ width: `${Math.max(t.progressPct || 0, 2)}%` }} />
                  </div>
                ) : (
                  <span className="text-[0.7rem] text-fg-muted">{t.mode} topic — no finish line</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link href="/plan" className="p-2 text-center text-[0.8rem] text-fg-muted">View full board →</Link>
    </div>
  );
}
