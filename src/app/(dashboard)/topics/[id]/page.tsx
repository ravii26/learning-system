'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';

// Modular Imports
import LearningContract from './LearningContract';
import KnowledgeMap from './KnowledgeMap';
import SocraticCoach from './SocraticCoach';
import ConfusionMistakeBank from './ConfusionMistakeBank';
import ReactivationModal from './ReactivationModal';
import SessionDebriefModal, { SessionLog } from './SessionDebriefModal';
import SessionTimeline from './SessionTimeline';
import CurriculumView, { CourseModule } from './CurriculumView';
import RichTextEditor from './RichTextEditor';

interface ActivityLog {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  timestamp: string;
}

interface Resource {
  title: string;
  type: string;
  url: string;
  purpose: string;
  status: string;
  notes: string;
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
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
  subtasks: Subtask[];
  activityLogs: ActivityLog[];
  contract: any;
  knowledgeMap: any;
  confusions: any[];
  mistakes: any[];
  pauseHistory: any[];
  activeSlotType: string | null;
  sessionLogs: SessionLog[];
  topicMode: 'self_directed' | 'course';
  curriculum: CourseModule[];
}

const STAGES = ['Define', 'Map', 'Fundamentals', 'Core Knowledge', 'Application', 'Advanced', 'Proof'];
const DEPTHS = ['Awareness', 'Working Knowledge', 'Proficiency', 'Deep', 'Mastery'];
const AREAS = ['Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];
const STATUSES = ['inbox', 'queued', 'active', 'paused', 'maintenance', 'reference', 'dropped'];

export default function TopicDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'workspace' | 'contract' | 'materials' | 'confusions' | 'history' | 'notes' | 'sessions'>('workspace');

  // Edit fields
  const [title, setTitle] = useState('');
  const [area, setArea] = useState('');
  const [why, setWhy] = useState('');
  const [depthTarget, setDepthTarget] = useState('');
  const [status, setStatus] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [lastCompleted, setLastCompleted] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [proofOfLearning, setProofOfLearning] = useState('');
  const [notes, setNotes] = useState('');
  
  // Advanced State variables
  const [contract, setContract] = useState<any>({ outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] });
  const [concepts, setConcepts] = useState<any[]>([]);
  const [confusions, setConfusions] = useState<any[]>([]);
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [pauseHistory, setPauseHistory] = useState<any[]>([]);
  const [activeSlotType, setActiveSlotType] = useState<string | null>(null);

  // Session Log state
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [showDebrief, setShowDebrief] = useState(false);
  const [timerElapsedMinutes, setTimerElapsedMinutes] = useState(25);

  // Course Mode state
  const [topicMode, setTopicMode] = useState<'self_directed' | 'course'>('self_directed');
  const [curriculum, setCurriculum] = useState<CourseModule[]>([]);

  // Selected concept for active Socratic Coach tutoring
  const [selectedConcept, setSelectedConcept] = useState<any | null>(null);
  const [explanationsRead, setExplanationsRead] = useState(0);

  // Reactivation Modal State
  const [showReactivation, setShowReactivation] = useState(false);

  // Materials Sub-State
  const [resources, setResources] = useState<Resource[]>([]);
  const [newResTitle, setNewResTitle] = useState('');
  const [newResType, setNewResType] = useState('BOOK');
  const [newResUrl, setNewResUrl] = useState('');
  const [newResPurpose, setNewResPurpose] = useState('');
  const [newResNotes, setNewResNotes] = useState('');
  const [showAddRes, setShowAddRes] = useState(false);

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Notes Markdown Mode
  const [notesMode, setNotesMode] = useState<'write' | 'preview'>('write');
  const [scrapingLink, setScrapingLink] = useState(false);

  const fetchTopic = useCallback(async () => {
    try {
      const res = await fetch(`/api/topics/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setTopic(data);
        
        // Populate inputs
        setTitle(data.title);
        setArea(data.area);
        setWhy(data.why || '');
        setDepthTarget(data.depthTarget || 'Proficiency');
        setStatus(data.status);
        setProgressPct(data.progressPct);
        setCurrentStage(data.currentStage);
        setLastCompleted(data.lastCompleted || '');
        setNextAction(data.nextAction || '');
        setProofOfLearning(data.proofOfLearning || '');
        setNotes(data.notes || '');
        
        // Populate advanced JSONs
        setContract(data.contract || { outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] });
        const mapData = data.knowledgeMap || { concepts: [] };
        setConcepts(mapData.concepts || []);
        setConfusions(data.confusions || []);
        setMistakes(data.mistakes || []);
        setPauseHistory(data.pauseHistory || []);
        setActiveSlotType(data.activeSlotType || null);
        setSessionLogs(Array.isArray(data.sessionLogs) ? data.sessionLogs : []);
        setTopicMode(data.topicMode || 'self_directed');
        setCurriculum(Array.isArray(data.curriculum) ? data.curriculum : []);

        // Parse resources & subtasks JSON
        setResources(Array.isArray(data.resources) ? data.resources : []);
        setSubtasks(Array.isArray(data.subtasks) ? data.subtasks : []);
      } else {
        setError('Topic not found');
      }
    } catch (e) {
      setError('Failed to fetch topic details');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchTopic();
  }, [fetchTopic]);

  // Handle main topic form save
  const handleSave = async (e?: React.FormEvent, statusOverride?: string) => {
    if (e) e.preventDefault();
    setError(null);
    setSaving(true);

    const targetStatus = statusOverride || status;

    // Enforce guards
    if (targetStatus === 'active') {
      if (!why.trim()) {
        setError('Why you are learning is required for active topics.');
        setSaving(false);
        return;
      }
      if (!depthTarget) {
        setError('Depth target is required for active topics.');
        setSaving(false);
        return;
      }
      if (!nextAction.trim()) {
        setError('A concrete verb-first Next Action is required for active topics.');
        setSaving(false);
        return;
      }
    }

    if (targetStatus === 'paused' && !nextAction.trim()) {
      setError('A concrete Next Action is required to pause a topic.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          area,
          why: why.trim() || null,
          depthTarget,
          status: targetStatus,
          progressPct: Number(progressPct),
          currentStage,
          lastCompleted: lastCompleted.trim() || null,
          nextAction: nextAction.trim() || null,
          proofOfLearning: proofOfLearning.trim() || null,
          notes: notes.trim() || null,
          resources,
          subtasks,
          contract,
          knowledgeMap: { concepts },
          confusions,
          mistakes,
          pauseHistory,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setTopic(data);
        setStatus(data.status);
        await fetchTopic();
        router.refresh();
      } else {
        setError(data.error || 'Failed to update topic');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    // Collect pause reason
    const reason = prompt('Why are you pausing this topic?');
    if (reason === null) return;

    const newPauseLog = {
      id: Math.random().toString(36).substring(2, 9),
      pausedAt: new Date().toISOString(),
      resumedAt: null,
      reason: reason.trim() || 'Switched focus to another priority.',
      completedConcepts: concepts.filter(c => c.status !== 'Unknown' && c.status !== 'Exposed').map(c => c.title),
      currentConcept: selectedConcept?.title || 'None',
      openQuestion: confusions.filter(c => !c.resolved)[0]?.text || 'None',
      reactivationScore: null,
    };

    const updatedPauseHistory = [...pauseHistory, newPauseLog];
    setPauseHistory(updatedPauseHistory);

    // Save with paused status
    setError(null);
    try {
      const res = await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paused',
          pauseHistory: updatedPauseHistory,
        }),
      });

      if (res.ok) {
        await fetchTopic();
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to pause topic');
      }
    } catch (e) {
      alert('Connection error pausing topic');
    }
  };

  const handleResume = async () => {
    // Check if slots capacity reached
    try {
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const stats = await statsRes.json();
        const activeCount = stats.counts.active;
        if (topic?.status !== 'active' && activeCount >= 2) {
          alert('Active limit reached (max 2). You must pause or drop another active topic first.');
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Launch Socratic reactivation modal instead of straight save!
    setShowReactivation(true);
  };

  // Reactivation success handler
  const handleConfirmReactivation = async (forgottenIds: string[], reactivationNotes: string) => {
    // Update concepts status for forgotten ones to 'Exposed' and reset spaced review dates
    const updatedConcepts = concepts.map((c) => {
      if (forgottenIds.includes(c.id)) {
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1); // due tomorrow
        return {
          ...c,
          status: 'Exposed',
          reviewIntervalDays: 1,
          consecutiveRecalls: 0,
          nextReviewDate: nextReview.toISOString(),
        };
      }
      return c;
    });

    // Update pause logs
    const updatedPauseHistory = pauseHistory.map((ph, idx) => {
      if (idx === pauseHistory.length - 1) {
        return {
          ...ph,
          resumedAt: new Date().toISOString(),
          reactivationScore: `Flagged ${forgottenIds.length} forgotten`,
        };
      }
      return ph;
    });

    try {
      const res = await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          knowledgeMap: { concepts: updatedConcepts },
          pauseHistory: updatedPauseHistory,
          nextAction: nextAction || 'Continue study map concepts',
        }),
      });

      if (res.ok) {
        await fetchTopic();
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resume topic');
      }
    } catch (e) {
      alert('Error connecting to database');
    }
  };

  // Sub-saving callbacks
  const handleSaveContract = async (updatedContract: any) => {
    setContract(updatedContract);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: updatedContract }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConcepts = async (updatedConcepts: any[]) => {
    setConcepts(updatedConcepts);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeMap: { concepts: updatedConcepts } }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDiagnoseConcepts = async (diagnosticLevels: Record<string, string>) => {
    const updated = concepts.map((c) => {
      if (c.id in diagnosticLevels) {
        return {
          ...c,
          status: diagnosticLevels[c.id],
        };
      }
      return c;
    });

    setConcepts(updated);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeMap: { concepts: updated } }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConfusions = async (updatedConfusions: any[]) => {
    setConfusions(updatedConfusions);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confusions: updatedConfusions }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveMistakes = async (updatedMistakes: any[]) => {
    setMistakes(updatedMistakes);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mistakes: updatedMistakes }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  // Session Log handlers
  const handleSaveSessionLog = async (log: SessionLog) => {
    const updated = [...sessionLogs, log];
    setSessionLogs(updated);
    const updates: Record<string, unknown> = { sessionLogs: updated };
    if (log.nextAction.trim()) updates.nextAction = log.nextAction.trim();
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (log.nextAction.trim()) setNextAction(log.nextAction.trim());
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCurriculum = async (modules: CourseModule[]) => {
    setCurriculum(modules);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum: modules }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotes = async (html: string) => {
    setNotes(html);
    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: html }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSocraticProgress = async (conceptId: string, success: boolean, mistakeText?: string, whyMade?: string, howToAvoid?: string) => {
    try {
      await fetch('/api/review/spaced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: params.id,
          conceptId,
          success,
          mistakeText,
          whyMade,
          howToAvoid,
        }),
      });
      await fetchTopic();
      setSelectedConcept(null); // Return to map
    } catch (e) {
      console.error(e);
    }
  };

  // Materials: Add Resource
  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResTitle.trim()) return;

    const newRes: Resource = {
      title: newResTitle.trim(),
      type: newResType,
      url: newResUrl.trim(),
      purpose: newResPurpose.trim(),
      status: 'NOT_STARTED',
      notes: newResNotes.trim(),
    };

    const updatedRes = [...resources, newRes];
    setResources(updatedRes);
    setNewResTitle('');
    setNewResUrl('');
    setNewResPurpose('');
    setNewResNotes('');
    setShowAddRes(false);

    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updatedRes }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleResourceStatus = async (index: number) => {
    const cycle = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED'];
    const updated = [...resources];
    const idx = cycle.indexOf(updated[index].status);
    updated[index].status = cycle[(idx + 1) % cycle.length];
    setResources(updated);

    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updated }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteResource = async (index: number) => {
    if (!confirm('Remove resource?')) return;
    const updated = resources.filter((_, i) => i !== index);
    setResources(updated);

    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: updated }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  // Materials: Subtasks Checklist
  const updateSubtasksAndProgress = async (updatedSubtasks: Subtask[]) => {
    setSubtasks(updatedSubtasks);
    let newProgress = progressPct;
    if (updatedSubtasks.length > 0) {
      const completed = updatedSubtasks.filter(t => t.completed).length;
      newProgress = Math.round((completed / updatedSubtasks.length) * 100);
      setProgressPct(newProgress);
    }

    try {
      await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtasks: updatedSubtasks,
          progressPct: newProgress,
        }),
      });
      await fetchTopic();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    const newSub: Subtask = {
      id: Math.random().toString(36).substring(2, 9),
      title: newSubtaskTitle.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setNewSubtaskTitle('');
    await updateSubtasksAndProgress([...subtasks, newSub]);
  };

  const handleToggleSubtask = async (id: string) => {
    const updated = subtasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    await updateSubtasksAndProgress(updated);
  };

  const handleDeleteSubtask = async (id: string) => {
    await updateSubtasksAndProgress(subtasks.filter(t => t.id !== id));
  };

  // Timer Focus
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [timerMode, setTimerMode] = useState<'study' | 'shortBreak' | 'longBreak'>('study');

  useEffect(() => {
    let interval: any = null;
    if (timerActive) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            // Calculate elapsed minutes from the original timer preset
            const presetSecs = timerMode === 'study' ? 25 * 60 : timerMode === 'shortBreak' ? 5 * 60 : 15 * 60;
            setTimerElapsedMinutes(Math.round((presetSecs - 0) / 60));
            setTimeout(() => setShowDebrief(true), 300);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [timerActive, timerMode]);

  const resetTimer = (mode: 'study' | 'shortBreak' | 'longBreak') => {
    setTimerActive(false);
    setTimerMode(mode);
    setSecondsRemaining(mode === 'study' ? 25 * 60 : mode === 'shortBreak' ? 5 * 60 : 15 * 60);
  };

  const formatTimerTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const r = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  const handleScrapeLink = async () => {
    if (!newResUrl.trim()) return;
    setScrapingLink(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newResUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setNewResTitle(data.title);
        if (data.description) setNewResPurpose(data.description);
        if (data.type) setNewResType(data.type);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScrapingLink(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!confirm('Permanent Delete?')) return;
    try {
      await fetch(`/api/topics/${params.id}`, { method: 'DELETE' });
      router.push('/');
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex-center" style={{ minHeight: '60vh' }}>Loading Study Workspace...</div>;
  }

  if (error && !topic) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <p style={{ color: 'var(--color-danger)' }}>⚠️ {error}</p>
        <Link href="/" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header bar */}
      <div className="flex-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Back
          </Link>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</h2>
          {activeSlotType && (
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary-light)', fontWeight: 600, textTransform: 'uppercase' }}>
              ⚡ {activeSlotType} focus slot
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {topic?.status === 'active' ? (
            <button onClick={handlePause} className="btn btn-secondary" style={{ color: 'var(--color-warning)' }}>
              ⏸️ Pause Topic
            </button>
          ) : topic?.status === 'paused' ? (
            <button onClick={handleResume} className="btn btn-primary">
              ▶️ Resume Topic
            </button>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              Status: <strong className={`status-${topic?.status}`}>{topic?.status}</strong>
            </span>
          )}
          
          <button onClick={handleDeleteTopic} className="btn btn-secondary" style={{ color: 'var(--color-danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            🗑️ Delete
          </button>
        </div>
      </div>

      {/* Main Tab selectors */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '4px', overflowX: 'auto' }}>
        {[
          { key: 'workspace', label: topicMode === 'course' ? '📚 Curriculum' : '💻 Study Desk & Map' },
          { key: 'contract', label: '📜 Contract' },
          { key: 'materials', label: '📚 Materials' },
          { key: 'notes', label: '📝 Notes' },
          { key: 'confusions', label: '🚫 Mistakes' },
          { key: 'sessions', label: `📅 Sessions${sessionLogs.length > 0 ? ` (${sessionLogs.length})` : ''}` },
          { key: 'history', label: '📜 History' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: '10px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: activeTab === t.key ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'all var(--transition-fast)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Body Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '32px', alignItems: 'start' }}>
        
        {/* LEFT WORKSPACE PANELS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {activeTab === 'workspace' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Course Mode — Curriculum View */}
              {topicMode === 'course' ? (
                <CurriculumView
                  curriculum={curriculum}
                  onSaveCurriculum={handleSaveCurriculum}
                />
              ) : (
                /* Self-Directed — Socratic Coach + Knowledge Map */
                selectedConcept ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      onClick={() => setSelectedConcept(null)}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '6px 12px' }}
                    >
                      ← Back to Knowledge Map
                    </button>
                    <SocraticCoach
                      concept={selectedConcept}
                      topicId={params.id}
                      topicTitle={title}
                      onSaveProgress={handleSaveSocraticProgress}
                      explanationsRead={explanationsRead}
                      onIncrementExplanationsRead={() => setExplanationsRead(prev => prev + 1)}
                      onResetExplanationsRead={() => setExplanationsRead(0)}
                    />
                  </div>
                ) : (
                  <KnowledgeMap
                    concepts={concepts}
                    topicTitle={title}
                    onSaveConcepts={handleSaveConcepts}
                    onSelectConcept={(c) => setSelectedConcept(c)}
                    selectedConceptId={selectedConcept?.id}
                  />
                )
              )}

            </div>
          )}

          {/* Notes Tab — Rich Text Editor */}
          {activeTab === 'notes' && (
            <div className="glass-panel" style={{ padding: '4px' }}>
              <RichTextEditor
                content={notes}
                onChange={handleSaveNotes}
                placeholder="Write notes, summaries, key concepts... Format with headings, bullets, bold, and more."
                minHeight={300}
              />
            </div>
          )}

          {/* Sessions Tab — Session Timeline */}
          {activeTab === 'sessions' && (
            <SessionTimeline sessionLogs={sessionLogs} />
          )}

          {activeTab === 'contract' && (
            <LearningContract
              contract={contract}
              onSaveContract={handleSaveContract}
              concepts={concepts}
              onDiagnoseConcepts={handleDiagnoseConcepts}
            />
          )}

          {activeTab === 'materials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Resources list */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="flex-between">
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>📚 Reference Resources</h3>
                  <button
                    onClick={() => setShowAddRes(!showAddRes)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  >
                    {showAddRes ? 'Cancel' : '➕ Add Resource'}
                  </button>
                </div>

                {showAddRes && (
                  <form onSubmit={handleAddResource} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Title"
                      value={newResTitle}
                      onChange={(e) => setNewResTitle(e.target.value)}
                      required
                    />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <select
                        className="form-input"
                        value={newResType}
                        onChange={(e) => setNewResType(e.target.value)}
                        style={{ background: '#121218' }}
                      >
                        <option value="BOOK">Book</option>
                        <option value="COURSE">Course</option>
                        <option value="VIDEO">Video</option>
                        <option value="ARTICLE">Article</option>
                        <option value="DOCUMENTATION">Docs</option>
                        <option value="PAPER">Paper</option>
                        <option value="WEBSITE">Website</option>
                        <option value="PEOPLE_EXPERT">Expert</option>
                      </select>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="url"
                          className="form-input"
                          placeholder="URL"
                          value={newResUrl}
                          onChange={(e) => setNewResUrl(e.target.value)}
                        />
                        {newResUrl && (
                          <button
                            type="button"
                            onClick={handleScrapeLink}
                            disabled={scrapingLink}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          >
                            {scrapingLink ? '🔍' : 'Fill'}
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      className="form-input"
                      placeholder="Role / Purpose (e.g. Primary Explanation, Reference...)"
                      value={newResPurpose}
                      onChange={(e) => setNewResPurpose(e.target.value)}
                    />

                    <textarea
                      className="form-input"
                      placeholder="Quick summary notes..."
                      value={newResNotes}
                      onChange={(e) => setNewResNotes(e.target.value)}
                      style={{ height: '50px', resize: 'none' }}
                    />

                    <button type="submit" className="btn btn-primary" style={{ padding: '8px' }}>Add to Stack</button>
                  </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {resources.map((res, idx) => (
                    <div key={idx} className="glass-card" style={{ padding: '12px', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="flex-between">
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>{res.type}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleToggleResourceStatus(idx)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                            {res.status}
                          </button>
                          <button onClick={() => handleDeleteResource(idx)} style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>×</button>
                        </div>
                      </div>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>{res.url ? <a href={res.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{res.title}</a> : res.title}</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Role: {res.purpose || 'General Reference'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subtask checklist */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>📋 Milestones & Exercises</h3>
                
                <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Add practice exercise or milestone..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>➕ Add</button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {subtasks.map((task) => (
                    <div key={task.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(0,0,0,0.15)', opacity: task.completed ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={task.completed} onChange={() => handleToggleSubtask(task.id)} style={{ width: '15px', height: '15px' }} />
                        <span style={{ fontSize: '0.85rem', textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</span>
                      </div>
                      <button onClick={() => handleDeleteSubtask(task.id)} style={{ color: 'var(--color-danger)', fontSize: '1rem' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'confusions' && (
            <ConfusionMistakeBank
              confusions={confusions}
              mistakes={mistakes}
              onSaveConfusions={handleSaveConfusions}
              onSaveMistakes={handleSaveMistakes}
            />
          )}

          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Pause History logs */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>⏸️ Pause & Reactivation Logs</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pauseHistory.map((ph, idx) => (
                    <div key={ph.id || idx} className="glass-card" style={{ padding: '14px', background: 'rgba(0,0,0,0.15)', fontSize: '0.82rem' }}>
                      <p style={{ color: 'var(--color-warning)', fontWeight: 600, fontSize: '0.75rem' }}>PAUSE SESSION</p>
                      <p><strong>Paused on:</strong> {new Date(ph.pausedAt).toLocaleString()}</p>
                      {ph.resumedAt && <p><strong>Resumed on:</strong> {new Date(ph.resumedAt).toLocaleString()}</p>}
                      <p><strong>Reason:</strong> {ph.reason}</p>
                      {ph.currentConcept && <p><strong>Stopped on concept:</strong> {ph.currentConcept}</p>}
                      {ph.reactivationScore && <p><strong>Reactivation:</strong> {ph.reactivationScore}</p>}
                    </div>
                  ))}
                  {pauseHistory.length === 0 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>No pause history recorded.</p>
                  )}
                </div>
              </div>

              {/* Activity log timeline */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>📜 Activity Timeline</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(topic?.activityLogs ?? []).map((log) => (
                    <div key={log.id} style={{ fontSize: '0.8rem', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <div className="flex-between" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary-light)' }}>{log.fieldChanged.toUpperCase()}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p style={{ color: 'var(--color-text-primary)' }}>
                        {log.oldValue === null ? `Initialized as "${log.newValue}"` : `Changed from "${log.oldValue}" to "${log.newValue}"`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* RIGHT SIDE FOCUS timer & detail configs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* General info card */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>📌 Study Context Card</h3>
            
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p><strong>Area:</strong> {area}</p>
              <p><strong>Stage:</strong> {currentStage}</p>
              <p><strong>Target Depth:</strong> {depthTarget}</p>
              <p><strong>Estimated Effort:</strong> {contract?.estimatedEffort || 0} Hours</p>
              <p><strong>Last Touched:</strong> {topic?.lastTouchedDate ? new Date(topic.lastTouchedDate).toLocaleDateString() : '—'}</p>
            </div>
            
            {/* Stage Stepper progress */}
            <div style={{ marginTop: '10px' }}>
              <span className="form-label" style={{ fontSize: '0.7rem' }}>STAGE PROGRESSION</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {STAGES.map((st) => {
                  const isPassed = STAGES.indexOf(currentStage) >= STAGES.indexOf(st);
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: isPassed ? '#fff' : 'var(--color-text-muted)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPassed ? 'var(--color-success)' : 'rgba(255,255,255,0.08)' }}></div>
                      <span>{st}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pomodoro Timer widget */}
          {(status === 'active' || status === 'paused') && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⏱️</span> Study Focus Timer
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button type="button" onClick={() => resetTimer('study')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', justifyContent: 'flex-start', background: timerMode === 'study' ? 'rgba(99,102,241,0.1)' : 'transparent' }}>🔥 Study</button>
                  <button type="button" onClick={() => resetTimer('shortBreak')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', justifyContent: 'flex-start', background: timerMode === 'shortBreak' ? 'rgba(20,184,166,0.1)' : 'transparent' }}>☕ Break</button>
                </div>

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 700, fontFamily: 'monospace' }}>{formatTimerTime(secondsRemaining)}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => setTimerActive(!timerActive)} className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                      {timerActive ? 'Pause' : 'Start'}
                    </button>
                    <button type="button" onClick={() => resetTimer(timerMode)} className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>Reset</button>
                  </div>
                </div>
              </div>

              {/* Manual Log Session button */}
              <button
                type="button"
                onClick={() => { setTimerElapsedMinutes(Math.round((25 * 60 - secondsRemaining) / 60) || 25); setShowDebrief(true); }}
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: '0.75rem', padding: '6px', borderStyle: 'dashed' }}
              >
                📝 Log a Session Manually
              </button>

              {/* Topic mode toggle */}
              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Learning Mode</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={async () => { setTopicMode('self_directed'); await fetch(`/api/topics/${params.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicMode: 'self_directed' }) }); }}
                    style={{ flex: 1, padding: '6px 4px', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)', border: topicMode === 'self_directed' ? '1.5px solid var(--color-primary)' : '1.5px solid var(--border-color)', background: topicMode === 'self_directed' ? 'rgba(99,102,241,0.12)' : 'transparent', color: topicMode === 'self_directed' ? 'var(--color-primary-light)' : 'var(--color-text-muted)', cursor: 'pointer' }}
                  >🧭 Self-Directed</button>
                  <button
                    type="button"
                    onClick={async () => { setTopicMode('course'); await fetch(`/api/topics/${params.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topicMode: 'course' }) }); }}
                    style={{ flex: 1, padding: '6px 4px', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)', border: topicMode === 'course' ? '1.5px solid #a855f7' : '1.5px solid var(--border-color)', background: topicMode === 'course' ? 'rgba(168,85,247,0.12)' : 'transparent', color: topicMode === 'course' ? '#c084fc' : 'var(--color-text-muted)', cursor: 'pointer' }}
                  >📚 Course</button>
                </div>
              </div>
            </div>
          )}

          {/* Direct Configs form panel */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>⚙️ Quick Action Configs</h3>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>NEXT CONCRETE ACTION</label>
              <input type="text" className="form-input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px' }} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>STAGE</label>
              <select className="form-input" value={currentStage} onChange={(e) => setCurrentStage(e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px', background: '#121218' }}>
                {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>PROGRESS PERCENT (%)</label>
              <input type="number" className="form-input" min="0" max="100" value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} style={{ fontSize: '0.8rem', padding: '6px 10px' }} />
            </div>

            <button onClick={() => handleSave()} disabled={saving} className="btn btn-primary" style={{ width: '100%', fontSize: '0.8rem' }}>
              💾 Sync Topic Changes
            </button>
          </div>

        </div>

      </div>

      {/* Reactivation Modal overlay */}
      {showReactivation && (
        <ReactivationModal
          topicTitle={title}
          concepts={concepts}
          onConfirmResume={handleConfirmReactivation}
          onClose={() => setShowReactivation(false)}
        />
      )}

      {/* Session Debrief Modal overlay */}
      {showDebrief && (
        <SessionDebriefModal
          topicTitle={title}
          currentNextAction={nextAction}
          timerDurationMinutes={timerElapsedMinutes}
          onSave={handleSaveSessionLog}
          onClose={() => setShowDebrief(false)}
        />
      )}

    </div>
  );
}
