'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ToastProvider';

interface Concept {
  id: string;
  title: string;
  status: string;
  parentId: string | null;
  difficulty: 'Low' | 'Medium' | 'High';
  importance: 'Low' | 'Medium' | 'High';
}

interface SocraticCoachProps {
  concept: Concept;
  topicId: string;
  onSaveProgress: (conceptId: string, success: boolean, mistakeText?: string, whyMade?: string, howToAvoid?: string) => Promise<void>;
  explanationsRead: number;
  onIncrementExplanationsRead: () => void;
  onResetExplanationsRead: () => void;
}

export default function SocraticCoach({
  concept,
  topicId,
  topicTitle,
  onSaveProgress,
  explanationsRead,
  onIncrementExplanationsRead,
  onResetExplanationsRead,
}: SocraticCoachProps & { topicTitle?: string }) {
  const toast = useToast();
  // Tutor Stages: 'explain' | 'demonstrate' | 'connect' | 'question' | 'retrieve' | 'apply' | 'correct'
  const [stage, setStage] = useState<'explain' | 'demonstrate' | 'connect' | 'question' | 'retrieve' | 'apply' | 'correct'>('explain');
  
  const handleCopyText = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} to clipboard`, 'Copied!');
    }
  };

  // Student inputs
  const [retrievalInput, setRetrievalInput] = useState('');
  const [applyInput, setApplyInput] = useState('');
  
  // Self assessment & Mistake Logger
  const [selfAssessment, setSelfAssessment] = useState<'correct' | 'partial' | 'wrong'>('correct');
  const [mistakeText, setMistakeText] = useState('');
  const [whyMade, setWhyMade] = useState('');
  const [howToAvoid, setHowToAvoid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamic AI content & loading
  const [aiTemplate, setAiTemplate] = useState<{
    explain: string;
    demonstrate: string;
    connect: string;
    question: string;
    apply: string;
    idealAnswer: string;
    isAi?: boolean;
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState(true);

  // Editable concept title state
  const [displayConceptTitle, setDisplayConceptTitle] = useState(concept.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitleInput, setEditedTitleInput] = useState(concept.title);

  // AI Evaluation Feedback
  const [aiEval, setAiEval] = useState<{ captured?: string; missed?: string; tip?: string } | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);

  // Generic offline template, used only when the AI call fails
  const getDynamicFallback = (cTitle: string): NonNullable<typeof aiTemplate> => {
    const topicName = topicTitle || 'your subject';
    return {
      explain: `Let's break down "${cTitle}" within ${topicName}.\n\n"${cTitle}" represents a core mechanism that controls data flow, execution rules, or architectural decisions. Mastering this ensures your implementations in ${topicName} remain predictable, scalable, and resilient.`,
      demonstrate: `Consider a real-world scenario of "${cTitle}" in ${topicName}. Under high concurrency or stress, without "${cTitle}", the system encounters latency drift or failure states. Applying it maintains system integrity and consistency.`,
      connect: `Connect "${cTitle}" to your foundational prerequisites in ${topicName}. Understanding how this component operates enables you to design modular, production-ready solutions.`,
      question: `What is the primary objective of "${cTitle}" in ${topicName}, and how does it prevent failure?`,
      apply: `Imagine you are reviewing a production system using ${topicName} that experiences errors with "${cTitle}". Detail your step-by-step approach to diagnose and fix it.`,
      idealAnswer: `An ideal solution includes:\n1. Isolating the component boundary\n2. Verifying configuration parameters\n3. Applying error logging and validation tests.`,
    };
  };

  const template = aiTemplate || getDynamicFallback(displayConceptTitle);

  // Fetch AI content on concept change or manual title update
  const fetchSocraticData = (targetTitle: string) => {
    setStage('explain');
    setRetrievalInput('');
    setApplyInput('');
    setMistakeText('');
    setWhyMade('');
    setHowToAvoid('');
    setAiEval(null);
    onIncrementExplanationsRead();
    setLoadingAi(true);

    fetch('/api/socratic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate',
        conceptTitle: targetTitle,
        topicTitle: topicTitle || '',
      }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.explain && data.idealAnswer) {
          setAiTemplate(data);
        } else {
          setAiTemplate(getDynamicFallback(targetTitle));
        }
        setLoadingAi(false);
      })
      .catch(err => {
        console.error('Socratic AI fetch error:', err);
        setAiTemplate(getDynamicFallback(targetTitle));
        setLoadingAi(false);
      });
  };

  useEffect(() => {
    setDisplayConceptTitle(concept.title);
    setEditedTitleInput(concept.title);
    fetchSocraticData(concept.title);
  }, [concept.id, concept.title]);

  const [stageError, setStageError] = useState<string | null>(null);

  const handleNextStage = () => {
    setStageError(null);
    if (stage === 'explain') setStage('demonstrate');
    else if (stage === 'demonstrate') setStage('connect');
    else if (stage === 'connect') setStage('question');
    else if (stage === 'question') setStage('retrieve');
  };

  const submitRetrieval = () => {
    setStageError(null);
    if (retrievalInput.trim().length < 15) {
      setStageError('Retrieval requires effort! Please write a more detailed explanation from memory (at least 15 characters).');
      return;
    }
    onResetExplanationsRead();
    setStage('apply');
  };

  const submitApply = async () => {
    setStageError(null);
    if (applyInput.trim().length < 15) {
      setStageError('Please write out your solution proposal before viewing the evaluation (at least 15 characters).');
      return;
    }
    setStage('correct');

    // Trigger AI evaluation if available
    setLoadingEval(true);
    try {
      const res = await fetch('/api/socratic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          conceptTitle: concept.title,
          topicTitle: topicTitle || '',
          userRecall: `${retrievalInput}\n\nSolution Attempt:\n${applyInput}`,
          idealAnswer: template.idealAnswer,
        }),
      });
      if (res.ok) {
        const evalData = await res.json();
        setAiEval(evalData);
      }
    } catch (e) {
      console.error('AI Eval error:', e);
    } finally {
      setLoadingEval(false);
    }
  };

  const handleSaveAssessment = async () => {
    setStageError(null);
    setSubmitting(true);
    try {
      const isSuccess = selfAssessment === 'correct' || selfAssessment === 'partial';
      await onSaveProgress(
        concept.id,
        isSuccess,
        selfAssessment === 'wrong' || mistakeText ? mistakeText || `Incorrect understanding of ${concept.title}` : undefined,
        whyMade,
        howToAvoid
      );
      
      setStage('explain');
      setRetrievalInput('');
      setApplyInput('');
      setMistakeText('');
      setWhyMade('');
      setHowToAvoid('');
    } catch (e) {
      console.error(e);
      setStageError('Connection error logging assessment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Retrieval Guard overlay block
  if (explanationsRead >= 3) {
    return (
      <div className="glass-panel" style={{ padding: '32px', borderLeft: '4px solid var(--color-danger)', background: 'rgba(239, 68, 68, 0.03)' }}>
        <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '16px' }}>🚨</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-danger)', textAlign: 'center', marginBottom: '8px' }}>
          Fake Progress Warning (Retrieval Guard)
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
          You have read explanations for <strong>{explanationsRead}</strong> concepts in a row without testing your memory. Learning science shows that consumption without retrieval leads to immediate forgetting.
        </p>

        {stageError && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.8rem', marginBottom: '16px' }}>
            ⚠️ {stageError}
          </div>
        )}

        <div className="form-group">
          <label className="form-label" style={{ color: 'var(--color-danger)' }}>
            FREE RECALL CHALLENGE: Summarize "{concept.title}" from memory now to unlock the workspace.
          </label>
          <textarea
            className="form-input"
            style={{ width: '100%', height: '120px', resize: 'none', background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace' }}
            placeholder="Type what you remember about this concept from memory. No looking back!"
            value={retrievalInput}
            onChange={(e) => setRetrievalInput(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (retrievalInput.trim().length < 20) {
              setStageError('Please write a genuine recall summary (at least 20 characters) to unlock.');
              return;
            }
            onResetExplanationsRead();
            setStage('explain');
            setRetrievalInput('');
          }}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '12px' }}
        >
          🔑 Submit Active Recall & Unlock Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Concept Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flexGrow: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              🧠 AI Socratic Coach ➔ Study Concept:
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: template.isAi ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                border: template.isAi ? '1px solid #10b981' : '1px solid var(--color-primary-light)',
                color: template.isAi ? '#10b981' : 'var(--color-primary-light)',
                fontWeight: 600,
              }}
            >
              {template.isAi ? '✨ Live LLM Tutor' : '⚠️ Offline template — AI unavailable'}
            </span>
          </div>

          {!isEditingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>{displayConceptTitle}</h3>
              <button
                type="button"
                onClick={() => { setIsEditingTitle(true); setEditedTitleInput(displayConceptTitle); }}
                style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                title="Edit concept title to customize tutoring"
              >
                ✎ Rename Concept
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editedTitleInput.trim()) {
                  setDisplayConceptTitle(editedTitleInput.trim());
                  setIsEditingTitle(false);
                  fetchSocraticData(editedTitleInput.trim());
                }
              }}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}
            >
              <input
                type="text"
                className="form-input"
                value={editedTitleInput}
                onChange={(e) => setEditedTitleInput(e.target.value)}
                style={{ fontSize: '0.9rem', padding: '6px 12px', width: '260px' }}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                Save & Tutor
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      {stageError && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '0.8rem' }}>
          ⚠️ {stageError}
        </div>
      )}

      {/* Stage Progress + Instruction Header */}
      {(() => {
        const stages = [
          { key: 'explain', step: 1, instruction: '📖 Read this explanation carefully. Take your time.' },
          { key: 'demonstrate', step: 2, instruction: '🔍 Study this real-world example to see the concept in action.' },
          { key: 'connect', step: 3, instruction: '🔗 Read how this connects to what you already know.' },
          { key: 'question', step: 4, instruction: '🤔 Think about the question below. Formulate your answer mentally before moving on.' },
          { key: 'retrieve', step: 5, instruction: '✍️ Now write what you remember — without looking back. This is the learning.' },
          { key: 'apply', step: 6, instruction: '🛠️ Apply what you learned. Write your solution to the real-world problem below.' },
          { key: 'correct', step: 7, instruction: '✅ Compare your answer with the ideal. Honestly assess how you did.' },
        ];
        const current = stages.find(s => s.key === stage);
        if (!current) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Progress bar */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {stages.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStage(s.key as any)}
                  title={s.instruction}
                  style={{
                    height: '4px',
                    flex: 1,
                    borderRadius: '2px',
                    background: s.step <= current.step ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                />
              ))}
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', paddingLeft: '8px' }}>
                {current.step} / {stages.length}
              </span>
            </div>
            {/* Instruction label */}
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontSize: '0.82rem',
              color: '#c7d2fe',
              fontWeight: 500,
            }}>
              {current.instruction}
            </div>
          </div>
        );
      })()}

      {/* Stage Content Renderer */}
      {loadingAi ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-primary-light)', fontSize: '0.88rem' }}>
          ✨ Generating tailored Socratic tutoring module for "{displayConceptTitle}"...
        </div>
      ) : (
        <div style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
          
          {stage === 'explain' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Stage 1: Core Concept Breakdown
              </span>
              <div style={{ fontSize: '0.9rem', lineHeight: '1.65', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
                {template.explain}
              </div>
            </div>
          )}

          {stage === 'demonstrate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Stage 2: Real-World Demonstration & Scenario
              </span>
              <div style={{ fontSize: '0.9rem', lineHeight: '1.65', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
                {template.demonstrate}
              </div>
            </div>
          )}

          {stage === 'connect' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Stage 3: Conceptual Connections & Mental Models
              </span>
              <div style={{ fontSize: '0.9rem', lineHeight: '1.65', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
                {template.connect}
              </div>
            </div>
          )}

        {stage === 'question' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
              {template.question}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Take a moment to formulate your answer mentally, then proceed to the active recall check.
            </p>
          </div>
        )}

        {stage === 'retrieve' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label" style={{ color: 'var(--color-accent)' }}>
              ACTIVE RECALL: Type your explanation from memory (no referencing back!)
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '110px', resize: 'none', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
              placeholder="What did you just learn? Summarize the concept rules in your own words..."
              value={retrievalInput}
              onChange={(e) => setRetrievalInput(e.target.value)}
            />
            <button onClick={submitRetrieval} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Submit Recall Check →
            </button>
          </div>
        )}

        {stage === 'apply' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label" style={{ color: 'var(--color-secondary-light)' }}>
              APPLICATION CHALLENGE
            </label>
            <p style={{ fontSize: '0.9rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
              {template.apply}
            </p>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '100px', resize: 'none', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
              placeholder="Type your design solution or code draft..."
              value={applyInput}
              onChange={(e) => setApplyInput(e.target.value)}
            />
            <button onClick={submitApply} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Submit Solution →
            </button>
          </div>
        )}

        {stage === 'correct' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* AI Evaluation feedback card */}
            {loadingEval ? (
              <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.82rem', color: 'var(--color-primary-light)' }}>
                ✨ Groq AI is analyzing your response and comparing with ideal model...
              </div>
            ) : aiEval && (
              <div style={{ padding: '16px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.25)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🤖</span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--color-primary-light)' }}>Groq AI Socratic Evaluation</strong>
                </div>
                {aiEval.captured && (
                  <div style={{ fontSize: '0.8rem', color: '#10b981' }}>
                    <strong>✅ What you captured:</strong> {aiEval.captured}
                  </div>
                )}
                {aiEval.missed && (
                  <div style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
                    <strong>⚠️ What to improve:</strong> {aiEval.missed}
                  </div>
                )}
                {aiEval.tip && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                    <strong>💡 Key Tip:</strong> "{aiEval.tip}"
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span className="form-label">YOUR DRAFT SOLUTION</span>
                <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: 'var(--radius-sm)', minHeight: '80px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {applyInput}
                </div>
              </div>
              <div>
                <span className="form-label" style={{ color: 'var(--color-success)' }}>IDEAL ANALYSIS / COMPARISON</span>
                <div style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: 'var(--radius-sm)', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                  {template.idealAnswer}
                </div>
              </div>
            </div>

            {/* Self-Assessment Check */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>SELF-ASSESSMENT: HOW DID YOU DO?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('correct')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'correct' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'correct' ? '1px solid var(--color-success)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'correct' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                  }}
                >
                  🎯 Nailed It
                </button>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('partial')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'partial' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'partial' ? '1px solid var(--color-warning)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'partial' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                  }}
                >
                  ⚠️ Partial Gap
                </button>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('wrong')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'wrong' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'wrong' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'wrong' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                  }}
                >
                  ❌ Made Mistake
                </button>
              </div>
            </div>

            {/* Mistake Bank Logger Inline */}
            {(selfAssessment === 'wrong' || selfAssessment === 'partial') && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(239,68,68,0.02)' }}>
                <span className="form-label" style={{ color: 'var(--color-danger)', marginBottom: 0 }}>LOG TO MISTAKE BANK</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Describe your mistake..."
                  value={mistakeText}
                  onChange={(e) => setMistakeText(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Why did you make it? (Cognitive bias/forgetfulness...)"
                    value={whyMade}
                    onChange={(e) => setWhyMade(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="How to avoid in the future?"
                    value={howToAvoid}
                    onChange={(e) => setHowToAvoid(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveAssessment}
              disabled={submitting}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-end' }}
            >
              {submitting ? 'Saving Assessment...' : '💾 Finalize Socratic Step'}
            </button>
          </div>
        )}

      </div>
      )}

      {/* Footer Nav Controls */}
      {stage !== 'retrieve' && stage !== 'apply' && stage !== 'correct' && (
        <button
          onClick={handleNextStage}
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-end', padding: '8px 16px', fontSize: '0.8rem', border: '1px solid var(--color-primary-light)', color: 'var(--color-primary-light)' }}
        >
          Next Step ➔
        </button>
      )}

    </div>
  );
}
