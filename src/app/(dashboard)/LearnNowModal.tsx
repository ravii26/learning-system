import React, { useState, useEffect } from 'react';
import { generateSessionPlan, SessionPlan, SessionPlanStep, Topic } from '@/lib/sessionHeuristics';

interface LearnNowModalProps {
  activeTopics: Topic[];
  dueReviewsCount: number;
  mistakesCount: number;
  onSessionComplete: (topicId: string, summary: string, nextAction: string) => Promise<void>;
  onClose: () => void;
}

export default function LearnNowModal({
  activeTopics,
  dueReviewsCount,
  mistakesCount,
  onSessionComplete,
  onClose,
}: LearnNowModalProps) {
  // Views: 'setup' | 'running' | 'completed'
  const [view, setView] = useState<'setup' | 'running' | 'completed'>('setup');

  // Setup inputs
  const [time, setTime] = useState<number>(30);
  const [energy, setEnergy] = useState<'low' | 'normal' | 'high'>('normal');
  const [context, setContext] = useState<'desk' | 'commute' | 'break' | 'weekend'>('desk');
  const [plan, setPlan] = useState<SessionPlan | null>(null);

  // Running session timer state
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [scratchpad, setScratchpad] = useState('');

  // Reflection state
  const [reflectLearn, setReflectLearn] = useState('');
  const [reflectUnclear, setReflectUnclear] = useState('');
  const [reflectNext, setReflectNext] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Generate initial plan
  useEffect(() => {
    const newPlan = generateSessionPlan(time, energy, context, activeTopics, dueReviewsCount, mistakesCount);
    setPlan(newPlan);
  }, [time, energy, context, activeTopics, dueReviewsCount, mistakesCount]);

  // Handle countdown timers
  useEffect(() => {
    let interval: any = null;
    if (view === 'running' && sessionActive) {
      interval = setInterval(() => {
        setTotalSecondsElapsed((prev) => prev + 1);
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            // Step complete, check if there are more steps
            if (plan && activeStepIdx + 1 < plan.steps.length) {
              const nextIdx = activeStepIdx + 1;
              setActiveStepIdx(nextIdx);
              // Play double chime tone
              playMicroChime();
              return plan.steps[nextIdx].durationMin * 60;
            } else {
              setSessionActive(false);
              setView('completed');
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [view, sessionActive, activeStepIdx, plan]);

  const playMicroChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  const handleStartSession = () => {
    if (!plan) return;
    setActiveStepIdx(0);
    setSecondsRemaining(plan.steps[0].durationMin * 60);
    setTotalSecondsElapsed(0);
    setSessionActive(true);
    setView('running');
  };

  const handleSkipStep = () => {
    if (!plan) return;
    if (activeStepIdx + 1 < plan.steps.length) {
      const nextIdx = activeStepIdx + 1;
      setActiveStepIdx(nextIdx);
      setSecondsRemaining(plan.steps[nextIdx].durationMin * 60);
    } else {
      setView('completed');
    }
  };

  const handleFinishEarly = () => {
    if (confirm('Finish this learning session early?')) {
      setView('completed');
    }
  };

  const handleSaveReflection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;

    if (!reflectLearn.trim() || !reflectNext.trim()) {
      alert('Please fill out what you learned and your next action to log the session.');
      return;
    }

    setSubmitting(true);
    try {
      // Compile reflection log
      const summaryLog = `[Learn Now Session: ${plan.title}] Elapsed: ${Math.floor(totalSecondsElapsed / 60)}m. Summary: "${reflectLearn.trim()}". Gaps: "${reflectUnclear.trim() || 'None'}"`;
      const targetTopicId = plan.topicId === 'all' ? (activeTopics[0]?.id || '') : plan.topicId;
      
      await onSessionComplete(targetTopicId, summaryLog, reflectNext.trim());
      onClose();
    } catch (e) {
      console.error(e);
      alert('Connection error logging reflection.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const r = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1400, padding: '16px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '620px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* VIEW: Setup */}
        {view === 'setup' && plan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>⚡ Socratic Learn Now</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Aligns your study block dynamically to available constraints.
                </p>
              </div>
              <button onClick={onClose} style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>×</button>
            </div>

            {/* Inputs selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>TIME AVAILABLE</label>
                <select className="form-input" value={time} onChange={(e) => setTime(Number(e.target.value))} style={{ background: '#121218' }}>
                  <option value={5}>5 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>ENERGY LEVEL</label>
                <select className="form-input" value={energy} onChange={(e) => setEnergy(e.target.value as any)} style={{ background: '#121218' }}>
                  <option value="low">Low Energy (Review)</option>
                  <option value="normal">Normal Energy</option>
                  <option value="high">High Energy (Focus)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>CONTEXT</label>
                <select className="form-input" value={context} onChange={(e) => setContext(e.target.value as any)} style={{ background: '#121218' }}>
                  <option value="desk">At Desk (Coding/Project)</option>
                  <option value="commute">On Commute (Audio/Reading)</option>
                  <option value="break">Short Break (Recall)</option>
                  <option value="weekend">Weekend (Deep Dive)</option>
                </select>
              </div>
            </div>

            {/* Plan Recommendation Previews */}
            <div className="glass-card" style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
              <span className="badge badge-tech" style={{ textTransform: 'uppercase', marginBottom: '6px' }}>
                Topic: {plan.topicTitle}
              </span>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Recommendation: {plan.title}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                "{plan.reason}"
              </p>

              {/* Steps timeline progression */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                {plan.steps.map((step, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary-light)', minWidth: '45px' }}>
                      {step.durationMin} min
                    </span>
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontWeight: 600 }}>{step.label}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '1px' }}>{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleStartSession} className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              ⚡ Launch Timed Study Session
            </button>
          </div>
        )}

        {/* VIEW: Running session timer */}
        {view === 'running' && plan && plan.steps[activeStepIdx] && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="flex-between">
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {plan.title.toUpperCase()} ➔ STEP {activeStepIdx + 1} OF {plan.steps.length}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Target: {plan.topicTitle}
              </span>
            </div>

            {/* Big Countdown Timer for active step */}
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Current Activity: {plan.steps[activeStepIdx].label}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {plan.steps[activeStepIdx].description}
              </span>
              
              <div style={{ fontSize: '4.5rem', fontWeight: 700, fontFamily: 'monospace', color: sessionActive ? '#fff' : 'var(--color-text-muted)', letterSpacing: '-0.02em', margin: '8px 0' }}>
                {formatTime(secondsRemaining)}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={() => setSessionActive(!sessionActive)} className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  {sessionActive ? '⏸️ Pause Timer' : '▶️ Resume Timer'}
                </button>
                <button onClick={handleSkipStep} className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  ⏭️ Next Step
                </button>
                <button onClick={handleFinishEarly} className="btn btn-danger" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  🛑 Finish Early
                </button>
              </div>
            </div>

            {/* Note scratchpad */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>CURIOSITY STUDY SCRATCHPAD (FAST NOTES)</label>
              <textarea
                className="form-input"
                placeholder="Jot down formulas, code templates, draft answers, or recall outlines here..."
                style={{ width: '100%', height: '140px', resize: 'none', background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                value={scratchpad}
                onChange={(e) => setScratchpad(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* VIEW: Reflection completed logs */}
        {view === 'completed' && plan && (
          <form onSubmit={handleSaveReflection} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', color: 'var(--color-success)' }}>🧠</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '8px' }}>Session Metacognition Reflection</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Take 20 seconds to evaluate what has changed in your understanding.
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">WHAT DID YOU ACTUALLY LEARN/PRACTICE?</label>
                <textarea
                  className="form-input"
                  placeholder="e.g. Mastered asynchronous replication lags and read-after-write consistency rules..."
                  style={{ width: '100%', height: '60px', resize: 'none' }}
                  value={reflectLearn}
                  onChange={(e) => setReflectLearn(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">WHAT REMAINS FUZZY OR UNCLEAR (ACTIVE GAPS)?</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Still a bit fuzzy on multi-leader split-brain resolution details"
                  value={reflectUnclear}
                  onChange={(e) => setReflectUnclear(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">REQUIRED NEXT ACTION (VERB-FIRST)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Code 2 write conflicts resolver routines in Redis"
                  value={reflectNext}
                  onChange={(e) => setReflectNext(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%' }}>
              {submitting ? 'Syncing reflection logs...' : '💾 Save Reflection & Conclude Session'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
