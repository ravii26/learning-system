'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/ToastProvider';
import { computePracticeTrend, type RepForTrend } from '@/lib/practiceTrend';

/**
 * Practice mode's home (project plan's Example D — English/communication:
 * no curriculum, no concepts, success is a curve, not a completion bar).
 * Deliberately a dedicated page, not a topics/[id] tab: a practice topic
 * has nothing to show on the syllabus-shaped topic detail page (no
 * curriculum, no concepts, no subtasks), so reusing it would mean a mostly
 * empty page with one relevant section. Mirrors the /notes page's pattern
 * from Phase 8 for the same reason.
 */

const RUBRIC_DIMENSIONS: Array<{ key: string; label: string; inverted: boolean }> = [
  { key: 'fluency', label: 'Fluency', inverted: false },
  { key: 'structure', label: 'Structure', inverted: false },
  { key: 'vocabulary', label: 'Vocabulary', inverted: false },
  { key: 'fillers', label: 'Fillers (lower is better)', inverted: true },
];
const INVERTED_KEYS = RUBRIC_DIMENSIONS.filter((d) => d.inverted).map((d) => d.key);

interface PracticeTopic {
  id: string;
  title: string;
  area: string;
}

interface PracticeRepRow {
  id: string;
  promptText: string;
  rubricScores: Record<string, number>;
  invertedKeys: string[];
  score: number;
  occurredAt: string;
  recordingUrl: string | null;
}

interface ArtifactRow {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  kind: string | null;
  occurredAt: string;
}

function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const blocks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => blocks[Math.min(blocks.length - 1, Math.floor(((v - min) / range) * (blocks.length - 1)))]).join('');
}

export default function PracticePage() {
  const toast = useToast();

  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [reps, setReps] = useState<PracticeRepRow[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [prompt, setPrompt] = useState<{ promptText: string; conceptId: string | null; conceptTitle: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [scores, setScores] = useState<Record<string, number>>({ fluency: 3, structure: 3, vocabulary: 3, fillers: 3 });
  const [recordingUrl, setRecordingUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<string>('');
  const [submittingRep, setSubmittingRep] = useState(false);

  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactKind, setArtifactKind] = useState('project');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [addingArtifact, setAddingArtifact] = useState(false);

  const fetchTopicsAndPrompt = useCallback(async () => {
    try {
      const [topicsRes, promptRes] = await Promise.all([
        fetch('/api/topics?status=active'),
        fetch('/api/practice-prompt'),
      ]);
      let practiceTopics: PracticeTopic[] = [];
      if (topicsRes.ok) {
        const all = await topicsRes.json();
        practiceTopics = all.filter((t: any) => t.mode === 'practice').map((t: any) => ({ id: t.id, title: t.title, area: t.area }));
      }
      // status=active only returns active-status topics; practice topics
      // are created as 'maintenance' (see handleCreateTopic below) so they
      // don't consume a WIP slot — fetch all topics too and merge in.
      if (practiceTopics.length === 0) {
        const allRes = await fetch('/api/topics');
        if (allRes.ok) {
          const all = await allRes.json();
          practiceTopics = all.filter((t: any) => t.mode === 'practice').map((t: any) => ({ id: t.id, title: t.title, area: t.area }));
        }
      }
      setTopics(practiceTopics);
      setSelectedTopicId((prev) => prev || practiceTopics[0]?.id || '');
      if (promptRes.ok) setPrompt(await promptRes.json());
    } catch (e) {
      console.error('Failed to load practice topics:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopicsAndPrompt();
  }, [fetchTopicsAndPrompt]);

  const fetchTopicData = useCallback(async (topicId: string) => {
    if (!topicId) {
      setReps([]);
      setArtifacts([]);
      return;
    }
    try {
      const [repsRes, artifactsRes] = await Promise.all([
        fetch(`/api/practice-reps?topicId=${topicId}`),
        fetch(`/api/artifacts?topicId=${topicId}`),
      ]);
      if (repsRes.ok) setReps(await repsRes.json());
      if (artifactsRes.ok) setArtifacts(await artifactsRes.json());
    } catch (e) {
      console.error('Failed to load practice topic data:', e);
    }
  }, []);

  useEffect(() => {
    fetchTopicData(selectedTopicId);
  }, [selectedTopicId, fetchTopicData]);

  const trend = useMemo(() => {
    const forTrend: RepForTrend[] = reps.map((r) => ({ occurredAt: r.occurredAt, rubricScores: r.rubricScores, invertedKeys: r.invertedKeys }));
    return computePracticeTrend(forTrend);
  }, [reps]);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTopicTitle.trim();
    if (!title) return;
    setCreatingTopic(true);
    try {
      // status: 'maintenance', not 'active' — a practice topic is ongoing
      // by nature (Example D: no finish line), so it deliberately doesn't
      // consume one of the 2 WIP-limited active slots the syllabus status
      // machine enforces.
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status: 'maintenance', mode: 'practice' }),
      });
      if (res.ok) {
        const topic = await res.json();
        setNewTopicTitle('');
        toast.success(`"${title}" started`);
        setTopics((prev) => [...prev, { id: topic.id, title: topic.title, area: topic.area }]);
        setSelectedTopicId(topic.id);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to start topic');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleSubmitRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId || !prompt) return;
    setSubmittingRep(true);
    try {
      const res = await fetch('/api/practice-reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: selectedTopicId,
          promptText: prompt.promptText,
          promptConceptId: prompt.conceptId,
          rubricScores: scores,
          invertedKeys: INVERTED_KEYS,
          recordingUrl: recordingUrl.trim() || undefined,
          durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
        }),
      });
      if (res.ok) {
        toast.success('Rep logged');
        setRecordingUrl('');
        setDurationSeconds('');
        await fetchTopicData(selectedTopicId);
        const promptRes = await fetch('/api/practice-prompt');
        if (promptRes.ok) setPrompt(await promptRes.json());
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to log rep');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setSubmittingRep(false);
    }
  };

  const handleAddArtifact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId || !artifactTitle.trim()) return;
    setAddingArtifact(true);
    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: selectedTopicId, title: artifactTitle.trim(), kind: artifactKind, url: artifactUrl.trim() || undefined }),
      });
      if (res.ok) {
        toast.success('Artifact logged');
        setArtifactTitle('');
        setArtifactUrl('');
        await fetchTopicData(selectedTopicId);
      } else {
        toast.error('Failed to log artifact');
      }
    } catch {
      toast.error('Connection error');
    } finally {
      setAddingArtifact(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
        <div className="skeleton" style={{ height: '52px', borderRadius: '12px' }} />
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Practice</h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          A daily rep, a prompt pulled from what you&apos;re already reviewing. No completion bar — a curve.
        </p>
      </div>

      {topics.length === 0 ? (
        <form onSubmit={handleCreateTopic} className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            No practice topic yet — e.g. &quot;Spoken English&quot; or &quot;Technical Writing&quot;.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Spoken English"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              disabled={creatingTopic}
              style={{ fontSize: '0.9rem', padding: '8px 12px' }}
            />
            <button type="submit" disabled={creatingTopic || !newTopicTitle.trim()} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              {creatingTopic ? 'Starting…' : 'Start ▸'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {topics.length > 1 && (
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '6px 10px', width: 'auto', alignSelf: 'flex-start', background: '#121218' }}
            >
              {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}

          {/* Today's prompt + rep-logging form */}
          <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--color-primary)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-primary-light)', textTransform: 'uppercase' }}>
              ▸ Today&apos;s rep
            </span>
            <div style={{ marginTop: '10px', fontSize: '0.95rem', fontWeight: 600 }}>{prompt?.promptText}</div>
            {prompt?.conceptTitle && (
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                pulled from a concept currently in review: {prompt.conceptTitle}
              </div>
            )}

            <form onSubmit={handleSubmitRep} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {RUBRIC_DIMENSIONS.map((dim) => (
                  <label key={dim.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {dim.label}
                    <select
                      value={scores[dim.key]}
                      onChange={(e) => setScores((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                      className="form-input"
                      style={{ fontSize: '0.85rem', padding: '5px 8px', background: '#121218' }}
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="recording URL (optional)"
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '6px 10px', flex: 2 }}
                />
                <input
                  type="number"
                  className="form-input"
                  placeholder="seconds"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '6px 10px', flex: 1 }}
                />
              </div>
              <button type="submit" disabled={submittingRep} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                {submittingRep ? 'Logging…' : 'Log rep ▸'}
              </button>
            </form>
          </div>

          {/* The curve — never a completion percentage */}
          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{topics.find((t) => t.id === selectedTopicId)?.title}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{trend.overallTrend}</span>
            </div>
            {trend.repCount === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '10px' }}>No reps logged yet.</div>
            ) : (
              <>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
                  {trend.repCount} rep{trend.repCount === 1 ? '' : 's'} over {trend.spanDays} day{trend.spanDays === 1 ? '' : 's'}
                  {trend.currentStreak > 0 && ` · current streak ${trend.currentStreak}`}
                </div>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {trend.dimensions.map((d) => (
                    <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: '10px', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: d.key === trend.weakestKey ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                        {d.key}{d.key === trend.weakestKey ? ' ← weakest' : ''}
                      </span>
                      <span style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>{sparkline(d.values)}</span>
                      <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {d.first.toFixed(1)} → {d.last.toFixed(1)}{d.inverted ? ' (lower better)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Artifacts */}
          <div className="glass-panel" style={{ padding: '18px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Artifacts ({artifacts.length})
            </span>
            {artifacts.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {artifacts.map((a) => (
                  <div key={a.id} style={{ fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span>{a.title} {a.kind && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>· {a.kind}</span>}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{new Date(a.occurredAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddArtifact} style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. mock interview, essay"
                value={artifactTitle}
                onChange={(e) => setArtifactTitle(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '5px 8px', flex: 2, minWidth: '140px' }}
              />
              <select
                value={artifactKind}
                onChange={(e) => setArtifactKind(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.78rem', padding: '5px 8px', width: 'auto', background: '#121218' }}
              >
                <option value="project">project</option>
                <option value="writing">writing</option>
                <option value="presentation">presentation</option>
                <option value="mock_interview">mock interview</option>
                <option value="other">other</option>
              </select>
              <input
                type="text"
                className="form-input"
                placeholder="url (optional)"
                value={artifactUrl}
                onChange={(e) => setArtifactUrl(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '5px 8px', flex: 1, minWidth: '100px' }}
              />
              <button type="submit" disabled={addingArtifact || !artifactTitle.trim()} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
                + Add
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
