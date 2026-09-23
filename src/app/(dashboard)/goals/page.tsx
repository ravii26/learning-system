'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/**
 * Goal list. Readiness is always shown as "met/total", never a bare
 * percentage — see src/lib/goalReadiness.ts and the project plan's
 * honesty rule on projections from a handful of goals.
 */

interface GoalRow {
  id: string;
  title: string;
  outcome: string;
  status: string;
  targetDate: string | null;
  readinessMet: number;
  readinessTotal: number;
  _count?: { links: number };
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--color-text-muted)',
  active: 'var(--color-primary-light)',
  achieved: 'var(--color-success)',
  abandoned: 'var(--color-text-muted)',
  paused: 'var(--color-warning)',
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) setGoals(await res.json());
    } catch (e) {
      console.error('Failed to load goals:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '48px', borderRadius: '12px' }} />
        {[...Array(2)].map((_, i) => <div key={i} className="skeleton" style={{ height: '90px', borderRadius: '12px' }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Goals</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Generate a roadmap from Plan to start one — an AI-decomposed outcome, tracked as criteria met, not a fabricated percentage.
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          No goals yet. Use "Generate AI Roadmap" from{' '}
          <Link href="/plan" style={{ color: 'var(--color-primary-light)' }}>Plan</Link> to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {goals.map((g) => (
            <Link
              key={g.id}
              href={`/goals/${g.id}`}
              className="glass-card"
              style={{
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                borderLeft: `3px solid ${STATUS_COLORS[g.status] || 'var(--border-color)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700 }}>{g.title}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLORS[g.status] }}>
                  {g.status}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{g.outcome}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                <span>
                  {g.readinessTotal > 0 ? `${g.readinessMet}/${g.readinessTotal} criteria met` : 'No criteria yet'}
                </span>
                {g._count && <span>· {g._count.links} linked</span>}
                {g.targetDate && <span>· due {new Date(g.targetDate).toLocaleDateString()}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
