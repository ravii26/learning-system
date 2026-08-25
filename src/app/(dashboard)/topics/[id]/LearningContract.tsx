import React, { useState } from 'react';

interface Prerequisite {
  id: string;
  title: string;
  status: 'known' | 'missing' | 'recommended';
}

interface Contract {
  outcome: string;
  estimatedEffort: number;
  successCriterion: string;
  currentLevel: string;
  prerequisites: Prerequisite[];
}

interface Concept {
  id: string;
  title: string;
  status: string;
}

interface LearningContractProps {
  contract: Contract;
  onSaveContract: (updated: Contract) => void;
  concepts: Concept[];
  onDiagnoseConcepts: (conceptLevels: Record<string, string>) => void;
}

export default function LearningContract({
  contract,
  onSaveContract,
  concepts,
  onDiagnoseConcepts,
}: LearningContractProps) {
  const [outcome, setOutcome] = useState(contract?.outcome || '');
  const [estimatedEffort, setEstimatedEffort] = useState(contract?.estimatedEffort || 0);
  const [successCriterion, setSuccessCriterion] = useState(contract?.successCriterion || '');
  const [currentLevel, setCurrentLevel] = useState(contract?.currentLevel || 'Beginner');
  
  // Prerequisites State
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>(contract?.prerequisites || []);
  const [newPrereqTitle, setNewPrereqTitle] = useState('');
  const [newPrereqStatus, setNewPrereqStatus] = useState<'known' | 'missing'>('missing');

  // Diagnostic Modal State
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticLevels, setDiagnosticLevels] = useState<Record<string, string>>({});

  const handleSave = () => {
    onSaveContract({
      outcome: outcome.trim(),
      estimatedEffort: Number(estimatedEffort),
      successCriterion: successCriterion.trim(),
      currentLevel,
      prerequisites,
    });
  };

  const handleAddPrereq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrereqTitle.trim()) return;

    const updated = [
      ...prerequisites,
      {
        id: Math.random().toString(36).substring(2, 9),
        title: newPrereqTitle.trim(),
        status: newPrereqStatus,
      },
    ];
    setPrerequisites(updated);
    setNewPrereqTitle('');
    
    onSaveContract({
      outcome,
      estimatedEffort,
      successCriterion,
      currentLevel,
      prerequisites: updated,
    });
  };

  const handleTogglePrereq = (id: string) => {
    const updated = prerequisites.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          status: p.status === 'known' ? 'missing' : 'known' as any,
        };
      }
      return p;
    });
    setPrerequisites(updated);
    onSaveContract({
      outcome,
      estimatedEffort,
      successCriterion,
      currentLevel,
      prerequisites: updated,
    });
  };

  const handleDeletePrereq = (id: string) => {
    const updated = prerequisites.filter((p) => p.id !== id);
    setPrerequisites(updated);
    onSaveContract({
      outcome,
      estimatedEffort,
      successCriterion,
      currentLevel,
      prerequisites: updated,
    });
  };

  const handleStartDiagnostic = () => {
    // Initialize diagnostic levels with current concept status or 'Unknown'
    const initial: Record<string, string> = {};
    concepts.forEach((c) => {
      initial[c.id] = c.status || 'Unknown';
    });
    setDiagnosticLevels(initial);
    setShowDiagnostic(true);
  };

  const submitDiagnostic = () => {
    onDiagnoseConcepts(diagnosticLevels);
    setShowDiagnostic(false);
    alert('Adaptive learning diagnostic complete. Map levels updated!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Contract Details Form */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📜</span> Learning Contract
        </h3>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">DESIRED CAPABILITY OUTCOME (MEASURABLE)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Build 3 useful scripts without tutorials"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">ESTIMATED EFFORT (HOURS)</label>
            <input
              type="number"
              className="form-input"
              value={estimatedEffort}
              onChange={(e) => setEstimatedEffort(Number(e.target.value))}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">CURRENT SKILL LEVEL</label>
            <select
              className="form-input"
              value={currentLevel}
              onChange={(e) => setCurrentLevel(e.target.value)}
              style={{ background: '#121218' }}
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">PRIMARY SUCCESS CRITERION</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Can design and defend architecture for unfamiliar problems"
            value={successCriterion}
            onChange={(e) => setSuccessCriterion(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="btn btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.85rem', alignSelf: 'flex-start' }}
        >
          💾 Update Learning Contract
        </button>
      </div>

      {/* Prerequisites Checklist */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🛠️</span> Foundation Prerequisites
        </h3>
        
        <form onSubmit={handleAddPrereq} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Docker basics, Linux terminal..."
            value={newPrereqTitle}
            onChange={(e) => setNewPrereqTitle(e.target.value)}
            style={{ fontSize: '0.85rem', padding: '8px 12px' }}
          />
          <select
            className="form-input"
            value={newPrereqStatus}
            onChange={(e) => setNewPrereqStatus(e.target.value as any)}
            style={{ fontSize: '0.85rem', width: '130px', background: '#121218' }}
          >
            <option value="missing">Need to learn</option>
            <option value="known">Already Know</option>
          </select>
          <button type="submit" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            ➕ Add
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {prerequisites.map((p) => (
            <div
              key={p.id}
              className="glass-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(0,0,0,0.15)',
                borderLeft: p.status === 'known' ? '3px solid var(--color-success)' : '3px solid var(--color-warning)',
                opacity: p.status === 'known' ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={p.status === 'known'}
                  onChange={() => handleTogglePrereq(p.id)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', textDecoration: p.status === 'known' ? 'line-through' : 'none' }}>
                  {p.title}
                </span>
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    background: p.status === 'known' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: p.status === 'known' ? 'var(--color-success)' : 'var(--color-warning)',
                  }}
                >
                  {p.status === 'known' ? 'Known (Skipped)' : 'Required foundation'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeletePrereq(p.id)}
                style={{ color: 'var(--color-danger)', fontSize: '1rem', border: 'none', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          ))}

          {prerequisites.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No prerequisites defined. Add dependencies to audit your foundations.
            </p>
          )}
        </div>
      </div>

      {/* Adaptive Diagnostic Tool */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(99, 102, 241, 0.03)', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🧠</span> Engine 2 — Adaptive Learning Diagnostic
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          Don't relearn what you already know. Take a diagnostic self-assessment to map your starting levels, skip functional blocks, and highlight weak areas.
        </p>
        <button
          type="button"
          onClick={handleStartDiagnostic}
          className="btn btn-primary"
          disabled={concepts.length === 0}
          style={{ alignSelf: 'flex-start' }}
        >
          ⚡ Run Adaptive Diagnostic Assessment
        </button>

        {concepts.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-warning)' }}>
            ⚠️ Define concepts in the Knowledge Map first before taking a diagnostic.
          </p>
        )}
      </div>

      {/* Diagnostic Modal */}
      {showDiagnostic && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, padding: '16px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Adaptive Diagnostic Check</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Evaluate your current mastery for each concept. The curriculum will adapt automatically.
            </p>

            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', paddingRight: '8px' }}>
              {concepts.map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.title}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setDiagnosticLevels({ ...diagnosticLevels, [c.id]: 'Unknown' })}
                      className="btn"
                      style={{
                        fontSize: '0.75rem',
                        padding: '6px',
                        background: diagnosticLevels[c.id] === 'Unknown' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
                        border: diagnosticLevels[c.id] === 'Unknown' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                        color: diagnosticLevels[c.id] === 'Unknown' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                      }}
                    >
                      Unknown (New)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagnosticLevels({ ...diagnosticLevels, [c.id]: 'Exposed' })}
                      className="btn"
                      style={{
                        fontSize: '0.75rem',
                        padding: '6px',
                        background: diagnosticLevels[c.id] === 'Exposed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
                        border: diagnosticLevels[c.id] === 'Exposed' ? '1px solid var(--color-warning)' : '1px solid var(--border-color)',
                        color: diagnosticLevels[c.id] === 'Exposed' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                      }}
                    >
                      Some Exposure
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagnosticLevels({ ...diagnosticLevels, [c.id]: 'Can Apply' })}
                      className="btn"
                      style={{
                        fontSize: '0.75rem',
                        padding: '6px',
                        background: diagnosticLevels[c.id] === 'Can Apply' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                        border: diagnosticLevels[c.id] === 'Can Apply' ? '1px solid var(--color-success)' : '1px solid var(--border-color)',
                        color: diagnosticLevels[c.id] === 'Can Apply' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                      }}
                    >
                      Strong / Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button type="button" onClick={() => setShowDiagnostic(false)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={submitDiagnostic} className="btn btn-primary">Apply Diagnostic Levels</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
