'use client';

import React, { useState } from 'react';

export interface CourseModule {
  id: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt: string | null;
  notes: string;
}

interface CurriculumViewProps {
  curriculum: CourseModule[];
  onSaveCurriculum: (modules: CourseModule[]) => Promise<void>;
  onImportToSubtasks?: (moduleTitles: string[]) => Promise<void>;
  onPracticeModule?: (mod: CourseModule) => void;
  topicTitle?: string;
  topicId?: string;
}

export default function CurriculumView({ curriculum, onSaveCurriculum, onImportToSubtasks, onPracticeModule, topicTitle, topicId }: CurriculumViewProps) {
  const [modules, setModules] = useState<CourseModule[]>(
    [...curriculum].sort((a, b) => a.order - b.order)
  );

  React.useEffect(() => {
    setModules([...curriculum].sort((a, b) => a.order - b.order));
  }, [curriculum]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(30);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState(false);
  const [generatingInitialCurriculum, setGeneratingInitialCurriculum] = useState(false);

  const handleGenerateInitialCurriculum = async () => {
    if (!topicTitle) return;
    setGeneratingInitialCurriculum(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-curriculum', topicTitle }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.modules) && data.modules.length > 0) {
          const generated: CourseModule[] = data.modules.map((m: any, i: number) => ({
            id: Math.random().toString(36).substring(2, 9),
            order: i + 1,
            title: m.title || `Module ${i + 1}`,
            estimatedMinutes: m.estimatedMinutes || 30,
            completed: false,
            completedAt: null,
            notes: m.notes || '',
          }));
          setModules(generated);
          await save(generated);
        }
      }
    } catch (e) {
      console.error('Failed to generate initial curriculum:', e);
    } finally {
      setGeneratingInitialCurriculum(false);
    }
  };

  // AI Generated Lesson & Quiz state per module
  const [moduleLessons, setModuleLessons] = useState<Record<string, any>>({});
  const [generatingLessonId, setGeneratingLessonId] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  // Previously-generated lessons are persisted server-side, so a remount
  // restores them instead of re-billing the AI provider for identical content.
  React.useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    fetch(`/api/generate-lesson?topicId=${topicId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.lessons) setModuleLessons((prev) => ({ ...data.lessons, ...prev }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [topicId]);

  const completedCount = modules.filter(m => m.completed).length;
  const progressPct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
  const currentModule = modules.find(m => !m.completed);

  const handleImportToSubtasks = async () => {
    if (!onImportToSubtasks || modules.length === 0) return;
    const uncompletedTitles = modules.filter(m => !m.completed).map(m => `Module: ${m.title}`);
    if (uncompletedTitles.length === 0) return;
    await onImportToSubtasks(uncompletedTitles);
    setImported(true);
    setTimeout(() => setImported(false), 3000);
  };

  const handleGenerateLesson = async (mod: CourseModule, regenerate = false) => {
    setGeneratingLessonId(mod.id);
    try {
      const res = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleTitle: mod.title,
          topicTitle,
          topicId,
          moduleId: mod.id,
          regenerate,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate lesson');

      const data = await res.json();
      setModuleLessons(prev => ({ ...prev, [mod.id]: data }));
    } catch (e) {
      console.error('Error generating lesson:', e);
      alert('Failed to generate AI lesson. Please try again.');
    } finally {
      setGeneratingLessonId(null);
    }
  };

  const save = async (updated: CourseModule[]) => {
    setSaving(true);
    await onSaveCurriculum(updated);
    setSaving(false);
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const mod: CourseModule = {
      id: Math.random().toString(36).substring(2, 9),
      order: modules.length + 1,
      title: newTitle.trim(),
      estimatedMinutes: newMinutes,
      completed: false,
      completedAt: null,
      notes: '',
    };
    const updated = [...modules, mod];
    setModules(updated);
    setNewTitle('');
    await save(updated);
  };

  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    const newMods: CourseModule[] = lines.map((title, i) => ({
      id: Math.random().toString(36).substring(2, 9),
      order: modules.length + i + 1,
      title,
      estimatedMinutes: 30,
      completed: false,
      completedAt: null,
      notes: '',
    }));
    const updated = [...modules, ...newMods];
    setModules(updated);
    setBulkText('');
    setShowBulk(false);
    await save(updated);
  };

  const handleToggleComplete = async (id: string) => {
    const updated = modules.map(m =>
      m.id === id
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? new Date().toISOString() : null }
        : m
    );
    setModules(updated);
    await save(updated);
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    const updated = modules.map(m => m.id === id ? { ...m, notes } : m);
    setModules(updated);
    await save(updated);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this module?')) return;
    const updated = modules.filter(m => m.id !== id).map((m, i) => ({ ...m, order: i + 1 }));
    setModules(updated);
    await save(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Progress Header */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>📚 Course Curriculum & AI Lessons</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onImportToSubtasks && modules.length > 0 && (
              <button
                type="button"
                onClick={handleImportToSubtasks}
                className="btn btn-secondary"
                style={{ fontSize: '0.72rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {imported ? '✅ Modules Imported!' : '⚡ Import Modules to Checklist'}
              </button>
            )}
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{completedCount}</strong> of <strong style={{ color: 'var(--color-text-primary)' }}>{modules.length}</strong> modules complete
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '6px', borderRadius: '9999px', background: 'var(--fill-3)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: '9999px',
            width: `${progressPct}%`,
            background: 'var(--ink)',
            transition: 'width 0.5s ease',
          }} />
        </div>

        {currentModule && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            → Currently on: <strong style={{ color: 'var(--color-primary-light)' }}>{currentModule.title}</strong>
          </p>
        )}
        {completedCount === modules.length && modules.length > 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600 }}>🎉 Course complete!</p>
        )}
      </div>

      {/* Module list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {modules.length === 0 && (
          <div className="glass-panel" style={{ padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '2.5rem' }}>📋</span>
            <div>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>No curriculum modules yet</h4>
              <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', maxWidth: '420px', marginTop: '6px', lineHeight: 1.5 }}>
                Break down this topic into structured lessons. Let AI generate 4-6 sequential modules, or add your own modules below.
              </p>
            </div>
            {topicTitle && (
              <button
                type="button"
                onClick={handleGenerateInitialCurriculum}
                disabled={generatingInitialCurriculum}
                className="btn btn-primary"
                style={{ fontSize: '0.84rem', padding: '8px 18px' }}
              >
                {generatingInitialCurriculum ? '✨ Generating Structured Modules...' : '🤖 Generate AI Curriculum for This Topic'}
              </button>
            )}
          </div>
        )}

        {modules.map((mod, idx) => {
          const isCurrent = mod.id === currentModule?.id;
          const isExpanded = expandedId === mod.id;
          const lessonData = moduleLessons[mod.id];
          const isGenerating = generatingLessonId === mod.id;

          return (
            <div
              key={mod.id}
              className="glass-panel"
              style={{
                padding: 0,
                border: isCurrent ? '1px solid var(--fill-4)' : '1px solid var(--border-color)',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
            >
              {/* Module row */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={mod.completed}
                  onChange={() => handleToggleComplete(mod.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)', flexShrink: 0 }}
                />

                {/* Order + Title */}
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700, minWidth: '20px' }}>
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div style={{ flexGrow: 1 }}>
                  <p style={{
                    fontSize: '0.88rem',
                    fontWeight: isCurrent ? 700 : 500,
                    color: mod.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                    textDecoration: mod.completed ? 'line-through' : 'none',
                    transition: 'all 0.2s',
                  }}>
                    {isCurrent && <span style={{ color: 'var(--color-primary-light)', marginRight: '6px' }}>→</span>}
                    {mod.title}
                  </p>
                  {mod.completedAt && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      ✓ Completed {new Date(mod.completedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Duration */}
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  ~{mod.estimatedMinutes >= 60 ? `${Math.floor(mod.estimatedMinutes / 60)}h` : `${mod.estimatedMinutes}m`}
                </span>

                {/* Socratic Practice */}
                {onPracticeModule && (
                  <button
                    type="button"
                    onClick={() => onPracticeModule(mod)}
                    className="btn btn-primary"
                    style={{ fontSize: '0.7rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
                    title="Practice this module using Socratic AI Tutor"
                  >
                    🧠 Practice
                  </button>
                )}

                {/* Expand Lesson & Quiz toggle */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                  style={{ fontSize: '0.7rem', color: isExpanded ? 'var(--color-primary-light)' : 'var(--color-text-muted)', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: isExpanded ? 'var(--fill-2)' : 'transparent', cursor: 'pointer', fontWeight: 600 }}
                >
                  {isExpanded ? '▲ Close Lesson' : '📖 View Lesson & Quiz'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(mod.id)}
                  style={{ color: 'var(--color-danger)', fontSize: '1rem', lineHeight: 1, padding: '2px' }}
                >
                  ×
                </button>
              </div>

              {/* Expanded Lesson & Quiz Area */}
              {isExpanded && (
                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-sunk)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {!lessonData && !isGenerating && (
                    <div style={{ textAlign: 'center', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                        No generated AI lesson loaded for this module yet.
                      </p>
                      <button
                        onClick={() => handleGenerateLesson(mod)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.78rem', padding: '8px 16px', borderRadius: '9999px' }}
                      >
                        ✨ Generate AI Interactive Lesson & Quiz
                      </button>
                    </div>
                  )}

                  {isGenerating && (
                    <div style={{ textAlign: 'center', padding: '20px', fontSize: '0.85rem', color: 'var(--color-primary-light)' }}>
                      🧠 Generating custom lesson content & quiz for "{mod.title}"...
                    </div>
                  )}

                  {lessonData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {lessonData.fallback && (
                        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--warning-tint)', border: '1px solid var(--warning-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-warning)' }}>
                            ⚠️ Placeholder content — the AI provider was unavailable, so this is generic filler, not a real lesson. It wasn&apos;t saved.
                          </span>
                          <button
                            onClick={() => handleGenerateLesson(mod, true)}
                            disabled={isGenerating}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {/* Summary & Takeaways */}
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--fill-2)', border: '1px solid var(--fill-4)' }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-light)', marginBottom: '4px' }}>
                          💡 Summary: {lessonData.summary}
                        </p>
                        {Array.isArray(lessonData.keyTakeaways) && (
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {lessonData.keyTakeaways.map((kt: string, i: number) => (
                              <span key={i} style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                ✓ {kt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Explanation Content */}
                      <div>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '6px' }}>📖 Lesson Content</h4>
                        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {lessonData.explanation}
                        </div>
                      </div>

                      {/* Code / Example Block */}
                      {lessonData.codeOrExample && (
                        <div>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>💻 Practical Example / Drill</h4>
                          <pre style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunk)', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--color-text-primary)', overflowX: 'auto', fontFamily: 'monospace' }}>
                            {lessonData.codeOrExample}
                          </pre>
                        </div>
                      )}

                      {/* Interactive Quiz Sandbox */}
                      {Array.isArray(lessonData.quiz) && lessonData.quiz.length > 0 && (
                        <div style={{ borderTop: '1px border-dashed var(--border-color)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📝 Interactive Self-Check Quiz ({lessonData.quiz.length} Questions)
                          </h4>

                          {lessonData.quiz.map((q: any, qIdx: number) => {
                            const key = `${mod.id}-${qIdx}`;
                            const selected = selectedAnswers[key];
                            const isAnswered = selected !== undefined;
                            const isCorrect = selected === q.correctIndex;

                            return (
                              <div key={qIdx} style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--fill-1)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{qIdx + 1}. {q.question}</p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                  {q.options.map((opt: string, optIdx: number) => {
                                    const isThisSelected = selected === optIdx;
                                    const isThisCorrect = optIdx === q.correctIndex;

                                    let bg = 'var(--fill-2)';
                                    let border = '1px solid var(--border-color)';
                                    let color = 'var(--color-text-secondary)';

                                    if (isAnswered) {
                                      if (isThisCorrect) {
                                        bg = 'var(--success-line)';
                                        border = '1px solid var(--color-success)';
                                        color = 'var(--color-success)';
                                      } else if (isThisSelected) {
                                        bg = 'var(--danger-line)';
                                        border = '1px solid var(--color-danger)';
                                        color = 'var(--color-danger)';
                                      }
                                    }

                                    return (
                                      <button
                                        key={optIdx}
                                        type="button"
                                        disabled={isAnswered}
                                        onClick={() => setSelectedAnswers(prev => ({ ...prev, [key]: optIdx }))}
                                        style={{
                                          padding: '8px 10px',
                                          borderRadius: 'var(--radius-sm)',
                                          background: bg,
                                          border: border,
                                          color: color,
                                          fontSize: '0.75rem',
                                          textAlign: 'left',
                                          cursor: isAnswered ? 'default' : 'pointer',
                                          transition: 'all 0.15s',
                                        }}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>

                                {isAnswered && (
                                  <div style={{ marginTop: '4px', padding: '6px 10px', borderRadius: '4px', background: isCorrect ? 'var(--success-tint)' : 'var(--danger-tint)', fontSize: '0.72rem', color: isCorrect ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                    {isCorrect ? '✅ Correct! ' : '❌ Incorrect. '} {q.explanation}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Module Notes Input */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Personal Module Notes</p>
                    <textarea
                      className="form-input"
                      rows={3}
                      placeholder="Write your takeaways or notes for this module..."
                      value={mod.notes}
                      onChange={e => handleUpdateNotes(mod.id, e.target.value)}
                      style={{ resize: 'vertical', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add module form */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 style={{ fontSize: '0.88rem', fontWeight: 600 }}>Add Module</h4>
          <button
            onClick={() => setShowBulk(!showBulk)}
            style={{ fontSize: '0.72rem', color: 'var(--color-primary-light)', textDecoration: 'underline' }}
          >
            {showBulk ? 'Single mode' : 'Bulk add (paste list)'}
          </button>
        </div>

        {!showBulk ? (
          <form onSubmit={handleAddModule} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Module title e.g. Past Perfect Tense"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              style={{ flexGrow: 1 }}
            />
            <input
              type="number"
              className="form-input"
              min={1}
              max={480}
              value={newMinutes}
              onChange={e => setNewMinutes(Number(e.target.value))}
              style={{ width: '70px' }}
              title="Estimated minutes"
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>min</span>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px', whiteSpace: 'nowrap' }} disabled={saving}>
              + Add
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea
              className="form-input"
              rows={5}
              placeholder="One module per line:&#10;Module 1: Present Simple&#10;Module 2: Past Tense&#10;Module 3: Future Tense"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.82rem' }}
            />
            <button onClick={handleBulkAdd} className="btn btn-primary" disabled={!bulkText.trim() || saving}>
              Add {bulkText.split('\n').filter(l => l.trim()).length} modules
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
