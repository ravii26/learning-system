import React, { useState } from 'react';
import type { Concept } from './KnowledgeMap';

interface ReactivationModalProps {
  topicTitle: string;
  concepts: Concept[];
  onConfirmResume: (forgottenConceptIds: string[], reactivationNotes: string) => Promise<void>;
  onClose: () => void;
}

export default function ReactivationModal({
  topicTitle,
  concepts,
  onConfirmResume,
  onClose,
}: ReactivationModalProps) {
  // Wizard steps: 'intro' | 'recall' | 'test' | 'flag' | 'review' | 'done'
  const [step, setStep] = useState<'intro' | 'recall' | 'test' | 'flag' | 'review' | 'done'>('intro');

  // Reactivation Logs
  const [freeRecallText, setFreeRecallText] = useState('');
  
  // Test concepts subset (up to 3 concepts that are not Unknown)
  const testConcepts = concepts.filter(c => c.status !== 'Unknown').slice(0, 3);
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [forgottenIds, setForgottenIds] = useState<string[]>([]);
  
  const [submitting, setSubmitting] = useState(false);

  const handleNext = () => {
    if (step === 'intro') {
      setStep('recall');
    } else if (step === 'recall') {
      if (freeRecallText.trim().length < 10) {
        alert('Please write what you remember (at least 10 characters) to help reactivate your brain.');
        return;
      }
      if (testConcepts.length > 0) {
        setStep('test');
      } else {
        setStep('done');
      }
    } else if (step === 'test') {
      setStep('flag');
    } else if (step === 'flag') {
      if (forgottenIds.length > 0) {
        setStep('review');
      } else {
        setStep('done');
      }
    } else if (step === 'review') {
      setStep('done');
    }
  };

  const handleToggleForgot = (id: string) => {
    setForgottenIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const reactivationSummary = `Reactivation Recap: Free recall: "${freeRecallText.slice(0, 60)}...". Flagged ${forgottenIds.length} forgotten concepts.`;
      await onConfirmResume(forgottenIds, reactivationSummary);
      onClose();
    } catch (e) {
      console.error(e);
      alert('Error during resume activation.');
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
      <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Step Intro */}
        {step === 'intro' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '3rem' }}>⚡</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Reactivation Session</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontWeight: 600 }}>TOPIC: {topicTitle}</span>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
              Welcome back! Instead of re-reading everything from lesson one, we will guide you through a 3-minute reactivation process to re-establish neural connections and highlight forgotten concepts.
            </p>
            <button onClick={handleNext} className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '12px' }}>
              Start Reactivation Block
            </button>
          </div>
        )}

        {/* Step Recall */}
        {step === 'recall' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Step 1: Free Recall Check</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Without referencing notes or checking details, write down everything you remember about <strong>"{topicTitle}"</strong>. Focus on core mechanisms or key rules.
            </p>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '140px', resize: 'none', background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace' }}
              placeholder="Start typing what you remember..."
              value={freeRecallText}
              onChange={(e) => setFreeRecallText(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button onClick={handleNext} className="btn btn-primary">Next: Concept Check →</button>
            </div>
          </div>
        )}

        {/* Step Test */}
        {step === 'test' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Step 2: Quick Retrieval Check</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Recall what you can about these concepts. Just write a one-sentence summary for each:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto' }}>
              {testConcepts.map((tc) => (
                <div key={tc.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>{tc.title}</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Describe this concept..."
                    value={testAnswers[tc.id] || ''}
                    onChange={(e) => setTestAnswers({ ...testAnswers, [tc.id]: e.target.value })}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button onClick={() => setStep('recall')} className="btn btn-secondary">Back</button>
              <button onClick={handleNext} className="btn btn-primary">Next: Flag forgotten →</button>
            </div>
          </div>
        )}

        {/* Step Flag */}
        {step === 'flag' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Step 3: Identify Forgotten Concepts</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Based on the checks, flag any concepts that felt completely forgotten or blurry. They will return to your study review sequence.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {testConcepts.map((tc) => (
                <div
                  key={tc.id}
                  onClick={() => handleToggleForgot(tc.id)}
                  className="glass-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: forgottenIds.includes(tc.id) ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.15)',
                    border: forgottenIds.includes(tc.id) ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tc.title}</span>
                  <span style={{ fontSize: '0.75rem', color: forgottenIds.includes(tc.id) ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {forgottenIds.includes(tc.id) ? '⚠️ Blurry / Forgotten' : '✅ Clear / Retained'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button onClick={() => setStep('test')} className="btn btn-secondary">Back</button>
              <button onClick={handleNext} className="btn btn-primary">
                {forgottenIds.length > 0 ? 'Next: Review blurry items →' : 'Finish Reactivation →'}
              </button>
            </div>
          </div>
        )}

        {/* Step Review */}
        {step === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Step 4: Micro-review Gaps</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Take 30 seconds to review the titles of your flagged blurry concepts. We have scheduled them for priority retrieval reviews.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {concepts.filter(c => forgottenIds.includes(c.id)).map((tc) => (
                <div key={tc.id} className="glass-card" style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-warning)' }}>{tc.title}</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Scheduled for immediate spaced retrieval review.
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button onClick={() => setStep('flag')} className="btn btn-secondary">Back</button>
              <button onClick={handleNext} className="btn btn-primary">Finish Reactivation →</button>
            </div>
          </div>
        )}

        {/* Step Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '3rem', color: 'var(--color-success)' }}>✅</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Reactivation Completed</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Your brain has loaded the context for <strong>"{topicTitle}"</strong>. Spaced repetition dates for flagged items have been adjusted. You are ready to start studying!
            </p>
            
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn btn-primary"
              style={{ alignSelf: 'center', marginTop: '12px' }}
            >
              {submitting ? 'Activating Card...' : '🚀 Resume Active Learning'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
