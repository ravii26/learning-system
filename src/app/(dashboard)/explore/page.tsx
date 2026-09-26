'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';

const OUTCOME_LABELS: Record<string, string> = {
  interesting: 'Queued for later',
  useful: 'Queued for later',
  important: 'High Priority Queue',
  useless: 'Dropped/Not useful',
  curiosity: 'Curiosity Reference Only',
};

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

  // Recent explorations
  const [recentExplorations, setRecentExplorations] = useState<Array<{ id: string; title: string; status: string; lastTouchedDate: string; outcomeLabel: string }>>([]);

  useEffect(() => {
    // Recent explorations, via the CaptureItem this flow now creates
    // alongside each topic (tags: ['explored', outcome]) — a proper
    // relational link, replacing the previous `title.includes('[Explored:')`
    // string match. That hack also meant the outcome label had to be
    // stuffed into the topic's own title forever; it no longer is.
    Promise.all([
      fetch('/api/captures?status=processed').then(r => (r.ok ? r.json() : [])),
      fetch('/api/topics').then(r => (r.ok ? r.json() : [])),
    ])
      .then(([captures, topics]: [Array<{ id: string; resultTopicId: string | null; tags: string[] }>, Array<{ id: string; title: string; status: string; lastTouchedDate: string }>]) => {
        const topicsById = new Map(topics.map((t) => [t.id, t]));
        const explored = captures
          .filter((c) => c.tags.includes('explored') && c.resultTopicId && topicsById.has(c.resultTopicId))
          .slice(0, 5)
          .map((c) => {
            const topic = topicsById.get(c.resultTopicId!)!;
            const outcomeTag = c.tags.find((t) => t !== 'explored') || 'explored';
            return { id: topic.id, title: topic.title, status: topic.status, lastTouchedDate: topic.lastTouchedDate, outcomeLabel: OUTCOME_LABELS[outcomeTag] || outcomeTag };
          });
        setRecentExplorations(explored);
      })
      .catch(() => {});
  }, []);

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
    // Interesting/Useful/Important -> Queue · Not useful -> Dropped · Curiosity -> Reference
    let dbStatus = 'queued';
    if (outcome === 'useless') dbStatus = 'dropped';
    else if (outcome === 'curiosity') dbStatus = 'reference';

    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topicTitle.trim(),
          status: dbStatus,
          notes: notes.trim() || 'No exploration notes taken.',
          area: 'Other',
          why: 'Explored through Curiosity Mode.',
          depthTarget: 'Awareness',
        }),
      });

      // Record the exploration itself as a processed CaptureItem, linked to
      // the topic it produced — see the useEffect above for why (replaces
      // the old `title.includes('[Explored:')` string match). Best-effort:
      // if this fails, the topic above was still created successfully, so
      // don't fail the whole save over a tracking record.
      if (res.ok) {
        const createdTopic = await res.json().catch(() => null);
        if (createdTopic?.id) {
          fetch('/api/captures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rawText: `Explored: ${topicTitle.trim()}`,
              sourceType: 'thought',
              tags: ['explored', outcome],
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((capture) => {
              if (capture?.id) {
                return fetch(`/api/captures/${capture.id}/process`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'topic', existingTopicId: createdTopic.id }),
                });
              }
            })
            .catch(() => {});
        }
      }

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
        <>
          <form onSubmit={(e) => { e.preventDefault(); startSession(); }} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="form-group">
              <label className="form-label">What curiosity are you exploring?</label>
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
              <label className="form-label">Session length</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {[15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className="btn"
                    style={{
                      fontSize: '0.85rem',
                      background: durationMinutes === mins ? 'var(--fill-3)' : 'var(--fill-1)',
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
              Start Exploration
            </button>
          </form>

          {/* Recent Explorations */}
          {recentExplorations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Recent Explorations
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentExplorations.map(t => {
                  const statusColor: Record<string, string> = {
                    queued: 'var(--color-primary-light)',
                    reference: 'var(--color-text-muted)',
                    dropped: 'var(--color-danger)',
                  };
                  return (
                    <div key={t.id} className="review-preview-card">
                      <span style={{ flexGrow: 1, fontSize: '0.85rem', fontWeight: 500 }}>{t.title}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(t.lastTouchedDate).toLocaleDateString()}
                      </span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: statusColor[t.status] || 'var(--color-text-muted)' }}>
                        {t.outcomeLabel}
                      </span>
                      <a
                        href={`/topics/${t.id}`}
                        style={{ fontSize: '0.7rem', color: 'var(--color-primary-light)', whiteSpace: 'nowrap', textDecoration: 'none' }}
                      >
                        View →
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* RUNNING / PAUSED STATE */}
      {(sessionState === 'running' || sessionState === 'paused') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          
          {/* Active Timer Card */}
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Exploring: "{topicTitle}"
            </span>
            
            <div style={{ fontSize: '4.5rem', fontWeight: 700, fontFamily: 'monospace', color: sessionState === 'paused' ? 'var(--color-text-muted)' : 'var(--color-text-primary)', letterSpacing: '-0.05em' }}>
              {formatTime(secondsRemaining)}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {sessionState === 'running' ? (
                <button onClick={handlePause} className="btn btn-secondary">
                  Pause Timer
                </button>
              ) : (
                <button onClick={handleResume} className="btn btn-primary">
                  ▶️ Resume Timer
                </button>
              )}
              
              <button onClick={handleFinishEarly} className="btn btn-danger">
                Complete Early
              </button>
            </div>
          </div>

          {/* Note taking Pad */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div className="flex-between" style={{ marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Curiosity scratchpad (fast notes)</label>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-sunk)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setNotesMode('write')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    borderRadius: '4px',
                    background: notesMode === 'write' ? 'var(--bg-surface)' : 'transparent',
                    color: notesMode === 'write' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setNotesMode('preview')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    borderRadius: '4px',
                    background: notesMode === 'preview' ? 'var(--bg-surface)' : 'transparent',
                    color: notesMode === 'preview' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  Preview
                </button>
              </div>
            </div>
            
            {notesMode === 'write' ? (
              <textarea
                className="form-input"
                placeholder="Jot down interesting concepts, takeaways, or links during your exploration (supports Markdown)..."
                style={{ width: '100%', height: '250px', resize: 'vertical', background: 'var(--bg-sunk)', fontFamily: 'monospace' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            ) : (
              <div
                className="form-input md-content"
                style={{
                  width: '100%',
                  minHeight: '250px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  background: 'var(--bg-sunk)',
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '8px' }}>Session Concluded: What's the verdict?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              How do you evaluate <strong>"{topicTitle}"</strong> after this exploration?
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label">Select verdict outcome</label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setOutcome('interesting')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'interesting' ? 'var(--fill-2)' : 'transparent',
                  border: outcome === 'interesting' ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  color: outcome === 'interesting' ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                }}
              >
                <strong>Interesting</strong> — Send to Queue for structured study later
              </button>

              <button
                type="button"
                onClick={() => setOutcome('useful')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'useful' ? 'var(--fill-2)' : 'transparent',
                  border: outcome === 'useful' ? '1px solid var(--color-secondary)' : '1px solid var(--border-color)',
                  color: outcome === 'useful' ? 'var(--color-secondary-light)' : 'var(--color-text-secondary)',
                }}
              >
                <strong>Useful</strong> — Send to Queue as a practical skill resource
              </button>

              <button
                type="button"
                onClick={() => setOutcome('important')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'important' ? 'var(--fill-2)' : 'transparent',
                  border: outcome === 'important' ? '1px solid var(--color-accent)' : '1px solid var(--border-color)',
                  color: outcome === 'important' ? 'var(--color-text-secondary)' : 'var(--color-text-secondary)',
                }}
              >
                <strong>Important</strong> — Queue high-priority and plan activation
              </button>

              <button
                type="button"
                onClick={() => setOutcome('curiosity')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'curiosity' ? 'var(--fill-3)' : 'transparent',
                  border: outcome === 'curiosity' ? '1px solid var(--fill-4)' : '1px solid var(--border-color)',
                  color: outcome === 'curiosity' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
              >
                <strong>Just Curiosity</strong> — File in Reference only for future lookup
              </button>

              <button
                type="button"
                onClick={() => setOutcome('useless')}
                className="btn"
                style={{
                  justifyContent: 'flex-start',
                  fontSize: '0.85rem',
                  background: outcome === 'useless' ? 'var(--danger-tint)' : 'transparent',
                  border: outcome === 'useless' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                  color: outcome === 'useless' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                }}
              >
                <strong>Not Useful</strong> — Record as Dropped so I don't waste time on it again
              </button>
            </div>
          </div>

          <button onClick={handleSaveOutcome} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Outcome & Exit'}
          </button>
        </div>
      )}

      {/* SAVED STATE */}
      {sessionState === 'saved' && (
        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center' }}>
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
