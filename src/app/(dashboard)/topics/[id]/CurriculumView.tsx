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
}

export default function CurriculumView({ curriculum, onSaveCurriculum }: CurriculumViewProps) {
  const [modules, setModules] = useState<CourseModule[]>(
    [...curriculum].sort((a, b) => a.order - b.order)
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(30);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);

  const completedCount = modules.filter(m => m.completed).length;
  const progressPct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
  const currentModule = modules.find(m => !m.completed);

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
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>📚 Course Curriculum</h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>{completedCount}</strong> of <strong style={{ color: 'var(--color-text-primary)' }}>{modules.length}</strong> modules complete
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: '6px', borderRadius: '9999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: '9999px',
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, var(--color-primary), #818cf8)',
            transition: 'width 0.5s ease',
          }} />
        </div>

        {currentModule && (
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            → Currently on: <strong style={{ color: 'var(--color-primary-light)' }}>{currentModule.title}</strong>
          </p>
        )}
        {completedCount === modules.length && modules.length > 0 && (
          <p style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>🎉 Course complete!</p>
        )}
      </div>

      {/* Module list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {modules.map((mod, idx) => {
          const isCurrent = mod.id === currentModule?.id;
          const isExpanded = expandedId === mod.id;

          return (
            <div
              key={mod.id}
              className="glass-panel"
              style={{
                padding: 0,
                border: isCurrent ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border-color)',
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

                {/* Notes toggle */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                  style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                >
                  {isExpanded ? '▲ Notes' : '▼ Notes'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(mod.id)}
                  style={{ color: 'var(--color-danger)', fontSize: '1rem', lineHeight: 1, padding: '2px' }}
                >
                  ×
                </button>
              </div>

              {/* Expanded notes area */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-color)' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Module Notes</p>
                  <textarea
                    className="form-input"
                    rows={4}
                    placeholder="Write your notes for this module..."
                    value={mod.notes}
                    onChange={e => handleUpdateNotes(mod.id, e.target.value)}
                    style={{ resize: 'vertical', fontSize: '0.82rem' }}
                  />
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
