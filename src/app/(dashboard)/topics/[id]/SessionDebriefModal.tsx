'use client';

import React, { useState } from 'react';

export type ActivityType =
  | 'read_watch'
  | 'write_practice'
  | 'speak_converse'
  | 'drill_repeat'
  | 'course_module'
  | 'free_explore';

export interface SessionLog {
  id: string;
  activityType: ActivityType;
  whatDone: string;
  oneInsight: string;
  whatWasHard: string;
  nextAction: string;
  durationMinutes: number;
  moduleId?: string;
  timestamp: string;
}

interface SessionDebriefModalProps {
  topicTitle: string;
  currentNextAction: string;
  timerDurationMinutes?: number;
  onSave: (log: SessionLog) => Promise<void>;
  onClose: () => void;
}

const ACTIVITY_TYPES: { type: ActivityType; icon: string; label: string; color: string }[] = [
  { type: 'read_watch',     icon: '📖', label: 'Read / Watch',      color: '#6366f1' },
  { type: 'write_practice', icon: '✍️', label: 'Write / Practice',  color: '#14b8a6' },
  { type: 'speak_converse', icon: '🗣️', label: 'Speak / Converse',  color: '#10b981' },
  { type: 'drill_repeat',   icon: '🎯', label: 'Drill / Repeat',    color: '#f59e0b' },
  { type: 'course_module',  icon: '📚', label: 'Course Module',     color: '#a855f7' },
  { type: 'free_explore',   icon: '🔬', label: 'Free Explore',      color: '#f43f5e' },
];

export default function SessionDebriefModal({
  topicTitle,
  currentNextAction,
  timerDurationMinutes = 25,
  onSave,
  onClose,
}: SessionDebriefModalProps) {
  const [step, setStep] = useState(1);
  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [whatDone, setWhatDone] = useState(currentNextAction || '');
  const [oneInsight, setOneInsight] = useState('');
  const [whatWasHard, setWhatWasHard] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [duration, setDuration] = useState(timerDurationMinutes);
  const [saving, setSaving] = useState(false);
  const [showHardField, setShowHardField] = useState(false);

  const selectedActivity = ACTIVITY_TYPES.find(a => a.type === activityType);

  const handleSubmit = async () => {
    if (!activityType) return;
    setSaving(true);
    const log: SessionLog = {
      id: Math.random().toString(36).substring(2, 11),
      activityType,
      whatDone: whatDone.trim(),
      oneInsight: oneInsight.trim(),
      whatWasHard: whatWasHard.trim(),
      nextAction: nextAction.trim(),
      durationMinutes: duration,
      timestamp: new Date().toISOString(),
    };
    await onSave(log);
    setSaving(false);
    onClose();
  };

  const StepDot = ({ n }: { n: number }) => (
    <span style={{
      width: '8px', height: '8px', borderRadius: '50%',
      background: step >= n ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
      display: 'inline-block',
      transition: 'background 0.25s',
    }} />
  );

  return (
    <div className="debrief-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="debrief-card">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Session Debrief</p>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{topicTitle}</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '24px' }}>
          <StepDot n={1} /><StepDot n={2} /><StepDot n={3} />
        </div>

        {/* Step 1 — Activity Type */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, textAlign: 'center' }}>What kind of session was this?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {ACTIVITY_TYPES.map(a => (
                <button
                  key={a.type}
                  onClick={() => { setActivityType(a.type); setStep(2); }}
                  style={{
                    padding: '14px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: activityType === a.type ? `1.5px solid ${a.color}` : '1.5px solid var(--border-color)',
                    background: activityType === a.type ? `${a.color}18` : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{a.icon}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: activityType === a.type ? a.color : 'var(--color-text-secondary)' }}>{a.label}</span>
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ alignSelf: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>Skip for now</button>
          </div>
        )}

        {/* Step 2 — Capture */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {selectedActivity && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: `${selectedActivity.color}12`, border: `1px solid ${selectedActivity.color}30` }}>
                <span>{selectedActivity.icon}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: selectedActivity.color }}>{selectedActivity.label}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">What did you actually do?</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="e.g. Watched the RAG pipeline video, practiced ordering food in English..."
                value={whatDone}
                onChange={e => setWhatDone(e.target.value)}
                style={{ resize: 'none' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">💡 What clicked today?</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="The one thing that stuck — an insight, a connection, something that made sense..."
                value={oneInsight}
                onChange={e => setOneInsight(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            {!showHardField ? (
              <button
                onClick={() => setShowHardField(true)}
                style={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: 'var(--color-text-muted)', textDecoration: 'underline' }}
              >
                + Add what was difficult (optional)
              </button>
            ) : (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">😤 What was hard or still unclear?</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Anything that confused you, felt hard, or needs more practice..."
                  value={whatWasHard}
                  onChange={e => setWhatWasHard(e.target.value)}
                  style={{ resize: 'none' }}
                  autoFocus
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ flex: 1 }}>← Back</button>
              <button
                onClick={() => setStep(3)}
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={!whatDone.trim()}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Next Action + Duration */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <p style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>✅ Great session logged!</p>
              {oneInsight && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>"{oneInsight}"</p>}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">⏭️ Next session, I'll...</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="e.g. Watch Module 4 on irregular verbs, practice 10 min conversation..."
                value={nextAction}
                onChange={e => setNextAction(e.target.value)}
                style={{ resize: 'none' }}
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">⏱️ Session duration (minutes)</label>
              <input
                type="number"
                className="form-input"
                min={1}
                max={480}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                style={{ width: '100px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={() => setStep(2)} className="btn btn-secondary" style={{ flex: 1 }}>← Back</button>
              <button
                onClick={handleSubmit}
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={saving}
              >
                {saving ? 'Saving...' : '💾 Save Session'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
