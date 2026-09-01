'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  
  // Wizard State
  // 'intro' | 'reviewing' | 'promote' | 'completed'
  const [step, setStep] = useState<'intro' | 'reviewing' | 'promote' | 'completed'>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  
  // Form values for the current topic under review
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
      const res = await fetch('/api/topics');
      if (res.ok) {
        const data: Topic[] = await res.json();
        setTopics(data);
        
        const ap = data.filter(t => t.status === 'active' || t.status === 'paused');
        setActivePaused(ap);
        
        const q = data.filter(t => t.status === 'queued');
        setQueuedTopics(q);
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
    return <div className="flex-center" style={{ minHeight: '60vh' }}>Processing Review...</div>;
  }

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* HEADER */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Weekly Focus Review</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Evaluate active/paused topics and decide what to learn next.
        </p>
      </div>

      {/* STEP: Intro */}
      {step === 'intro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Stats strip */}
          <div className="stat-strip">
            <span className="stat-chip" style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)', color: '#c084fc' }}>
              ⚡ {activePaused.filter(t => t.status === 'active').length} Active
            </span>
            <span className="stat-chip" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)', color: '#fbbf24' }}>
              ⏸️ {activePaused.filter(t => t.status === 'paused').length} Paused
            </span>
            <span className="stat-chip" style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)', color: '#818cf8' }}>
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
                    background: currentDecision === 'continue' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.02)',
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
                    background: currentDecision === 'pause' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
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
                    background: currentDecision === 'maintenance' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
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
                    background: currentDecision === 'drop' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
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
                <div key={qt.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,0,0,0.15)' }}>
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
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', background: 'rgba(99, 102, 241, 0.05)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
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
              background: 'rgba(0,0,0,0.8)',
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
                  <select className="form-input" value={depthTarget} onChange={e => setDepthTarget(e.target.value)} style={{ background: '#121218' }}>
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
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: 'var(--radius-sm)', textAlign: 'left', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>Summary of audit decisions:</p>
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
          
          <button onClick={() => { router.push('/'); router.refresh(); }} className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '12px' }}>
            Return to Dashboard
          </button>
        </div>
      )}

    </div>
  );
}
