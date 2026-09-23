'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';

// Modular Imports
import LearningContract from './LearningContract';
import KnowledgeMap, { Concept } from './KnowledgeMap';
import SocraticCoach from './SocraticCoach';
import ConfusionMistakeBank from './ConfusionMistakeBank';
import ReactivationModal from './ReactivationModal';
import SessionDebriefModal, { SessionLog } from './SessionDebriefModal';
import SessionTimeline from './SessionTimeline';
import CurriculumView, { CourseModule } from './CurriculumView';
import RichTextEditor from './RichTextEditor';
import CustomDialog, { CustomDialogConfig } from '@/components/CustomDialog';

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
          // contract / knowledgeMap / confusions / mistakes / pauseHistory are
          // deliberately NOT sent here. Each has its own save handler, and the
          // copies in this component's state go stale the moment the Socratic
          // coach or the spaced-review queue writes to them. Including them in
          // this form save overwrote live review scheduling with whatever was
          // loaded at mount.
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

  const [dialogConfig, setDialogConfig] = useState<CustomDialogConfig>({ isOpen: false, message: '' });

  const handlePause = () => {
    setDialogConfig({
      isOpen: true,
      type: 'prompt',
      title: 'Pause Topic',
      message: 'Why are you pausing this topic? (e.g. Switched focus, taking a break)',
      promptValue: 'Switched focus to another priority.',
      confirmLabel: 'Pause Topic',
      onConfirm: async (reason) => {
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
        const newPauseLog = {
          id: Math.random().toString(36).substring(2, 9),
          pausedAt: new Date().toISOString(),
          resumedAt: null,
          reason: (reason || '').trim() || 'Switched focus to another priority.',
          completedConcepts: concepts.filter(c => c.status !== 'Unknown' && c.status !== 'Exposed').map(c => c.title),
          currentConcept: selectedConcept?.title || 'None',
          openQuestion: confusions.filter(c => !c.resolved)[0]?.text || 'None',
          reactivationScore: null,
        };

        const updatedPauseHistory = [...pauseHistory, newPauseLog];
        setPauseHistory(updatedPauseHistory);

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
            setDialogConfig({ isOpen: true, type: 'error', title: 'Pause Error', message: data.error || 'Failed to pause topic' });
          }
        } catch (e) {
          setDialogConfig({ isOpen: true, type: 'error', title: 'Connection Error', message: 'Connection error pausing topic' });
        }
      },
      onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  const handleResume = async () => {
    // Check if slots capacity reached
    try {
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const stats = await statsRes.json();
        const activeCount = stats.counts.active;
        if (topic?.status !== 'active' && activeCount >= 2) {
          setDialogConfig({
            isOpen: true,
            type: 'warning',
            title: 'Active Capacity Reached',
            message: 'You already have 2 active topics. Please pause or drop an active topic first before resuming this one.',
            onConfirm: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
          });
          return;
        }
      }

      setError(null);
      const res = await fetch(`/api/topics/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });

      if (res.ok) {
        await fetchTopic();
        router.refresh();
      } else {
        const data = await res.json();
        setDialogConfig({ isOpen: true, type: 'error', title: 'Resume Error', message: data.error || 'Failed to resume topic' });
      }
    } catch (e) {
      setDialogConfig({ isOpen: true, type: 'error', title: 'Connection Error', message: 'Error connecting to database' });
    }
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

  const [generatingStudyPlan, setGeneratingStudyPlan] = useState(false);

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

  const handleGenerateStudyPlan = async () => {
    setGeneratingStudyPlan(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-curriculum', topicTitle: title }),
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
          await handleSaveCurriculum(generated);
          setTopicMode('course');
        }
      }
    } catch (e) {
      console.error('Failed to generate study plan:', e);
    } finally {
      setGeneratingStudyPlan(false);
    }
  };

  const handleStartKnowledgeMap = async () => {
    setGeneratingStudyPlan(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-concepts', topicTitle: title }),
      });
      let generatedConcepts: Concept[] = [];
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.concepts) && data.concepts.length > 0) {
          generatedConcepts = data.concepts.map((c: any) => ({
            id: Math.random().toString(36).substring(2, 9),
            title: c.title || 'Core Concept',
            parentId: null,
            status: 'Unknown',
            difficulty: c.difficulty || 'Medium',
            importance: c.importance || 'High',
          }));
        }
      }
      if (generatedConcepts.length === 0) {
        generatedConcepts = [
          { id: Math.random().toString(36).substring(2, 9), title: `${title} Fundamentals`, parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
          { id: Math.random().toString(36).substring(2, 9), title: `Core Mechanics of ${title}`, parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
          { id: Math.random().toString(36).substring(2, 9), title: `Practical Application & Synthesis`, parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        ];
      }
      await handleSaveConcepts(generatedConcepts);
      setTopicMode('self_directed');
    } catch (e) {
      console.error('Failed to generate concepts:', e);
    } finally {
      setGeneratingStudyPlan(false);
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

  const handleDeleteResource = (index: number) => {
    setDialogConfig({
      isOpen: true,
      type: 'confirm',
      title: 'Remove Bookmark',
      message: 'Are you sure you want to remove this bookmark resource?',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
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
      },
      onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
    });
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

  const handleDeleteTopic = () => {
    setDialogConfig({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Topic',
      message: `Are you sure you want to permanently delete "${title}"? This action cannot be undone.`,
      confirmLabel: 'Delete Topic',
      onConfirm: async () => {
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
        try {
          await fetch(`/api/topics/${params.id}`, { method: 'DELETE' });
          router.push('/');
          router.refresh();
        } catch (e) {
          console.error(e);
        }
      },
      onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  const handleLaunchSocraticSession = async () => {
    if (selectedConcept) {
      setSelectedConcept(null);
      return;
    }
    setActiveTab('workspace');
    if (concepts.length > 0) {
      setSelectedConcept(concepts[0]);
    } else {
      const defaultConcept = {
        id: Math.random().toString(36).substring(2, 9),
        title: `${title} Fundamentals & Core Principles`,
        status: 'Exposed',
        parentId: null,
        difficulty: 'Medium',
        importance: 'High',
      };
      const updatedConcepts = [defaultConcept];
      setConcepts(updatedConcepts);
      setSelectedConcept(defaultConcept);
      try {
        await fetch(`/api/topics/${params.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledgeMap: { concepts: updatedConcepts } }),
        });
      } catch (e) {
        console.error(e);
      }
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
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Back
          </Link>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</h2>
          {activeSlotType && (
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary-light)', fontWeight: 600, textTransform: 'uppercase' }}>
              ⚡ {activeSlotType} focus slot
            </span>
          )}
          <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', border: '1px solid var(--border-color)' }}>
            🏷️ {area}
          </span>
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

      {/* Current Focus Hero Card */}
      <div className="glass-panel" style={{ padding: '18px 22px', borderLeft: '4px solid var(--color-primary)', background: 'rgba(99, 102, 241, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              🎯 Your Next Action
            </span>
            {nextAction && nextAction.trim() ? (
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '2px', color: '#fff' }}>
                {nextAction}
              </h3>
            ) : (
              <div style={{ marginTop: '4px' }}>
                <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
                  You have not set a next action yet.
                </p>
                <button
                  onClick={() => setActiveTab('contract')}
                  style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--color-primary-light)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Go to My Goal & Progress to set one →
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => {
                setActiveTab('workspace');
                if (concepts.length > 0) {
                  setSelectedConcept(concepts[0]);
                } else if (curriculum.length > 0) {
                  setSelectedConcept({ id: curriculum[0].id, title: curriculum[0].title });
                } else {
                  handleGenerateStudyPlan();
                }
              }}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px', borderRadius: 'var(--radius-sm)' }}
            >
              🧠 Practice with AI Coach
            </button>
            <button
              onClick={() => setActiveTab('materials')}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: 'var(--radius-sm)' }}
            >
              📋 Tasks ({subtasks.filter(s => s.completed).length}/{subtasks.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab selectors */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '6px', overflowX: 'auto' }}>
        {[
          { key: 'workspace', label: '📖 Study & Practice' },
          { key: 'materials', label: `📋 Tasks & Resources (${subtasks.length + resources.length})` },
          { key: 'contract', label: '🎯 My Goal & Progress' },
          { key: 'sessions', label: `📊 Sessions & Notes (${sessionLogs.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            style={{
              padding: '10px 16px',
              fontSize: '0.85rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: activeTab === t.key ? '#fff' : 'var(--color-text-secondary)',
              background: activeTab === t.key ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
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

              {/* Show Curriculum when no concepts yet, otherwise Knowledge Map + Socratic Coach */}
              {concepts.length === 0 && curriculum.length === 0 ? (
                /* Truly empty — no curriculum, no concepts yet */
                <div className="glass-panel" style={{ padding: '36px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '2.8rem' }}>🚀</span>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Ready to learn {title}?</h3>
                    <p style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
                      Get started in seconds. Let AI generate structured study modules for this topic, or build a visual concept map.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      onClick={handleGenerateStudyPlan}
                      disabled={generatingStudyPlan}
                      className="btn btn-primary"
                      style={{ fontSize: '0.86rem', padding: '10px 20px' }}
                    >
                      {generatingStudyPlan ? '✨ Generating Modules with AI...' : '🤖 Generate AI Course Modules'}
                    </button>
                    <button
                      onClick={handleStartKnowledgeMap}
                      disabled={generatingStudyPlan}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.86rem', padding: '10px 18px' }}
                    >
                      🗺️ Build Visual Concept Map
                    </button>
                  </div>
                </div>
              ) : curriculum.length > 0 && !selectedConcept ? (
                /* Curriculum exists — show it as the default study view */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {concepts.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setTopicMode(topicMode === 'course' ? 'self_directed' : 'course')}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                      >
                        {topicMode === 'course' ? '🗺️ Switch to Knowledge Map' : '📚 Switch to Curriculum'}
                      </button>
                    </div>
                  )}
                  {topicMode === 'course' || concepts.length === 0 ? (
                    <CurriculumView
                      curriculum={curriculum}
                      topicTitle={title}
                      onPracticeModule={(mod) => setSelectedConcept({ id: mod.id, title: mod.title })}
                      onSaveCurriculum={handleSaveCurriculum}
                      onImportToSubtasks={async (titles) => {
                        const existingTitles = new Set(subtasks.map(s => s.title.toLowerCase()));
                        const newSubs: Subtask[] = titles
                          .filter(t => !existingTitles.has(t.toLowerCase()))
                          .map(title => ({
                            id: Math.random().toString(36).substring(2, 9),
                            title,
                            completed: false,
                            createdAt: new Date().toISOString(),
                          }));
                        if (newSubs.length > 0) {
                          await updateSubtasksAndProgress([...subtasks, ...newSubs]);
                        }
                      }}
                    />
                  ) : (
                    <KnowledgeMap
                      concepts={concepts}
                      topicTitle={title}
                      onSaveConcepts={handleSaveConcepts}
                      onSelectConcept={(c) => setSelectedConcept(c)}
                      selectedConceptId={selectedConcept?.id}
                    />
                  )}
                </div>
              ) : selectedConcept ? (
                /* A concept is selected — show Socratic Coach */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    onClick={() => setSelectedConcept(null)}
                    className="btn btn-secondary"
                    style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '6px 12px' }}
                  >
                    ← Back to Study Plan
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
                /* Concepts exist but no concept selected — show Knowledge Map */
                <KnowledgeMap
                  concepts={concepts}
                  topicTitle={title}
                  onSaveConcepts={handleSaveConcepts}
                  onSelectConcept={(c) => setSelectedConcept(c)}
                  selectedConceptId={selectedConcept?.id}
                />
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

          {/* Materials Tab */}
          {activeTab === 'materials' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="flex-between">
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>📚 Bookmarks & Learning Materials</h3>
                  <button onClick={() => setShowAddRes(!showAddRes)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                    {showAddRes ? 'Cancel' : '➕ Add Material'}
                  </button>
                </div>

                {showAddRes && (
                  <form onSubmit={handleAddResource} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="url"
                        className="form-input"
                        placeholder="Paste URL (e.g. https://docs.example.com)..."
                        value={newResUrl}
                        onChange={(e) => setNewResUrl(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleScrapeLink}
                        disabled={scrapingLink || !newResUrl.trim()}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      >
                        {scrapingLink ? 'Fetching...' : '🔍 Auto-Fetch Info'}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Resource Title..."
                        value={newResTitle}
                        onChange={(e) => setNewResTitle(e.target.value)}
                        required
                      />
                      <select
                        className="form-input"
                        value={newResType}
                        onChange={(e) => setNewResType(e.target.value)}
                        style={{ background: '#121218' }}
                      >
                        <option value="ARTICLE">Article / Doc</option>
                        <option value="VIDEO">Video / Course</option>
                        <option value="BOOK">Book / Chapter</option>
                        <option value="PAPER">Paper / Spec</option>
                        <option value="TOOL">Tool / Sandbox</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <input
                      type="text"
                      className="form-input"
                      placeholder="Why is this material relevant?"
                      value={newResPurpose}
                      onChange={(e) => setNewResPurpose(e.target.value)}
                    />

                    <button type="submit" className="btn btn-primary">Save Bookmark</button>
                  </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {resources.map((res, i) => (
                    <div key={i} className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(0,0,0,0.15)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary-light)', fontWeight: 700 }}>
                            {res.type}
                          </span>
                          <a href={res.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
                            {res.title} ↗
                          </a>
                        </div>
                        {res.purpose && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{res.purpose}</p>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleToggleResourceStatus(i)}
                          style={{
                            fontSize: '0.7rem',
                            padding: '4px 8px',
                            borderRadius: '9999px',
                            background: res.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' : res.status === 'IN_PROGRESS' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)',
                            color: res.status === 'COMPLETED' ? '#10b981' : res.status === 'IN_PROGRESS' ? '#f59e0b' : 'var(--color-text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {res.status}
                        </button>
                        <button onClick={() => handleDeleteResource(i)} style={{ color: 'var(--color-danger)', fontSize: '1rem' }}>×</button>
                      </div>
                    </div>
                  ))}
                  {resources.length === 0 && !showAddRes && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                      No bookmarks saved yet. Click "+ Add Material" above to bookmark documentation or guides.
                    </p>
                  )}
                </div>
              </div>

              {/* Subtask checklist */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>📋 Milestones & Practical Exercises</h3>
                
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

        {/* RIGHT SIDE FOCUS COMPANION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Focus Timer Widget */}
          {(status === 'active' || status === 'paused') && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', borderLeft: '3px solid var(--color-primary)' }}>
              <div className="flex-between">
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⏱️ Focus Sprint Timer
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  {timerMode === 'study' ? '25m Sprint' : '5m Break'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'monospace', color: '#fff' }}>
                  {formatTimerTime(secondsRemaining)}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setTimerActive(!timerActive)}
                    className="btn btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    {timerActive ? '⏸ Pause' : '▶ Start'}
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTimer(timerMode)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  >
                    ↺
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => { setTimerElapsedMinutes(Math.round((25 * 60 - secondsRemaining) / 60) || 25); setShowDebrief(true); }}
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: '0.75rem', padding: '6px', borderStyle: 'dashed' }}
              >
                📝 Log Study Session & Insights
              </button>
            </div>
          )}

          {/* Quick Notes Side-Drawer */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="flex-between">
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>📝 Quick Scratchpad & Notes</span>
              <button
                onClick={() => handleSaveNotes(notes)}
                className="btn btn-secondary"
                style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                disabled={saving}
              >
                💾 Save
              </button>
            </div>
            <textarea
              className="form-input"
              rows={6}
              placeholder="Jot down quick thoughts, formulas, or key takeaways as you study..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'vertical', fontSize: '0.82rem', lineHeight: 1.5, background: 'rgba(0,0,0,0.2)' }}
            />
          </div>

          {/* Compact Study Context & Stage Selection */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="flex-between">
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>📌 Topic Milestone Stage</h4>
              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontWeight: 600 }}>
                {depthTarget || 'Proficiency'}
              </span>
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>CURRENT MASTERY STAGE</label>
              <select
                className="form-input"
                value={currentStage}
                onChange={async (e) => {
                  const newSt = e.target.value;
                  setCurrentStage(newSt);
                  try {
                    await fetch(`/api/topics/${params.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ currentStage: newSt }),
                    });
                  } catch (err) {}
                }}
                style={{ background: '#121218', fontSize: '0.82rem' }}
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
              <p><strong>Category:</strong> {area}</p>
              <p><strong>Target Effort:</strong> {contract?.estimatedEffort || 0} Hours</p>
              <p><strong>Last Activity:</strong> {topic?.lastTouchedDate ? new Date(topic.lastTouchedDate).toLocaleDateString() : '—'}</p>
            </div>
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

      {/* Global Custom Dialog Modal (Replaces browser alert, confirm, prompt) */}
      <CustomDialog {...dialogConfig} />

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
