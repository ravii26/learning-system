'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Subcomponents Import
import PrioritizationPortal from './PrioritizationPortal';
import LearnNowModal from './LearnNowModal';
import SpacedReviewQueue from './SpacedReviewQueue';
import KnowledgeGraph from './KnowledgeGraph';

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

const AREAS = ['All Areas', 'Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];
const STATUSES = ['inbox', 'queued', 'active', 'paused', 'maintenance', 'reference', 'dropped'];

export default function DashboardPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('All Areas');
  
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

  // Prioritization swaps state
  const [showPrioritization, setShowPrioritization] = useState(false);
  const [pendingActiveTopic, setPendingActiveTopic] = useState<Topic | null>(null);

  // Learn Now state
  const [showLearnNow, setShowLearnNow] = useState(false);
  const [dueReviewsCount, setDueReviewsCount] = useState(0);

  // Drag and Drop State
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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
        }),
      });

      if (res.ok) {
        setNewInboxTitle('');
        await fetchData();
        router.refresh();
      } else {
        const data = await res.json();
        setCaptureError(data.error || 'Failed to capture topic');
      }
    } catch (err) {
      setCaptureError('Failed to connect to server');
    } finally {
      setCapturing(false);
    }
  };

  const handleTransition = async (topic: Topic, newStatus: string) => {
    if (newStatus === 'active') {
      const currentActiveCount = topics.filter(t => t.status === 'active').length;
      if (currentActiveCount >= 2) {
        // Exceeded slot limit! Trigger Prioritization swap portal.
        setPendingActiveTopic(topic);
        setShowPrioritization(true);
        return;
      }

      // If missing why, depth, or nextAction, open fallback promotion modal
      if (!topic.why || !topic.depthTarget || !topic.nextAction) {
        setActivatingTopic(topic);
        setWhy(topic.why || '');
        setDepthTarget(topic.depthTarget || 'Proficiency');
        setNextAction(topic.nextAction || '');
        setActivationError(null);
        return;
      }
    }

    // Direct transition
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
        alert(data.error || 'Failed to update status');
      }
    } catch (err) {
      alert('Failed to connect to server');
    }
  };

  const handleConfirmSwap = async (activeToPauseId: string, pauseReason: string) => {
    if (!pendingActiveTopic) return;

    // 1. Fetch active topic metadata
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
      // 2. Pause the selected active topic
      await fetch(`/api/topics/${activeToPauseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paused',
          pauseHistory: updatedPauseHistory,
          nextAction: 'Re-prioritize and resume study',
        }),
      });

      // 3. Activate the pending topic
      const targetWhy = pendingActiveTopic.why || 'Swapped into active focus slot.';
      const targetDepth = pendingActiveTopic.depthTarget || 'Proficiency';
      const targetNext = pendingActiveTopic.nextAction || 'Map core concepts and prerequisites';

      await fetch(`/api/topics/${pendingActiveTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          why: targetWhy,
          depthTarget: targetDepth,
          nextAction: targetNext,
        }),
      });

      setShowPrioritization(false);
      setPendingActiveTopic(null);
      await fetchData();
      router.refresh();
    } catch (e) {
      console.error(e);
      alert('Connection error during slot swap.');
    }
  };

  const handleSessionComplete = async (topicId: string, summary: string, nextAction: string) => {
    try {
      // Fetch existing notes to append session reflections
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
        setActivatingTopic(null);
        await fetchData();
        router.refresh();
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

  if (loading) {
    return <div className="flex-center" style={{ minHeight: '60vh' }}>Loading Personal Learning OS...</div>;
  }

  const STALE_DAYS = 7;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '32px', alignItems: 'start' }}>
      
      {/* LEFT BOARD VIEW */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Header Board Controls */}
        <div className="flex-between">
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Workspace Dashboard</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Manage your focus load, capture ideas, and monitor spaced retention schedules.
            </p>
          </div>

          <button
            onClick={() => setShowLearnNow(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))', color: '#fff' }}
          >
            ⚡ Learn Now
          </button>
        </div>

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

        {/* Search & Area Filter Filters */}
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

        {/* 7 Status Kanban Columns Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', overflowX: 'auto', paddingBottom: '16px' }}>
          {STATUSES.map((colStatus) => {
            const colTopics = filteredTopics.filter(t => t.status === colStatus);
            const isOver = dragOverColumn === colStatus;
            
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
                <div className="flex-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: colStatus === 'active' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)' }}>
                    {colStatus}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                    {colTopics.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  {colTopics.map((t) => {
                    const lastTouched = t.lastTouchedDate ? new Date(t.lastTouchedDate) : null;
                    const daysSinceTouch = lastTouched ? Math.floor((Date.now() - lastTouched.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const isStale = colStatus === 'active' && daysSinceTouch >= STALE_DAYS;
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
                          borderLeft: t.activeSlotType === 'primary' ? '3px solid var(--color-primary)' : t.activeSlotType === 'secondary' ? '3px solid var(--color-accent)' : '1px solid var(--border-color)',
                        }}
                      >
                        <Link href={`/topics/${t.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{t.title}</span>
                          <span className={`badge badge-${t.area.toLowerCase()}`} style={{ fontSize: '0.6rem', alignSelf: 'flex-start' }}>{t.area}</span>
                          
                          {colStatus === 'active' && t.nextAction && (
                            <p style={{ fontSize: '0.68rem', color: 'var(--color-warning)', fontStyle: 'italic', marginTop: '2px', lineBreak: 'anywhere' }}>
                              Next: {t.nextAction}
                            </p>
                          )}

                          {isStale && (
                            <span style={{ fontSize: '0.6rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '2px' }}>
                              ⚠️ Untouched for 7 days
                            </span>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            <span>Progress: {t.progressPct}%</span>
                            <span>{t.currentStage}</span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* RIGHT SIDE DETAILS PANEL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Spaced Review Queue Widget */}
        <SpacedReviewQueue onReviewSaved={fetchData} />

        {/* Visual Personal Knowledge Graph Network */}
        <KnowledgeGraph topics={topics} />

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
          <form onSubmit={submitFallbackActivation} className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Activate "{activatingTopic.title}"</h3>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">WHY ARE YOU LEARNING THIS?</label>
              <textarea className="form-input" style={{ width: '100%', height: '60px', resize: 'none' }} value={why} onChange={e => setWhy(e.target.value)} required />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">DEPTH TARGET</label>
              <select className="form-input" value={depthTarget} onChange={e => setDepthTarget(e.target.value)} style={{ background: '#121218' }}>
                <option value="Awareness">Awareness</option>
                <option value="Working Knowledge">Working Knowledge</option>
                <option value="Proficiency">Proficiency</option>
                <option value="Deep">Deep Knowledge</option>
                <option value="Mastery">Mastery</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">CONCRETE NEXT ACTION (VERB-FIRST)</label>
              <input type="text" className="form-input" value={nextAction} onChange={e => setNextAction(e.target.value)} required />
            </div>

            {activationError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{activationError}</p>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" onClick={() => setActivatingTopic(null)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Activate Topic</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
