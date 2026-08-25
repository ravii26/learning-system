import React, { useState } from 'react';

interface Topic {
  id: string;
  title: string;
  area: string;
  nextAction: string | null;
  progressPct: number;
}

interface PrioritizationPortalProps {
  activeTopics: Topic[];
  pendingTopic: Topic;
  onConfirmSwap: (activeToPauseId: string, pauseReason: string) => Promise<void>;
  onClose: () => void;
}

export default function PrioritizationPortal({
  activeTopics,
  pendingTopic,
  onConfirmSwap,
  onClose,
}: PrioritizationPortalProps) {
  const [selectedTopicId, setSelectedTopicId] = useState(activeTopics[0]?.id || '');
  const [pauseReason, setPauseReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) return;

    setSubmitting(true);
    try {
      await onConfirmSwap(selectedTopicId, pauseReason.trim() || 'Swapped out to prioritize: ' + pendingTopic.title);
    } catch (e) {
      console.error(e);
      alert('Failed to swap focus topics.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1500, padding: '16px'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', color: 'var(--color-warning)' }}>🔒</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '8px' }}>Active Focus Limit Reached</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            You already have <strong>2 active commitments</strong>. Learning science proves that attempting to learn too many things simultaneously dilutes attention and stalls progress.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--color-warning)' }}>
              WHICH ACTIVE TOPIC SHOULD BE PAUSED?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeTopics.map((t) => (
                <label
                  key={t.id}
                  className="glass-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: selectedTopicId === t.id ? 'rgba(99, 102, 241, 0.08)' : 'rgba(0,0,0,0.15)',
                    border: selectedTopicId === t.id ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <input
                    type="radio"
                    name="swapTopic"
                    value={t.id}
                    checked={selectedTopicId === t.id}
                    onChange={() => setSelectedTopicId(t.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div style={{ flexGrow: 1, fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginTop: '2px' }}>
                      Progress: {t.progressPct}% | Next: {t.nextAction || 'None'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">WHY ARE YOU PAUSING THIS TOPIC?</label>
            <textarea
              className="form-input"
              placeholder="e.g., Temporarily prioritizing a system design sprint..."
              style={{ width: '100%', height: '60px', resize: 'none' }}
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel Activation</button>
            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ background: 'var(--color-warning)', borderColor: 'var(--color-warning)', color: '#000' }}>
              {submitting ? 'Swapping Focus...' : 'Pause Selected & Activate New'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
