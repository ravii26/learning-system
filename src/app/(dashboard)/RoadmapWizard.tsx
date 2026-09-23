'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GeneratedTopic } from '../api/generate-roadmap/route';

interface RoadmapWizardProps {
  onClose: () => void;
  onComplete?: () => void;
}

const POPULAR_GOALS = [
  { label: '🤖 Machine Learning', goal: 'Machine Learning' },
  { label: '📊 Data Science', goal: 'Data Science' },
  { label: '💰 Personal Finance', goal: 'Personal Finance' },
  { label: '🗣️ English Fluency', goal: 'English Professional Communication' },
  { label: '📱 Mobile App Dev', goal: 'React Native & Mobile App Development' },
  { label: '🎸 Music Theory & Piano', goal: 'Music Theory & Piano Practice' },
];

export default function RoadmapWizard({ onClose, onComplete }: RoadmapWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form state
  const [goal, setGoal] = useState('');
  const [currentLevel, setCurrentLevel] = useState<'beginner' | 'intermediate' | 'experienced' | 'advanced'>('beginner');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [weeklyHours, setWeeklyHours] = useState<number>(5);

  // Generated state
  const [roadmapTitle, setRoadmapTitle] = useState('');
  const [estimatedWeeks, setEstimatedWeeks] = useState(8);
  const [topics, setTopics] = useState<GeneratedTopic[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [expandedTopicIdx, setExpandedTopicIdx] = useState<number | null>(null);
  // The full generate-roadmap response, kept only for Goal.roadmapRaw
  // (provenance — see POST /api/goals). Not read back out for any logic.
  const [rawRoadmapResponse, setRawRoadmapResponse] = useState<unknown>(null);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!goal.trim()) return;
    setStep(3);
    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const res = await fetch('/api/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          currentLevel,
          desiredOutcome: desiredOutcome.trim(),
          weeklyHours,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate roadmap');

      const data = await res.json();

      if (data.isValid === false) {
        setError(data.invalidReason || 'The topic entered is unclear. Please try a specific goal.');
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        }
        setStep(1);
        return;
      }

      setRoadmapTitle(data.roadmapTitle || `${goal} Roadmap`);
      setEstimatedWeeks(data.estimatedWeeks || 8);
      setTopics(Array.isArray(data.topics) ? data.topics : []);
      setRawRoadmapResponse(data);
      setStep(4);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error generating roadmap');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAllTopics = async () => {
    if (topics.length === 0) return;
    setCreating(true);
    setError(null);

    try {
      // One call, server-side: creates the Goal, every topic, and the
      // GoalLinks joining them, atomically — see POST /api/goals. Used to
      // be a client-side loop of individual POST /api/topics calls with
      // no Goal at all, which is exactly the "thrown away" data problem
      // Phase 7 exists to fix (roadmapTitle/estimatedWeeks/the original
      // prompt vanished the moment topics existed).
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: roadmapTitle,
          outcome: goal,
          why: desiredOutcome || null,
          roadmapRaw: rawRoadmapResponse,
          currentLevel,
          topics,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create goal');
      }

      router.refresh();
      if (onComplete) onComplete();
      onClose();
    } catch (e: any) {
      console.error('Error creating goal:', e);
      setError(e.message || 'Failed to create roadmap topics');
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveTopic = (idx: number) => {
    setTopics(topics.filter((_, i) => i !== idx));
  };

  return (
    <div className="debrief-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="debrief-card" style={{ maxWidth: '640px', borderRadius: 'var(--radius-lg)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              🤖 Groq AI Roadmap Generator
            </span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '2px' }}>
              {step === 1 && 'What do you want to learn?'}
              {step === 2 && 'Tell us about your background'}
              {step === 3 && 'Generating Learning Path...'}
              {step === 4 && roadmapTitle}
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-text-muted)', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-danger)', fontSize: '0.8rem', marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Suggestions when input is invalid or ambiguous */}
        {suggestions.length > 0 && step === 1 && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-light)', marginBottom: '8px' }}>💡 Did you mean one of these topics?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setGoal(sug); setError(null); setSuggestions([]); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid var(--color-primary)',
                    color: 'var(--color-primary-light)',
                    cursor: 'pointer',
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Goal Input */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Learning Goal or Skill</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. React Native, Personal Finance, Piano & Music Theory, Italian..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                autoFocus
                style={{ fontSize: '0.95rem', padding: '10px 14px' }}
              />
            </div>

            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 600 }}>Popular Goals</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {POPULAR_GOALS.map((p) => (
                  <button
                    key={p.goal}
                    type="button"
                    onClick={() => { setGoal(p.goal); setError(null); }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '9999px',
                      fontSize: '0.78rem',
                      background: goal === p.goal ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                      border: goal === p.goal ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                      color: goal === p.goal ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!goal.trim()}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
            >
              Next: Customize Level →
            </button>
          </div>
        )}

        {/* Step 2: Context & Preferences */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Your Current Starting Level</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { id: 'beginner', label: 'Complete Beginner', desc: 'Starting from scratch' },
                  { id: 'intermediate', label: 'Know Basics', desc: 'Read some material, know terms' },
                  { id: 'experienced', label: 'Some Experience', desc: 'Have hands-on practice' },
                  { id: 'advanced', label: 'Advanced', desc: 'Want deeper specialization' },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setCurrentLevel(lvl.id as any)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: currentLevel === lvl.id ? '1.5px solid var(--color-primary)' : '1px solid var(--border-color)',
                      background: currentLevel === lvl.id ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: currentLevel === lvl.id ? 'var(--color-primary-light)' : 'var(--color-text-primary)' }}>{lvl.label}</p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{lvl.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">What do you want to be able to DO? (Target Outcome)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Build and deploy production apps, write fluently at work..."
                value={desiredOutcome}
                onChange={(e) => setDesiredOutcome(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Study Time Commitment (Hours/Week)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[2, 5, 10, 15].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setWeeklyHours(hrs)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      border: weeklyHours === hrs ? '1.5px solid var(--color-primary)' : '1px solid var(--border-color)',
                      background: weeklyHours === hrs ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      color: weeklyHours === hrs ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {hrs} hrs/wk
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="button" onClick={() => setStep(1)} className="btn btn-secondary" style={{ flex: 1 }}>← Back</button>
              <button type="button" onClick={handleGenerate} className="btn btn-primary" style={{ flex: 2 }}>
                ✨ Generate AI Roadmap
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Loading Animation */}
        {step === 3 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite' }}>🧠</div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Architecting your personalized roadmap...</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', maxWidth: '360px' }}>
              Groq AI is analyzing your level and building a structured, step-by-step topic curriculum for <strong>"{goal}"</strong>.
            </p>
          </div>
        )}

        {/* Step 4: Preview & Confirm */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-primary-light)' }}>
                🗓️ Estimated duration: <strong>~{estimatedWeeks} weeks</strong> at {weeklyHours}h/week
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                {topics.length} topics generated
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
              {topics.map((t, i) => {
                const isExpanded = expandedTopicIdx === i;
                const hasModules = Array.isArray(t.curriculum) && t.curriculum.length > 0;

                return (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: i === 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255,255,255,0.02)',
                      border: i === 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: i === 0 ? '#10b981' : 'var(--color-text-muted)', minWidth: '18px', marginTop: '2px' }}>
                        {i + 1}
                      </span>

                      <div style={{ flexGrow: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{t.title}</p>
                          {i === 0 && (
                            <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '9999px', background: '#10b98120', color: '#10b981', fontWeight: 700 }}>
                              STARTS ACTIVE
                            </span>
                          )}
                          <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '9999px', background: t.mode === 'course' ? 'rgba(168,85,247,0.15)' : 'rgba(99,102,241,0.15)', color: t.mode === 'course' ? '#c084fc' : 'var(--color-primary-light)', fontWeight: 600 }}>
                            {t.mode === 'course' ? '📚 Course' : '🧭 Self-Directed'}
                          </span>
                          {t.area && (
                            <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>
                              {t.area}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{t.why}</p>
                        {t.nextAction && (
                          <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            → Next action: {t.nextAction}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                          ~{t.estimatedHours}h
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveTopic(i)}
                          style={{ color: 'var(--color-text-muted)', fontSize: '1rem', cursor: 'pointer', padding: '0 2px' }}
                          title="Remove topic"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Modules toggle & list */}
                    {hasModules && (
                      <div style={{ marginTop: '2px', borderTop: '1px border-dashed var(--border-color)', paddingTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedTopicIdx(isExpanded ? null : i)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-primary-light)',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isExpanded ? '▼ Hide Curriculum Modules' : `▶ View Curriculum (${t.curriculum!.length} Modules)`}
                        </button>

                        {isExpanded && (
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px', borderLeft: '2px solid rgba(99, 102, 241, 0.3)' }}>
                            {t.curriculum!.map((mod, modIdx) => (
                              <div key={modIdx} style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                                📌 {mod}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button type="button" onClick={() => setStep(2)} className="btn btn-secondary" style={{ flex: 1 }}>
                ← Regenerate
              </button>
              <button
                type="button"
                onClick={handleCreateAllTopics}
                disabled={creating || topics.length === 0}
                className="btn btn-primary"
                style={{ flex: 2 }}
              >
                {creating ? 'Creating Topics...' : `🚀 Create ${topics.length} Topics in Dashboard`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
