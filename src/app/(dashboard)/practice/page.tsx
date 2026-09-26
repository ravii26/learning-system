'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { computePracticeTrend, type RepForTrend } from '@/lib/practiceTrend';
import { RUBRIC_TEMPLATES, getRubricTemplate } from '@/lib/practiceRubrics';
import { Button, Field, Input, Select, Sparkline } from '@/components/ui';

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
        toast.success('Rep saved');
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
        toast.success('Added');
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
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        {[60, 260, 180].map((h) => <div key={h} className="skeleton rounded-md" style={{ height: h }} />)}
      </div>
    );
  }

  const TREND_WORD: Record<string, string> = { Improving: 'Improving', Steady: 'Holding steady', 'Needs focus': 'Needs focus', New: 'Just started' };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-9">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Practice</h1>
        <p className="m-0 text-[1.05rem] text-fg-secondary">
          Skills you get better at by doing: speaking, writing, explaining. One short rep a day, scored honestly — the trend is the progress.
        </p>
      </header>

      {topics.length === 0 ? (
        <form onSubmit={handleCreateTopic} className="glass-panel flex flex-col gap-4 p-7">
          <h2 className="m-0 text-[1.2rem] font-semibold">What do you want to practise?</h2>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Skill" htmlFor="new-practice">
              <Input id="new-practice" placeholder="e.g. Spoken English" value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} disabled={creatingTopic} />
            </Field>
            <Field label="Scored on" htmlFor="new-rubric">
              <Select id="new-rubric" value={newTopicTemplate} onChange={(e) => setNewTopicTemplate(e.target.value)}>
                {RUBRIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={creatingTopic || !newTopicTitle.trim()} className="self-start">
            {creatingTopic ? 'Starting…' : 'Start practising'}
          </Button>
          <p className="m-0 text-[0.875rem] text-fg-muted">
            Practice doesn’t take one of your two Now slots. For subjects with material to cover, <Link href="/learn/new" className="underline underline-offset-2">start a course</Link> instead.
          </p>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {topics.length > 1 && (
              <Field label="Skill" htmlFor="pick-practice">
                <Select id="pick-practice" value={selectedTopicId} onChange={(e) => setSelectedTopicId(e.target.value)} className="w-auto">
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Scored on" htmlFor="pick-rubric" hint={template.description}>
              <Select id="pick-rubric" value={template.key} onChange={(e) => handleChangeTemplate(e.target.value)} className="w-auto">
                {RUBRIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <section aria-labelledby="rep-h" className="glass-panel flex flex-col gap-6 p-7">
            <div className="flex flex-col gap-2">
              <span id="rep-h" className="text-[0.9rem] text-fg-muted">
                Today’s rep{prompt?.conceptTitle ? ` · from “${prompt.conceptTitle}”, which you’re reviewing` : ''}
              </span>
              <p className="m-0 font-serif text-[1.9rem] font-medium leading-snug">{prompt?.promptText ?? 'Loading a prompt…'}</p>
              <p className="m-0 text-[0.95rem] text-fg-secondary">Do it first — out loud or written, about two minutes. Then score yourself honestly.</p>
            </div>

            <form onSubmit={handleSubmitRep} className="flex flex-col gap-5">
              {template.dimensions.map((dim) => (
                <fieldset key={dim.key} className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-1 p-0 text-[0.95rem] font-semibold">
                    {dim.label}
                    {dim.inverted && <span className="font-normal text-fg-muted"> · lower is better</span>}
                    {dim.hint && <span className="block text-[0.82rem] font-normal text-fg-muted">{dim.hint}</span>}
                  </legend>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={scores[dim.key] === n}
                        onClick={() => setScores((prev) => ({ ...prev, [dim.key]: n }))}
                        className={`h-11 w-11 rounded-[10px] text-[1rem] font-semibold ${scores[dim.key] === n ? 'bg-ink text-on-ink' : 'border border-line bg-surface text-fg-secondary hover:border-line-hover'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Field label="Recording link (optional)" htmlFor="rep-url">
                  <Input id="rep-url" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} />
                </Field>
                <Field label="Seconds (optional)" htmlFor="rep-secs">
                  <Input id="rep-secs" type="number" value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" variant="primary" size="lg" disabled={submittingRep || !prompt} className="self-start">
                {submittingRep ? 'Saving…' : 'Save this rep'}
              </Button>
            </form>
          </section>

          <section aria-labelledby="trend-h" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="trend-h" className="m-0 text-[1.2rem] font-semibold">{selectedTopic?.title}: how it’s going</h2>
              <span className="text-[0.9rem] text-fg-secondary">{TREND_WORD[trend.overallTrend] ?? trend.overallTrend}</span>
            </div>
            {trend.repCount === 0 ? (
              <p className="m-0 text-[0.95rem] text-fg-muted">No reps yet. After three, you’ll see which parts are improving.</p>
            ) : (
              <>
                <p className="m-0 text-[0.95rem] text-fg-secondary">
                  {trend.repCount} rep{trend.repCount === 1 ? '' : 's'} over {trend.spanDays} day{trend.spanDays === 1 ? '' : 's'}
                  {trend.currentStreak > 0 ? ` · ${trend.currentStreak}-day streak` : ''}
                </p>
                <ul className="m-0 flex list-none flex-col p-0">
                  {trend.dimensions.map((d) => (
                    <li key={d.key} className="grid min-h-[52px] grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-4 border-b border-line last:border-b-0">
                      <span className={`text-[0.95rem] ${d.key === trend.weakestKey ? 'font-semibold text-k-fading-text' : 'text-fg'}`}>
                        {dimensionLabel(d.key)}
                        {d.key === trend.weakestKey && <span className="block text-[0.78rem] font-normal">focus here</span>}
                      </span>
                      <Sparkline values={d.values} width={200} height={26} color="var(--ink)" label={`${dimensionLabel(d.key)} over time: ${d.values.join(', ')}`} />
                      <span className="whitespace-nowrap text-[0.875rem] text-fg-muted">
                        {d.first.toFixed(1)} → <strong className="text-fg">{d.last.toFixed(1)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby="proof-h" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="proof-h" className="m-0 text-[1.2rem] font-semibold">Things you made</h2>
              <p className="m-0 text-[0.9rem] text-fg-muted">A mock interview, a talk, an essay — real proof beyond the daily reps.</p>
            </div>
            {artifacts.length > 0 && (
              <ul className="m-0 flex list-none flex-col p-0">
                {artifacts.map((a) => (
                  <li key={a.id} className="flex min-h-[48px] items-center justify-between gap-3 border-b border-line text-[0.95rem] last:border-b-0">
                    <span>
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="font-medium text-fg underline underline-offset-2">{a.title}</a> : <span className="font-medium">{a.title}</span>}
                      {a.kind && <span className="text-[0.82rem] text-fg-muted"> · {a.kind.replace('_', ' ')}</span>}
                    </span>
                    <span className="whitespace-nowrap text-[0.82rem] text-fg-muted">{new Date(a.occurredAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddArtifact} className="flex flex-wrap gap-2">
              <label htmlFor="art-title" className="sr-only">What you made</label>
              <Input id="art-title" className="h-10 min-w-[180px] flex-[2] py-0" placeholder="What you made" value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} />
              <label htmlFor="art-kind" className="sr-only">Kind</label>
              <Select id="art-kind" className="h-10 w-auto py-0" value={artifactKind} onChange={(e) => setArtifactKind(e.target.value)}>
                <option value="project">Project</option>
                <option value="writing">Writing</option>
                <option value="presentation">Talk</option>
                <option value="mock_interview">Mock interview</option>
                <option value="other">Other</option>
              </Select>
              <label htmlFor="art-url" className="sr-only">Link</label>
              <Input id="art-url" className="h-10 min-w-[120px] flex-1 py-0" placeholder="Link (optional)" value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} />
              <Button type="submit" disabled={addingArtifact || !artifactTitle.trim()}>Add</Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
