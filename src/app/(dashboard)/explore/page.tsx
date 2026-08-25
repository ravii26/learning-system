'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';

export default function ExplorePage() {
  const router = useRouter();

  // Exploration Session State: 'setup' | 'running' | 'paused' | 'evaluate' | 'saved'
  const [sessionState, setSessionState] = useState<'setup' | 'running' | 'paused' | 'evaluate' | 'saved'>('setup');
  
  const [topicTitle, setTopicTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [notes, setNotes] = useState('');
  const [notesMode, setNotesMode] = useState<'write' | 'preview'>('write');
  
  // Timer State
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Outcome Selection
  const [outcome, setOutcome] = useState<'interesting' | 'useful' | 'important' | 'useless' | 'curiosity'>('interesting');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionState === 'running') {
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setSessionState('evaluate');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionState]);

  const startSession = () => {
    if (!topicTitle.trim()) {
      alert('Please enter a topic title to explore.');
      return;
    }
    setSecondsRemaining(durationMinutes * 60);
    setSessionState('running');
  };

  const handlePause = () => {
    setSessionState('paused');
  };

  const handleResume = () => {
    setSessionState('running');
  };

  const handleFinishEarly = () => {
    if (confirm('Finish your exploration session early?')) {
      setSessionState('evaluate');
    }
  };

  const handleSaveOutcome = async () => {
    setSaving(true);
    
    // Map outcome to SOW Status
    // Interesting -> Queue
    // Useful -> Queue
    // Important -> Queue (or we can tag as active later)
    // Not useful (useless) -> Dropped
    // Just curiosity -> Reference
    let dbStatus = 'queued';
    let summarySuffix = '';
    
    if (outcome === 'interesting' || outcome === 'useful') {
      dbStatus = 'queued';
      summarySuffix = ' [Explored: Queued for later]';
    } else if (outcome === 'important') {
      dbStatus = 'queued';
      summarySuffix = ' [Explored: High Priority Queue]';
    } else if (outcome === 'useless') {
      dbStatus = 'dropped';
      summarySuffix = ' [Explored: Dropped/Not useful]';
    } else if (outcome === 'curiosity') {
      dbStatus = 'reference';
      summarySuffix = ' [Explored: Curiosity Reference Only]';
    }

    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topicTitle.trim() + summarySuffix,
          status: dbStatus,
          notes: notes.trim() || 'No exploration notes taken.',
          area: 'Other',
          why: 'Explored through Curiosity Mode.',
          depthTarget: 'Awareness',
        }),
      });

      if (res.ok) {
        setSessionState('saved');
        router.refresh();
      } else {
        alert('Failed to save exploration outcome.');
      }
    } catch (e) {
      console.error(e);
      alert('Connection error.');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* HEADER */}
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Exploration Mode</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Explore random curiosities and micro-learn for 15-60 minutes without commitment.
        </p>
      </div>

      {/* SETUP STATE */}
      {sessionState === 'setup' && (
        <form onSubmit={(e) => { e.preventDefault(); startSession(); }} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '3rem', textAlign: 'center' }}>⏱️</div>
          
          <div className="form-group">
            <label className="form-label">WHAT CURIOSITY ARE YOU EXPLORING?</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. How Venture Capital Works, Caching Mechanisms, History of Cinematography..."
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">SESSION LENGTH</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(mins)}
                  className="btn"
                  style={{
                    fontSize: '0.85rem',
                    background: durationMinutes === mins ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: durationMinutes === mins ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                    color: durationMinutes === mins ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  }}
                >
                  {mins} Minutes
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '12px' }}>
            ⚡ Start Exploration
          </button>
        </form>
      )}

      {/* RUNNING / PAUSED STATE */}
      {(sessionState === 'running' || sessionState === 'paused') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          
          {/* Active Timer Card */}
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Exploring: "{topicTitle}"
            </span>
            
            <div style={{ fontSize: '4.5rem', fontWeight: 700, fontFamily: 'monospace', color: sessionState === 'paused' ? 'var(--color-text-muted)' : '#fff', letterSpacing: '-0.05em' }}>
              {formatTime(secondsRemaining)}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {sessionState === 'running' ? (
                <button onClick={handlePause} className="btn btn-secondary">
                  ⏸️ Pause Timer
                </button>
              ) : (
                <button onClick={handleResume} className="btn btn-primary">
                  ▶️ Resume Timer
                </button>
              )}
              
              <button onClick={handleFinishEarly} className="btn btn-danger">
                🛑 Complete Early
              </button>
            </div>
          </div>

          {/* Note taking Pad */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div className="flex-between" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>CURIOSITY SCRATCHPAD (FAST NOTES)</label>
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setNotesMode('write')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    borderRadius: '4px',
                    background: notesMode === 'write' ? 'var(--color-primary)' : 'transparent',
                    color: notesMode === 'write' ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  ✍️ Write
                </button>
                <button
                  type="button"
                  onClick={() => setNotesMode('preview')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    borderRadius: '4px',
                    background: notesMode === 'preview' ? 'var(--color-primary)' : 'transparent',
                    color: notesMode === 'preview' ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  👁️ Preview
                </button>
              </div>
            </div>
            
            {notesMode === 'write' ? (
              <textarea
                className="form-input"
                placeholder="Jot down interesting concepts, takeaways, or links during your exploration (supports Markdown)..."
                style={{ width: '100%', height: '250px', resize: 'vertical', background: 'rgba(0, 0, 0, 0.25)', fontFamily: 'monospace' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            ) : (
              <div
                className="form-input"
                style={{
                  width: '100%',
                  minHeight: '250px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-color)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }}
              />
            )}
          </div>

        </div>
      )}

      {/* EVALUATION STATE */}
      {sessionState === 'evaluate' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>💡</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '8px' }}>Session Concluded: What's the verdict?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              How do you evaluate <strong>"{topicTitle}"</strong> after this exploration?
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label">SELECT VERDICT OUTCOME</label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setOutcome('interesting')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'interesting' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  border: outcome === 'interesting' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  color: outcome === 'interesting' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                }}
              >
                💡 <strong>Interesting</strong> — Send to Queue for structured study later
              </button>

              <button
                type="button"
                onClick={() => setOutcome('useful')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'useful' ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                  border: outcome === 'useful' ? '1px solid var(--color-secondary)' : '1px solid var(--border-color)',
                  color: outcome === 'useful' ? 'var(--color-secondary-light)' : 'var(--color-text-secondary)',
                }}
              >
                🛠️ <strong>Useful</strong> — Send to Queue as a practical skill resource
              </button>

              <button
                type="button"
                onClick={() => setOutcome('important')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'important' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                  border: outcome === 'important' ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                  color: outcome === 'important' ? '#d8b4fe' : 'var(--color-text-secondary)',
                }}
              >
                🚀 <strong>Important</strong> — Queue high-priority and plan activation
              </button>

              <button
                type="button"
                onClick={() => setOutcome('curiosity')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'curiosity' ? 'rgba(107, 114, 128, 0.15)' : 'transparent',
                  border: outcome === 'curiosity' ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border-color)',
                  color: outcome === 'curiosity' ? '#f3f4f6' : 'var(--color-text-secondary)',
                }}
              >
                📖 <strong>Just Curiosity</strong> — File in Reference only for future lookup
              </button>

              <button
                type="button"
                onClick={() => setOutcome('useless')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'useless' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                  border: outcome === 'useless' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                  color: outcome === 'useless' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                }}
              >
                🗑️ <strong>Not Useful</strong> — Record as Dropped so I don't waste time on it again
              </button>
            </div>
          </div>

          <button onClick={handleSaveOutcome} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Outcome & Exit'}
          </button>
        </div>
      )}

      {/* SAVED STATE */}
      {sessionState === 'saved' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', color: 'var(--color-success)' }}>💾</div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Exploration Logged</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Your session on <strong>"{topicTitle}"</strong> has been categorized and recorded in your learning operating system with your notes intact.
            </p>
          </div>
          
          <button onClick={() => { router.push('/'); router.refresh(); }} className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '12px' }}>
            Return to Dashboard
          </button>
        </div>
      )}

    </div>
  );
}
