'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStudyTimer } from '@/lib/useStudyTimer';
import { Button, ButtonLink } from '@/components/ui';
import ResurfacedNote from '@/components/ResurfacedNote';

const SPRINT_GRADES = [
  { grade: 'Again', key: '1', label: 'Forgot', hint: 'comes back soon' },
  { grade: 'Hard', key: '2', label: 'Hard', hint: 'sooner than usual' },
  { grade: 'Good', key: '3', label: 'Got it', hint: 'on schedule' },
  { grade: 'Easy', key: '4', label: 'Easy', hint: 'later than usual' },
] as const;

const daysAgo = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
};

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
  /** Set once you've recalled it before — a due card like this is slipping. */
  lastRecalledAt?: string | null;
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
  // One natural stopping point: once the slipping cards are done.
  const [pauseAfterSlipping, setPauseAfterSlipping] = useState(false);
  const [slippingDismissed, setSlippingDismissed] = useState(false);

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
        const list: DueConcept[] = spacedData.dueConcepts || [];
        // Slipping cards (recalled before, now overdue) first: they're the
        // ones you'd otherwise lose. The API's most-overdue order is kept
        // within each group.
        setDueConcepts([...list.filter((c) => c.lastRecalledAt), ...list.filter((c) => !c.lastRecalledAt)]);
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
      const slippingCount = dueConcepts.filter((c) => c.lastRecalledAt).length;
      if (currentConceptIdx + 1 < dueConcepts.length) {
        if (!slippingDismissed && slippingCount > 0 && currentConceptIdx + 1 === slippingCount) setPauseAfterSlipping(true);
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
    if (activeTab !== 'spaced_sprint' || dueConcepts.length === 0 || pauseAfterSlipping) return;
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
  }, [activeTab, revealedAnswer, dueConcepts.length, currentConceptIdx, pauseAfterSlipping]);

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
    setReviewError(null);
    if (!why.trim() || !nextAction.trim()) {
      setReviewError('Add why it matters now and a next step first.');
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
      setReviewError('Couldn’t save the check-in. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-6">
        {[60, 44, 320].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  const card = dueConcepts[currentConceptIdx];
  const slippingTotal = dueConcepts.filter((c) => c.lastRecalledAt).length;
  const remainingAfterSlipping = dueConcepts.length - slippingTotal;
  const TABS: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'spaced_sprint', label: `Cards${dueConcepts.length ? ` · ${dueConcepts.length}` : ''}` },
    { key: 'weekly_audit', label: 'Weekly check-in' },
    { key: 'pomodoro', label: `Focus timer${isActive ? ` · ${formattedTime}` : ''}` },
  ];

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Review</h1>
          <p className="m-0 text-[1.05rem] text-fg-secondary">Recall what you’ve learned just before it slips. That’s what makes it stay.</p>
        </div>
        <div role="tablist" aria-label="Review" className="flex self-start rounded-xl bg-sunk p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={`h-10 rounded-[9px] px-4 text-[0.9rem] ${activeTab === t.key ? 'bg-surface font-semibold text-fg shadow-card' : 'font-medium text-fg-secondary hover:text-fg'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'spaced_sprint' && (
        <div className="flex flex-col gap-8">
          {!card ? (
            <section className="flex flex-col gap-3 py-8">
              <h2 className="m-0 font-serif text-[2rem] font-normal">Nothing to review right now.</h2>
              <p className="m-0 max-w-[520px] text-[1rem] text-fg-secondary">
                Cards come back here just before you’d forget them. Finish a module or check a quiz and new ones appear.
              </p>
              <ButtonLink href="/" className="mt-2 self-start">Back to Today</ButtonLink>
            </section>
          ) : pauseAfterSlipping ? (
            <section className="flex flex-col gap-4 py-8">
              <h2 className="m-0 font-serif text-[2.2rem] font-normal leading-tight">
                The {slippingTotal} slipping card{slippingTotal === 1 ? ' is' : 's are'} safe again.
              </h2>
              <p className="m-0 max-w-[560px] text-[1.05rem] text-fg-secondary">
                {remainingAfterSlipping} more {remainingAfterSlipping === 1 ? 'is' : 'are'} due, about {Math.max(1, Math.ceil(remainingAfterSlipping * 0.7))} min. You can also stop here — nothing else is slipping today.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="lg" onClick={() => { setPauseAfterSlipping(false); setSlippingDismissed(true); }}>
                  Do the other {remainingAfterSlipping}
                </Button>
                <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
              </div>
            </section>
          ) : (
            <article className="flex flex-col gap-7">
              <div
                className="flex gap-1.5"
                role="img"
                aria-label={`Card ${currentConceptIdx + 1} of ${dueConcepts.length}${slippingTotal ? `; the first ${slippingTotal} are slipping` : ''}`}
              >
                {dueConcepts.slice(0, 40).map((c, i) => (
                  <span
                    key={c.conceptId}
                    className={`block h-1.5 flex-1 rounded-full ${
                      i < currentConceptIdx ? 'bg-ink' : i === currentConceptIdx ? 'shadow-[inset_0_0_0_2px_var(--ink)]' : c.lastRecalledAt ? 'bg-k-fading' : 'bg-sunk'
                    }`}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-[0.9rem] text-fg-secondary">
                <span className={`h-2.5 w-2.5 rounded-[3px] ${card.lastRecalledAt ? 'bg-k-fading' : 'bg-k-learning'}`} aria-hidden="true" />
                <span>
                  <strong className="text-fg">{card.topicTitle}</strong>
                  {card.moduleTitle ? ` · ${card.moduleTitle}` : ''}
                  {' · '}
                  {card.lastRecalledAt ? `slipping — last recalled ${daysAgo(card.lastRecalledAt)}` : 'first review'}
                </span>
                <span className="ml-auto text-fg-muted">{currentConceptIdx + 1} of {dueConcepts.length}</span>
              </div>

              <h2 className="m-0 font-serif text-[2.1rem] font-medium leading-[1.2] tracking-[-0.01em]">
                {card.prompt ? card.prompt : <>Explain “{card.conceptTitle}” in your own words.</>}
              </h2>

              {!revealedAnswer ? (
                <div className="flex flex-col gap-3.5">
                  <label htmlFor="recall-attempt" className="text-[0.95rem] font-semibold text-fg-secondary">
                    Answer from memory first — out loud or typed
                  </label>
                  <textarea
                    id="recall-attempt"
                    key={card.conceptId}
                    rows={4}
                    placeholder="Optional. Writing it down makes the check more honest."
                    className="form-input resize-y text-[1.05rem] leading-relaxed"
                  />
                  <div className="flex items-center gap-3.5">
                    <Button variant="primary" size="lg" onClick={() => setRevealedAnswer(true)}>Show answer</Button>
                    <span className="text-[0.875rem] text-fg-muted">
                      or press <kbd className="rounded bg-sunk px-1.5 py-0.5 text-[0.75rem] text-fg-secondary">Space</kbd>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2.5 border-t border-line pt-6">
                    <span className="text-[0.875rem] font-semibold text-k-solid">Answer</span>
                    {card.answer ? (
                      <p className="m-0 whitespace-pre-wrap font-serif text-[1.3rem] leading-relaxed">{card.answer}</p>
                    ) : (
                      <p className="m-0 text-[1rem] text-fg-secondary">
                        This card has no stored answer. Check yourself against your notes, then grade honestly.
                      </p>
                    )}
                  </div>
                  {card.moduleNote && (
                    <div className="flex flex-col gap-1.5 rounded-xl bg-sunk px-5 py-4">
                      <span className="text-[0.8rem] font-semibold text-fg-muted">
                        Your notes{card.moduleTitle ? ` on ${card.moduleTitle}` : ''}
                      </span>
                      <p className="m-0 whitespace-pre-wrap font-serif text-[1.05rem] italic leading-relaxed text-fg-secondary">{card.moduleNote}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <span className="text-[0.95rem] font-semibold">How well did you remember it?</span>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {SPRINT_GRADES.map((g) => (
                        <button
                          key={g.grade}
                          onClick={() => handleLogSpacedReview(g.grade)}
                          className={`flex min-h-[76px] flex-col items-start gap-1 rounded-xl border bg-surface px-4 py-3 text-left hover:border-line-hover ${g.grade === 'Good' ? 'border-ink' : 'border-line'}`}
                        >
                          <span className="flex items-center gap-2 text-[1rem] font-semibold text-fg">
                            <kbd className="rounded bg-sunk px-1.5 text-[0.7rem] text-fg-secondary">{g.key}</kbd>
                            {g.label}
                          </span>
                          <span className="text-[0.8rem] text-fg-muted">{g.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </article>
          )}

          <ResurfacedNote />
        </div>
      )}

      {activeTab === 'pomodoro' && (
        <section className="flex flex-col items-center gap-6 py-10 text-center">
          <span className="text-[0.95rem] font-semibold text-fg-secondary">
            {mode === 'study' ? 'Focus block' : mode === 'shortBreak' ? 'Short break' : 'Long break'}
          </span>
          <div className="font-mono text-[5rem] font-medium leading-none tracking-tight tabular-nums">{formattedTime}</div>
          <div className="flex flex-wrap justify-center gap-2.5">
            {!isActive ? (
              <Button variant="primary" size="lg" onClick={startTimer}>Start</Button>
            ) : (
              <Button size="lg" onClick={pauseTimer}>Pause</Button>
            )}
            <Button size="lg" onClick={() => resetTimer('study')}>Reset to 25 min</Button>
            <Button size="lg" variant="ghost" onClick={() => resetTimer('shortBreak')}>5-minute break</Button>
          </div>
          {isCompleted && <p className="m-0 text-[1rem] text-fg-secondary">Block done. Take the break — it helps it settle.</p>}
          <p className="m-0 max-w-[460px] text-[0.875rem] text-fg-muted">
            Studying inside a topic counts your time on its own. Use this for work away from the app.
          </p>
        </section>
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
              {activePaused.filter(t => t.status === 'active').length} in Now
            </span>
            <span className="stat-chip" style={{ background: 'var(--warning-tint)', borderColor: 'var(--warning-line)', color: 'var(--color-warning)' }}>
              {activePaused.filter(t => t.status === 'paused').length} resting
            </span>
            <span className="stat-chip" style={{ background: 'var(--fill-2)', borderColor: 'var(--fill-4)', color: 'var(--color-text-primary)' }}>
              {queuedTopics.length} in Next
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>Check in on {activePaused.length} topic{activePaused.length === 1 ? '' : 's'}</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                Five minutes a week: for each topic, keep going, rest it, or let it go — and set its next step.
              </p>
            </div>

            {activePaused.length === 0 ? (
              <div style={{ padding: '20px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
                Nothing in Now or resting. You can still move topics up from Next.
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
                      {t.status === 'active' ? 'Now' : 'resting'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={startReview} className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '4px' }}>
              Start the check-in
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
              <label className="form-label">Next step (start with a verb)</label>
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
                  Keep going
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
                  Rest it
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
                  Done — just keep it fresh
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
                  Let it go
                </button>
              </div>
            </div>
          </div>

          {reviewError && (
            <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{reviewError}</p>
          )}

          <button onClick={handleNextTopic} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
            {currentIdx + 1 < activePaused.length ? 'Next topic' : 'Choose what moves up'}
          </button>
        </div>
      )}

      {/* STEP: Queue Promotion */}
      {step === 'promote' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>Move something up from Next</h2>
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
              Both Now slots are taken. Finish or rest a topic to make room.
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

                {reviewError && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{reviewError}</p>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="button" onClick={() => { setPromotingTopic(null); setReviewError(null); }} className="btn btn-secondary">Cancel</button>
                  <button type="button" onClick={submitPromotion} className="btn btn-primary">Activate Topic</button>
                </div>
              </div>
            </div>
          )}

          {reviewError && !promotingTopic && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{reviewError}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '12px' }}>
            {activePaused.length > 0 && (
              <button onClick={() => setStep('reviewing')} className="btn btn-secondary">
                Back
              </button>
            )}
            <button onClick={finishReview} className="btn btn-primary" style={{ marginLeft: 'auto' }}>
              Finish the check-in
            </button>
          </div>
        </div>
      )}

      {/* STEP: Completed */}
      {step === 'completed' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Check-in done</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Your topics are updated. See you next week.
            </p>
            <div style={{ background: 'var(--bg-sunk)', padding: '16px', borderRadius: 'var(--radius-sm)', textAlign: 'left', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontWeight: 600, borderBottom: '1px solid var(--fill-2)', paddingBottom: '4px' }}>What you decided</p>
              {decisions.map(d => (
                <div key={d.topicId} className="flex-between">
                  <span>{d.title}</span>
                  <span className={`status-${d.decision}`} style={{ fontWeight: 500 }}>{d.decision}</span>
                </div>
              ))}
              {promotedDecisions.map(p => (
                <div key={p.topicId} className="flex-between">
                  <span>{topics.find(t => t.id === p.topicId)?.title}</span>
                  <span style={{ color: 'var(--color-primary-light)', fontWeight: 500 }}>moved to Now</span>
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
