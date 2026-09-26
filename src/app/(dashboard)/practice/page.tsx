'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { computePracticeTrend, type RepForTrend } from '@/lib/practiceTrend';
import { RUBRIC_TEMPLATES, getRubricTemplate } from '@/lib/practiceRubrics';
import { Button, Card, CardLabel, EmptyState, Field, Input, Select, Sparkline, StatPill } from '@/components/ui';

/**
 * Practice mode's home (project plan's Example D — English/communication:
 * no curriculum, no concepts, success is a curve, not a completion bar).
 * A dedicated page rather than a topics/[id] tab: a practice topic has
 * nothing to show on the syllabus-shaped topic page.
 *
 * Each practice topic picks a rubric template (src/lib/practiceRubrics.ts);
 * the rep form and the trend both follow that template's dimensions.
 */

interface PracticeTopic {
  id: string;
  title: string;
  area: string;
  rubricTemplate: string | null;
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

const TREND_TONE = { Improving: 'success', Steady: 'neutral', 'Needs focus': 'warning', New: 'primary' } as const;

function defaultScores(templateKey: string | null): Record<string, number> {
  return Object.fromEntries(getRubricTemplate(templateKey).dimensions.map((d) => [d.key, 3]));
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
  const [newTopicTemplate, setNewTopicTemplate] = useState(RUBRIC_TEMPLATES[0].key);
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [scores, setScores] = useState<Record<string, number>>(defaultScores(null));
  const [recordingUrl, setRecordingUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<string>('');
  const [submittingRep, setSubmittingRep] = useState(false);

  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactKind, setArtifactKind] = useState('project');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [addingArtifact, setAddingArtifact] = useState(false);

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  const template = getRubricTemplate(selectedTopic?.rubricTemplate);

  const fetchTopicsAndPrompt = useCallback(async () => {
    try {
      // All live topics, filtered to practice mode. (This used to fetch
      // status=active first and only fall back to all topics when none
      // matched — so one active practice topic hid every maintenance one.)
      const [topicsRes, promptRes] = await Promise.all([fetch('/api/topics'), fetch('/api/practice-prompt')]);
      if (topicsRes.ok) {
        const all = await topicsRes.json();
        const practiceTopics: PracticeTopic[] = all
          .filter((t: any) => t.mode === 'practice')
          .map((t: any) => ({ id: t.id, title: t.title, area: t.area, rubricTemplate: t.rubricTemplate ?? null }));
        setTopics(practiceTopics);
        setSelectedTopicId((prev) => prev || practiceTopics[0]?.id || '');
      }
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

  // The form always matches the selected topic's template.
  useEffect(() => {
    setScores(defaultScores(selectedTopic?.rubricTemplate ?? null));
  }, [selectedTopic?.id, selectedTopic?.rubricTemplate]);

  const trend = useMemo(() => {
    const forTrend: RepForTrend[] = reps.map((r) => ({ occurredAt: r.occurredAt, rubricScores: r.rubricScores, invertedKeys: r.invertedKeys }));
    return computePracticeTrend(forTrend);
  }, [reps]);

  const dimensionLabel = (key: string) => template.dimensions.find((d) => d.key === key)?.label ?? key;

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTopicTitle.trim();
    if (!title) return;
    setCreatingTopic(true);
    try {
      // status 'maintenance', not 'active': practice has no finish line, so
      // it doesn't take one of the 2 WIP-limited active slots.
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status: 'maintenance', mode: 'practice', area: 'Personal', rubricTemplate: newTopicTemplate }),
      });
      if (res.ok) {
        const topic = await res.json();
        setNewTopicTitle('');
        toast.success(`"${title}" started`);
        setTopics((prev) => [...prev, { id: topic.id, title: topic.title, area: topic.area, rubricTemplate: topic.rubricTemplate ?? null }]);
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

  const handleChangeTemplate = async (key: string) => {
    if (!selectedTopic) return;
    if (reps.length > 0 && !window.confirm('Switch rubric? Existing reps keep their old scores, but the trend will show both sets of dimensions.')) return;
    const res = await fetch(`/api/topics/${selectedTopic.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubricTemplate: key }),
    }).catch(() => null);
    if (res?.ok) {
      setTopics((prev) => prev.map((t) => (t.id === selectedTopic.id ? { ...t, rubricTemplate: key } : t)));
    } else {
      toast.error('Could not change the rubric');
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
          rubricScores: scores, // inverted dimensions come from the template, server-side
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
      <div className="flex max-w-[760px] flex-col gap-3.5">
        {[52, 200].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Practice</h1>
        <p className="mt-0.5 text-[0.82rem] text-fg-secondary">
          A daily rep, with a prompt pulled from what you&apos;re already reviewing. No completion bar — a curve.
        </p>
      </div>

      {topics.length === 0 ? (
        <Card as="form" onSubmit={handleCreateTopic} className="flex flex-col gap-3">
          <p className="text-[0.85rem] text-fg-muted">
            No practice topic yet — e.g. &quot;Spoken English&quot; or &quot;Technical Writing&quot;. You can also switch any topic to Practice in its Setup.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field label="Topic">
              <Input placeholder="e.g. Spoken English" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} disabled={creatingTopic} />
            </Field>
            <Field label="Rubric">
              <Select value={newTopicTemplate} onChange={(e) => setNewTopicTemplate(e.target.value)}>
                {RUBRIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="primary" disabled={creatingTopic || !newTopicTitle.trim()}>
              {creatingTopic ? 'Starting…' : 'Start ▸'}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {topics.length > 1 && (
              <Field label="Topic">
                <Select value={selectedTopicId} onChange={(e) => setSelectedTopicId(e.target.value)} className="w-auto">
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Rubric" hint={template.description}>
              <Select value={template.key} onChange={(e) => handleChangeTemplate(e.target.value)} className="w-auto">
                {RUBRIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          {/* Today's prompt + rep-logging form */}
          <Card accent="primary">
            <CardLabel tone="primary">Today&apos;s rep</CardLabel>
            <div className="mt-2.5 text-[0.95rem] font-semibold">{prompt?.promptText}</div>
            {prompt?.conceptTitle && (
              <div className="mt-1 text-[0.72rem] text-fg-muted">pulled from a concept currently in review: {prompt.conceptTitle}</div>
            )}

            <form onSubmit={handleSubmitRep} className="mt-4 flex flex-col gap-3">
              <p className="text-[0.75rem] text-fg-muted">Do the rep first (out loud or written), then score it honestly, 1–5.</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {template.dimensions.map((dim) => (
                  <Field key={dim.key} label={`${dim.label}${dim.inverted ? ' (lower is better)' : ''}`} hint={dim.hint}>
                    <Select
                      value={scores[dim.key] ?? 3}
                      onChange={(e) => setScores((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-[2fr_1fr] gap-2.5">
                <Input placeholder="recording URL (optional)" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} />
                <Input type="number" placeholder="seconds" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} />
              </div>
              <Button type="submit" variant="primary" disabled={submittingRep} className="self-start">
                {submittingRep ? 'Logging…' : 'Log rep ▸'}
              </Button>
            </form>
          </Card>

          {/* The curve — never a completion percentage */}
          <Card>
            <div className="flex-between flex-wrap gap-2">
              <span className="text-[0.9rem] font-bold">{selectedTopic?.title}</span>
              <StatPill label={trend.overallTrend} tone={TREND_TONE[trend.overallTrend]} />
            </div>
            {trend.repCount === 0 ? (
              <div className="mt-2.5 text-[0.8rem] text-fg-muted">No reps logged yet. After 3 reps, this shows whether each dimension is improving.</div>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatPill value={trend.repCount} label={trend.repCount === 1 ? 'rep' : 'reps'} />
                  <StatPill value={trend.spanDays} label={trend.spanDays === 1 ? 'day' : 'days'} />
                  {trend.currentStreak > 0 && <StatPill value={trend.currentStreak} label="day streak" tone="success" />}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {trend.dimensions.map((d) => (
                    <div key={d.key} className="grid grid-cols-[minmax(0,130px)_auto_1fr] items-center gap-3 text-[0.78rem]">
                      <span className={d.key === trend.weakestKey ? 'text-danger' : 'text-fg-secondary'}>
                        {dimensionLabel(d.key)}{d.key === trend.weakestKey ? ' ← weakest' : ''}
                      </span>
                      <Sparkline
                        values={d.values}
                        width={96}
                        height={22}
                        color={d.improving ? 'var(--color-success)' : 'var(--color-primary-light)'}
                        label={`${dimensionLabel(d.key)} scores over time: ${d.values.join(', ')}`}
                      />
                      <span className="whitespace-nowrap text-fg-muted">
                        {d.first.toFixed(1)} → {d.last.toFixed(1)}{d.inverted ? ' (lower better)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Artifacts */}
          <Card>
            <CardLabel>Artifacts ({artifacts.length})</CardLabel>
            {artifacts.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {artifacts.map((a) => (
                  <div key={a.id} className="flex justify-between gap-2 text-[0.82rem]">
                    <span>
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-primary-light">{a.title} ↗</a> : a.title}
                      {a.kind && <span className="text-[0.7rem] text-fg-muted"> · {a.kind.replace('_', ' ')}</span>}
                    </span>
                    <span className="whitespace-nowrap text-[0.7rem] text-fg-muted">{new Date(a.occurredAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddArtifact} className="mt-3 flex flex-wrap gap-2">
              <Input className="min-w-[140px] flex-[2] px-2 py-1.5 text-[0.78rem]" placeholder="e.g. mock interview, essay" value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} />
              <Select className="w-auto px-2 py-1.5 text-[0.78rem]" value={artifactKind} onChange={(e) => setArtifactKind(e.target.value)}>
                <option value="project">project</option>
                <option value="writing">writing</option>
                <option value="presentation">presentation</option>
                <option value="mock_interview">mock interview</option>
                <option value="other">other</option>
              </Select>
              <Input className="min-w-[100px] flex-1 px-2 py-1.5 text-[0.78rem]" placeholder="url (optional)" value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} />
              <Button type="submit" size="sm" disabled={addingArtifact || !artifactTitle.trim()}>+ Add</Button>
            </form>
          </Card>
        </>
      )}

      {topics.length === 0 && (
        <EmptyState icon="🎙️" title="What counts as practice?">
          Skills you get better at by doing reps: speaking, writing, explaining. For subjects with material to cover, use a Syllabus topic from the <Link href="/plan" className="text-primary-light">board</Link> instead.
        </EmptyState>
      )}
    </div>
  );
}
