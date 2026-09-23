'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';

/**
 * Goal detail: the roadmap as a dependency-ordered path (GoalLinks,
 * ordered), readiness as criteria met/total with unmet criteria listed and
 * linked to the topic that closes each one — per the project plan's Fix on
 * Goal.readiness, never a bare percentage.
 */

interface LinkedTopic {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  area: string;
}

interface GoalLinkRow {
  id: string;
  order: number;
  required: boolean;
  topic: LinkedTopic | null;
}

interface ReadinessCriterion {
  topicId: string;
  label: string;
  met: boolean;
}

interface GoalDetail {
  id: string;
  title: string;
  outcome: string;
  why: string | null;
  status: string;
  targetDate: string | null;
  createdAt: string;
  links: GoalLinkRow[];
  readiness: { met: number; total: number; criteria: ReadinessCriterion[] };
}

const STATUS_OPTIONS = ['draft', 'active', 'paused', 'achieved', 'abandoned'];

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchGoal = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals/${params.id}`);
      if (res.ok) {
        setGoal(await res.json());
      } else if (res.status === 404) {
        setGoal(null);
      }
    } catch (e) {
      console.error('Failed to load goal:', e);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  const handleStatusChange = async (status: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/goals/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Goal marked ${status}`);
        await fetchGoal();
      } else {
        toast.error('Failed to update goal');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '760px' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Goal not found.</p>
        <Link href="/goals" style={{ color: 'var(--color-primary-light)', fontSize: '0.85rem' }}>← Back to Goals</Link>
      </div>
    );
  }

  const unmet = goal.readiness.criteria.filter((c) => !c.met);
  const met = goal.readiness.criteria.filter((c) => c.met);
  const orderedLinks = [...goal.links].sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <Link href="/goals" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>← Back to Goals</Link>

      <div className="glass-panel" style={{ padding: '20px' }}>
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{goal.title}</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>"{goal.outcome}"</p>
            {goal.why && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{goal.why}</p>}
          </div>
          <select
            value={goal.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="form-input"
            style={{ width: 'auto', fontSize: '0.8rem', padding: '6px 10px', background: '#121218' }}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Readiness — criteria met/total, never a bare percentage */}
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              Readiness: {goal.readiness.met} / {goal.readiness.total} criteria met
            </span>
          </div>
          {goal.readiness.total > 0 && (
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ width: `${(goal.readiness.met / goal.readiness.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))' }} />
            </div>
          )}

          {unmet.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: met.length > 0 ? '10px' : 0 }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>UNMET</span>
              {unmet.map((c) => (
                <Link key={c.topicId} href={`/topics/${c.topicId}`} style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
                  ☐ {c.label}
                </Link>
              ))}
            </div>
          )}
          {met.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>MET</span>
              {met.map((c) => (
                <Link key={c.topicId} href={`/topics/${c.topicId}`} style={{ fontSize: '0.8rem', color: 'var(--color-success)', textDecoration: 'none' }}>
                  ☑ {c.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The roadmap — dependency-ordered path */}
      <div>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px' }}>The Path</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orderedLinks.map((link, idx) => (
            link.topic ? (
              <Link
                key={link.id}
                href={`/topics/${link.topic.id}`}
                className="glass-card"
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderLeft: link.topic.status === 'active' ? '3px solid var(--color-primary)' : '3px solid var(--border-color)',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', minWidth: '18px' }}>{idx + 1}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{link.topic.title}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                    <span className={`badge badge-${link.topic.area.toLowerCase()}`} style={{ fontSize: '0.62rem' }}>{link.topic.area}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{link.topic.status}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{link.topic.progressPct}%</span>
                  </div>
                </div>
              </Link>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}
