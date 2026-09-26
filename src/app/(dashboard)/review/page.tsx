'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStudyTimer } from '@/lib/useStudyTimer';
import { Button, ButtonLink, Card, CardLabel, EmptyState } from '@/components/ui';
import ResurfacedNote from '@/components/ResurfacedNote';

const SPRINT_GRADES = [
  { grade: 'Again', key: '1', label: '❌ Again', hint: 'Forgot it', cls: 'border-danger bg-[var(--danger-tint)] text-danger' },
  { grade: 'Hard', key: '2', label: '😓 Hard', hint: 'Got it, with effort', cls: 'border-warning bg-[var(--warning-tint)] text-warning' },
  { grade: 'Good', key: '3', label: '✅ Good', hint: 'Recalled fine', cls: 'border-success bg-[var(--success-tint)] text-success' },
  { grade: 'Easy', key: '4', label: '⚡ Easy', hint: 'Instant', cls: 'border-primary bg-[var(--fill-2)] text-primary-light' },
] as const;

interface Topic {
  id: string;
  title: string;
  area: string;
  status: string;
  why: string | null;
  depthTarget: string | null;
  nextAction: string | null;
  lastTouchedDate: string;
  progressPct: number;
}

interface DueConcept {
  topicId: string;
  topicTitle: string;
  topicArea: string;
  conceptId: string;
  conceptTitle: string;
  conceptStatus: string;
  difficulty: string;
  importance: string;
  /** Set on cards made from lessons and quiz misses; plain concepts have neither. */
  prompt?: string | null;
  answer?: string | null;
  moduleTitle?: string | null;
  /** Your own notes on the module this card came from, as plain text. */
  moduleNote?: string | null;
}

interface ReviewDecision {
  topicId: string;
  title: string;
  decision: 'continue' | 'pause' | 'drop' | 'maintenance';
  nextAction: string;
}

export default function ReviewPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activePaused, setActivePaused] = useState<Topic[]>([]);
  const [queuedTopics, setQueuedTopics] = useState<Topic[]>([]);
  const [dueConcepts, setDueConcepts] = useState<DueConcept[]>([]);
  const [currentConceptIdx, setCurrentConceptIdx] = useState(0);
  const [revealedAnswer, setRevealedAnswer] = useState(false);

  // Focus mode tab: 'spaced_sprint' | 'weekly_audit' | 'pomodoro'
  const [activeTab, setActiveTab] = useState<'spaced_sprint' | 'weekly_audit' | 'pomodoro'>('spaced_sprint');
  
  // Timer Hook
  const { secondsRemaining, isActive, mode, formattedTime, startTimer, pauseTimer, resetTimer, isCompleted } = useStudyTimer();

  // Wizard State for weekly audit
  const [step, setStep] = useState<'intro' | 'reviewing' | 'promote' | 'completed'>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  
  const [currentDecision, setCurrentDecision] = useState<'continue' | 'pause' | 'drop' | 'maintenance'>('continue');
  const [currentNextAction, setCurrentNextAction] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Queue Promotion State
  const [activeSlotsRemaining, setActiveSlotsRemaining] = useState(2);
  const [promotingTopic, setPromotingTopic] = useState<Topic | null>(null);
  const [why, setWhy] = useState('');
  const [depthTarget, setDepthTarget] = useState('Proficiency');
  const [nextAction, setNextAction] = useState('');
  const [promotedDecisions, setPromotedDecisions] = useState<Array<{ topicId: string, why: string, depthTarget: string, nextAction: string }>>([]);

  const fetchData = async () => {
    try {
      const [topicsRes, spacedRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/review/spaced')
      ]);

      if (topicsRes.ok) {
        const data: Topic[] = await topicsRes.json();
        setTopics(data);
        setActivePaused(data.filter(t => t.status === 'active' || t.status === 'paused'));
        setQueuedTopics(data.filter(t => t.status === 'queued'));
      }

      if (spacedRes.ok) {
        const spacedData = await spacedRes.json();
        setDueConcepts(spacedData.dueConcepts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Four FSRS grades (was pass/fail, which threw away Hard/Easy — the
  // difference between a 3-day and a 3-week next interval).
  const handleLogSpacedReview = async (grade: 'Again' | 'Hard' | 'Good' | 'Easy') => {
    const concept = dueConcepts[currentConceptIdx];
    if (!concept) return;

    try {
      await fetch('/api/review/spaced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: concept.topicId,
          conceptId: concept.conceptId,
          grade,
        }),
      });

      setRevealedAnswer(false);
      if (currentConceptIdx + 1 < dueConcepts.length) {
        setCurrentConceptIdx(prev => prev + 1);
      } else {
        await fetchData();
        setCurrentConceptIdx(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard: Space reveals, 1-4 grades — only on the sprint tab, and never
  // while typing in a field.
  useEffect(() => {
    if (activeTab !== 'spaced_sprint' || dueConcepts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (!revealedAnswer && e.key === ' ') {
        e.preventDefault();
        setRevealedAnswer(true);
        return;
      }
      const g = revealedAnswer ? SPRINT_GRADES.find((x) => x.key === e.key) : undefined;
      if (g) {
        e.preventDefault();
        handleLogSpacedReview(g.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, revealedAnswer, dueConcepts.length, currentConceptIdx]);

  const startReview = () => {
    if (activePaused.length === 0) {
      // Go straight to promotion if there are no active/paused topics
      setStep('promote');
      calculateActiveSlots(0);
      return;
    }
    setStep('reviewing');
    setCurrentIdx(0);
    loadTopicForReview(0);
  };

  const loadTopicForReview = (index: number) => {
    const topic = activePaused[index];
    setCurrentDecision(topic.status === 'paused' ? 'pause' : 'continue');
    setCurrentNextAction(topic.nextAction || '');
    setReviewError(null);
  };

  const handleNextTopic = () => {
    if ((currentDecision === 'continue' || currentDecision === 'pause') && !currentNextAction.trim()) {
      setReviewError('A Next Action is required to continue or pause this topic.');
      return;
    }

    const currentTopic = activePaused[currentIdx];
    
    // Record decision
    const newDecision: ReviewDecision = {
      topicId: currentTopic.id,
      title: currentTopic.title,
      decision: currentDecision,
      nextAction: currentNextAction.trim(),
    };

    const updatedDecisions = [...decisions.filter(d => d.topicId !== currentTopic.id), newDecision];
    setDecisions(updatedDecisions);

    if (currentIdx + 1 < activePaused.length) {
      setCurrentIdx(currentIdx + 1);
      loadTopicForReview(currentIdx + 1);
    } else {
      // Calculate remaining active slots before promotion
      let activeCountAfterReview = 0;
      updatedDecisions.forEach(d => {
        if (d.decision === 'continue') activeCountAfterReview++;
      });
      calculateActiveSlots(activeCountAfterReview);
      setStep('promote');
    }
  };

  const calculateActiveSlots = (currentActive: number) => {
    const remaining = Math.max(0, 2 - currentActive);
    setActiveSlotsRemaining(remaining);
  };

  // Promotion handlers
  const handleSelectPromote = (topic: Topic) => {
    setPromotingTopic(topic);
    setWhy(topic.why || '');
    setDepthTarget(topic.depthTarget || 'Proficiency');
    setNextAction(topic.nextAction || '');
  };

  const submitPromotion = () => {
    if (!promotingTopic) return;
    if (!why.trim() || !nextAction.trim()) {
      alert('Why and Next Action are required to activate this topic.');
      return;
    }

    // Record promotion
    setPromotedDecisions([
      ...promotedDecisions,
      {
        topicId: promotingTopic.id,
        why: why.trim(),
        depthTarget,
        nextAction: nextAction.trim(),
      }
    ]);

    setActiveSlotsRemaining(prev => Math.max(0, prev - 1));
    setQueuedTopics(prev => prev.filter(t => t.id !== promotingTopic.id));
    setPromotingTopic(null);
  };

  const finishReview = async () => {
    setLoading(true);
    try {
      // 1. Save standard reviews to backend
      const reviewPayload = decisions.map(d => ({
        topicId: d.topicId,
        title: d.title,
        decision: d.decision,
      }));

      // Update next actions on topics whose next action changed
      for (const d of decisions) {
        const originalTopic = activePaused.find(t => t.id === d.topicId);
        if (originalTopic && originalTopic.nextAction !== d.nextAction) {
          await fetch(`/api/topics/${d.topicId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextAction: d.nextAction, status: d.decision === 'continue' ? 'active' : d.decision }),
          });
        }
      }

      // 2. Save promoted queue topics to active status
      for (const p of promotedDecisions) {
        await fetch(`/api/topics/${p.topicId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'active',
            why: p.why,
            depthTarget: p.depthTarget,
            nextAction: p.nextAction,
          }),
        });
      }

      // 3. Post review log to create setting timestamp
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: [...reviewPayload, ...promotedDecisions.map(p => ({ topicId: p.topicId, title: 'Promoted from Queue', decision: 'continue' }))]
        }),
      });

      setStep('completed');
    } catch (e) {
      console.error(e);
      alert('An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex-center" style={{ minHeight: '60vh' }}>Processing Workspace...</div>;
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* HEADER & NAVIGATION TABS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Daily Focus & Review Workspace</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Execute active recall sprints, monitor focus commitments, and manage study timers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button
            onClick={() => setActiveTab('spaced_sprint')}
            className={`btn ${activeTab === 'spaced_sprint' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚡ Spaced Recall Sprint ({dueConcepts.length})
          </button>

          <button
            onClick={() => setActiveTab('weekly_audit')}
            className={`btn ${activeTab === 'weekly_audit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            🔄 Weekly Focus Audit
          </button>

          <button
            onClick={() => setActiveTab('pomodoro')}
            className={`btn ${activeTab === 'pomodoro' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⏱️ Pomodoro Sprint ({formattedTime})
          </button>
        </div>
      </div>

      {/* TAB 1: SPACED RECALL SPRINT */}
      {activeTab === 'spaced_sprint' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {dueConcepts.length === 0 ? (
            <EmptyState icon="🎉" title="No concepts due" action={<ButtonLink href="/">← Back to Today</ButtonLink>}>
              Nothing in your spaced-repetition queue right now. Concepts come back here when FSRS says you&apos;re about to forget them.
            </EmptyState>
          ) : (
            <Card className="flex flex-col gap-5 p-7">
              <div className="flex-between">
                <span className="badge badge-tech text-[0.72rem]">{dueConcepts[currentConceptIdx].topicTitle}</span>
                <span className="text-[0.75rem] text-fg-muted">Card {currentConceptIdx + 1} of {dueConcepts.length}</span>
              </div>

              <div className="rounded-md border border-line bg-sunk px-3 py-6 text-center">
                <CardLabel>Recall from memory first</CardLabel>
                <h2 className="mx-auto mt-2 max-w-[560px] text-xl font-bold text-fg">
                  {dueConcepts[currentConceptIdx].prompt
                    ? dueConcepts[currentConceptIdx].prompt
                    : <>Can you explain or define: &quot;{dueConcepts[currentConceptIdx].conceptTitle}&quot;?</>}
                </h2>
                {revealedAnswer && (
                  <div className="mt-4 border-t border-dashed border-line pt-4 text-[0.88rem]">
                    {dueConcepts[currentConceptIdx].answer ? (
                      <div className="mx-auto max-w-[560px] whitespace-pre-wrap text-left leading-relaxed text-fg">
                        <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-success">Answer</span>
                        {dueConcepts[currentConceptIdx].answer}
                      </div>
                    ) : (
                      <span className="text-fg-muted">
                        No stored answer for this card — check yourself against your notes, then grade honestly.
                      </span>
                    )}
                    {dueConcepts[currentConceptIdx].moduleNote && (
                      <div className="mx-auto mt-4 max-w-[560px] whitespace-pre-wrap rounded-md bg-fill-2 px-4 py-3 text-left text-[0.85rem] leading-relaxed text-fg-secondary">
                        <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-fg-muted">
                          Your notes{dueConcepts[currentConceptIdx].moduleTitle ? ` on ${dueConcepts[currentConceptIdx].moduleTitle}` : ''}
                        </span>
                        {dueConcepts[currentConceptIdx].moduleNote}
                      </div>
                    )}
                    <div className="mt-3 text-[0.75rem] text-fg-muted">
                      {dueConcepts[currentConceptIdx].conceptTitle} · level {dueConcepts[currentConceptIdx].conceptStatus}
                    </div>
                  </div>
                )}
              </div>

              {!revealedAnswer ? (
                <Button variant="primary" className="self-center px-6" onClick={() => setRevealedAnswer(true)}>
                  👁️ I&apos;ve tried — reveal &amp; grade <kbd className="ml-1 rounded bg-fill-4 px-1 text-[0.7rem]">Space</kbd>
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SPRINT_GRADES.map((g) => (
                    <button
                      key={g.grade}
                      onClick={() => handleLogSpacedReview(g.grade)}
                      className={`btn flex-col gap-0.5 border py-3 ${g.cls}`}
                    >
                      <span className="text-[0.9rem] font-semibold">{g.label} <kbd className="ml-1 rounded bg-fill-3 px-1 text-[0.68rem]">{g.key}</kbd></span>
                      <span className="text-[0.68rem] opacity-80">{g.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          <ResurfacedNote />
        </div>
      )}

      {/* TAB 3: POMODORO TIMER WORKSPACE */}
      {activeTab === 'pomodoro' && (
        <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {mode === 'study' ? '🧠 Deep Study Sprint' : mode === 'shortBreak' ? '☕ Short Break' : '🌴 Long Break'}
          </span>
          <div style={{ fontSize: '4.5rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '2px', color: 'var(--color-text-primary)' }}>
            {formattedTime}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {!isActive ? (
              <button onClick={startTimer} className="btn btn-primary" style={{ padding: '10px 24px', fontSize: '0.9rem' }}>
                ▶ Start Focus Timer
              </button>
            ) : (
              <button onClick={pauseTimer} className="btn btn-secondary" style={{ padding: '10px 24px', fontSize: '0.9rem' }}>
                ⏸ Pause
              </button>
            )}
            <button onClick={() => resetTimer('study')} className="btn btn-secondary" style={{ padding: '10px 16px', fontSize: '0.85rem' }}>
              ↺ Reset 25m
            </button>
            <button onClick={() => resetTimer('shortBreak')} className="btn btn-secondary" style={{ padding: '10px 16px', fontSize: '0.85rem' }}>
              ☕ 5m Break
            </button>
          </div>

          {isCompleted && (
            <div style={{ padding: '12px 18px', background: 'var(--success-tint)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-sm)', color: 'var(--color-success)', fontSize: '0.85rem' }}>
              🎉 Pomodoro sprint complete! Great focus effort.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WEEKLY FOCUS AUDIT */}
      {activeTab === 'weekly_audit' && (
        <>
          {/* STEP: Intro */}
          {step === 'intro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Stats strip */}
          <div className="stat-strip">
            <span className="stat-chip" style={{ background: 'var(--fill-2)', borderColor: 'var(--fill-4)', color: 'var(--color-text-secondary)' }}>
              ⚡ {activePaused.filter(t => t.status === 'active').length} Active
            </span>
            <span className="stat-chip" style={{ background: 'var(--warning-tint)', borderColor: 'var(--warning-line)', color: 'var(--color-warning)' }}>
              ⏸️ {activePaused.filter(t => t.status === 'paused').length} Paused
            </span>
            <span className="stat-chip" style={{ background: 'var(--fill-2)', borderColor: 'var(--fill-4)', color: 'var(--color-text-primary)' }}>
              📋 {queuedTopics.length} Queued
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>🔄</div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>Auditing {activePaused.length} Focus Cards</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                Review each active and paused topic, update next actions, and decide whether to continue, pause, or close them out.
              </p>
            </div>

            {activePaused.length === 0 ? (
              <div style={{ padding: '20px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                ✨ Nothing to review — your focus is clean!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                {activePaused.map(t => (
                  <div key={t.id} className="review-preview-card">
                    <span className={`badge badge-${t.area.toLowerCase()}`}>{t.area}</span>
                    <span style={{ flexGrow: 1, fontSize: '0.88rem', fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(t.lastTouchedDate).toLocaleDateString()}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: t.status === 'active' ? 'var(--color-primary-light)' : 'var(--color-warning)',
                    }}>
                      {t.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={startReview} className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '4px' }}>
              🚀 Start Focus Review
            </button>
          </div>
        </div>
      )}

      {/* STEP: Reviewing step-by-step */}
      {step === 'reviewing' && activePaused[currentIdx] && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Visual progress bar */}
          <div className="review-progress-bar">
            <div
              className="review-progress-fill"
              style={{ width: `${Math.round(((currentIdx + 1) / activePaused.length) * 100)}%` }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--color-text-secondary)', marginTop: '-14px' }}>
            <span>Topic {currentIdx + 1} of {activePaused.length}</span>
            <span>{Math.round(((currentIdx + 1) / activePaused.length) * 100)}% reviewed</span>
          </div>
          
          <div>
            <span className={`badge badge-${activePaused[currentIdx].area.toLowerCase()}`} style={{ marginBottom: '8px' }}>
              {activePaused[currentIdx].area}
            </span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '6px' }}>
              {activePaused[currentIdx].title}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Last touched: {new Date(activePaused[currentIdx].lastTouchedDate).toLocaleDateString()}
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Next concrete action (verb-first)</label>
              <input
                type="text"
                className="form-input"
                value={currentNextAction}
                onChange={(e) => setCurrentNextAction(e.target.value)}
                placeholder="e.g. Study CAP theorem trade-offs"
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ marginBottom: '8px' }}>Status decision</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setCurrentDecision('continue')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: currentDecision === 'continue' ? 'var(--fill-3)' : 'var(--fill-1)',
                    border: currentDecision === 'continue' ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                    color: currentDecision === 'continue' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  ⚡ Continue Active
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentDecision('pause')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: currentDecision === 'pause' ? 'var(--warning-tint)' : 'var(--fill-1)',
                    border: currentDecision === 'pause' ? '1px solid var(--color-warning)' : '1px solid var(--border-color)',
                    color: currentDecision === 'pause' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                  }}
                >
                  ⏸️ Pause topic
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentDecision('maintenance')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: currentDecision === 'maintenance' ? 'var(--success-tint)' : 'var(--fill-1)',
                    border: currentDecision === 'maintenance' ? '1px solid var(--color-success)' : '1px solid var(--border-color)',
                    color: currentDecision === 'maintenance' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                  }}
                >
                  ✅ Complete / Maintain
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentDecision('drop')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: currentDecision === 'drop' ? 'var(--danger-tint)' : 'var(--fill-1)',
                    border: currentDecision === 'drop' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                    color: currentDecision === 'drop' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                  }}
                >
                  🗑️ Drop learning
                </button>
              </div>
            </div>
          </div>

          {reviewError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{reviewError}</p>
          )}

          <button onClick={handleNextTopic} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            {currentIdx + 1 < activePaused.length ? 'Next Topic →' : 'Review Queue Promotion →'}
          </button>
        </div>
      )}

      {/* STEP: Queue Promotion */}
      {step === 'promote' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>🚀 Promote Queued Topics</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              You have <strong>{activeSlotsRemaining} / 2</strong> active slots available. Decide if you would like to promote any of your queued learning topics.
            </p>
          </div>

          {activeSlotsRemaining > 0 && queuedTopics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Available in Queue</span>
              {queuedTopics.map((qt) => (
                <div key={qt.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-sunk)' }}>
                  <div>
                    <span className={`badge badge-${qt.area.toLowerCase()}`} style={{ marginRight: '8px' }}>{qt.area}</span>
                    <strong style={{ fontSize: '0.9rem' }}>{qt.title}</strong>
                  </div>
                  <button onClick={() => handleSelectPromote(qt)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                    Activate
                  </button>
                </div>
              ))}
            </div>
          )}

          {queuedTopics.length === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
              No topics in queue.
            </p>
          )}

          {activeSlotsRemaining === 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', background: 'var(--fill-1)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--fill-3)' }}>
              🔒 <strong>Active Slots Occupied</strong>. You cannot promote any more topics to active because your 2 slots are full.
            </p>
          )}

          {promotedDecisions.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Promotions Selected:</span>
              <ul style={{ fontSize: '0.85rem', marginTop: '8px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {promotedDecisions.map(p => (
                  <li key={p.topicId}>
                    Promoted <strong>{topics.find(t => t.id === p.topicId)?.title}</strong> with next action: <em>"{p.nextAction}"</em>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick inline promotion details form modal */}
          {promotingTopic && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--bg-overlay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              padding: '16px'
            }}>
              <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Activate "{promotingTopic.title}"</h3>
                
                <div className="form-group">
                  <label className="form-label">Why is this critical now?</label>
                  <textarea className="form-input" style={{ width: '100%', height: '60px', resize: 'none' }} value={why} onChange={e => setWhy(e.target.value)} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Depth target</label>
                  <select className="form-input" value={depthTarget} onChange={e => setDepthTarget(e.target.value)} style={{ background: 'var(--bg-surface)' }}>
                    <option value="Awareness">Awareness</option>
                    <option value="Working Knowledge">Working Knowledge</option>
                    <option value="Proficiency">Proficiency</option>
                    <option value="Deep">Deep Knowledge</option>
                    <option value="Mastery">Mastery</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Concrete next action (verb-first)</label>
                  <input type="text" className="form-input" value={nextAction} onChange={e => setNextAction(e.target.value)} required />
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="button" onClick={() => setPromotingTopic(null)} className="btn btn-secondary">Cancel</button>
                  <button type="button" onClick={submitPromotion} className="btn btn-primary">Activate Topic</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '12px' }}>
            {activePaused.length > 0 && (
              <button onClick={() => setStep('reviewing')} className="btn btn-secondary">
                ← Go Back
              </button>
            )}
            <button onClick={finishReview} className="btn btn-primary" style={{ marginLeft: 'auto' }}>
              Finalize Focus Audit & Log Review
            </button>
          </div>
        </div>
      )}

      {/* STEP: Completed */}
      {step === 'completed' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', color: 'var(--color-success)' }}>✅</div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Weekly Audit Completed</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Your focus and pipeline allocations have been recorded. Active counts and milestones are up to date.
            </p>
            <div style={{ background: 'var(--bg-sunk)', padding: '16px', borderRadius: 'var(--radius-sm)', textAlign: 'left', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontWeight: 600, borderBottom: '1px solid var(--fill-2)', paddingBottom: '4px' }}>Summary of audit decisions:</p>
              {decisions.map(d => (
                <div key={d.topicId} className="flex-between">
                  <span>{d.title}</span>
                  <span className={`status-${d.decision}`} style={{ fontWeight: 500 }}>{d.decision.toUpperCase()}</span>
                </div>
              ))}
              {promotedDecisions.map(p => (
                <div key={p.topicId} className="flex-between">
                  <span>{topics.find(t => t.id === p.topicId)?.title}</span>
                  <span style={{ color: 'var(--color-primary-light)', fontWeight: 500 }}>PROMOTED ACTIVE</span>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      )}
        </>
      )}

    </div>
  );
}
