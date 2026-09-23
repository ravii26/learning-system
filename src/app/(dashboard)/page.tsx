'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';
import { pickNextAction, type NextActionPick, type TopicForNextAction } from '@/lib/nextAction';

/**
 * The Today screen — the front door as of Phase 4 (see the plan's Fix 2).
 *
 * The old dashboard (the full kanban board, prioritization portal, AI
 * roadmap wizard, knowledge graph — all of it, unchanged) moved to /plan.
 * This screen answers one question: what do I do in the next 25 minutes?
 * It picks for you and always says why (src/lib/nextAction.ts) — a pick
 * with no visible reason isn't trustworthy.
 *
 * Deliberately not on this screen yet, because the underlying feature
 * doesn't exist: a Goal readiness footer (Goals land in Phase 7) and a
 * "daily rep" practice card (practice mode lands in Phase 9). The pomodoro
 * timer card below links to the existing /review page's pomodoro tab
 * instead of promising something not built yet.
 */

interface Topic extends TopicForNextAction {
  area: string;
  progressPct: number;
  currentStage: string;
  depthTarget: string | null;
  why: string | null;
}

export default function TodayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [captureTitle, setCaptureTitle] = useState('');
  const [capturing, setCapturing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [topicsRes, spacedRes] = await Promise.all([
        fetch('/api/topics'),
        fetch('/api/review/spaced'),
      ]);
      if (topicsRes.ok) setTopics(await topicsRes.json());
      if (spacedRes.ok) {
        const spaced = await spacedRes.json();
        setDueCount(spaced.dueConcepts?.length || 0);
      }
    } catch (e) {
      console.error('Failed to load Today screen data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The global `C` hotkey (wired in HeaderToolbar) focuses this input.
  // Same-page: a custom event, since HeaderToolbar and this page are both
  // already mounted. Cross-page: HeaderToolbar navigates here with
  // ?focus=capture instead, since a same-tick event would have no listener
  // yet on the page it's navigating to.
  useEffect(() => {
    const onFocusCapture = () => {
      document.getElementById('quick-capture-input')?.focus();
    };
    window.addEventListener('learning-os:focus-capture', onFocusCapture);
    return () => window.removeEventListener('learning-os:focus-capture', onFocusCapture);
  }, []);

  // ?focus=capture arriving from HeaderToolbar's cross-page navigation: the
  // input doesn't exist yet while `loading` is true (this component renders
  // a skeleton with no form until fetchData() resolves), so this must wait
  // for loading to finish rather than firing once on mount.
  useEffect(() => {
    if (loading || searchParams.get('focus') !== 'capture') return;
    document.getElementById('quick-capture-input')?.focus();
    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = captureTitle.trim();
    if (!title) return;
    setCapturing(true);
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status: 'inbox' }),
      });
      if (res.ok) {
        setCaptureTitle('');
        toast.success(`"${title}" captured to Inbox`);
        await fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to capture');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setCapturing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '52px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '110px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '64px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '160px', borderRadius: '12px' }} />
      </div>
    );
  }

  const activeTopics = topics.filter((t) => t.status === 'active');
  const pick: NextActionPick | null = pickNextAction(activeTopics);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      {/* Capture — always present, works from anywhere (Fix 5) */}
      <form onSubmit={handleCapture} className="glass-panel" style={{ padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>C ▸</span>
        <input
          id="quick-capture-input"
          type="text"
          className="form-input"
          placeholder="capture anything… (goes to Inbox)"
          value={captureTitle}
          onChange={(e) => setCaptureTitle(e.target.value)}
          disabled={capturing}
          style={{ fontSize: '0.9rem', padding: '8px 12px', border: 'none', background: 'transparent' }}
        />
        {captureTitle.trim() && (
          <button type="submit" disabled={capturing} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            {capturing ? 'Capturing…' : 'Capture ▸'}
          </button>
        )}
        <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem', color: '#818cf8' }}>⌘K</kbd>
      </form>

      {/* Next 25 minutes — the one choice */}
      <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-primary)' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-primary-light)', textTransform: 'uppercase' }}>
          ▸ Next 25 minutes
        </span>
        {pick ? (
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>{pick.topicTitle}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>→ {pick.nextAction}</div>
              <div style={{ fontSize: '0.72rem', color: pick.isStale ? 'var(--color-danger)' : 'var(--color-text-muted)', marginTop: '8px' }}>
                why this: {pick.reason}
              </div>
            </div>
            <button onClick={() => router.push(`/topics/${pick.topicId}`)} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Start ▸
            </button>
          </div>
        ) : (
          <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            No active topic has a concrete next action queued.{' '}
            <Link href="/plan" style={{ color: 'var(--color-primary-light)' }}>Open the board</Link> to set one.
          </div>
        )}
      </div>

      {/* Due reviews + pomodoro — link out to the existing /review page */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              ▸ Due reviews
            </span>
            <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
              {dueCount > 0 ? `${dueCount} concept${dueCount === 1 ? '' : 's'} · ~${Math.max(1, Math.ceil(dueCount * 0.7))} min` : 'Queue is clear'}
            </div>
          </div>
          <Link href="/review" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>Review ▸</Link>
        </div>

        <div className="glass-panel" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              ▸ Focus timer
            </span>
            <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>25-minute pomodoro block</div>
          </div>
          <Link href="/review" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>Start ▸</Link>
        </div>
      </div>

      {/* NOW — the WIP-limited active slots */}
      <div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>
          Now ({activeTopics.length}/2)
        </div>
        {activeTopics.length === 0 ? (
          <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            No active topics. <Link href="/plan" style={{ color: 'var(--color-primary-light)' }}>Open the board</Link> to activate one.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeTopics.length}, 1fr)`, gap: '14px' }}>
            {activeTopics.map((t) => (
              <Link
                key={t.id}
                href={`/topics/${t.id}`}
                className="glass-card"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  borderLeft: t.activeSlotType === 'primary' ? '3px solid var(--color-primary)' : '3px solid var(--color-accent)',
                }}
              >
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{t.title}</span>
                <span className={`badge badge-${t.area.toLowerCase()}`} style={{ fontSize: '0.65rem', alignSelf: 'flex-start' }}>{t.area}</span>
                {t.nextAction && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>next: {t.nextAction}</span>
                )}
                <div className="progress-bar-mini" style={{ marginTop: '4px' }}>
                  <div className="progress-bar-mini-fill" style={{ width: `${Math.max(t.progressPct || 0, 2)}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/plan"
        style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}
      >
        View full board →
      </Link>
    </div>
  );
}
