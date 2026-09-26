'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CourseModule, ModuleEvidence } from './page';
import { renderMarkdown } from '@/lib/markdown';
import RichTextEditor from './RichTextEditor';
import { Icon, KnowledgeMark } from '@/components/ui';
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
  correct: { label: 'Correct', color: 'var(--color-success)', bg: 'var(--success-tint)' },
  partial: { label: 'Partly there', color: 'var(--color-warning)', bg: 'var(--warning-tint)' },
  incorrect: { label: 'Not yet', color: 'var(--color-danger)', bg: 'var(--danger-tint)' },
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

  const quiz: any[] = Array.isArray(lesson?.quiz) ? lesson.quiz : [];
  const sources: any[] = Array.isArray(lesson?.recommendedResources) ? lesson.recommendedResources : [];
  const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
  const objectives = listOf(lesson?.learningObjectives);
  const useWhen = listOf(lesson?.whenToUse);
  const avoidWhen = listOf(lesson?.whenNotToUse);
  const pitfalls = listOf(lesson?.commonMistakes);
  const checkTab: 'quiz' | 'challenge' = quiz.length ? 'quiz' : 'challenge';

  const STEPS: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'guide', label: 'Read' },
    ...(quiz.length ? [{ key: 'quiz' as const, label: 'Check' }] : []),
    { key: 'challenge', label: 'Explain it back' },
    { key: 'media', label: 'Go deeper' },
  ];

  const sourceHref = (r: any) =>
    r?.url && /^https?:\/\//i.test(r.url)
      ? r.url
      : r?.type === 'video'
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(r?.searchQuery || `${topicTitle} ${module.title}`)}`
        : `https://www.google.com/search?q=${encodeURIComponent(r?.searchQuery || `${topicTitle} ${module.title} ${r?.type || ''}`)}`;
  const sourceKind = (t: string | undefined) =>
    t === 'video' ? 'Video' : t === 'book' ? 'Book' : t === 'course' ? 'Course' : t === 'paper' ? 'Paper' : t === 'docs' ? 'Docs' : 'Article';

  return (
    <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      <article className="flex min-w-0 max-w-[720px] flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Steps in this module" className="flex flex-wrap gap-1.5">
            {STEPS.map((step, i) => {
              const on = activeTab === step.key;
              return (
                <button
                  key={step.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActiveTab(step.key)}
                  className={`flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[0.875rem] font-semibold ${on ? 'bg-ink text-on-ink' : 'text-fg-secondary hover:bg-fill-2 hover:text-fg'}`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.75rem] ${on ? 'bg-on-ink text-ink' : 'bg-sunk text-fg-secondary'}`}>{i + 1}</span>
                  {step.label}
                </button>
              );
            })}
          </div>
          {activeTab === 'guide' && !loadingLesson && (
            <button type="button" onClick={() => setActiveTab(checkTab)} className="text-[0.875rem] font-medium text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
              Already know this? Skip to the check
            </button>
          )}
        </div>

        <header className="flex flex-col gap-3">
          <div className="text-[0.9rem] text-fg-muted">Module {module.order} · about {module.estimatedMinutes} min</div>
          <h2 className="m-0 font-serif text-[2.75rem] font-medium leading-[1.08] tracking-[-0.02em]">{module.title}</h2>
          {evidence?.state && (
            <div className="flex flex-wrap items-center gap-2 text-[0.875rem] text-fg-secondary">
              <KnowledgeMark state={evidence.state} showLabel />
              {evidence.reason && <span>— {evidence.reason}</span>}
            </div>
          )}
          {lesson?.summary && !loadingLesson && (
            <p className="m-0 font-serif text-[1.35rem] italic leading-relaxed text-fg-secondary">{lesson.summary}</p>
          )}
        </header>

        {loadingLesson ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <p className="m-0 text-[0.95rem] text-fg-secondary">Writing this lesson for you — the first time takes a few seconds.</p>
            {[92, 100, 84, 96, 70].map((w, i) => <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />)}
          </div>
        ) : !lesson ? (
          <div className="flex flex-col items-start gap-3 rounded-xl bg-sunk p-5">
            <p className="m-0 text-[1rem] text-fg-secondary">Couldn’t load this lesson.</p>
            <button type="button" onClick={() => loadLesson(false)} className="btn btn-secondary">Try again</button>
          </div>
        ) : (
          <>
            {activeTab === 'guide' && (
              <div className="flex flex-col gap-9">
                {objectives.length > 0 && (
                  <section aria-labelledby="obj-h" className="flex flex-col gap-3">
                    <h3 id="obj-h" className="m-0 text-[1.05rem] font-semibold">By the end, you’ll be able to</h3>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {objectives.map((o, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[1rem] leading-relaxed">
                          <Icon name="check" size={16} strokeWidth={2.2} className="mt-1 shrink-0 text-fg-muted" />
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {lesson.explanation && (
                  <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.explanation) }} />
                )}

                {lesson.codeOrExample && (
                  <section aria-labelledby="ex-h" className="flex flex-col gap-3">
                    <h3 id="ex-h" className="m-0 text-[1.15rem] font-semibold">A worked example</h3>
                    <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.codeOrExample) }} />
                  </section>
                )}

                {(useWhen.length > 0 || avoidWhen.length > 0) && (
                  <div className="grid gap-8 sm:grid-cols-2">
                    {useWhen.length > 0 && (
                      <section className="flex flex-col gap-2.5">
                        <h3 className="m-0 text-[1.05rem] font-semibold">Use it when</h3>
                        <ul className="m-0 flex flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
                          {useWhen.map((x, i) => <li key={i} className="list-disc">{x}</li>)}
                        </ul>
                      </section>
                    )}
                    {avoidWhen.length > 0 && (
                      <section className="flex flex-col gap-2.5">
                        <h3 className="m-0 text-[1.05rem] font-semibold">Where it breaks</h3>
                        <ul className="m-0 flex flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
                          {avoidWhen.map((x, i) => <li key={i} className="list-disc">{x}</li>)}
                        </ul>
                      </section>
                    )}
                  </div>
                )}

                {pitfalls.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <h3 className="m-0 text-[1.05rem] font-semibold">Where people go wrong</h3>
                    <ul className="m-0 flex flex-col gap-2 pl-5 text-[1rem] leading-relaxed">
                      {pitfalls.map((x, i) => <li key={i} className="list-disc">{x}</li>)}
                    </ul>
                  </section>
                )}

                <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
                  <button type="button" onClick={() => setActiveTab(checkTab)} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
                    Check yourself <Icon name="arrowRight" size={16} />
                  </button>
                  <span className="text-[0.9rem] text-fg-muted">Recalling it now is what makes it stay.</span>
                </div>
              </div>
            )}

            {activeTab === 'quiz' && quiz.length > 0 && (
              <section aria-labelledby="quiz-h" className="flex flex-col gap-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="quiz-h" className="m-0 text-[1.2rem] font-semibold">Check yourself</h3>
                  <span className="text-[0.9rem] text-fg-muted">{quiz.length} question{quiz.length === 1 ? '' : 's'} · misses become review cards</span>
                </div>
                {quiz.map((q: any, qIdx: number) => {
                  const selected = quizSelections[qIdx];
                  return (
                    <fieldset key={qIdx} className="m-0 flex flex-col gap-2.5 border-0 p-0">
                      <legend className="mb-3 p-0 text-[1.05rem] font-semibold leading-snug">
                        <span className="mr-2 text-fg-muted">{qIdx + 1}.</span>{q.question}
                      </legend>
                      {q.options.map((opt: string, optIdx: number) => {
                        const chosen = selected === optIdx;
                        const right = quizSubmitted && optIdx === q.correctIndex;
                        const wrong = quizSubmitted && chosen && optIdx !== q.correctIndex;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            aria-pressed={chosen}
                            disabled={quizSubmitted}
                            onClick={() => setQuizSelections((prev) => ({ ...prev, [qIdx]: optIdx }))}
                            className={`flex min-h-[52px] items-center gap-3.5 rounded-xl border-[1.5px] px-4 py-2.5 text-left text-[1rem] disabled:cursor-default ${
                              right ? 'border-k-solid bg-surface' : wrong ? 'border-danger bg-surface' : chosen ? 'border-ink bg-surface' : 'border-line bg-surface hover:border-line-hover'
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sunk text-[0.8rem] font-semibold">
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {right && <span className="text-[0.8rem] font-semibold text-k-solid">Correct</span>}
                            {wrong && <span className="text-[0.8rem] font-semibold text-danger">Your answer</span>}
                          </button>
                        );
                      })}
                      {quizSubmitted && q.explanation && (
                        <p className="m-0 mt-1 rounded-lg bg-sunk px-4 py-3 text-[0.95rem] leading-relaxed text-fg-secondary">{q.explanation}</p>
                      )}
                    </fieldset>
                  );
                })}
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
                  <button
                    type="button"
                    onClick={handleCheckQuiz}
                    disabled={quizSubmitted || Object.keys(quizSelections).length < quiz.length}
                    className="btn btn-primary h-12 px-6 py-0 text-[1rem]"
                  >
                    {quizSubmitted ? 'Checked' : 'Check answers'}
                  </button>
                  {quizSubmitted && (
                    <button type="button" onClick={() => { setQuizSelections({}); setQuizSubmitted(false); setQuizResult(null); }} className="btn btn-secondary h-12 py-0">
                      Retake
                    </button>
                  )}
                  {quizResult ? (
                    <span className="text-[0.95rem] text-fg-secondary" role="status">{quizResult}</span>
                  ) : (
                    <span className="text-[0.875rem] text-fg-muted">Answer all {quiz.length} to check.</span>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'challenge' && (
              <section aria-labelledby="ch-h" className="flex flex-col gap-6">
                <h3 id="ch-h" className="m-0 text-[1.2rem] font-semibold">Explain it back</h3>
                <div className="rounded-xl bg-sunk px-5 py-4 text-[1rem] leading-relaxed">
                  <span className="mb-1 block text-[0.8rem] font-semibold text-fg-muted">The situation</span>
                  {lesson?.socraticChallenge?.scenario || `You’re using ${module.title} on real work, and the obvious approach gives the wrong result.`}
                </div>
                <p className="m-0 font-serif text-[1.45rem] leading-snug">
                  {lesson?.socraticChallenge?.question || `How would you handle it with ${module.title}? Walk through your reasoning.`}
                </p>
                <div className="flex flex-col gap-2.5">
                  <label htmlFor="challenge-answer" className="text-[0.95rem] font-semibold text-fg-secondary">Your answer, in your own words</label>
                  <textarea
                    id="challenge-answer"
                    rows={6}
                    className="form-input resize-y text-[1.05rem] leading-relaxed"
                    placeholder="Explain it as if to a colleague. Aim for why, not just what."
                    value={challengeAnswer}
                    onChange={(e) => setChallengeAnswer(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleEvaluateChallenge}
                      disabled={evaluating || challengeAnswer.trim().length < 10}
                      className="btn btn-primary h-12 px-6 py-0 text-[1rem]"
                    >
                      {evaluating ? 'Reading your answer…' : 'Get feedback'}
                    </button>
                    <span className="text-[0.875rem] text-fg-muted">A clear verdict is saved to this module’s record.</span>
                  </div>
                </div>

                {evaluation && (
                  <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6" role="status">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h4 className="m-0 text-[1.05rem] font-semibold">{evaluation.fallback ? 'No AI feedback this time' : 'Feedback'}</h4>
                      {evaluation.verdict && (
                        <span className="rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold" style={{ color: VERDICT_STYLE[evaluation.verdict].color, background: VERDICT_STYLE[evaluation.verdict].bg }}>
                          {VERDICT_STYLE[evaluation.verdict].label}
                        </span>
                      )}
                    </div>
                    {evaluation.captured && (
                      <div className="text-[1rem] leading-relaxed"><span className="font-semibold">What you got: </span>{evaluation.captured}</div>
                    )}
                    {evaluation.missed && (
                      <div className="text-[1rem] leading-relaxed"><span className="font-semibold">What’s missing: </span>{evaluation.missed}</div>
                    )}
                    {evaluation.tip && (
                      <div className="text-[1rem] leading-relaxed text-fg-secondary">
                        <span className="font-semibold text-fg">{evaluation.fallback ? 'Note: ' : 'Remember: '}</span>{evaluation.tip}
                      </div>
                    )}
                    {evaluation.followUp && (
                      <div className="flex flex-col gap-2.5 rounded-lg bg-sunk px-4 py-3.5">
                        <span className="text-[0.8rem] font-semibold text-fg-muted">Go one step further</span>
                        <span className="text-[1rem]">{evaluation.followUp}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = evaluation.followUp;
                            setChallengeAnswer('');
                            setEvaluation(null);
                            if (lesson) setLesson({ ...lesson, socraticChallenge: { ...lesson.socraticChallenge, question: next } });
                          }}
                          className="btn btn-secondary h-10 self-start py-0"
                        >
                          Answer this next
                        </button>
                      </div>
                    )}
                    {lesson?.socraticChallenge?.idealAnswer && (
                      <details className="text-[0.95rem]">
                        <summary className="cursor-pointer font-semibold text-fg-secondary">See a model answer</summary>
                        <p className="m-0 mt-2 whitespace-pre-wrap font-serif text-[1.1rem] leading-relaxed">{lesson.socraticChallenge.idealAnswer}</p>
                      </details>
                    )}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'media' && (
              <section aria-labelledby="deeper-h" className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <h3 id="deeper-h" className="m-0 text-[1.2rem] font-semibold">Go deeper</h3>
                  <p className="m-0 text-[0.95rem] text-fg-secondary">A video or a chapter builds intuition a page can’t. Save what you use to this topic’s sources.</p>
                </div>
                <ul className="m-0 flex list-none flex-col p-0">
                  {[...sources, { title: `${module.title}: official docs and cheat sheets`, type: 'docs', searchQuery: `${module.title} documentation cheat sheet`, whyRecommended: 'The canonical reference, for looking things up later.' }].map((r: any, i: number) => {
                    const saved = !!savedBookmarkTitles[r.title];
                    return (
                      <li key={i} className="flex flex-wrap items-start gap-4 border-b border-line py-4 last:border-b-0">
                        <span className="w-16 shrink-0 pt-0.5 text-[0.8rem] font-semibold text-fg-muted">{sourceKind(r.type)}</span>
                        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                          <a href={sourceHref(r)} target="_blank" rel="noopener noreferrer" className="text-[1.02rem] font-semibold text-fg">
                            {r.title} <Icon name="arrowRight" size={13} className="inline -rotate-45" />
                          </a>
                          {r.whyRecommended && <span className="text-[0.9rem] leading-relaxed text-fg-secondary">{r.whyRecommended}</span>}
                        </div>
                        {onAddBookmark && (
                          <button
                            type="button"
                            onClick={() => handleBookmarkResource({ ...r, url: sourceHref(r) })}
                            disabled={saved}
                            className="btn btn-secondary h-9 px-3 py-0 text-[0.85rem]"
                          >
                            {saved ? 'Saved' : 'Save to sources'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </article>

      <aside className="flex flex-col gap-8 xl:sticky xl:top-6">
        <button
          type="button"
          onClick={() => onToggleCompleted(module.id)}
          aria-pressed={module.completed}
          className={`btn h-12 w-full py-0 text-[0.95rem] ${module.completed ? 'btn-secondary' : 'btn-primary'}`}
        >
          {module.completed ? (
            <>
              <Icon name="check" size={16} strokeWidth={2.4} /> Finished — undo
            </>
          ) : (
            'Mark this module finished'
          )}
        </button>

        <section aria-labelledby="notes-h" className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h3 id="notes-h" className="m-0 text-[0.95rem] font-semibold">Your notes on this module</h3>
            <span className="text-[0.8rem] text-fg-muted">Saved as you type · shown again with its review cards</span>
          </div>
          {/* Keyed by module: the editor captures its save callback when it's
              created, so a save still pending after you switch modules lands
              on the module you typed it in. */}
          <RichTextEditor
            key={module.id}
            content={module.notes || ''}
            onChange={(html) => saveModuleNotes(module.id, html)}
            placeholder={`Explain ${module.title} back in your own words.`}
            minHeight={150}
          />
          {notes && notes.replace(/<[^>]*>/g, '').trim() && (
            <details className="text-[0.85rem] text-fg-secondary">
              <summary className="cursor-pointer font-semibold">Older topic-wide notes</summary>
              <div className="mt-2">
                <RichTextEditor content={notes} onChange={onSaveNotes} placeholder="" minHeight={100} />
              </div>
            </details>
          )}
        </section>

        <section aria-labelledby="shown-h" className="flex flex-col gap-3">
          <h3 id="shown-h" className="m-0 text-[0.95rem] font-semibold">What you’ve shown so far</h3>
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-3.5 text-[0.9rem]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-fg-muted">Last quiz</dt>
              <dd className="m-0 font-semibold">{evidence?.quiz?.total ? `${evidence.quiz.correct} of ${evidence.quiz.total}` : '—'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-fg-muted">Explain-it</dt>
              <dd className="m-0 font-semibold" style={{ color: isVerdict(evidence?.challenge?.verdict) ? VERDICT_STYLE[evidence!.challenge!.verdict as Verdict].color : undefined }}>
                {isVerdict(evidence?.challenge?.verdict) ? VERDICT_STYLE[evidence!.challenge!.verdict as Verdict].label : '—'}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-fg-muted">In review</dt>
              <dd className="m-0 font-semibold">{evidence?.reviewCards ? `${evidence.reviewCards} card${evidence.reviewCards === 1 ? '' : 's'}` : '—'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-fg-muted">Where it stands</dt>
              <dd className="m-0 font-semibold">{evidence?.state ? <KnowledgeMark state={evidence.state} showLabel /> : '—'}</dd>
            </div>
          </dl>
        </section>

        <ProblemLog topicId={topicId} moduleId={module.id} onChanged={onEvidenceChanged} />

        <button
          type="button"
          onClick={() => { setGenerating(true); loadLesson(true); }}
          disabled={loadingLesson || generating}
          className="self-start text-[0.85rem] font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
          title="Write this lesson again with fresh examples"
        >
          {generating ? 'Rewriting…' : 'Rewrite this lesson'}
        </button>
      </aside>
    </div>
  );
}
