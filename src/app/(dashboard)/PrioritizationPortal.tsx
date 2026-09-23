import React, { useState } from 'react';

interface Topic {
  id: string;
  title: string;
  area: string;
  why?: string | null;
  depthTarget?: string | null;
  nextAction: string | null;
  progressPct: number;
}

interface PrioritizationPortalProps {
  activeTopics: Topic[];
  pendingTopic: Topic;
  onConfirmSwap: (
    activeToPauseId: string,
    pauseReason: string,
    pendingWhy?: string,
    pendingDepth?: string,
    pendingNextAction?: string
  ) => Promise<void>;
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
  const [pendingWhy, setPendingWhy] = useState(pendingTopic.why || '');
  const [pendingDepth, setPendingDepth] = useState(pendingTopic.depthTarget || 'Proficiency');
  const [pendingNextAction, setPendingNextAction] = useState(pendingTopic.nextAction || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) return;

    if (!pendingWhy.trim() || !pendingNextAction.trim()) {
      setError('Please provide "Why you are learning" and a "Next Action" for activating this topic.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onConfirmSwap(
        selectedTopicId,
        pauseReason.trim() || 'Swapped out to prioritize: ' + pendingTopic.title,
        pendingWhy.trim(),
        pendingDepth,
        pendingNextAction.trim()
      );
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to swap focus topics.');
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
      <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
        
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', color: 'var(--color-warning)' }}>🔒</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>Active Focus Limit Reached</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            You already have <strong>2 active commitments</strong>. Choose which active topic to pause and confirm activation details for <strong>"{pendingTopic.title}"</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ color: 'var(--color-warning)' }}>
              1. WHICH ACTIVE TOPIC SHOULD BE PAUSED?
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
                    padding: '10px 12px',
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

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">PAUSE REASON</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Temporarily prioritizing a new sprint..."
              style={{ width: '100%' }}
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              required
            />
          </div>

          <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              2. ACTIVATION CONTRACT FOR "{pendingTopic.title}"
            </span>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Why are you learning this?</label>
              <textarea
                className="form-input"
                style={{ width: '100%', height: '50px', resize: 'none' }}
                value={pendingWhy}
                onChange={(e) => setPendingWhy(e.target.value)}
                placeholder="Core motivation and practical outcome goal..."
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Depth Target</label>
                <select
                  className="form-input"
                  value={pendingDepth}
                  onChange={(e) => setPendingDepth(e.target.value)}
                  style={{ background: '#121218' }}
                >
                  <option value="Awareness">Awareness</option>
                  <option value="Working Knowledge">Working Knowledge</option>
                  <option value="Proficiency">Proficiency</option>
                  <option value="Deep">Deep Knowledge</option>
                  <option value="Mastery">Mastery</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Verb-First Next Action</label>
                <input
                  type="text"
                  className="form-input"
                  value={pendingNextAction}
                  onChange={(e) => setPendingNextAction(e.target.value)}
                  placeholder="e.g. Read chapter 1..."
                  required
                />
              </div>
            </div>
          </div>

          {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>⚠️ {error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
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
