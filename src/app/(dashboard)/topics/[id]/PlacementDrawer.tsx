'use client';

import React, { useState } from 'react';
import { Button, Drawer } from '@/components/ui';

interface Question {
  moduleId: string;
  moduleTitle: string;
  question: string;
  options: string[];
}

interface Result {
  moduleId: string;
  correct: number;
  total: number;
  passed: boolean;
}

interface Review {
  moduleId: string;
  question: string;
  chosen: number | null;
  correctIndex: number;
  explanation: string;
}

type Phase = 'intro' | 'loading' | 'answering' | 'submitting' | 'done';

/**
 * Skip what you already know: a short quiz across the modules you haven't
 * finished. Modules where every answer is right are marked finished and
 * show as solid; their questions come back in 7 days to confirm.
 */
export default function PlacementDrawer({ open, onClose, topicId, openModuleCount, onApplied }: {
  open: boolean;
  onClose: () => void;
  topicId: string;
  openModuleCount: number;
  onApplied: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [review, setReview] = useState<Review[]>([]);

  const perModule = openModuleCount * 2 <= 14 ? 2 : 1;
  const estimate = Math.min(14, openModuleCount * perModule);

  const close = () => {
    onClose();
    // Reset after the drawer is gone so a second open starts fresh.
    setTimeout(() => {
      setPhase('intro');
      setError(null);
      setQuestions([]);
      setAnswers({});
      setResults([]);
      setReview([]);
      setCheckId(null);
    }, 0);
  };

  const start = async () => {
    setPhase('loading');
    setError(null);
    const res = await fetch(`/api/topics/${topicId}/placement`, { method: 'POST' }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.questions) {
      setError(data?.error || 'Couldn’t write the check. Try again.');
      setPhase('intro');
      return;
    }
    setCheckId(data.id);
    setQuestions(data.questions);
    setPhase('answering');
  };

  const submit = async () => {
    if (!checkId) return;
    setPhase('submitting');
    const res = await fetch(`/api/placement/${checkId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.results) {
      setError(data?.error || 'Couldn’t submit. Try again.');
      setPhase('answering');
      return;
    }
    setResults(data.results);
    setReview(data.review);
    setPhase('done');
    if (data.results.some((r: Result) => r.passed)) onApplied();
  };

  const answered = Object.keys(answers).length;
  const titleOf = (moduleId: string) => questions.find((q) => q.moduleId === moduleId)?.moduleTitle ?? moduleId;
  const passed = results.filter((r) => r.passed);

  return (
    <Drawer open={open} onClose={close} title="Placement check" label="Placement check">
      {phase === 'intro' || phase === 'loading' ? (
        <div className="flex flex-col gap-4 text-[0.9rem] leading-relaxed text-fg-secondary">
          <p className="m-0">
            About {estimate} questions across the {openModuleCount} module{openModuleCount === 1 ? '' : 's'} you haven’t finished — roughly {Math.max(3, Math.round(estimate * 0.5))} minutes.
          </p>
          <ul className="m-0 flex flex-col gap-1.5 pl-5">
            <li>Get every question for a module right and it’s marked finished, shown as solid.</li>
            <li>Those questions come back in Daily Review in a week, to confirm you really know them.</li>
            <li>Anything you miss stays as it is. No penalty for guessing wrong.</li>
          </ul>
          <p className="m-0">Answer from what you know. Looking things up only means relearning later.</p>
          {error && <p className="m-0 text-danger">{error}</p>}
          <Button variant="primary" onClick={start} disabled={phase === 'loading'} className="self-start">
            {phase === 'loading' ? 'Writing your questions…' : 'Start the check'}
          </Button>
        </div>
      ) : phase === 'done' ? (
        <div className="flex flex-col gap-5">
          <div>
            <p className="m-0 text-lg font-bold text-fg">
              {passed.length === 0
                ? 'Nothing placed out this time.'
                : `${passed.length} module${passed.length === 1 ? '' : 's'} marked as known.`}
            </p>
            <p className="m-0 mt-1 text-[0.85rem] text-fg-secondary">
              {passed.length === 0
                ? 'That’s useful too: now you know where to start.'
                : 'They’ll come back for a quick review in a week. Start with the first module you missed.'}
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {results.map((r) => (
              <li key={r.moduleId} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[0.88rem] last:border-b-0">
                <span className="text-fg">{titleOf(r.moduleId)}</span>
                <span className={r.passed ? 'font-semibold text-k-solid' : 'text-fg-muted'}>
                  {r.passed ? 'Known ✓' : `${r.correct} of ${r.total} — study it`}
                </span>
              </li>
            ))}
          </ul>
          <details className="text-[0.85rem]">
            <summary className="cursor-pointer font-semibold text-fg-secondary">See the answers</summary>
            <ol className="mt-3 flex flex-col gap-3 pl-5">
              {review.map((q, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="text-fg">{q.question}</span>
                  <span className={q.chosen === q.correctIndex ? 'text-k-solid' : 'text-k-fading-text'}>
                    {q.chosen === q.correctIndex ? 'Right' : 'Missed'} — correct: {questions[i]?.options[q.correctIndex]}
                  </span>
                  {q.explanation && <span className="text-fg-muted">{q.explanation}</span>}
                </li>
              ))}
            </ol>
          </details>
          <Button variant="primary" onClick={close} className="self-start">Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <ol className="m-0 flex flex-col gap-6 p-0" style={{ listStyle: 'none' }}>
            {questions.map((q, i) => (
              <li key={i}>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 p-0">
                    <span className="block text-[0.72rem] font-semibold text-fg-muted">
                      {i + 1} of {questions.length} · {q.moduleTitle}
                    </span>
                    <span className="mt-1 block text-[0.95rem] font-semibold leading-snug text-fg">{q.question}</span>
                  </legend>
                  {q.options.map((opt, o) => (
                    <label
                      key={o}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-[0.88rem] ${answers[i] === o ? 'border-fg bg-white/10 text-fg' : 'border-line text-fg-secondary'}`}
                    >
                      <input
                        type="radio"
                        name={`pq-${i}`}
                        checked={answers[i] === o}
                        onChange={() => setAnswers((a) => ({ ...a, [i]: o }))}
                        className="h-4 w-4 shrink-0"
                      />
                      {opt}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ol>
          {error && <p className="m-0 text-danger">{error}</p>}
          <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-surface py-3">
            <Button variant="primary" onClick={submit} disabled={phase === 'submitting' || answered === 0}>
              {phase === 'submitting' ? 'Checking…' : 'Submit'}
            </Button>
            <span className="text-[0.8rem] text-fg-muted">
              {answered} of {questions.length} answered{answered < questions.length ? ' · unanswered counts as not known' : ''}
            </span>
          </div>
        </div>
      )}
    </Drawer>
  );
}
