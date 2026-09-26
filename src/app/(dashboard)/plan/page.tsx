'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Subcomponents Import
import PrioritizationPortal from '../PrioritizationPortal';
import LearnNowModal from '../LearnNowModal';
import KnowledgeGraph from '../KnowledgeGraph';
import RoadmapWizard from '../RoadmapWizard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Icon, KnowledgeStrip } from '@/components/ui';
import type { Knowledge } from '@/lib/moduleState';

interface Topic {
  id: string;
  title: string;
  area: string;
  why: string | null;
  depthTarget: string | null;
  status: string;
  progressPct: number;
  currentStage: string;
  lastCompleted: string | null;
  nextAction: string | null;
  lastTouchedDate: string;
  notes: string | null;
  activeSlotType: string | null;
  knowledgeMap?: any;
  mistakes?: any[];
  mode?: string;
  curriculum?: Array<{ order: number; title: string; completed: boolean }> | null;
}

interface Stats {
  counts: {
    inbox: number;
    queued: number;
    active: number;
    paused: number;
    maintenance: number;
    reference: number;
    dropped: number;
  };
  staleActiveCount: number;
  daysSinceLastReview: number | null;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  exiting?: boolean;
}

const AREAS = ['All Areas', 'Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];
const STATUSES = ['inbox', 'queued', 'active', 'paused', 'maintenance', 'reference', 'dropped'];

const EMPTY_STATE_HINTS: Record<string, { icon: string; text: string }> = {
  inbox:       { icon: '', text: 'Capture a curiosity above' },
  queued:      { icon: '', text: 'Move topics here to queue them up' },
  active:      { icon: '', text: 'Drag a topic here to start learning' },
  paused:      { icon: '', text: 'Paused topics appear here' },
  maintenance: { icon: '', text: 'Maintained topics appear here' },
  reference:   { icon: '', text: 'Reference material lands here' },
  dropped:     { icon: '', text: 'Dropped topics are archived here' },
};

let toastIdCounter = 0;

export default function PlanPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('All Areas');

  // View Mode: 'list' (clean, intuitive default) vs 'board' (full Kanban)
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'map'>('list');
  const [knowledge, setKnowledge] = useState<Record<string, Knowledge[]>>({});

  // Show/hide empty columns toggle
  const [showEmptyColumns, setShowEmptyColumns] = useState(false);

  // Inbox Capture
  const [newInboxTitle, setNewInboxTitle] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Quick Activation Modal State (Fallback for direct activation)
  const [activatingTopic, setActivatingTopic] = useState<Topic | null>(null);
  const [why, setWhy] = useState('');
  const [depthTarget, setDepthTarget] = useState('Proficiency');
  const [nextAction, setNextAction] = useState('');
  const [activationError, setActivationError] = useState<string | null>(null);

  // AI Roadmap Wizard state
  const [showRoadmapWizard, setShowRoadmapWizard] = useState(false);
  const [captureTopicMode, setCaptureTopicMode] = useState<'self_directed' | 'course'>('self_directed');

  // Prioritization swaps state
  const [showPrioritization, setShowPrioritization] = useState(false);
  const [pendingActiveTopic, setPendingActiveTopic] = useState<Topic | null>(null);

  // Learn Now state
  const [showLearnNow, setShowLearnNow] = useState(false);
  const [dueReviewsCount, setDueReviewsCount] = useState(0);

  // Drag and Drop State
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 320);
    }, 3000);
  }, []);

  const fetchData = async () => {
    try {
      const [topicsRes, statsRes, spacedRes, progressRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/stats'),
        fetch('/api/review/spaced'),
        fetch('/api/progress'),
      ]);
      if (progressRes.ok) {
        const p = await progressRes.json();
        setKnowledge(Object.fromEntries(p.topics.filter((t: any) => t.knowledge).map((t: any) => [t.id, t.knowledge.states])));
      }

      if (topicsRes.ok && statsRes.ok && spacedRes.ok) {
        const topicsData = await topicsRes.json();
        const statsData = await statsRes.json();
        const spacedData = await spacedRes.json();
        setTopics(topicsData);
        setStats(statsData);
        setDueReviewsCount(spacedData.dueConcepts?.length || 0);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInboxTitle.trim()) return;

    setCapturing(true);
    setCaptureError(null);

    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newInboxTitle.trim(),
          status: 'inbox',
          topicMode: captureTopicMode,
        }),
      });

      if (res.ok) {
        const capturedTitle = newInboxTitle.trim();
        setNewInboxTitle('');
        await fetchData();
        router.refresh();
        showToast(`"${capturedTitle}" added to Inbox`, 'success');
      } else {
        const data = await res.json();
        setCaptureError(data.error || 'Failed to capture topic');
        showToast('Failed to capture topic', 'error');
      }
    } catch (err) {
      setCaptureError('Failed to connect to server');
      showToast('Connection error', 'error');
    } finally {
      setCapturing(false);
    }
  };

  const handleTransition = async (topic: Topic, newStatus: string) => {
    if (newStatus === 'active') {
      const currentActiveCount = topics.filter(t => t.status === 'active').length;
      if (currentActiveCount >= 2) {
        setPendingActiveTopic(topic);
        setShowPrioritization(true);
        return;
      }

      if (!topic.why || !topic.depthTarget || !topic.nextAction) {
        setActivatingTopic(topic);
        setWhy(topic.why || '');
        setDepthTarget(topic.depthTarget || 'Proficiency');
        setNextAction(topic.nextAction || '');
        setActivationError(null);
        return;
      }
    }

    try {
      const res = await fetch(`/api/topics/${topic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await fetchData();
        router.refresh();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      showToast('Failed to connect to server', 'error');
    }
  };

  const handleConfirmSwap = async (
    activeToPauseId: string,
    pauseReason: string,
    pendingWhy?: string,
    pendingDepth?: string,
    pendingNextAction?: string
  ) => {
    if (!pendingActiveTopic) return;

    const activeToPause = topics.find(t => t.id === activeToPauseId);
    let updatedPauseHistory: any[] = [];
    if (activeToPause) {
      const existingHistory = activeToPause.knowledgeMap?.pauseHistory || [];
      const newPause = {
        id: Math.random().toString(36).substring(2, 9),
        pausedAt: new Date().toISOString(),
        resumedAt: null,
        reason: pauseReason,
        completedConcepts: [],
        currentConcept: 'None',
        openQuestion: 'None',
        reactivationScore: null,
      };
      updatedPauseHistory = [...existingHistory, newPause];
    }

    try {
      const pauseRes = await fetch(`/api/topics/${activeToPauseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paused',
          pauseHistory: updatedPauseHistory,
          nextAction: 'Re-prioritize and resume study',
        }),
      });

      if (!pauseRes.ok) {
        const pauseErr = await pauseRes.json();
        throw new Error(pauseErr.error || 'Failed to pause selected topic');
      }

      const targetWhy = pendingWhy || pendingActiveTopic.why || 'Swapped into active focus slot.';
      const targetDepth = pendingDepth || pendingActiveTopic.depthTarget || 'Proficiency';
      const targetNext = pendingNextAction || pendingActiveTopic.nextAction || 'Map core concepts and prerequisites';

      const activateRes = await fetch(`/api/topics/${pendingActiveTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          why: targetWhy,
          depthTarget: targetDepth,
          nextAction: targetNext,
        }),
      });

      if (!activateRes.ok) {
        const actErr = await activateRes.json();
        throw new Error(actErr.error || 'Failed to activate new topic');
      }

      setShowPrioritization(false);
      setPendingActiveTopic(null);
      await fetchData();
      router.refresh();
      showToast(`"${pendingActiveTopic.title}" is now active`, 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Connection error during slot swap.', 'error');
    }
  };

  const handleSessionComplete = async (topicId: string, summary: string, nextAction: string) => {
    try {
      const topic = topics.find(t => t.id === topicId);
      const prevNotes = topic?.notes || '';
      const newNotes = prevNotes + `\n\n### Learning Reflection (${new Date().toLocaleDateString()})\n` + summary;

      await fetch(`/api/topics/${topicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: newNotes,
          nextAction: nextAction,
          status: 'active',
        }),
      });

      await fetchData();
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const submitFallbackActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activatingTopic) return;
    if (!why.trim() || !nextAction.trim()) {
      setActivationError('Why and Next Action are required to activate a topic.');
      return;
    }

    try {
      const res = await fetch(`/api/topics/${activatingTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          why: why.trim(),
          depthTarget,
          nextAction: nextAction.trim(),
        }),
      });

      if (res.ok) {
        const title = activatingTopic.title;
        setActivatingTopic(null);
        await fetchData();
        router.refresh();
        showToast(`"${title}" is now active`, 'success');
      } else {
        const data = await res.json();
        setActivationError(data.error || 'Failed to activate topic');
      }
    } catch (err) {
      setActivationError('Connection error');
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggingCardId(id);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    setDragOverColumn(null);
    const cardId = e.dataTransfer.getData('text/plain') || draggingCardId;
    if (!cardId) return;

    const topic = topics.find((t) => t.id === cardId);
    if (!topic) return;

    await handleTransition(topic, newStatus);
  };

  // Search/Filter matching
  const filteredTopics = topics.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));
    const matchesArea = selectedArea === 'All Areas' || t.area === selectedArea;
    return matchesSearch && matchesArea;
  });

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '32px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="flex-between">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="skeleton skeleton-text" style={{ width: '220px', height: '28px' }} />
              <div className="skeleton skeleton-text" style={{ width: '320px', height: '14px' }} />
            </div>
            <div className="skeleton" style={{ width: '120px', height: '38px' }} />
          </div>
          <div className="skeleton" style={{ height: '56px', borderRadius: '12px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div className="skeleton" style={{ height: '40px' }} />
            <div className="skeleton" style={{ height: '40px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton skeleton-col" />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="skeleton" style={{ height: '220px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '300px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  const STALE_DAYS = 7;

  // Determine which columns have content
  const nonEmptyStatuses = STATUSES.filter(s => filteredTopics.some(t => t.status === s));
  const visibleStatuses = showEmptyColumns ? STATUSES : (nonEmptyStatuses.length > 0 ? STATUSES : STATUSES);
  // Always show at least the columns with items + INBOX + ACTIVE + QUEUED
  const alwaysShowStatuses = new Set(['inbox', 'queued', 'active']);
  const columnsToShow = showEmptyColumns
    ? STATUSES
    : STATUSES.filter(s => alwaysShowStatuses.has(s) || filteredTopics.some(t => t.status === s));

  const hiddenEmptyCount = STATUSES.filter(
    s => !alwaysShowStatuses.has(s) && !filteredTopics.some(t => t.status === s)
  ).length;

  const STATUS_WORD: Record<string, string> = {
    active: 'Now',
    queued: 'Next',
    inbox: 'Inbox',
    paused: 'Resting',
    maintenance: 'Keeping fresh',
    reference: 'Reference',
    dropped: 'Let go',
  };
  const KIND: Record<string, string> = { syllabus: 'Course', accretion: 'Ideas you collect', practice: 'Daily practice', reference: 'Reference' };
  const nextModuleOf = (t: Topic) =>
    [...(t.curriculum ?? [])].sort((a, b) => a.order - b.order).find((m) => !m.completed)?.title ?? null;
  const daysAgo = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  const byStatus = (s: string) => filteredTopics.filter((t) => t.status === s);
  const now = byStatus('active');
  const next = byStatus('queued');
  const inbox = byStatus('inbox');
  const others = filteredTopics.filter((t) => ['paused', 'maintenance', 'reference', 'dropped'].includes(t.status));
  const ghost = 'h-9 rounded-lg px-3 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg';

  const Row = ({ t, actions }: { t: Topic; actions: React.ReactNode }) => {
    const states = knowledge[t.id] ?? [];
    const nm = nextModuleOf(t);
    return (
      <li className="grid items-center gap-x-5 gap-y-2 border-b border-line py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col">
          <Link href={`/topics/${t.id}`} className="truncate text-[1rem] font-semibold text-fg">{t.title}</Link>
          <span className="truncate text-[0.82rem] text-fg-muted">
            {t.area} · {KIND[t.mode ?? 'syllabus'] ?? 'Topic'}
            {nm ? ` · next: ${nm}` : t.nextAction ? ` · next: ${t.nextAction}` : ''}
          </span>
        </div>
        <div className="min-w-0">
          {states.length > 0 ? <KnowledgeStrip states={states} size="sm" /> : <span className="text-[0.82rem] text-fg-muted">Not started</span>}
        </div>
        <div className="flex flex-wrap justify-end gap-1">{actions}</div>
      </li>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Learn</h1>
          <p className="m-0 text-[1.05rem] text-fg-secondary">Two topics in Now. Everything else waits in Next or your Inbox.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowLearnNow(true)} className="btn btn-secondary h-11 py-0">Pick for me</button>
          <button type="button" onClick={() => setShowRoadmapWizard(true)} className="btn btn-secondary h-11 py-0">Roadmap from a goal</button>
          <Link href="/learn/new" className="btn btn-primary h-11 py-0 no-underline hover:no-underline">
            <Icon name="plus" size={16} /> Learn something new
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="View" className="flex rounded-xl bg-sunk p-1">
          {([['list', 'Topics'], ['board', 'Board'], ['map', 'Map']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={viewMode === key}
              onClick={() => setViewMode(key)}
              className={`h-9 rounded-[9px] px-4 text-[0.875rem] ${viewMode === key ? 'bg-surface font-semibold text-fg shadow-card' : 'font-medium text-fg-secondary hover:text-fg'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label htmlFor="learn-search" className="sr-only">Search topics</label>
        <input id="learn-search" className="form-input h-10 w-[220px] py-0 text-[0.9rem]" placeholder="Search topics" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label htmlFor="learn-area" className="sr-only">Area</label>
        <select id="learn-area" className="form-input h-10 w-auto py-0 text-[0.9rem]" value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {viewMode === 'list' && (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="now-h" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 id="now-h" className="m-0 text-[1.2rem] font-semibold">Now <span className="font-normal text-fg-muted">{now.length} of 2</span></h2>
              {stats && stats.staleActiveCount > 0 && <span className="text-[0.85rem] text-k-fading-text">{stats.staleActiveCount} untouched for a week+</span>}
            </div>
            {now.length === 0 ? (
              <p className="m-0 rounded-xl bg-sunk px-5 py-4 text-[0.95rem] text-fg-secondary">Nothing in Now. Start something from Next below, or learn something new.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {now.map((t) => {
                  const states = knowledge[t.id] ?? [];
                  const nm = nextModuleOf(t);
                  const idle = daysAgo(t.lastTouchedDate);
                  return (
                    <div key={t.id} className="glass-panel flex flex-col gap-4 p-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.82rem] text-fg-muted">
                          {t.area} · {KIND[t.mode ?? 'syllabus'] ?? 'Topic'} · {idle === 0 ? 'touched today' : `${idle} day${idle === 1 ? '' : 's'} ago`}
                        </span>
                        <Link href={`/topics/${t.id}`} className="font-serif text-[1.6rem] font-medium leading-tight text-fg">{t.title}</Link>
                      </div>
                      {states.length > 0 && <KnowledgeStrip states={states} showSummary />}
                      <span className="text-[0.95rem] text-fg-secondary">Next: {nm ?? t.nextAction ?? 'set a next step'}</span>
                      <div className="flex gap-2">
                        <Link href={`/topics/${t.id}`} className="btn btn-primary h-10 py-0 no-underline hover:no-underline">Continue</Link>
                        <button type="button" className={ghost} onClick={() => handleTransition(t, 'paused')}>Rest it</button>
                        <button type="button" className={ghost} onClick={() => handleTransition(t, 'maintenance')}>Done — keep fresh</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="next-h" className="flex flex-col gap-2">
            <h2 id="next-h" className="m-0 text-[1.2rem] font-semibold">Next <span className="font-normal text-fg-muted">{next.length}</span></h2>
            {next.length === 0 ? (
              <p className="m-0 text-[0.95rem] text-fg-muted">Nothing lined up. Move something up from your Inbox.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {next.map((t) => (
                  <Row key={t.id} t={t} actions={
                    <>
                      <button type="button" className="btn btn-secondary h-9 py-0 text-[0.85rem]" onClick={() => handleTransition(t, 'active')}>Start</button>
                      <button type="button" className={ghost} onClick={() => handleTransition(t, 'inbox')}>Back to Inbox</button>
                    </>
                  } />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="inbox-h" className="flex flex-col gap-3">
            <h2 id="inbox-h" className="m-0 text-[1.2rem] font-semibold">Inbox <span className="font-normal text-fg-muted">{inbox.length}</span></h2>
            <form onSubmit={handleQuickCapture} className="flex gap-2">
              <label htmlFor="inbox-add" className="sr-only">Add to Inbox</label>
              <input
                id="inbox-add"
                className="form-input h-11 flex-1 py-0"
                placeholder="Something you might want to learn — e.g. how caches fail"
                value={newInboxTitle}
                onChange={(e) => setNewInboxTitle(e.target.value)}
                disabled={capturing}
              />
              <button type="submit" disabled={capturing || !newInboxTitle.trim()} className="btn btn-secondary h-11 py-0">{capturing ? 'Adding…' : 'Add'}</button>
            </form>
            {captureError && <p role="alert" className="m-0 text-[0.85rem] text-danger">{captureError}</p>}
            {inbox.length > 0 && (
              <ul className="m-0 list-none p-0">
                {inbox.map((t) => (
                  <Row key={t.id} t={t} actions={
                    <>
                      <button type="button" className="btn btn-secondary h-9 py-0 text-[0.85rem]" onClick={() => handleTransition(t, 'queued')}>Move to Next</button>
                      <button type="button" className={ghost} onClick={() => handleTransition(t, 'active')}>Start</button>
                      <button type="button" className={ghost} onClick={() => handleTransition(t, 'dropped')}>Let go</button>
                    </>
                  } />
                ))}
              </ul>
            )}
          </section>

          {others.length > 0 && (
            <details className="flex flex-col gap-2">
              <summary className="cursor-pointer text-[1.05rem] font-semibold text-fg-secondary">Resting, done and let go · {others.length}</summary>
              <ul className="m-0 mt-2 list-none p-0">
                {others.map((t) => (
                  <Row key={t.id} t={t} actions={
                    <>
                      <span className="self-center pr-2 text-[0.82rem] text-fg-muted">{STATUS_WORD[t.status]}</span>
                      {t.status !== 'dropped' && <button type="button" className="btn btn-secondary h-9 py-0 text-[0.85rem]" onClick={() => handleTransition(t, 'active')}>Resume</button>}
                      <button type="button" className={ghost} onClick={() => handleTransition(t, 'queued')}>Move to Next</button>
                    </>
                  } />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {viewMode === 'board' && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[0.9rem] text-fg-muted">Drag a topic between columns to change where it is.</p>
          <div className="grid gap-4 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${columnsToShow.length}, minmax(220px, 1fr))` }}>
            {columnsToShow.map((status) => {
              const list = byStatus(status);
              return (
                <div
                  key={status}
                  onDragOver={(e) => { e.preventDefault(); setDragOverColumn(status); }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => handleDrop(e, status)}
                  className={`flex min-h-[320px] flex-col gap-2.5 rounded-xl p-3 ${dragOverColumn === status ? 'column-drag-over' : 'bg-sunk'}`}
                >
                  <div className="flex items-baseline justify-between px-1">
                    <span className="text-[0.95rem] font-semibold">{STATUS_WORD[status]}</span>
                    <span className="text-[0.82rem] text-fg-muted">{list.length}{status === 'active' ? ' / 2' : ''}</span>
                  </div>
                  {list.length === 0 && <span className="px-1 text-[0.82rem] text-fg-muted">{EMPTY_STATE_HINTS[status]?.text}</span>}
                  {list.map((t) => {
                    const states = knowledge[t.id] ?? [];
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onDragEnd={() => setDraggingCardId(null)}
                        className={`glass-card flex flex-col gap-2 p-3.5 ${draggingCardId === t.id ? 'card-dragging' : ''}`}
                      >
                        <Link href={`/topics/${t.id}`} className="text-[0.95rem] font-semibold text-fg">{t.title}</Link>
                        <span className="text-[0.78rem] text-fg-muted">{t.area}</span>
                        {states.length > 0 && <KnowledgeStrip states={states} size="sm" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {hiddenEmptyCount > 0 && (
            <button type="button" className={`${ghost} self-start`} onClick={() => setShowEmptyColumns((v) => !v)}>
              {showEmptyColumns ? 'Hide empty columns' : `Show ${hiddenEmptyCount} empty column${hiddenEmptyCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {viewMode === 'map' && (
        <ErrorBoundary fallbackTitle="Unable to load the map">
          <KnowledgeGraph topics={topics} />
        </ErrorBoundary>
      )}

      {/* Prioritization swap portal */}
      {showPrioritization && pendingActiveTopic && (
        <PrioritizationPortal
          activeTopics={topics.filter(t => t.status === 'active')}
          pendingTopic={pendingActiveTopic}
          onConfirmSwap={handleConfirmSwap}
          onClose={() => { setShowPrioritization(false); setPendingActiveTopic(null); }}
        />
      )}

      {/* Socratic Learn Now workspace modal */}
      {showLearnNow && (
        <LearnNowModal
          activeTopics={topics.filter(t => t.status === 'active')}
          dueReviewsCount={dueReviewsCount}
          mistakesCount={topics.reduce((acc, t) => acc + (t.mistakes?.length || 0), 0)}
          onSessionComplete={handleSessionComplete}
          onClose={() => setShowLearnNow(false)}
        />
      )}

      {/* Fallback Quick Activation Form Modal */}
      {activatingTopic && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-overlay)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1500, padding: '16px'
        }}>
          <form onSubmit={submitFallbackActivation} className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Activate Topic</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                "{activatingTopic.title}"
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Why are you learning this?</label>
              <textarea className="form-input" style={{ width: '100%', height: '60px', resize: 'none' }} value={why} onChange={e => setWhy(e.target.value)} required />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Depth target</label>
              <select className="form-input" value={depthTarget} onChange={e => setDepthTarget(e.target.value)} style={{ background: 'var(--bg-surface)' }}>
                <option value="Awareness">Awareness</option>
                <option value="Working Knowledge">Working Knowledge</option>
                <option value="Proficiency">Proficiency</option>
                <option value="Deep">Deep Knowledge</option>
                <option value="Mastery">Mastery</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Concrete next action (verb-first)</label>
              <input type="text" className="form-input" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="e.g. Read chapter 1 of..." required />
            </div>

            {activationError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{activationError}</p>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button type="button" onClick={() => setActivatingTopic(null)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Activate Topic</button>
            </div>
          </form>
        </div>
      )}

      {/* AI Roadmap Wizard Modal */}
      {showRoadmapWizard && (
        <RoadmapWizard
          onClose={() => setShowRoadmapWizard(false)}
          onComplete={fetchData}
        />
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${toast.exiting ? ' toast-exit' : ''}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

    </div>
  );
}
