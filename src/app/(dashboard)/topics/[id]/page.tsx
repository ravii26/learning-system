'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Modular Components
import SocraticCoach from './SocraticCoach';
import ModuleStudyRoom from './ModuleStudyRoom';
import ConfusionMistakeBank from './ConfusionMistakeBank';
import RichTextEditor from './RichTextEditor';
import SessionDebriefModal, { SessionLog } from './SessionDebriefModal';
import CustomDialog, { CustomDialogConfig } from '@/components/CustomDialog';
import { Drawer, KnowledgeMark } from '@/components/ui';
import type { Knowledge } from '@/lib/moduleState';
import { useToast } from '@/components/ToastProvider';
import { useStudyTracker } from '@/lib/useStudyTracker';
import { formatDuration } from '@/lib/timeSummary';
import TopicTimeDrawer from './TopicTimeDrawer';
import PlacementDrawer from './PlacementDrawer';

/** Latest quiz/challenge result per module — from /api/topics/[id]/attempts. */
export interface ModuleEvidence {
  quiz?: { score: number | null; correct: number | null; total: number | null; at: string };
  challenge?: { verdict: string | null; at: string };
  attempts: number;
  reviewCards: number;
  /** How well you know it (lib/moduleState.ts), and why in one line. */
  state?: Knowledge;
  reason?: string;
}

export interface CourseModule {
  id: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt: string | null;
  notes: string;
}

interface Resource {
  id?: string;
  title: string;
  type: string;
  url: string;
  purpose: string;
  status: string;
  notes: string;
}

interface ActivityLog {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

interface Topic {
  id: string;
  title: string;
  area: string;
  why: string | null;
  depthTarget: string | null;
  status: string;
  progressPct: number;
  currentStage: string;
  lastCompleted: string | null;
  nextAction: string | null;
  proofOfLearning: string | null;
  notes: string | null;
  startedDate: string | null;
  lastTouchedDate: string;
  createdAt: string;
  resources: Resource[];
  activityLogs: ActivityLog[];
  confusions: any[];
  mistakes: any[];
  sessionLogs: SessionLog[];
  curriculum: CourseModule[];
}

export default function TopicStudyRoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Topic Metadata
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('Tech');
  const [why, setWhy] = useState('');
  const [notes, setNotes] = useState('');
  const [curriculum, setCurriculum] = useState<CourseModule[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [confusions, setConfusions] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);

  // Active Selected Module
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [generatingModules, setGeneratingModules] = useState(false);

  // Side Drawers
  const [confusionsDrawerOpen, setConfusionsDrawerOpen] = useState(false);
  const [resourcesDrawerOpen, setResourcesDrawerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  // Resources state inside drawer
  const [newResTitle, setNewResTitle] = useState('');
  const [newResType, setNewResType] = useState('ARTICLE');
  const [newResUrl, setNewResUrl] = useState('');
  const [newResPurpose, setNewResPurpose] = useState('');
  const [showAddRes, setShowAddRes] = useState(false);

  // Focus Timer
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [timerElapsedMinutes, setTimerElapsedMinutes] = useState(25);
  const [showDebrief, setShowDebrief] = useState(false);

  const toast = useToast();

  // Evidence per module (quiz scores, challenge verdicts, review cards)
  const [evidence, setEvidence] = useState<Record<string, ModuleEvidence>>({});
  const fetchEvidence = useCallback(async () => {
    const res = await fetch(`/api/topics/${params.id}/attempts`).catch(() => null);
    if (res?.ok) setEvidence((await res.json()).modules || {});
  }, [params.id]);
  useEffect(() => { fetchEvidence(); }, [fetchEvidence]);

  // Real study time: tracked while you study here (see useStudyTracker)
  const tracker = useStudyTracker({ topicId: params.id, moduleId: activeModuleId, forceActive: timerActive });
  const [timeTotals, setTimeTotals] = useState({ todaySeconds: 0, allTimeSeconds: 0 });
  const [timeDrawerOpen, setTimeDrawerOpen] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);
  const fetchTimeTotals = useCallback(async () => {
    const tz = new Date().getTimezoneOffset();
    const res = await fetch(`/api/time/summary?topicId=${params.id}&days=1&tz=${tz}`).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setTimeTotals({ todaySeconds: d.todaySeconds || 0, allTimeSeconds: d.allTimeSeconds || 0 });
    }
  }, [params.id]);
  useEffect(() => { fetchTimeTotals(); }, [fetchTimeTotals, tracker.flushCount]);

  // Syllabus editing (staged until Save)
  const [editingSyllabus, setEditingSyllabus] = useState(false);
  const [draftModules, setDraftModules] = useState<CourseModule[]>([]);

  // Resource editing
  const [editingResourceIdx, setEditingResourceIdx] = useState<number | null>(null);
  const [resourceDraft, setResourceDraft] = useState<Resource | null>(null);

  // Global Dialog
  const [dialogConfig, setDialogConfig] = useState<CustomDialogConfig>({
    isOpen: false,
    title: '',
    message: '',
  });

  // Fetch Topic Data
  const fetchTopic = useCallback(async () => {
    try {
      const res = await fetch(`/api/topics/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setTopic(data);
        setTitle(data.title);
        setArea(data.area || 'Tech');
        setWhy(data.why || '');
        setNotes(data.notes || '');
        setResources(data.resources || []);
        setConfusions(data.confusions || []);
        setMistakes(data.mistakes || []);
        setSessionLogs(data.sessionLogs || []);

        const sortedCurriculum = Array.isArray(data.curriculum)
          ? [...data.curriculum].sort((a: CourseModule, b: CourseModule) => a.order - b.order)
          : [];
        setCurriculum(sortedCurriculum);

        // Default active module to first incomplete or first module
        if (!activeModuleId && sortedCurriculum.length > 0) {
          const firstIncomplete = sortedCurriculum.find((m: CourseModule) => !m.completed);
          setActiveModuleId(firstIncomplete ? firstIncomplete.id : sortedCurriculum[0].id);
        }
      } else {
        setError('Topic not found');
      }
    } catch {
      setError('Failed to load topic');
    } finally {
      setLoading(false);
    }
  }, [params.id, activeModuleId]);

  useEffect(() => {
    fetchTopic();
  }, [fetchTopic]);

  // Auto-generate syllabus if ?autostart=1 passed from quick-start
  const autoStartedRef = React.useRef(false);
  useEffect(() => {
    if (loading || !topic || autoStartedRef.current) return;
    if (searchParams.get('autostart') === '1' && curriculum.length === 0) {
      autoStartedRef.current = true;
      handleGenerateCurriculum();
    }
  }, [loading, topic, curriculum.length, searchParams]);

  // Focus Timer Tick
  useEffect(() => {
    let interval: any = null;
    if (timerActive) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            setTimerElapsedMinutes(25);
            setTimeout(() => setShowDebrief(true), 300);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive]);

  const resetTimer = () => {
    setTimerActive(false);
    setSecondsRemaining(25 * 60);
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const r = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  // Save Curriculum to Backend
  const handleSaveCurriculum = async (updated: CourseModule[]) => {
    setCurriculum(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum: updated }),
      });
    } catch (e) {
      console.error('Failed to save curriculum:', e);
    }
  };

  // Toggle Module Completion
  const handleToggleModuleCompleted = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = curriculum.find((m) => m.id === id);
    const nowCompleting = target ? !target.completed : false;
    const updated = curriculum.map((m) =>
      m.id === id
        ? {
            ...m,
            completed: !m.completed,
            completedAt: !m.completed ? new Date().toISOString() : null,
          }
        : m
    );
    await handleSaveCurriculum(updated);

    // Finishing a module turns its lesson into Daily Review cards, so it
    // comes back before you forget it.
    if (nowCompleting) {
      const res = await fetch(`/api/topics/${params.id}/modules/${id}/review-cards`, { method: 'POST' }).catch(() => null);
      if (res?.ok) {
        const { added } = await res.json();
        if (added > 0) toast.success(`${added} review card${added === 1 ? '' : 's'} added to Daily Review — first one comes back in 2 days`);
        fetchEvidence();
      }
    }
  };

  // Syllabus editing: rename, re-time, reorder, remove — saved together
  const startEditingSyllabus = () => {
    setDraftModules(curriculum.map((m) => ({ ...m })));
    setEditingSyllabus(true);
  };
  const moveDraftModule = (index: number, dir: -1 | 1) => {
    setDraftModules((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };
  const saveSyllabusEdits = async () => {
    const cleaned = draftModules
      .map((m) => ({ ...m, title: m.title.trim(), estimatedMinutes: Math.min(240, Math.max(5, Math.round(Number(m.estimatedMinutes) || 30))) }))
      .filter((m) => m.title)
      .map((m, i) => ({ ...m, order: i + 1 }));
    await handleSaveCurriculum(cleaned);
    if (activeModuleId && !cleaned.some((m) => m.id === activeModuleId)) {
      setActiveModuleId(cleaned[0]?.id ?? null);
    }
    setEditingSyllabus(false);
    toast.success('Syllabus updated');
  };

  // Add Single Module
  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;

    const newMod: CourseModule = {
      id: Math.random().toString(36).substring(2, 9),
      order: curriculum.length + 1,
      title: newModuleTitle.trim(),
      estimatedMinutes: 30,
      completed: false,
      completedAt: null,
      notes: '',
    };

    const updated = [...curriculum, newMod];
    setNewModuleTitle('');
    if (!activeModuleId) setActiveModuleId(newMod.id);
    await handleSaveCurriculum(updated);
  };

  // AI Curriculum Generator
  const handleGenerateCurriculum = async () => {
    setGeneratingModules(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-curriculum',
          topicTitle: title,
          why,
          area,
          depthTarget: topic?.depthTarget || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fallback || !Array.isArray(data.modules) || data.modules.length === 0) {
          toast.error('Could not generate a syllabus right now — try again, or add modules yourself below.');
        }
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
          await handleSaveCurriculum(generated);
          if (generated.length > 0) {
            setActiveModuleId(generated[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to generate curriculum:', e);
    } finally {
      setGeneratingModules(false);
    }
  };

  const handleSaveConfusions = async (updated: any[]) => {
    setConfusions(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confusions: updated }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveMistakes = async (updated: any[]) => {
    setMistakes(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mistakes: updated }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Auto-Save Notes
  const handleSaveNotes = async (html: string) => {
    setNotes(html);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: html }),
      });
    } catch (e) {
      console.error('Failed to auto-save notes:', e);
    }
  };

  // Resource Handlers
  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResTitle.trim()) return;

    const newRes: Resource = {
      id: `r${Math.random().toString(36).substring(2, 9)}`,
      title: newResTitle.trim(),
      type: newResType,
      url: newResUrl.trim(),
      purpose: newResPurpose.trim(),
      status: 'NOT_STARTED',
      notes: '',
    };

    const updated = [...resources, newRes];
    setResources(updated);
    setNewResTitle('');
    setNewResUrl('');
    setNewResPurpose('');
    setShowAddRes(false);

    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updated }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const saveResources = async (updated: Resource[]) => {
    setResources(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updated }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveResourceEdit = async () => {
    if (editingResourceIdx === null || !resourceDraft || !resourceDraft.title.trim()) return;
    const updated = resources.map((r, i) => (i === editingResourceIdx ? { ...resourceDraft, title: resourceDraft.title.trim(), url: resourceDraft.url.trim() } : r));
    setEditingResourceIdx(null);
    setResourceDraft(null);
    await saveResources(updated);
  };

  const handleResourceStatus = async (index: number, status: string) => {
    await saveResources(resources.map((r, i) => (i === index ? { ...r, status } : r)));
  };

  const handleDeleteResource = async (index: number) => {
    const updated = resources.filter((_, i) => i !== index);
    setResources(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updated }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Topic
  const handleDeleteTopic = () => {
    setDialogConfig({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Topic',
      message: `Are you sure you want to delete "${title}"? It will disappear from your lists and Daily Review; its history is kept and can be restored.`,
      confirmLabel: 'Delete Topic',
      onConfirm: async () => {
        setDialogConfig((p) => ({ ...p, isOpen: false }));
        try {
          await fetch(`/api/topics/${params.id}`, { method: 'DELETE' });
          router.push('/');
          router.refresh();
        } catch (e) {
          console.error(e);
        }
      },
      onCancel: () => setDialogConfig((p) => ({ ...p, isOpen: false })),
    });
  };

  // Save Session Log from Debrief Modal
  const handleSaveSessionLog = async (log: SessionLog) => {
    const updated = [...sessionLogs, log];
    setSessionLogs(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionLogs: updated }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Opening Study Room...</p>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <p style={{ color: 'var(--color-danger)' }}>⚠️ {error || 'Topic not found'}</p>
        <Link href="/" className="btn btn-secondary">← Back to Dashboard</Link>
      </div>
    );
  }

  const completedCount = curriculum.filter((m) => m.completed).length;
  const progressPct = curriculum.length > 0 ? Math.round((completedCount / curriculum.length) * 100) : 0;
  const activeModule = curriculum.find((m) => m.id === activeModuleId) || curriculum[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
      
      {/* ── TOP BAR: Navigation, Title & Header Actions ──────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem',
              fontWeight: 500,
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
            }}
          >
            ← Back
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{title}</h1>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.15)', color: 'var(--color-primary-light)', fontWeight: 600 }}>
                {area}
              </span>
            </div>
            {why && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{why}</p>}
          </div>
        </div>

        {/* Top Right Tool Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

          {/* Real study time — tracked while you're active here, plus anything you log */}
          <button
            type="button"
            onClick={() => setTimeDrawerOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-line bg-black/30 px-3 py-1.5 text-left hover:border-line-hover"
            title="Time you actually spent on this topic — click to see history, log or correct time"
          >
            <span className="text-base">⏱</span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.82rem] font-bold text-fg">
                {formatDuration(timeTotals.todaySeconds + tracker.unflushedSeconds)} today
              </span>
              <span className="text-[0.68rem] text-fg-muted">
                {formatDuration(timeTotals.allTimeSeconds + tracker.unflushedSeconds)} total
              </span>
            </span>
          </button>

          {/* Focus Sprint Timer Card (pomodoro pacing; while it runs, reading without input still counts) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '8px' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace', color: timerActive ? '#10b981' : '#fff' }}>
              🍅 {formatTimer(secondsRemaining)}
            </span>
            <button
              type="button"
              onClick={() => setTimerActive(!timerActive)}
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                background: timerActive ? 'rgba(239,68,68,0.2)' : 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {timerActive ? 'Pause' : 'Start'}
            </button>
            <button
              type="button"
              onClick={resetTimer}
              style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Reset 25m Timer"
            >
              ↺
            </button>
          </div>

          {/* Drawer Quick Actions */}
          <button
            type="button"
            onClick={() => setConfusionsDrawerOpen(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            title="Log confusions or mistakes to review later"
          >
            ❓ Mistakes ({confusions.length + mistakes.length})
          </button>

          <button
            type="button"
            onClick={() => setResourcesDrawerOpen(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            title="View bookmarks and saved references"
          >
            📁 Resources ({resources.length})
          </button>

          <button
            type="button"
            onClick={() => setSettingsDrawerOpen(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            title="Topic settings and deletion"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Came back from an external link (video, book, docs): count that time? */}
      {tracker.awayPrompt && (
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-warning px-4 py-3">
          <span className="text-[0.86rem]">
            You were away <strong>{tracker.awayPrompt.minutes} min</strong>
            {tracker.awayPrompt.label ? <> on <em>{tracker.awayPrompt.label}</em></> : null}. Was that study time for this topic?
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary px-3 py-1 text-[0.78rem]"
              onClick={async () => {
                const p = tracker.awayPrompt!;
                if (await tracker.confirmAway(p.minutes, p.label)) toast.success(`Added ${p.minutes} min`);
              }}
            >
              Yes, add {tracker.awayPrompt.minutes} min
            </button>
            <button type="button" className="btn btn-secondary px-3 py-1 text-[0.78rem]" onClick={tracker.dismissAway}>No</button>
          </span>
        </div>
      )}

      {/* ── 2-PANE STUDY ROOM GRID ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* ── LEFT PANE: Syllabus & Curriculum Navigator ─────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Syllabus Header with Progress */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Course Syllabus</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {completedCount} of {curriculum.length} completed ({progressPct}%)
                </span>
              </div>
              {curriculum.length > 0 && !editingSyllabus && (
                <span className="flex gap-1.5">
                  {completedCount > 0 && completedCount < curriculum.length && (
                    <button type="button" onClick={() => setPlacementOpen(true)} className="btn btn-secondary px-2.5 py-1 text-[0.72rem]" title="Quiz yourself on the modules you haven't finished and skip the ones you already know">
                      Placement check
                    </button>
                  )}
                  <button type="button" onClick={startEditingSyllabus} className="btn btn-secondary px-2.5 py-1 text-[0.72rem]" title="Rename, re-time, reorder or remove modules">
                    ✎ Edit
                  </button>
                </span>
              )}
              {editingSyllabus && (
                <span className="flex gap-1.5">
                  <button type="button" onClick={saveSyllabusEdits} className="btn btn-primary px-2.5 py-1 text-[0.72rem]">Save</button>
                  <button type="button" onClick={() => setEditingSyllabus(false)} className="btn btn-secondary px-2.5 py-1 text-[0.72rem]">Cancel</button>
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--color-primary), #10b981)',
                  borderRadius: '9999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            {/* Modules List */}
            {editingSyllabus ? (
              <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
                {draftModules.map((mod, idx) => (
                  <div key={mod.id} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white/[0.02] p-2">
                    <input
                      className="form-input px-2 py-1.5 text-[0.82rem]"
                      value={mod.title}
                      onChange={(e) => setDraftModules((prev) => prev.map((m, i) => (i === idx ? { ...m, title: e.target.value } : m)))}
                      aria-label={`Module ${idx + 1} title`}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={5}
                        max={240}
                        className="form-input w-20 px-2 py-1 text-[0.75rem]"
                        value={mod.estimatedMinutes}
                        onChange={(e) => setDraftModules((prev) => prev.map((m, i) => (i === idx ? { ...m, estimatedMinutes: Number(e.target.value) } : m)))}
                        aria-label={`Module ${idx + 1} minutes`}
                      />
                      <span className="text-[0.7rem] text-fg-muted">min</span>
                      <span className="flex-1" />
                      <button type="button" disabled={idx === 0} onClick={() => moveDraftModule(idx, -1)} className="bg-transparent px-1.5 text-fg-secondary disabled:opacity-30" title="Move up">↑</button>
                      <button type="button" disabled={idx === draftModules.length - 1} onClick={() => moveDraftModule(idx, 1)} className="bg-transparent px-1.5 text-fg-secondary disabled:opacity-30" title="Move down">↓</button>
                      <button type="button" onClick={() => setDraftModules((prev) => prev.filter((_, i) => i !== idx))} className="bg-transparent px-1.5 text-danger" title="Remove module">✕</button>
                    </div>
                  </div>
                ))}
                {draftModules.length === 0 && <p className="text-[0.78rem] text-fg-muted">All modules removed — Save to confirm, or Cancel.</p>}
              </div>
            ) : curriculum.length > 0 ? (
              <>
              {completedCount === 0 && curriculum.length >= 2 && (
                <div className="flex flex-col gap-2 rounded-md border border-line bg-white/[0.03] px-3.5 py-3">
                  <span className="text-[0.85rem] font-semibold text-fg">Already know some of this?</span>
                  <span className="text-[0.78rem] text-fg-secondary">A few minutes of questions. Modules you get fully right start as known, so you don’t relearn them.</span>
                  <button type="button" onClick={() => setPlacementOpen(true)} className="btn btn-secondary self-start px-3 py-1 text-[0.78rem]">
                    Take the placement check
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
                {curriculum.map((mod) => {
                  const isSelected = mod.id === activeModuleId;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => setActiveModuleId(mod.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.02)',
                        border: isSelected ? '1px solid var(--color-primary-light)' : '1px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => handleToggleModuleCompleted(mod.id, e)}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: mod.completed ? 'none' : '2px solid rgba(255,255,255,0.3)',
                            background: mod.completed ? '#10b981' : 'transparent',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                          title={mod.completed ? 'Mark uncompleted' : 'Mark completed'}
                        >
                          {mod.completed && '✓'}
                        </button>

                        <div style={{ overflow: 'hidden' }}>
                          <div
                            style={{
                              fontSize: '0.84rem',
                              fontWeight: isSelected ? 700 : 500,
                              color: mod.completed ? 'var(--color-text-muted)' : isSelected ? '#fff' : 'var(--color-text-primary)',
                              textDecoration: mod.completed ? 'line-through' : 'none',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {mod.order}. {mod.title}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                            {evidence[mod.id]?.state && (
                              <KnowledgeMark state={evidence[mod.id].state!} reason={evidence[mod.id].reason} showLabel className="mr-1.5" />
                            )}
                            ~{mod.estimatedMinutes} mins
                            {evidence[mod.id]?.quiz && (
                              <span className="ml-1.5 text-fg-secondary">· quiz {evidence[mod.id].quiz!.correct}/{evidence[mod.id].quiz!.total}</span>
                            )}
                            {evidence[mod.id]?.challenge?.verdict && (
                              <span className={`ml-1.5 ${evidence[mod.id].challenge!.verdict === 'correct' ? 'text-success' : evidence[mod.id].challenge!.verdict === 'partial' ? 'text-warning' : 'text-danger'}`}>
                                · challenge {evidence[mod.id].challenge!.verdict}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-primary-light)', fontWeight: 700 }}>
                          ▶
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            ) : (
              <div style={{ padding: '24px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                  No curriculum modules yet. Generate a progressive study syllabus with AI:
                </p>
                <button
                  type="button"
                  onClick={handleGenerateCurriculum}
                  disabled={generatingModules}
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: '0.82rem', padding: '8px 14px' }}
                >
                  {generatingModules ? '✨ Generating Modules...' : '✨ Generate AI Syllabus'}
                </button>
              </div>
            )}

            {/* Quick Add Module Form (hidden while editing, so a staged edit can't drop it) */}
            {!editingSyllabus && (
            <form onSubmit={handleAddModule} style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="+ Add custom module..."
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '6px 10px', flex: 1 }}
              />
              <button type="submit" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 10px' }}>
                Add
              </button>
            </form>
            )}

          </div>
        </div>

        {/* ── RIGHT PANE: Active Lesson & Interactive Study Space ────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {activeModule ? (
            <ModuleStudyRoom
              topicId={params.id}
              topicTitle={title}
              topicArea={area}
              module={activeModule}
              evidence={evidence[activeModule.id]}
              onEvidenceChanged={fetchEvidence}
              notes={notes}
              onSaveNotes={handleSaveNotes}
              onModuleNotesSaved={(moduleId, html) =>
                setCurriculum((prev) => prev.map((m) => (m.id === moduleId ? { ...m, notes: html } : m)))
              }
              onToggleCompleted={handleToggleModuleCompleted}
              onAddBookmark={async (res) => {
                const newRes: Resource = {
                  id: `r${Math.random().toString(36).substring(2, 9)}`,
                  title: res.title,
                  type: res.type,
                  url: res.url,
                  purpose: res.purpose,
                  status: 'NOT_STARTED',
                  notes: '',
                };
                const updated = [...resources, newRes];
                setResources(updated);
                try {
                  await fetch(`/api/topics/${params.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resources: updated }),
                  });
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          ) : (
            <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '3rem' }}>🎯</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>Welcome to {title}</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', maxWidth: '480px', lineHeight: 1.6 }}>
                Generate your personalized course syllabus to start interactive Socratic tutoring and taking structured notes.
              </p>
              <button
                type="button"
                onClick={handleGenerateCurriculum}
                disabled={generatingModules}
                className="btn btn-primary"
                style={{ padding: '10px 24px', fontSize: '0.92rem' }}
              >
                {generatingModules ? '✨ Generating Syllabus...' : '✨ Generate AI Course Modules'}
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── SLIDE-OVER DRAWER: Confusions & Mistakes ─────────────────── */}
      <Drawer
        open={confusionsDrawerOpen}
        onClose={() => setConfusionsDrawerOpen(false)}
        title="❓ Mistakes & Confusions Bank"
        label="Mistakes and Confusions Bank"
      >
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          Tracking what confused you and why ensures you don't repeat the same errors.
        </div>
        <ConfusionMistakeBank
          confusions={confusions}
          mistakes={mistakes}
          onSaveConfusions={handleSaveConfusions}
          onSaveMistakes={handleSaveMistakes}
        />
      </Drawer>

      {/* ── SLIDE-OVER DRAWER: Bookmarks & Resources ─────────────────── */}
      <Drawer
        open={resourcesDrawerOpen}
        onClose={() => setResourcesDrawerOpen(false)}
        title="📁 Saved Resources & Links"
        label="Resources and Bookmarks"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Keep helpful articles, documentation, or tutorial videos handy.
            </span>
            <button
              type="button"
              onClick={() => setShowAddRes(!showAddRes)}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              {showAddRes ? 'Cancel' : '+ Add Link'}
            </button>
          </div>

          {showAddRes && (
            <form onSubmit={handleAddResource} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Resource title (e.g. Official Documentation)..."
                value={newResTitle}
                onChange={(e) => setNewResTitle(e.target.value)}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://... (optional for books)"
                  value={newResUrl}
                  onChange={(e) => setNewResUrl(e.target.value)}
                />
                <select
                  className="form-input"
                  value={newResType}
                  onChange={(e) => setNewResType(e.target.value)}
                  style={{ background: '#121218' }}
                >
                  <option value="ARTICLE">Article</option>
                  <option value="VIDEO">Video</option>
                  <option value="BOOK">Book</option>
                  <option value="TOOL">Tool</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="Why is this resource useful? (Optional)"
                value={newResPurpose}
                onChange={(e) => setNewResPurpose(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.8rem' }}>
                Save Bookmark
              </button>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {resources.map((res, i) =>
              editingResourceIdx === i && resourceDraft ? (
                <div key={res.id || i} className="flex flex-col gap-2 rounded-md border border-primary bg-black/20 p-3">
                  <input className="form-input text-[0.85rem]" value={resourceDraft.title} onChange={(e) => setResourceDraft({ ...resourceDraft, title: e.target.value })} placeholder="Title" aria-label="Resource title" />
                  <div className="grid grid-cols-[2fr_1fr] gap-2">
                    <input className="form-input text-[0.82rem]" value={resourceDraft.url} onChange={(e) => setResourceDraft({ ...resourceDraft, url: e.target.value })} placeholder="https://... (optional)" aria-label="Resource link" />
                    <select className="form-input bg-[#121218] text-[0.82rem]" value={resourceDraft.type} onChange={(e) => setResourceDraft({ ...resourceDraft, type: e.target.value })} aria-label="Resource type">
                      {['ARTICLE', 'VIDEO', 'BOOK', 'COURSE', 'PAPER', 'TOOL', 'WEBSITE', 'OTHER'].map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                    </select>
                  </div>
                  <input className="form-input text-[0.82rem]" value={resourceDraft.purpose} onChange={(e) => setResourceDraft({ ...resourceDraft, purpose: e.target.value })} placeholder="Why is it useful?" aria-label="Why it's useful" />
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveResourceEdit} disabled={!resourceDraft.title.trim()} className="btn btn-primary px-3 py-1 text-[0.78rem]">Save</button>
                    <button type="button" onClick={() => { setEditingResourceIdx(null); setResourceDraft(null); }} className="btn btn-secondary px-3 py-1 text-[0.78rem]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={res.id || i} className="flex items-start justify-between gap-3 rounded-md border border-line bg-black/20 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-[rgba(99,102,241,0.15)] px-1.5 py-px text-[0.65rem] font-bold text-primary-light">{res.type}</span>
                      {res.url ? (
                        <a href={res.url} target="_blank" rel="noreferrer" className="text-[0.88rem] font-semibold text-primary-light">{res.title} ↗</a>
                      ) : (
                        <span className="text-[0.88rem] font-semibold text-fg">{res.title}</span>
                      )}
                    </div>
                    {res.purpose && <p className="mt-0.5 text-[0.75rem] text-fg-secondary">{res.purpose}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <select
                      value={res.status || 'NOT_STARTED'}
                      onChange={(e) => handleResourceStatus(i, e.target.value)}
                      className="form-input w-auto bg-[#121218] px-1.5 py-1 text-[0.7rem]"
                      aria-label={`Status of ${res.title}`}
                    >
                      <option value="NOT_STARTED">To do</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="COMPLETED">Done</option>
                      <option value="PAUSED">Paused</option>
                    </select>
                    <button type="button" onClick={() => { setEditingResourceIdx(i); setResourceDraft({ ...res }); }} className="bg-transparent px-1.5 text-[0.75rem] text-primary-light" title="Edit">✎</button>
                    <button type="button" onClick={() => handleDeleteResource(i)} className="bg-transparent px-1.5 text-danger" title="Remove">✕</button>
                  </div>
                </div>
              )
            )}
            {resources.length === 0 && !showAddRes && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px' }}>
                No resources saved yet.
              </p>
            )}
          </div>
        </div>
      </Drawer>

      {/* ── SLIDE-OVER DRAWER: Topic Settings ────────────────────────── */}
      <Drawer
        open={settingsDrawerOpen}
        onClose={() => setSettingsDrawerOpen(false)}
        title="⚙️ Topic Settings"
        label="Topic Settings"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Topic Title</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Subject Area</label>
            <select
              className="form-input"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              style={{ background: '#121218' }}
            >
              <option value="Tech">Tech</option>
              <option value="Business">Business</option>
              <option value="Finance">Finance</option>
              <option value="Creative">Creative</option>
              <option value="Personal">Personal</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Why Are You Learning This?</label>
            <textarea
              className="form-input"
              style={{ height: '80px', resize: 'vertical' }}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="e.g. Master statistics to pass my job interview and build ML models..."
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                await fetch(`/api/topics/${params.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title, area, why }),
                });
                setSettingsDrawerOpen(false);
                fetchTopic();
              } catch (e) {
                console.error(e);
              }
            }}
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.82rem', alignSelf: 'flex-start' }}
          >
            Save Settings
          </button>

          <hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--color-danger)', fontWeight: 600, marginBottom: '6px' }}>Danger Zone</h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
              Delete this topic. It disappears from your lists; its modules, notes, review cards and time history are kept and can be restored.
            </p>
            <button
              type="button"
              onClick={handleDeleteTopic}
              className="btn btn-secondary"
              style={{ color: 'var(--color-danger)', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.8rem', padding: '6px 14px' }}
            >
              🗑️ Delete Topic
            </button>
          </div>
        </div>
      </Drawer>

      {/* Session Debrief Modal */}
      {showDebrief && (
        <SessionDebriefModal
          topicTitle={title}
          currentNextAction={activeModule ? `Module ${activeModule.order}: ${activeModule.title}` : title}
          timerDurationMinutes={timerElapsedMinutes}
          onSave={handleSaveSessionLog}
          onClose={() => setShowDebrief(false)}
        />
      )}

      <PlacementDrawer
        open={placementOpen}
        onClose={() => setPlacementOpen(false)}
        topicId={params.id}
        openModuleCount={curriculum.filter((m) => !m.completed).length}
        onApplied={() => {
          fetchTopic();
          fetchEvidence();
        }}
      />

      <TopicTimeDrawer
        open={timeDrawerOpen}
        onClose={() => setTimeDrawerOpen(false)}
        topicId={params.id}
        modules={curriculum.map((m) => ({ id: m.id, title: m.title }))}
        onChanged={fetchTimeTotals}
      />

      {/* Custom Confirmation / Alert Dialog */}
      <CustomDialog {...dialogConfig} />

    </div>
  );
}
