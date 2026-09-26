'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CourseModule, ModuleEvidence } from './page';
import { renderMarkdown } from '@/lib/markdown';
import RichTextEditor from './RichTextEditor';
import { KnowledgeMark } from '@/components/ui';
import ProblemLog from './ProblemLog';

interface ModuleStudyRoomProps {
  topicId: string;
  topicTitle: string;
  topicArea: string;
  module: CourseModule;
  notes: string;
  onSaveNotes: (html: string) => Promise<void>;
  /** Called after this module's own notes were saved, so the page keeps its copy fresh. */
  onModuleNotesSaved?: (moduleId: string, html: string) => void;
  onToggleCompleted: (id: string) => Promise<void>;
  onAddBookmark?: (resource: { title: string; url: string; type: string; purpose: string }) => Promise<void>;
  /** Latest quiz score / challenge verdict / review cards for this module. */
  evidence?: ModuleEvidence;
  /** Called after something was recorded, so the parent can refetch evidence. */
  onEvidenceChanged?: () => void;
}

type Verdict = 'correct' | 'partial' | 'incorrect';

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; bg: string }> = {
  correct: { label: 'Correct', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  partial: { label: 'Partly there', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  incorrect: { label: 'Not yet', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const isVerdict = (v: unknown): v is Verdict => v === 'correct' || v === 'partial' || v === 'incorrect';

export default function ModuleStudyRoom({
  topicId,
  topicTitle,
  topicArea,
  module,
  notes,
  onSaveNotes,
  onModuleNotesSaved,
  onToggleCompleted,
  onAddBookmark,
  evidence,
  onEvidenceChanged,
}: ModuleStudyRoomProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'media' | 'challenge' | 'quiz'>('guide');
  const [lesson, setLesson] = useState<any | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Socratic Challenge Interactive State
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    verdict?: Verdict | null;
    captured?: string;
    missed?: string;
    tip?: string;
    followUp?: string;
    fallback?: boolean;
  } | null>(null);
  const [savedBookmarkTitles, setSavedBookmarkTitles] = useState<Record<string, boolean>>({});

  // Quiz State
  const [quizSelections, setQuizSelections] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<string | null>(null);

  // Fetch or Generate Full Comprehensive Lesson
  const loadLesson = useCallback(async (forceRegenerate = false) => {
    setLoadingLesson(true);
    setEvaluation(null);
    setChallengeAnswer('');
    setQuizSelections({});
    setQuizSubmitted(false);
    setQuizResult(null);

    try {
      const res = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          moduleId: module.id,
          moduleTitle: module.title,
          topicTitle,
          area: topicArea || 'Tech',
          regenerate: forceRegenerate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLesson(data);
      }
    } catch (err) {
      console.error('Failed to load lesson:', err);
    } finally {
      setLoadingLesson(false);
      setGenerating(false);
    }
  }, [topicId, module.id, module.title, topicTitle, topicArea]);

  useEffect(() => {
    loadLesson(false);
  }, [loadLesson]);

  // Evaluate Socratic Challenge Answer
  const handleEvaluateChallenge = async () => {
    if (!challengeAnswer.trim()) return;
    setEvaluating(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          conceptTitle: module.title,
          topicTitle,
          topicId,
          moduleId: module.id,
          question: lesson?.socraticChallenge?.question,
          scenario: lesson?.socraticChallenge?.scenario,
          userRecall: challengeAnswer,
          idealAnswer: lesson?.socraticChallenge?.idealAnswer || lesson?.keyTakeaways?.join('\n') || 'Accurate understanding of core mechanics.',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setEvaluation({ ...data, verdict: isVerdict(data.verdict) ? data.verdict : null });
        if (isVerdict(data.verdict)) onEvidenceChanged?.();
      } else {
        setEvaluation({ fallback: true, tip: 'Could not reach the AI mentor. Compare your answer with the model solution below.' });
      }
    } catch (err) {
      console.error('Evaluation failed:', err);
      setEvaluation({ fallback: true, tip: 'Could not reach the AI mentor. Compare your answer with the model solution below.' });
    } finally {
      setEvaluating(false);
    }
  };

  const saveModuleNotes = async (moduleId: string, html: string) => {
    try {
      const res = await fetch(`/api/topics/${topicId}/modules/${moduleId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: html }),
      });
      if (res.ok) onModuleNotesSaved?.(moduleId, html);
    } catch (err) {
      console.error('Failed to save module notes:', err);
    }
  };

  // Grade locally right away, then save the attempt: the score becomes
  // evidence and every miss becomes a Daily Review card due tomorrow.
  const handleCheckQuiz = async () => {
    setQuizSubmitted(true);
    const quiz: any[] = Array.isArray(lesson?.quiz) ? lesson.quiz : [];
    const correct = quiz.filter((q, i) => quizSelections[i] === q.correctIndex).length;
    setQuizResult(`Score ${correct}/${quiz.length} · saving…`);
    try {
      const res = await fetch(`/api/topics/${topicId}/modules/${module.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: quizSelections }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const added: number = data.cardsAdded ?? 0;
      setQuizResult(
        `Score ${data.attempt?.correct ?? correct}/${data.attempt?.total ?? quiz.length} saved` +
          (added > 0 ? ` · ${added} missed question${added === 1 ? '' : 's'} added to Daily Review` : '')
      );
      onEvidenceChanged?.();
    } catch {
      setQuizResult(`Score ${correct}/${quiz.length} (not saved, try again later)`);
    }
  };

  // 1-Click Bookmark to Resources Drawer
  const handleBookmarkResource = async (res: any) => {
    if (!onAddBookmark) return;
    const url = res.url || `https://www.youtube.com/results?search_query=${encodeURIComponent(res.searchQuery || res.title)}`;
    await onAddBookmark({
      title: res.title,
      url,
      type: res.type === 'video' ? 'VIDEO' : res.type === 'book' ? 'BOOK' : 'ARTICLE',
      purpose: res.whyRecommended || 'Curated study reference',
    });
    setSavedBookmarkTitles((prev) => ({ ...prev, [res.title]: true }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── MODULE HEADER STRIP ───────────────────────────────────────── */}
      <div
        className="glass-panel"
        style={{
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          borderLeft: '4px solid var(--color-primary)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-primary-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Current Module • {module.estimatedMinutes} Mins Study Session
          </span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', marginTop: '2px', letterSpacing: '-0.01em' }}>
            {module.order}. {module.title}
          </h2>
          {evidence && (evidence.state || evidence.quiz || evidence.challenge || evidence.reviewCards > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[0.74rem] text-fg-secondary">
              {evidence.state && (
                <span className="inline-flex items-center gap-1.5">
                  <KnowledgeMark state={evidence.state} showLabel />
                  {evidence.reason && <span>— {evidence.reason}</span>}
                </span>
              )}
              {evidence.quiz?.total ? (
                <span>Last quiz <strong className="text-fg">{evidence.quiz.correct}/{evidence.quiz.total}</strong></span>
              ) : null}
              {isVerdict(evidence.challenge?.verdict) && (
                <span>
                  Challenge{' '}
                  <strong style={{ color: VERDICT_STYLE[evidence.challenge!.verdict as Verdict].color }}>
                    {VERDICT_STYLE[evidence.challenge!.verdict as Verdict].label}
                  </strong>
                </span>
              )}
              {evidence.reviewCards > 0 && (
                <span>{evidence.reviewCards} card{evidence.reviewCards === 1 ? '' : 's'} in Daily Review</span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => loadLesson(true)}
            disabled={loadingLesson || generating}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            title="Regenerate lesson with fresh examples"
          >
            {generating ? '⏳ Refreshing...' : '🔄 Refresh Guide'}
          </button>

          <button
            type="button"
            onClick={() => onToggleCompleted(module.id)}
            className={module.completed ? 'btn btn-secondary' : 'btn btn-primary'}
            style={{
              fontSize: '0.82rem',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: module.completed ? 'rgba(16,185,129,0.15)' : undefined,
              color: module.completed ? '#10b981' : undefined,
              border: module.completed ? '1px solid #10b981' : undefined,
            }}
          >
            {module.completed ? '✓ Module Completed' : 'Mark Module Complete'}
          </button>
        </div>
      </div>

      {/* ── 4 PILLARS NAVIGATION TABS ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('guide')}
          style={{
            padding: '10px 18px',
            fontSize: '0.86rem',
            fontWeight: activeTab === 'guide' ? 700 : 500,
            color: activeTab === 'guide' ? '#fff' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'guide' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>📖</span>
          <span>In-Depth Guide</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('media')}
          style={{
            padding: '10px 18px',
            fontSize: '0.86rem',
            fontWeight: activeTab === 'media' ? 700 : 500,
            color: activeTab === 'media' ? '#fff' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'media' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🎬</span>
          <span>Curated Videos & Books</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('challenge')}
          style={{
            padding: '10px 18px',
            fontSize: '0.86rem',
            fontWeight: activeTab === 'challenge' ? 700 : 500,
            color: activeTab === 'challenge' ? '#fff' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'challenge' ? '3px solid var(--color-primary)' : '3px solid transparent',
            background: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>🧠</span>
          <span>Socratic Challenge</span>
        </button>

        {lesson?.quiz && lesson.quiz.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('quiz')}
            style={{
              padding: '10px 18px',
              fontSize: '0.86rem',
              fontWeight: activeTab === 'quiz' ? 700 : 500,
              color: activeTab === 'quiz' ? '#fff' : 'var(--color-text-secondary)',
              borderBottom: activeTab === 'quiz' ? '3px solid var(--color-primary)' : '3px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🎯</span>
            <span>Self-Check Quiz ({lesson.quiz.length})</span>
          </button>
        )}
      </div>

      {/* ── LOADING SKELETON ─────────────────────────────────────────── */}
      {loadingLesson ? (
        <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Synthesizing Comprehensive Study Module...</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Building deep explanations, worked real-world examples, curated video lectures, and Socratic challenges for &quot;{module.title}&quot;.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── TAB 1: IN-DEPTH GUIDE ─────────────────────────────────── */}
          {activeTab === 'guide' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Big Picture Summary Banner */}
              {lesson?.summary && (
                <div style={{ padding: '16px 20px', borderRadius: 'var(--radius-sm)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    💡 The Big Picture & Real-World Purpose
                  </span>
                  <p style={{ fontSize: '0.92rem', color: '#e0e7ff', lineHeight: 1.6 }}>
                    {lesson.summary}
                  </p>
                </div>
              )}

              {/* Learning Objectives */}
              {Array.isArray(lesson?.learningObjectives) && lesson.learningObjectives.length > 0 && (
                <div className="glass-panel" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🎯 What You Will Be Able to Do
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                    {lesson.learningObjectives.map((obj: string, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                        <span>{obj}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comprehensive Markdown Explanation */}
              {lesson?.explanation && (
                <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    📚 Core Principles & Deep-Dive Mechanics
                  </span>
                  <div
                    style={{ fontSize: '0.92rem', lineHeight: 1.75, color: '#e2e8f0' }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.explanation) }}
                  />
                </div>
              )}

              {/* Concrete Worked Example / Code / Data Breakdown */}
              {lesson?.codeOrExample && (
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      🔬 Concrete Real-World Worked Example
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Walkthrough</span>
                  </div>
                  <div
                    style={{ fontSize: '0.88rem', lineHeight: 1.65 }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.codeOrExample) }}
                  />
                </div>
              )}

              {/* When to Use vs When NOT to Use Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {Array.isArray(lesson?.whenToUse) && lesson.whenToUse.length > 0 && (
                  <div className="glass-panel" style={{ padding: '18px 20px', borderLeft: '3px solid #10b981', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      ✅ When To Apply This
                    </span>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px', listStyleType: 'disc' }}>
                      {lesson.whenToUse.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(lesson?.whenNotToUse) && lesson.whenNotToUse.length > 0 && (
                  <div className="glass-panel" style={{ padding: '18px 20px', borderLeft: '3px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      ⚠️ When NOT To Use / Limitations
                    </span>
                    <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px', listStyleType: 'disc' }}>
                      {lesson.whenNotToUse.map((item: string, idx: number) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Common Pitfalls & Mistakes Beginners Make */}
              {Array.isArray(lesson?.commonMistakes) && lesson.commonMistakes.length > 0 && (
                <div className="glass-panel" style={{ padding: '20px 24px', borderLeft: '3px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🚨 Common Beginner Traps & How to Avoid Them
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {lesson.commonMistakes.map((mistake: string, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.86rem', color: 'var(--color-text-primary)' }}>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>•</span>
                        <span>{mistake}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ready for Challenge Callout */}
              <div style={{ padding: '18px 24px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Finished reading the guide?</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    Check curated multimedia videos or test your understanding with the Socratic Challenge.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('media')}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                  >
                    🎬 Watch Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('challenge')}
                    className="btn btn-primary"
                    style={{ fontSize: '0.8rem', padding: '6px 16px' }}
                  >
                    🧠 Try Challenge →
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ── TAB 2: CURATED VIDEOS & BOOKS ─────────────────────────── */}
          {activeTab === 'media' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ padding: '16px 20px', borderRadius: 'var(--radius-sm)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  🎬 Curated Video Lectures, Books & Deep References
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  A paragraph cannot replace a 10-minute visual animation or an authoritative chapter. Use these hand-picked materials to build deep intuition:
                </p>
              </div>

              {/* Multimedia Recommendations List */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                
                {/* 1. Curated YouTube Video Recommendation */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px', borderLeft: '4px solid #ef4444' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>
                        🎥 VIDEO BREAKDOWN
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>~10-15 mins</span>
                    </div>

                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginTop: '10px' }}>
                      {lesson?.recommendedResources?.[0]?.title || `Top Visual Lecture: ${module.title}`}
                    </h4>

                    <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                      {lesson?.recommendedResources?.[0]?.whyRecommended || 'Clear visual breakdown with step-by-step graphical animations.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(lesson?.recommendedResources?.[0]?.searchQuery || `${topicTitle} ${module.title}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', padding: '8px 12px', background: '#ef4444', borderColor: '#ef4444' }}
                    >
                      ▶ Watch on YouTube ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => handleBookmarkResource(lesson?.recommendedResources?.[0] || { title: `${module.title} Video`, type: 'video' })}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '8px 10px' }}
                      title="Bookmark to Topic Resources"
                    >
                      {savedBookmarkTitles[lesson?.recommendedResources?.[0]?.title || ''] ? '✓ Saved' : '+ Bookmark'}
                    </button>
                  </div>
                </div>

                {/* 2. Authoritative Book & Literature Reference */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px', borderLeft: '4px solid #3b82f6' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 700 }}>
                        📖 BOOK & READING
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Reference Chapter</span>
                    </div>

                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginTop: '10px' }}>
                      {lesson?.recommendedResources?.[1]?.title || `Recommended Textbook: ${topicTitle}`}
                    </h4>

                    <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                      {lesson?.recommendedResources?.[1]?.whyRecommended || 'In-depth textbook chapter covering edge cases, historical context, and mathematical rigor.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(lesson?.recommendedResources?.[1]?.searchQuery || `${topicTitle} ${module.title} textbook chapter guide`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', padding: '8px 12px' }}
                    >
                      🔍 Search Chapter ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => handleBookmarkResource(lesson?.recommendedResources?.[1] || { title: `${module.title} Chapter`, type: 'book' })}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '8px 10px' }}
                      title="Bookmark to Topic Resources"
                    >
                      {savedBookmarkTitles[lesson?.recommendedResources?.[1]?.title || ''] ? '✓ Saved' : '+ Bookmark'}
                    </button>
                  </div>
                </div>

                {/* 3. Official Documentation & Interactive Sandbox */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px', borderLeft: '4px solid #10b981' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>
                        📑 DOCS & CHEAT SHEET
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Quick Reference</span>
                    </div>

                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginTop: '10px' }}>
                      {module.title} Official Documentation & Specs
                    </h4>

                    <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                      The official standards, canonical examples, and syntax cheat sheets to bookmark for regular lookups.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`${module.title} cheat sheet docs syntax examples`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', padding: '8px 12px' }}
                    >
                      📄 Open Docs Search ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => handleBookmarkResource({ title: `${module.title} Docs`, type: 'article', searchQuery: `${module.title} docs` })}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '8px 10px' }}
                      title="Bookmark to Topic Resources"
                    >
                      {savedBookmarkTitles[`${module.title} Docs`] ? '✓ Saved' : '+ Bookmark'}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ── TAB 3: SOCRATIC CHALLENGE ─────────────────────────────── */}
          {activeTab === 'challenge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--color-primary)' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  🧠 The Socratic Mentor Challenge
                </span>

                {/* Scenario / Dilemma */}
                <div style={{ fontSize: '0.92rem', color: '#e0e7ff', lineHeight: 1.6, background: 'rgba(0,0,0,0.25)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <strong>Scenario:</strong> {lesson?.socraticChallenge?.scenario || `You are working on a real project involving ${module.title}. An edge case arises where applying the naive approach causes inconsistent results.`}
                </div>

                {/* Question */}
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>
                  {lesson?.socraticChallenge?.question || `How would you solve or diagnose this situation using ${module.title}? Explain your reasoning step-by-step.`}
                </div>

                {/* Student's Answer Textarea */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    Your Solution & Reasoning:
                  </label>
                  <textarea
                    className="form-input"
                    rows={4}
                    style={{ width: '100%', fontSize: '0.88rem', lineHeight: 1.5, background: 'rgba(0,0,0,0.3)', resize: 'vertical' }}
                    placeholder="Write your explanation or step-by-step solution here..."
                    value={challengeAnswer}
                    onChange={(e) => setChallengeAnswer(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleEvaluateChallenge}
                    disabled={evaluating || challengeAnswer.trim().length < 10}
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: '0.84rem' }}
                  >
                    {evaluating ? '🤖 AI Mentor is Evaluating...' : '🚀 Submit Answer to AI Mentor'}
                  </button>
                </div>
              </div>

              {/* AI Mentor Feedback Card */}
              {evaluation && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '22px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    borderLeft: `4px solid ${evaluation.verdict ? VERDICT_STYLE[evaluation.verdict].color : 'var(--color-text-muted)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.1rem' }}>💡</span>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                      {evaluation.fallback ? 'No AI feedback this time' : 'Mentor feedback'}
                    </h4>
                    {evaluation.verdict && (
                      <span
                        className="rounded px-2 py-0.5 text-[0.72rem] font-bold"
                        style={{ color: VERDICT_STYLE[evaluation.verdict].color, background: VERDICT_STYLE[evaluation.verdict].bg }}
                      >
                        {VERDICT_STYLE[evaluation.verdict].label}
                      </span>
                    )}
                    {evaluation.verdict && <span className="text-[0.72rem] text-fg-muted">saved to this module&apos;s record</span>}
                  </div>

                  {evaluation.captured && (
                    <div style={{ fontSize: '0.88rem', color: '#10b981', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span>✅</span>
                      <span><strong>What you nailed:</strong> {evaluation.captured}</span>
                    </div>
                  )}

                  {evaluation.missed && (
                    <div style={{ fontSize: '0.88rem', color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span>🔍</span>
                      <span><strong>Nuance to consider:</strong> {evaluation.missed}</span>
                    </div>
                  )}

                  {evaluation.tip && (
                    <div style={{ fontSize: '0.88rem', color: 'var(--color-primary-light)', display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(99,102,241,0.1)', padding: '10px 14px', borderRadius: '6px' }}>
                      <span>📌</span>
                      <span><strong>{evaluation.fallback ? 'Note' : 'Remember'}:</strong> {evaluation.tip}</span>
                    </div>
                  )}

                  {evaluation.followUp && (
                    <div className="flex flex-col gap-2 rounded-md border border-line bg-black/20 px-3.5 py-3 text-[0.86rem]">
                      <span className="text-[0.72rem] font-bold uppercase tracking-wide text-fg-secondary">Go one step further</span>
                      <span className="text-fg">{evaluation.followUp}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = evaluation.followUp;
                          setChallengeAnswer('');
                          setEvaluation(null);
                          if (lesson) setLesson({ ...lesson, socraticChallenge: { ...lesson.socraticChallenge, question: next } });
                        }}
                        className="btn btn-secondary self-start px-3 py-1 text-[0.78rem]"
                      >
                        Answer this next
                      </button>
                    </div>
                  )}

                  {/* Ideal Model Answer Toggle */}
                  {lesson?.socraticChallenge?.idealAnswer && (
                    <details style={{ marginTop: '6px', fontSize: '0.84rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                      <summary style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>View Mentor&apos;s Model Solution</summary>
                      <div style={{ marginTop: '8px', padding: '12px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', lineHeight: 1.6, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                        {lesson.socraticChallenge.idealAnswer}
                      </div>
                    </details>
                  )}
                </div>
              )}

            </div>
          )}

          {/* ── TAB 4: SELF-CHECK QUIZ ─────────────────────────────────── */}
          {activeTab === 'quiz' && Array.isArray(lesson?.quiz) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '14px 18px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>Diagnostic Concept Check</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Test your grasp of the mechanics before moving on to the next module.
                </p>
              </div>

              {lesson.quiz.map((q: any, qIdx: number) => {
                const selected = quizSelections[qIdx];
                const isCorrect = selected === q.correctIndex;
                return (
                  <div key={qIdx} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff' }}>
                      {qIdx + 1}. {q.question}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {q.options.map((opt: string, optIdx: number) => {
                        const isChosen = selected === optIdx;
                        let optStyle: React.CSSProperties = {
                          padding: '10px 14px',
                          borderRadius: '6px',
                          fontSize: '0.84rem',
                          textAlign: 'left',
                          background: isChosen ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.02)',
                          border: isChosen ? '1px solid var(--color-primary-light)' : '1px solid rgba(255,255,255,0.06)',
                          color: isChosen ? '#fff' : 'var(--color-text-primary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        };

                        if (quizSubmitted) {
                          if (optIdx === q.correctIndex) {
                            optStyle.border = '1px solid #10b981';
                            optStyle.background = 'rgba(16,185,129,0.15)';
                            optStyle.color = '#10b981';
                          } else if (isChosen && !isCorrect) {
                            optStyle.border = '1px solid #ef4444';
                            optStyle.background = 'rgba(239,68,68,0.15)';
                            optStyle.color = '#ef4444';
                          }
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => {
                              if (!quizSubmitted) {
                                setQuizSelections((prev) => ({ ...prev, [qIdx]: optIdx }));
                              }
                            }}
                            style={optStyle}
                          >
                            {String.fromCharCode(65 + optIdx)}. {opt}
                          </button>
                        );
                      })}
                    </div>

                    {quizSubmitted && q.explanation && (
                      <div style={{ fontSize: '0.8rem', color: isCorrect ? '#10b981' : '#f59e0b', background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', marginTop: '4px' }}>
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCheckQuiz}
                  disabled={quizSubmitted || Object.keys(quizSelections).length < lesson.quiz.length}
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '0.84rem' }}
                >
                  {quizSubmitted ? '✓ Quiz Checked' : 'Check Answers'}
                </button>
                {quizSubmitted && (
                  <button
                    type="button"
                    onClick={() => { setQuizSelections({}); setQuizSubmitted(false); setQuizResult(null); }}
                    className="btn btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                  >
                    Retake
                  </button>
                )}
                {quizResult && <span className="text-[0.82rem] text-fg-secondary">{quizResult}</span>}
              </div>
            </div>
          )}

          {/* ── PROBLEM LOG: can you solve it cold, not just recall it ─── */}
          <ProblemLog topicId={topicId} moduleId={module.id} onChanged={onEvidenceChanged} />

          {/* ── INTEGRATED RICH-TEXT LESSON NOTES (Always Present) ──────── */}
          <div className="glass-panel flex flex-col gap-3 px-6 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="m-0 text-base font-bold text-fg">Your notes on this module</h3>
              <span className="text-[0.72rem] text-fg-muted">Saved as you type · shown again with this module’s review cards</span>
            </div>

            {/* Keyed by module: the editor captures its save callback when
                it's created, so a save still pending after you switch
                modules lands on the module you typed it in. */}
            <RichTextEditor
              key={module.id}
              content={module.notes || ''}
              onChange={(html) => saveModuleNotes(module.id, html)}
              placeholder={`Explain ${module.title} back in your own words: the key idea, a formula, an example, where it breaks.`}
              minHeight={160}
            />

            {notes && notes.replace(/<[^>]*>/g, '').trim() && (
              <details className="text-[0.8rem] text-fg-secondary">
                <summary className="cursor-pointer font-semibold">Topic notebook (notes from before per-module notes)</summary>
                <div className="mt-2">
                  <RichTextEditor content={notes} onChange={onSaveNotes} placeholder="" minHeight={100} />
                </div>
              </details>
            )}
          </div>
        </>
      )}

    </div>
  );
}
