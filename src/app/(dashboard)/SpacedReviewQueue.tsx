import React, { useState, useEffect } from 'react';

interface DueConcept {
  topicId: string;
  topicTitle: string;
  topicArea: string;
  conceptId: string;
  conceptTitle: string;
  conceptStatus: string;
  difficulty: string;
  importance: string;
  lastRecalledAt: string | null;
  reviewIntervalDays: number;
  consecutiveRecalls: number;
}

interface SpacedReviewQueueProps {
  onReviewSaved: () => void;
}

const TEMPLATES: Record<string, string> = {
  'distributed fundamentals (cap theorem)': 'Choose CP or AP during partition. Cannot guarantee consistency (all reads latest) and availability (every node responds) simultaneously when messages delay/drop.',
  'database replication & consistency': 'Sync vs Async replication trade-offs. Sync blocks writes until backups acknowledge; Async write returns immediately but lag replica reads.',
  'database partitioning & sharding': 'Splitting rows across nodes using range or hash keys. Rebalancing required when hotspots occur.',
  'caching & content delivery networks (cdn)': 'Caches store reads to offload DBs. CDNs edge cache globally. Cache invalidation is the main complexity.',
};

export default function SpacedReviewQueue({ onReviewSaved }: SpacedReviewQueueProps) {
  const [loading, setLoading] = useState(true);
  const [dueConcepts, setDueConcepts] = useState<DueConcept[]>([]);
  
  // Active Test State
  const [testingConcept, setTestingConcept] = useState<DueConcept | null>(null);
  const [recallText, setRecallText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [selfSuccess, setSelfSuccess] = useState<boolean | null>(null);
  
  // Mistake bank logger sub-inputs
  const [mistakeText, setMistakeText] = useState('');
  const [whyMade, setWhyMade] = useState('');
  const [howToAvoid, setHowToAvoid] = useState('');
  
  // Interleaving sequence state
  const [interleavingList, setInterleavingList] = useState<DueConcept[]>([]);
  const [interleavingIdx, setInterleavingIdx] = useState(0);
  const [isInterleavedMode, setIsInterleavedMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchDueConcepts = async () => {
    try {
      const res = await fetch('/api/review/spaced');
      if (res.ok) {
        const data = await res.json();
        setDueConcepts(data.dueConcepts || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDueConcepts();
  }, []);

  const handleStartTest = (concept: DueConcept) => {
    setTestingConcept(concept);
    setRecallText('');
    setRevealed(false);
    setSelfSuccess(null);
    setMistakeText('');
    setWhyMade('');
    setHowToAvoid('');
  };

  const handleStartInterleaved = () => {
    if (dueConcepts.length === 0) return;
    // Shuffle and pick up to 5 concepts
    const shuffled = [...dueConcepts].sort(() => 0.5 - Math.random()).slice(0, 5);
    setInterleavingList(shuffled);
    setInterleavingIdx(0);
    setIsInterleavedMode(true);
    handleStartTest(shuffled[0]);
  };

  const handleConcludeTest = async () => {
    if (!testingConcept || selfSuccess === null) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/review/spaced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: testingConcept.topicId,
          conceptId: testingConcept.conceptId,
          success: selfSuccess,
          mistakeText: !selfSuccess ? mistakeText || `Forgotten: ${testingConcept.conceptTitle}` : undefined,
          whyMade: whyMade,
          howToAvoid: howToAvoid,
        }),
      });

      if (res.ok) {
        await fetchDueConcepts();
        onReviewSaved();
        
        // Handle interleaved transition
        if (isInterleavedMode) {
          const nextIdx = interleavingIdx + 1;
          if (nextIdx < interleavingList.length) {
            setInterleavingIdx(nextIdx);
            handleStartTest(interleavingList[nextIdx]);
          } else {
            alert('Interleaved review complete! Focus pathways reinforced.');
            setIsInterleavedMode(false);
            setTestingConcept(null);
          }
        } else {
          setTestingConcept(null);
        }
      } else {
        alert('Failed to save spaced review log.');
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting to API');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px' }}>Loading memory queue...</div>;
  }

  // Find target template answer
  const getIdealAnswer = (conceptTitle: string) => {
    const key = conceptTitle.toLowerCase();
    return TEMPLATES[key] || 'Recall key definitions, rules, constraints, and dependencies.';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Test overlay pane */}
      {testingConcept && (
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="flex-between">
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
              {isInterleavedMode ? `Interleaved Practice: ${interleavingIdx + 1} of ${interleavingList.length}` : 'Active Spaced Retrieval'}
            </span>
            <button
              onClick={() => { setTestingConcept(null); setIsInterleavedMode(false); }}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '0.7rem' }}
            >
              Exit test
            </button>
          </div>

          <div>
            <span className={`badge badge-${testingConcept.topicArea.toLowerCase()}`} style={{ marginRight: '8px' }}>
              {testingConcept.topicArea}
            </span>
            <strong style={{ fontSize: '0.95rem' }}>{testingConcept.conceptTitle}</strong>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Topic: "{testingConcept.topicTitle}" | Mastery Level: {testingConcept.conceptStatus}
            </p>
          </div>

          {!revealed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label className="form-label">EXPLAIN THIS CONCEPT FROM MEMORY</label>
              <textarea
                className="form-input"
                style={{ width: '100%', height: '90px', resize: 'none', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder="Close all resources. Write a one-sentence summary or definition..."
                value={recallText}
                onChange={(e) => setRecallText(e.target.value)}
              />
              <button
                onClick={() => {
                  if (recallText.trim().length < 8) {
                    alert('Please make an effort to write a recall summary.');
                    return;
                  }
                  setRevealed(true);
                }}
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.8rem' }}
              >
                👁️ Reveal Answer Checklist
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span className="form-label" style={{ fontSize: '0.7rem' }}>YOUR RECALL</span>
                  <div style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', minHeight: '60px', fontFamily: 'monospace' }}>
                    {recallText}
                  </div>
                </div>
                <div>
                  <span className="form-label" style={{ fontSize: '0.7rem', color: 'var(--color-success)' }}>IDEAL MODEL KEYPOINTS</span>
                  <div style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '4px', minHeight: '60px' }}>
                    {getIdealAnswer(testingConcept.conceptTitle)}
                  </div>
                </div>
              </div>

              {/* Success assessment selector */}
              <div>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>DID YOU RECALL IT CORRECTLY?</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setSelfSuccess(true); }}
                    className="btn"
                    style={{
                      flex: 1, fontSize: '0.75rem', padding: '6px',
                      background: selfSuccess === true ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: selfSuccess === true ? '1px solid var(--color-success)' : '1px solid var(--border-color)',
                      color: selfSuccess === true ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    }}
                  >
                    ✅ Yes, Correct
                  </button>
                  <button
                    onClick={() => { setSelfSuccess(false); }}
                    className="btn"
                    style={{
                      flex: 1, fontSize: '0.75rem', padding: '6px',
                      background: selfSuccess === false ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: selfSuccess === false ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                      color: selfSuccess === false ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                    }}
                  >
                    ❌ No, Forgot
                  </button>
                </div>
              </div>

              {/* If incorrect, inline log to mistake bank */}
              {selfSuccess === false && (
                <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(239, 68, 68, 0.02)' }}>
                  <span className="form-label" style={{ color: 'var(--color-danger)', fontSize: '0.7rem', marginBottom: 0 }}>LOG TO MISTAKE BANK</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Briefly state your mistake..."
                    value={mistakeText}
                    onChange={(e) => setMistakeText(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '6px' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Why forgot?"
                      value={whyMade}
                      onChange={(e) => setWhyMade(e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '6px' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="How to avoid?"
                      value={howToAvoid}
                      onChange={(e) => setHowToAvoid(e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '6px' }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleConcludeTest}
                disabled={selfSuccess === null || submitting}
                className="btn btn-primary"
                style={{ alignSelf: 'flex-end', padding: '6px 14px', fontSize: '0.8rem' }}
              >
                {submitting ? 'Saving recall...' : '💾 Save Spaced Result'}
              </button>

            </div>
          )}

        </div>
      )}

      {/* Main Spaced review queue grid lists */}
      {!testingConcept && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="flex-between">
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🧠</span> Engine 6 — Spaced Practice Reviews
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Spacing and active recall prevent cognitive decay. Mix reviews to avoid pattern memorization.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleStartInterleaved}
                disabled={dueConcepts.length === 0}
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: '#fff' }}
              >
                🔀 Interleaved Practice
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dueConcepts.slice(0, 4).map((c) => (
              <div
                key={c.conceptId}
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.15)',
                  borderLeft: '3px solid var(--color-primary-light)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.conceptTitle}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    <span className={`badge badge-${c.topicArea.toLowerCase()}`}>{c.topicArea}</span>
                    <span>Interval: {c.reviewIntervalDays}d</span>
                    <span>Recalls: {c.consecutiveRecalls}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleStartTest(c)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  ⚡ Recall
                </button>
              </div>
            ))}

            {dueConcepts.length > 4 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '4px' }}>
                And {dueConcepts.length - 4} more concepts due in your memory queue.
              </p>
            )}

            {dueConcepts.length === 0 && (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.8rem',
                }}
              >
                ✨ Spaced memory queue is clear. All core concepts are fully retained!
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
