'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ToastProvider';
import { enumToLabel } from '@/lib/masteryLevel';

/**
 * The competency tree — "where you stand" (the project plan's Example A).
 * Area -> Skill -> sub-skill, each showing evidence-earned mastery: a
 * score, a ladder label, AND the breakdown that produced it. Per the
 * plan's honesty rule, the score is never shown without the breakdown
 * next to it — a bare number implies more certainty than "half your
 * concepts are covered, half your reviews landed" actually carries.
 */

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  kind: 'area' | 'skill' | 'subskill';
  parentId: string | null;
  masteryScore: number;
  masteryLevel: string;
  evidenceCount: number;
  lastEvidenceAt: string | null;
  computedAt: string | null;
  masteryBreakdown: { retention: number; coverage: number; practice: number; artifacts: number } | null;
  targetLevel: string | null;
  _count?: { topics: number };
}

interface TopicRow {
  id: string;
  title: string;
  skillId: string | null;
  status: string;
}

interface SkillNode extends SkillRow {
  children: SkillNode[];
}

function buildTree(skills: SkillRow[]): SkillNode[] {
  const byId = new Map<string, SkillNode>(skills.map((s) => [s.id, { ...s, children: [] }]));
  const roots: SkillNode[] = [];
  for (const node of Array.from(byId.values())) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const PCT = (n: number) => `${Math.round(n * 100)}%`;

function MasteryBar({ score }: { score: number }) {
  return (
    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(2, Math.round(score * 100))}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
        }}
      />
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
      <span style={{ width: '68px' }}>{label}</span>
      <div style={{ flex: 1 }}>
        <MasteryBar score={value} />
      </div>
      <span style={{ width: '32px', textAlign: 'right' }}>{PCT(value)}</span>
    </div>
  );
}

function SkillCard({ node, topicsBySkill, depth }: { node: SkillNode; topicsBySkill: Map<string, TopicRow[]>; depth: number }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const topics = topicsBySkill.get(node.id) || [];
  const hasChildren = node.children.length > 0;
  const hasEvidence = node.evidenceCount > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? '20px' : 0 }}>
      <div
        className="glass-card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          borderLeft: depth === 0 ? '3px solid var(--color-primary)' : '3px solid var(--border-color)',
          cursor: hasChildren || topics.length > 0 ? 'pointer' : 'default',
        }}
        onClick={() => (hasChildren || topics.length > 0) && setExpanded((v) => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(hasChildren || topics.length > 0) && (
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{expanded ? '▾' : '▸'}</span>
            )}
            <span style={{ fontSize: depth === 0 ? '1rem' : '0.88rem', fontWeight: depth === 0 ? 700 : 600 }}>{node.name}</span>
            {node._count !== undefined && node._count.topics > 0 && (
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>({node._count.topics} topic{node._count.topics === 1 ? '' : 's'})</span>
            )}
          </div>
          {hasEvidence ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                {enumToLabel(node.masteryLevel)}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>({PCT(node.masteryScore)})</span>
            </div>
          ) : (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>No evidence yet</span>
          )}
        </div>

        {hasEvidence && <MasteryBar score={node.masteryScore} />}

        {hasEvidence && expanded && node.masteryBreakdown && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <BreakdownRow label="Retention" value={node.masteryBreakdown.retention} />
            <BreakdownRow label="Coverage" value={node.masteryBreakdown.coverage} />
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {node.evidenceCount} evidence point{node.evidenceCount === 1 ? '' : 's'}
              {node.computedAt && ` · computed ${new Date(node.computedAt).toLocaleDateString()}`}
            </span>
          </div>
        )}

        {expanded && topics.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>EVIDENCE — TOPICS</span>
            {topics.map((t) => (
              <a
                key={t.id}
                href={`/topics/${t.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              >
                → {t.title} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>({t.status})</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          {node.children.map((child) => (
            <SkillCard key={child.id} node={child} topicsBySkill={topicsBySkill} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  const toast = useToast();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [skillsRes, topicsRes] = await Promise.all([fetch('/api/skills'), fetch('/api/topics')]);
      if (skillsRes.ok) setSkills(await skillsRes.json());
      if (topicsRes.ok) setTopics(await topicsRes.json());
    } catch (e) {
      console.error('Failed to load skills:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const res = await fetch('/api/skills/recompute', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        if (result.failed?.length > 0) {
          toast.warning(`Recomputed ${result.succeeded}/${result.total} — ${result.failed.length} failed`);
        } else {
          toast.success(`Recomputed ${result.succeeded} skill${result.succeeded === 1 ? '' : 's'}`);
        }
        await fetchData();
      } else {
        toast.error('Failed to recompute');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setRecomputing(false);
    }
  };

  const tree = useMemo(() => buildTree(skills), [skills]);
  const topicsBySkill = useMemo(() => {
    const map = new Map<string, TopicRow[]>();
    for (const t of topics) {
      if (!t.skillId) continue;
      const arr = map.get(t.skillId) || [];
      arr.push(t);
      map.set(t.skillId, arr);
    }
    return map;
  }, [topics]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '48px', borderRadius: '12px' }} />
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '12px' }} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div className="flex-between">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Where You Stand</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Evidence-earned mastery, not a self-typed percentage. Drill into any skill to see what it's built on.
          </p>
        </div>
        <button onClick={handleRecompute} disabled={recomputing} className="btn btn-secondary">
          {recomputing ? 'Recomputing…' : '↻ Recompute'}
        </button>
      </div>

      {tree.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          No skills yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tree.map((node) => (
            <SkillCard key={node.id} node={node} topicsBySkill={topicsBySkill} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
