'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui';
import { renderMarkdown } from '@/lib/markdown';
import { useSpeechToText } from '@/lib/useSpeechToText';
import type { LessonExercise } from '@/lib/program/lessonGuide';
import type { CheckResult } from '@/lib/program/exerciseCheck';

/**
 * The lesson's Practice step: do the exercises right after reading. Typed
 * or spoken answers can be checked by the AI; "do" tasks (play it, cook it)
 * are ticked off by the learner against the success check.
 */

const TYPE_WORD: Record<LessonExercise['type'], string> = { write: 'Write', say: 'Say it', do: 'Do it', solve: 'Solve' };
const VERDICT: Record<CheckResult['verdict'], string> = { correct: 'Correct', partly: 'Nearly', wrong: 'Not yet' };

/** Work saved with the lesson, by exercise index (see api/topics/[id]/modules/[moduleId]/practice). */
export type SavedPractice = Record<string, { answer?: string; done?: boolean; result?: CheckResult | null }>;

export default function LessonPractice({ exercises, subject, onDone, saved, saveUrl, onWork }: {
  exercises: LessonExercise[]; subject: string; onDone: () => void; saved?: SavedPractice; saveUrl?: string;
  /** Latest work, so a parent that remounts this (tab switches) passes it back as `saved`. */
  onWork?: (w: SavedPractice) => void;
}) {
  const [done, setDone] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(Object.entries(saved ?? {}).map(([k, v]) => [Number(k), !!v?.done])));
  const work = React.useRef<SavedPractice>({ ...(saved ?? {}) });
  // Saved quietly: losing one save only means that box is empty next time.
  const persist = (i: number, patch: SavedPractice[string]) => {
    work.current[i] = { ...work.current[i], ...patch };
    onWork?.({ ...work.current });
    if (!saveUrl) return;
    fetch(saveUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i, ...work.current[i] }) }).catch(() => {});
  };
  const count = Object.values(done).filter(Boolean).length;
  return (
    <section aria-labelledby="practice-h" className="flex flex-col gap-7">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="practice-h" className="m-0 text-[1.2rem] font-semibold">Practice</h3>
        <span className="text-[0.9rem] text-fg-muted">{count} of {exercises.length} done</span>
      </div>
      <p className="m-0 text-[0.95rem] text-fg-secondary">Do each one before looking at the answer. Getting it wrong here is how it sticks.</p>
      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        {exercises.map((ex, i) => (
          <Exercise
            key={`${i}-${ex.prompt.slice(0, 20)}`} n={i + 1} ex={ex} subject={subject} done={!!done[i]}
            initialAnswer={saved?.[i]?.answer} initialResult={saved?.[i]?.result ?? null}
            onDone={(v) => { setDone((p) => ({ ...p, [i]: v })); persist(i, { done: v }); }}
            onChecked={(r) => persist(i, { answer: r.answer, result: { verdict: r.verdict, feedback: r.feedback, corrected: r.corrected } })}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <button type="button" onClick={onDone} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
          Check yourself <Icon name="arrowRight" size={16} />
        </button>
        <span className="text-[0.9rem] text-fg-muted">A short quiz next, then it goes into review.</span>
      </div>
    </section>
  );
}

/** One exercise: answer by typing or speaking, get it checked, see the model answer. Also used by daily sessions. */
export function Exercise({ n, ex, subject, done, onDone, onChecked, initialAnswer, initialResult }: {
  n: number; ex: LessonExercise; subject: string; done: boolean; onDone: (v: boolean) => void;
  onChecked?: (r: CheckResult & { answer: string }) => void;
  initialAnswer?: string; initialResult?: CheckResult | null;
}) {
  const [answer, setAnswer] = useState(initialAnswer ?? '');
  const [showAnswer, setShowAnswer] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechToText();
  const [spoken, setSpoken] = useState(false);
  const typed = ex.type === 'write' || ex.type === 'solve' || ex.type === 'say';
  const text = spoken && speech.transcript ? speech.transcript : answer;

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/exercise-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, instruction: ex.instruction, prompt: ex.prompt, modelAnswer: ex.answer, answer: text, spoken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not check it.');
      setResult(data);
      onChecked?.({ ...data, answer: text });
      if (data.verdict === 'correct') onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check it.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-line pb-6 last:border-b-0">
      <div className="flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">
        <span>{n}</span><span aria-hidden="true">·</span><span>{TYPE_WORD[ex.type]}</span>
        {done && <span className="ml-auto flex items-center gap-1 normal-case tracking-normal text-fg"><Icon name="check" size={14} strokeWidth={2.4} /> Done</span>}
      </div>
      {ex.instruction && <p className="m-0 text-[0.95rem] text-fg-secondary">{ex.instruction}</p>}
      {ex.prompt && <div className="lesson-prose text-[1.05rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(ex.prompt) }} />}

      {typed && (
        <div className="flex flex-col gap-2">
          {ex.type === 'say' && speech.supported && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { if (speech.listening) speech.stop(); else { setSpoken(true); setResult(null); speech.start(); } }}
                className={`btn h-10 py-0 ${speech.listening ? 'btn-primary' : 'btn-secondary'}`}>
                <Icon name="mic" size={16} /> {speech.listening ? 'Stop' : speech.transcript ? 'Say it again' : 'Say it'}
              </button>
              {speech.listening && <span className="text-[0.85rem] text-fg-muted" aria-live="polite">Listening…</span>}
              {!speech.listening && speech.seconds > 0 && <span className="text-[0.85rem] text-fg-muted">{speech.seconds} s</span>}
            </div>
          )}
          {speech.error && <p role="alert" className="m-0 text-[0.85rem] text-danger">{speech.error}</p>}
          <label className="sr-only" htmlFor={`ans-${n}`}>Your answer</label>
          <textarea
            id={`ans-${n}`}
            rows={ex.type === 'say' ? 3 : 2}
            className="form-input py-2.5 text-[1rem]"
            placeholder={ex.type === 'say' ? (speech.supported ? 'Tap “Say it”, or type what you would say' : 'Type what you would say') : 'Your answer'}
            value={text}
            onChange={(e) => { setSpoken(false); speech.setTranscript(''); setAnswer(e.target.value); setResult(null); }}
          />
          {ex.hint && !text && <p className="m-0 text-[0.85rem] text-fg-muted">Hint: {ex.hint}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {typed && (
          <button type="button" onClick={check} disabled={!text.trim() || checking || speech.listening} className="btn btn-primary h-10 py-0">
            {checking ? 'Checking…' : 'Check my answer'}
          </button>
        )}
        {!typed && (
          <button type="button" onClick={() => onDone(!done)} aria-pressed={done} className={`btn h-10 py-0 ${done ? 'btn-secondary' : 'btn-primary'}`}>
            {done ? 'Done ✓' : 'I did it'}
          </button>
        )}
        {ex.answer && (
          <button type="button" onClick={() => setShowAnswer((v) => !v)} className="btn btn-secondary h-10 py-0">
            {showAnswer ? 'Hide' : ex.type === 'do' ? 'What good looks like' : 'Show answer'}
          </button>
        )}
      </div>

      {error && <p role="alert" className="m-0 text-[0.9rem] text-danger">{error}</p>}
      {result && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-sunk p-4" aria-live="polite">
          <span className="font-semibold">{VERDICT[result.verdict]}</span>
          <p className="m-0 text-[0.95rem] leading-relaxed">{result.feedback}</p>
          {result.corrected && <p className="m-0 text-[0.95rem] leading-relaxed"><span className="text-fg-muted">Better: </span>{result.corrected}</p>}
        </div>
      )}
      {showAnswer && ex.answer && (
        <div className="rounded-xl border border-line p-4">
          <div className="lesson-prose text-[0.98rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(ex.answer) }} />
        </div>
      )}
    </li>
  );
}
