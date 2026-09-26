'use client';

import React, { useState } from 'react';

interface Confusion {
  id: string;
  text: string;
  resolved: boolean;
  resolvedAt?: string;
  answer?: string;
}

interface Mistake {
  id: string;
  concept: string;
  mistake: string;
  whyMade: string;
  correctUnderstanding: string;
  example: string;
  howToAvoid: string;
  createdAt: string;
}

interface ConfusionMistakeBankProps {
  confusions: Confusion[];
  mistakes: Mistake[];
  onSaveConfusions: (updated: Confusion[]) => void;
  onSaveMistakes: (updated: Mistake[]) => void;
}

export default function ConfusionMistakeBank({
  confusions,
  mistakes,
  onSaveConfusions,
  onSaveMistakes,
}: ConfusionMistakeBankProps) {
  const [activeTab, setActiveTab] = useState<'confusions' | 'mistakes'>('confusions');

  // Confusion State
  const [newConfusionText, setNewConfusionText] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionAnswer, setResolutionAnswer] = useState('');

  // Mistake State
  const [showAddMistake, setShowAddMistake] = useState(false);
  const [concept, setConcept] = useState('');
  const [mistake, setMistake] = useState('');
  const [whyMade, setWhyMade] = useState('');
  const [howToAvoid, setHowToAvoid] = useState('');

  // Mistake Test State
  const [testingMistakes, setTestingMistakes] = useState(false);
  const [testIdx, setTestIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Confusions handlers
  const handleAddConfusion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfusionText.trim()) return;

    const newConf: Confusion = {
      id: Math.random().toString(36).substring(2, 9),
      text: newConfusionText.trim(),
      resolved: false,
    };

    const updated = [newConf, ...confusions];
    onSaveConfusions(updated);
    setNewConfusionText('');
  };

  const handleResolveConfusion = (id: string) => {
    setResolvingId(id);
    setResolutionAnswer('');
  };

  const submitResolution = (id: string) => {
    if (!resolutionAnswer.trim()) return;

    const updated = confusions.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          resolved: true,
          resolvedAt: new Date().toISOString(),
          answer: resolutionAnswer.trim(),
        };
      }
      return c;
    });

    onSaveConfusions(updated);
    setResolvingId(null);
  };

  const handleDeleteConfusion = (id: string) => {
    const updated = confusions.filter((c) => c.id !== id);
    onSaveConfusions(updated);
  };

  // Mistake handlers
  const handleAddMistake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mistake.trim()) return;

    const newMistake: Mistake = {
      id: Math.random().toString(36).substring(2, 9),
      concept: concept.trim() || 'General',
      mistake: mistake.trim(),
      whyMade: whyMade.trim(),
      correctUnderstanding: 'Verify rules and bounds.',
      example: '',
      howToAvoid: howToAvoid.trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = [newMistake, ...mistakes];
    onSaveMistakes(updated);
    
    setConcept('');
    setMistake('');
    setWhyMade('');
    setHowToAvoid('');
    setShowAddMistake(false);
  };

  const handleDeleteMistake = (id: string) => {
    const updated = mistakes.filter((m) => m.id !== id);
    onSaveMistakes(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Sub Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('confusions'); setTestingMistakes(false); }}
          style={{
            padding: '10px 4px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: activeTab === 'confusions' && !testingMistakes ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'confusions' && !testingMistakes ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          Confusion Pad ({confusions.filter((c) => !c.resolved).length} unresolved)
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('mistakes'); }}
          style={{
            padding: '10px 4px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: activeTab === 'mistakes' || testingMistakes ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'mistakes' || testingMistakes ? '2px solid var(--color-primary)' : '2px solid transparent',
          }}
        >
          Mistake Bank ({mistakes.length} logged)
        </button>
      </div>

      {/* TAB 1: Confusion Pad */}
      {activeTab === 'confusions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <form onSubmit={handleAddConfusion} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="I don't understand why eventual consistency causes read lag..."
              value={newConfusionText}
              onChange={(e) => setNewConfusionText(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            />
            <button type="submit" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              Capture Confusion
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {confusions.map((c) => (
              <div
                key={c.id}
                className="glass-card"
                style={{
                  padding: '14px',
                  background: c.resolved ? 'var(--success-tint)' : 'var(--bg-sunk)',
                  borderLeft: c.resolved ? '3px solid var(--color-success)' : '3px solid var(--color-danger)',
                  opacity: c.resolved ? 0.75 : 1,
                }}
              >
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, marginRight: '16px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{c.text}</span>
                    {c.resolved && c.answer && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', background: 'var(--bg-sunk)', padding: '8px', borderRadius: '4px', marginTop: '6px' }}>
                        <strong>Resolution:</strong> {c.answer}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!c.resolved && resolvingId !== c.id && (
                      <button
                        onClick={() => handleResolveConfusion(c.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--color-success)' }}
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteConfusion(c.id)}
                      style={{ color: 'var(--color-danger)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {resolvingId === c.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    <textarea
                      className="form-input"
                      style={{ width: '100%', height: '60px', fontSize: '0.8rem', resize: 'none' }}
                      placeholder="Write your resolution or answer discovered through research..."
                      value={resolutionAnswer}
                      onChange={(e) => setResolutionAnswer(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setResolvingId(null)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Cancel</button>
                      <button onClick={() => submitResolution(c.id)} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.7rem' }}>Save Resolution</button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {confusions.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
                No active confusions captured.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Mistake Bank */}
      {activeTab === 'mistakes' && !testingMistakes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTestingMistakes(true)}
              className="btn btn-primary"
              disabled={mistakes.length === 0}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Test Mistakes ({mistakes.length} due)
            </button>
            
            <button
              onClick={() => setShowAddMistake(!showAddMistake)}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              {showAddMistake ? 'Cancel' : 'Log Manual Mistake'}
            </button>
          </div>

          {showAddMistake && (
            <form onSubmit={handleAddMistake} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--danger-tint)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>CONCEPT/SUBTOPIC</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. DCF Calculations"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>THE MISTAKE MADE</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Forgot to divide risk premium by beta"
                    value={mistake}
                    onChange={(e) => setMistake(e.target.value)}
                    required
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>WHY YOU MADE IT (COGNITIVE REASON)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Rushing execution without double check"
                    value={whyMade}
                    onChange={(e) => setWhyMade(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>HOW TO AVOID IN THE FUTURE</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Review calculations on draft spreadsheet first"
                    value={howToAvoid}
                    onChange={(e) => setHowToAvoid(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ padding: '8px', fontSize: '0.8rem' }}>
                Log to Mistake Bank
              </button>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mistakes.map((m) => (
              <div
                key={m.id}
                className="glass-card"
                style={{
                  padding: '14px',
                  background: 'var(--danger-tint)',
                  border: '1px solid var(--danger-tint)',
                  }}
              >
                <div className="flex-between" style={{ borderBottom: '1px solid var(--fill-2)', paddingBottom: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
                    {m.concept}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDeleteMistake(m.id)}
                      style={{ color: 'var(--color-danger)', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.82rem' }}>
                  <p><strong>Mistake:</strong> <span style={{ color: 'var(--color-text-primary)' }}>{m.mistake}</span></p>
                  {m.whyMade && <p><strong>Why:</strong> <span style={{ color: 'var(--color-text-secondary)' }}>{m.whyMade}</span></p>}
                  {m.howToAvoid && <p><strong>How to avoid:</strong> <span style={{ color: 'var(--color-success)' }}>{m.howToAvoid}</span></p>}
                </div>
              </div>
            ))}

            {mistakes.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Mistake bank is clear. Excellent performance!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Mistake Test Panel */}
      {testingMistakes && mistakes[testIdx] && (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="flex-between">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Mistake {testIdx + 1} of {mistakes.length}
            </span>
            <button onClick={() => setTestingMistakes(false)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
              Exit Test
            </button>
          </div>

          <div>
            <span className="badge badge-tech" style={{ textTransform: 'uppercase', marginBottom: '6px' }}>{mistakes[testIdx].concept}</span>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{mistakes[testIdx].mistake}</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Why you made it: {mistakes[testIdx].whyMade || 'Not documented.'}
            </p>
          </div>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.85rem', alignSelf: 'flex-start' }}
            >
              Reveal Avoidance Strategy
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'var(--success-tint)', border: '1px solid var(--success-tint)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 600, color: 'var(--color-success)', marginBottom: '4px' }}>HOW TO AVOID:</p>
                <p>{mistakes[testIdx].howToAvoid || 'Self-check core parameters.'}</p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    setRevealed(false);
                    if (testIdx + 1 < mistakes.length) setTestIdx(testIdx + 1);
                    else {
                      alert('Mistake review complete!');
                      setTestingMistakes(false);
                    }
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  I Recall Now
                </button>
                <button
                  onClick={() => {
                    setRevealed(false);
                    if (testIdx + 1 < mistakes.length) setTestIdx(testIdx + 1);
                    else {
                      alert('Mistake review complete!');
                      setTestingMistakes(false);
                    }
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem', color: 'var(--color-warning)' }}
                >
                  Re-review Later
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
