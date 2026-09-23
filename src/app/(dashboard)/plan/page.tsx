'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Subcomponents Import
import PrioritizationPortal from '../PrioritizationPortal';
import LearnNowModal from '../LearnNowModal';
import SpacedReviewQueue from '../SpacedReviewQueue';
import KnowledgeGraph from '../KnowledgeGraph';
import RoadmapWizard from '../RoadmapWizard';
import ErrorBoundary from '@/components/ErrorBoundary';

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
  inbox:       { icon: '💡', text: 'Capture a curiosity above' },
  queued:      { icon: '📋', text: 'Move topics here to queue them up' },
  active:      { icon: '⚡', text: 'Drag a topic here to start learning' },
  paused:      { icon: '⏸️', text: 'Paused topics appear here' },
  maintenance: { icon: '✅', text: 'Maintained topics appear here' },
  reference:   { icon: '📖', text: 'Reference material lands here' },
  dropped:     { icon: '🗑️', text: 'Dropped topics are archived here' },
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
      const [topicsRes, statsRes, spacedRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/stats'),
        fetch('/api/review/spaced')
      ]);

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
        showToast(`✅ "${capturedTitle}" added to Inbox`, 'success');
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
      showToast(`⚡ "${pendingActiveTopic.title}" is now active`, 'success');
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
        showToast(`⚡ "${title}" is now active`, 'success');
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '32px', alignItems: 'start' }}>

      {/* LEFT BOARD VIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Header Board Controls */}
        <div className="flex-between">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Plan</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              The full board: every topic, every status. Visit weekly to triage — for daily work, see Today.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowRoadmapWizard(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(99, 102, 241, 0.4)', color: 'var(--color-primary-light)' }}
            >
              🤖 Generate AI Roadmap
            </button>
            <button
              onClick={() => setShowLearnNow(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', color: '#fff' }}
            >
              ⚡ Learn Now
            </button>
          </div>
        </div>

        {/* Today's Sessions Strip */}
        {(() => {
          const todayStr = new Date().toDateString();
          const todayLogs: Array<{ topicTitle: string; activityType: string; durationMinutes: number }> = [];
          topics.forEach((t: any) => {
            if (Array.isArray(t.sessionLogs)) {
              t.sessionLogs.forEach((log: any) => {
                if (new Date(log.timestamp).toDateString() === todayStr) {
                  todayLogs.push({
                    topicTitle: t.title,
                    activityType: log.activityType,
                    durationMinutes: log.durationMinutes,
                  });
                }
              });
            }
          });

          if (todayLogs.length === 0) return null;

          const totalTodayMins = todayLogs.reduce((s, l) => s + l.durationMinutes, 0);

          return (
            <div className="glass-panel" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', borderLeft: '3px solid #10b981' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>
                📅 Today: {todayLogs.length} session{todayLogs.length > 1 ? 's' : ''} ({totalTodayMins}m)
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {todayLogs.map((l, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '0.7rem',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {l.topicTitle} · {l.durationMinutes}m
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Quick Capture Input Form */}
        <form onSubmit={handleQuickCapture} className="glass-panel" style={{ padding: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            placeholder="💡 Capture interesting curiosity in Inbox (e.g. History of cinematography, how caches fail...)"
            value={newInboxTitle}
            onChange={(e) => setNewInboxTitle(e.target.value)}
            disabled={capturing}
            style={{ fontSize: '0.9rem', padding: '10px 14px' }}
          />
          <button type="submit" disabled={capturing} className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>
            {capturing ? 'Capturing...' : '➕ Quick Capture'}
          </button>
        </form>
        {captureError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{captureError}</p>}

        {/* Search & Area Filter */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Search topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: '0.85rem', padding: '8px 12px' }}
          />

          <select
            className="form-input"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            style={{ fontSize: '0.85rem', padding: '8px 12px', background: '#121218' }}
          >
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Empty columns toggle */}
        {hiddenEmptyCount > 0 && !showEmptyColumns && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowEmptyColumns(true)}
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              + Show {hiddenEmptyCount} empty columns
            </button>
          </div>
        )}
        {showEmptyColumns && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowEmptyColumns(false)}
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              − Hide empty columns
            </button>
          </div>
        )}

        {/* Kanban Columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columnsToShow.length}, 1fr)`,
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '16px',
        }}>
          {columnsToShow.map((colStatus) => {
            const colTopics = filteredTopics.filter(t => t.status === colStatus);
            const isOver = dragOverColumn === colStatus;
            const hint = EMPTY_STATE_HINTS[colStatus];

            return (
              <div
                key={colStatus}
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(colStatus); }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, colStatus)}
                style={{
                  background: isOver ? 'rgba(99, 102, 241, 0.04)' : 'rgba(255,255,255,0.01)',
                  border: isOver ? '1px dashed var(--color-primary)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  minHeight: '450px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div className="flex-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: colStatus === 'active' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  }}>
                    {colStatus}
                  </span>
                  <span style={{
                    fontSize: '0.68rem',
                    color: 'var(--color-text-muted)',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}>
                    {colTopics.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  {colTopics.map((t) => {
                    const lastTouched = t.lastTouchedDate ? new Date(t.lastTouchedDate) : null;
                    const daysSinceTouch = lastTouched ? Math.floor((Date.now() - lastTouched.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const isStale = colStatus === 'active' && daysSinceTouch >= STALE_DAYS;
                    const hasRealNextAction = t.nextAction && t.nextAction.trim().toLowerCase() !== 'nothing' && t.nextAction.trim() !== '';

                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        className="glass-card"
                        style={{
                          padding: '10px 12px',
                          cursor: 'grab',
                          background: t.activeSlotType === 'primary' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(25, 25, 35, 0.45)',
                          borderLeft: t.activeSlotType === 'primary'
                            ? '3px solid var(--color-primary)'
                            : t.activeSlotType === 'secondary'
                            ? '3px solid var(--color-accent)'
                            : '1px solid var(--border-color)',
                        }}
                      >
                        <Link href={`/topics/${t.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', lineHeight: 1.35 }}>{t.title}</span>
                          <span className={`badge badge-${t.area.toLowerCase()}`} style={{ fontSize: '0.65rem', alignSelf: 'flex-start' }}>{t.area}</span>

                          {colStatus === 'active' && hasRealNextAction && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--color-warning)', fontStyle: 'italic', marginTop: '2px', lineBreak: 'anywhere' }}>
                              → {t.nextAction}
                            </p>
                          )}

                          {isStale && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '2px' }}>
                              ⚠ Untouched {daysSinceTouch}d
                            </span>
                          )}

                          {/* Mini progress bar */}
                          <div className="progress-bar-mini">
                            <div
                              className="progress-bar-mini-fill"
                              style={{ width: `${Math.max(t.progressPct || 0, 2)}%` }}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            <span>{t.progressPct}%</span>
                            <span style={{ opacity: 0.7 }}>{t.currentStage}</span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}

                  {/* Empty state hint */}
                  {colTopics.length === 0 && hint && (
                    <div className="empty-state">
                      <span className="empty-state-icon">{hint.icon}</span>
                      <span>{hint.text}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* RIGHT SIDE DETAILS PANEL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Spaced Review Queue Widget */}
        <ErrorBoundary fallbackTitle="Unable to load Spaced Repetition Queue">
          <SpacedReviewQueue onReviewSaved={fetchData} />
        </ErrorBoundary>

        {/* Visual Personal Knowledge Graph Network */}
        <ErrorBoundary fallbackTitle="Unable to load Knowledge Graph">
          <KnowledgeGraph topics={topics} />
        </ErrorBoundary>

      </div>

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
          background: 'rgba(0,0,0,0.85)',
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
              <select className="form-input" value={depthTarget} onChange={e => setDepthTarget(e.target.value)} style={{ background: '#121218' }}>
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
