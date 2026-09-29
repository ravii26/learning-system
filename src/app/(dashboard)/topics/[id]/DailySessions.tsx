'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { renderMarkdown } from '@/lib/markdown';
import type { SessionContent, SessionRating, SessionStep } from '@/lib/program/sessions';
import type { CheckResult } from '@/lib/program/exerciseCheck';
import { Exercise } from './LessonPractice';
import ManualAiPanel, { postManual } from '@/components/ManualAiPanel';
import { useAiMode } from '@/lib/useAiMode';

/**
 * A practice topic's page: today's session in full (every sentence, drill
 * and speaking task written out), then how it felt, which steers the next
 * days. New days are prepared a few at a time as you go.
 */

interface Session {
  id: string;
  day: number;
  title: string;
  minutes: number;
  content: SessionContent;
  status: 'pending' | 'done' | 'skipped';
  rating: SessionRating | null;
  notes: string | null;
  completedAt: string | null;
}

const KIND_WORD: Record<SessionStep['kind'], string> = {
  warmup: 'Warm-up', input: 'New material', drill: 'Drill', speak: 'Speak', write: 'Write', do: 'Do it', review: 'Review',
};
const RATING_WORD: Record<SessionRating, string> = { easy: 'Too easy', right: 'About right', hard: 'Too hard' };

export default function DailySessions({ topicId, topicTitle }: { topicId: string; topicTitle: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  // "Use my own ChatGPT/Claude": the next days come from the learner's chat.
  const { manual: manualMode } = useAiMode();
  const [manualHere, setManualHere] = useState(false);
  const useManual = manualMode || manualHere;
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/topics/${topicId}/sessions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your sessions.');
      setSessions(data.sessions);
      setAiAvailable(data.aiAvailable !== false);
      return data.sessions as Session[];
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your sessions.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  const prepare = useCallback(async (quiet = false) => {
    if (useManual) {
      // Never a paid call in copy-paste mode; the learner asks for the next days themselves.
      if (!quiet) setShowManual(true);
      return;
    }
    if (!quiet) setPreparing(true);
    setError(null);
    try {
      const res = await fetch(`/api/topics/${topicId}/sessions`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not prepare your sessions.');
      setSessions(data.sessions);
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not prepare your sessions.');
    } finally {
      setPreparing(false);
    }
  }, [topicId, useManual]);

  useEffect(() => { load(); }, [load]);

  const today = sessions.find((s) => s.status === 'pending') ?? null;
  const past = sessions.filter((s) => s.status !== 'pending').reverse();
  const upcoming = sessions.filter((s) => s.status === 'pending' && s.id !== today?.id);

  const finished = async (s: Session, patch: { status: 'done' | 'skipped'; rating?: SessionRating; notes?: string; results?: unknown }) => {
    const res = await fetch(`/api/topics/${topicId}/sessions/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not save that.');
    }
    const list = await load();
    // Keep a couple of days ready, written with today's result in mind.
    if (list.filter((x) => x.status === 'pending').length < 2) prepare(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return <div className="flex flex-col gap-3" aria-busy="true">{[90, 100, 70].map((w, i) => <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />)}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10">
      {!today && (
        <section className="glass-panel flex flex-col items-start gap-3 p-6">
          <h2 className="m-0 font-serif text-[1.8rem] font-normal leading-tight">
            {sessions.length ? 'You’re caught up' : 'Daily practice'}
          </h2>
          <p className="m-0 text-fg-secondary">
            {sessions.length
              ? 'The next days are written from how your recent sessions went.'
              : `Each day you get a new ${topicTitle.toLowerCase().includes('practice') ? '' : 'practice '}session with everything written out: what to say, drill or play, for how long, and how to know it worked. It builds day by day and brings back what you found hard.`}
          </p>
          {aiAvailable || useManual ? (
            <button type="button" onClick={() => prepare()} disabled={preparing || showManual} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
              {preparing ? 'Writing your next sessions… (about a minute)' : sessions.length ? 'Prepare the next days' : 'Prepare my first sessions'}
            </button>
          ) : <p className="m-0 text-[0.9rem] text-fg-muted">Writing sessions needs the AI, which isn’t set up.</p>}
          {error && <p role="alert" className="m-0 text-danger">{error}</p>}
          {!useManual && (error || !aiAvailable) && (
            <button type="button" className="text-[0.92rem] font-semibold underline underline-offset-2" onClick={() => { setManualHere(true); setError(null); setShowManual(true); }}>
              Use your own ChatGPT or Claude instead (free)
            </button>
          )}
        </section>
      )}

      {showManual && (
        <ManualAiPanel
          title="Your next practice days, from your own chat"
          what="your next 3 practice days, with every sentence, drill and task written out"
          getPrompt={async () => {
            const r = await postManual<{ prompt: string }>(`/api/topics/${topicId}/sessions`, {});
            if (!r.ok) throw new Error(r.problems[0]);
            return r.data.prompt;
          }}
          importReply={async (reply) => {
            const r = await postManual<{ sessions: Session[] }>(`/api/topics/${topicId}/sessions`, { step: 'import', reply });
            if (!r.ok) return r;
            setSessions(r.data.sessions);
            setShowManual(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return { ok: true };
          }}
          onCancel={() => setShowManual(false)}
        />
      )}

      {today && <Today key={today.id} session={today} topicTitle={topicTitle} onFinish={(p) => finished(today, p)} />}

      {useManual && today && upcoming.length === 0 && !showManual && (
        <button type="button" onClick={() => setShowManual(true)} className="self-start text-[0.92rem] font-medium text-fg-secondary underline underline-offset-2 hover:text-fg">
          Get the next days ready from your chat
        </button>
      )}

      {(upcoming.length > 0 || preparing) && (
        <section aria-labelledby="up-h" className="flex flex-col gap-2">
          <h3 id="up-h" className="m-0 text-[1rem] font-semibold">Coming up</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.92rem] text-fg-secondary">
            {upcoming.map((s) => <li key={s.id}>Day {s.day} · {s.title}</li>)}
            {preparing && today && <li className="text-fg-muted">Writing the next days…</li>}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-h" className="flex flex-col gap-2">
          <h3 id="past-h" className="m-0 text-[1rem] font-semibold">Done so far · {past.filter((s) => s.status === 'done').length} session{past.filter((s) => s.status === 'done').length === 1 ? '' : 's'}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {past.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[0.92rem] last:border-b-0">
                <span className={s.status === 'skipped' ? 'text-fg-muted line-through' : ''}>Day {s.day} · {s.title}</span>
                <span className="shrink-0 text-[0.8rem] text-fg-muted">{s.status === 'skipped' ? 'Skipped' : s.rating ? RATING_WORD[s.rating] : 'Done'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Today({ session, topicTitle, onFinish }: {
  session: Session; topicTitle: string;
  onFinish: (p: { status: 'done' | 'skipped'; rating?: SessionRating; notes?: string; results?: unknown }) => Promise<void>;
}) {
  const [stepsDone, setStepsDone] = useState<Record<number, boolean>>({});
  const [checks, setChecks] = useState<Array<{ step: number; item: number; verdict: string; feedback: string; answer: string }>>([]);
  const [rating, setRating] = useState<SessionRating | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = session.content;
  const doneCount = Object.values(stepsDone).filter(Boolean).length;

  const save = async (status: 'done' | 'skipped') => {
    setSaving(true);
    setError(null);
    try {
      await onFinish({ status, ...(status === 'done' ? { rating: rating ?? 'right', notes, results: { checks, stepsDone: Object.keys(stepsDone).filter((k) => stepsDone[+k]).map(Number) } } : {}) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
      setSaving(false);
    }
  };

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-[0.85rem] font-semibold uppercase tracking-wide text-fg-muted">Today · Day {session.day} · about {session.minutes} min</span>
        <h2 className="m-0 font-serif text-[2.2rem] font-medium leading-[1.1] tracking-[-0.02em]">{session.title}</h2>
        {c.goal && <p className="m-0 text-[1.05rem] leading-relaxed text-fg-secondary">{c.goal}</p>}
      </header>

      <ol className="m-0 flex list-none flex-col gap-8 p-0">
        {c.steps.map((st, i) => {
          const answerable = st.kind === 'speak' || st.kind === 'write';
          return (
            <li key={i} className="flex flex-col gap-3 rounded-2xl border border-line p-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">
                <span>{i + 1}. {KIND_WORD[st.kind]}</span><span aria-hidden="true">·</span><span>{st.minutes} min</span>
              </div>
              <h3 className="m-0 text-[1.15rem] font-semibold">{st.title}</h3>
              {st.target && <p className="m-0 text-[0.92rem]"><span className="text-fg-muted">Target: </span>{st.target}</p>}
              {st.instructions && <div className="lesson-prose text-[1rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(st.instructions) }} />}

              {answerable ? (
                <ol className="m-0 flex list-none flex-col gap-5 p-0">
                  {st.items.map((it, j) => (
                    <Exercise
                      key={j}
                      n={j + 1}
                      ex={{ type: st.kind === 'speak' ? 'say' : 'write', instruction: '', prompt: it.text, answer: it.answer ?? '' }}
                      subject={`${topicTitle}: ${session.title}`}
                      done={false}
                      onDone={() => {}}
                      onChecked={(r: CheckResult & { answer: string }) => setChecks((p) => [...p.filter((x) => !(x.step === i && x.item === j)), { step: i, item: j, verdict: r.verdict, feedback: r.feedback, answer: r.answer }])}
                    />
                  ))}
                </ol>
              ) : st.items.length > 0 && <StepItems items={st.items} />}

              <label className="flex cursor-pointer items-center gap-2.5 self-start pt-1 text-[0.95rem]">
                <input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={!!stepsDone[i]} onChange={(e) => setStepsDone((p) => ({ ...p, [i]: e.target.checked }))} />
                Done with this step
              </label>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="finish-h" className="glass-panel flex flex-col gap-4 p-6">
        <h3 id="finish-h" className="m-0 text-[1.1rem] font-semibold">Finish Day {session.day}</h3>
        {c.successCheck && <p className="m-0 text-[0.95rem] text-fg-secondary">Today worked if: {c.successCheck}</p>}
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[0.95rem] font-semibold">How did it feel? <span className="font-normal text-fg-muted">This sets the next days’ difficulty.</span></legend>
          <div className="flex flex-wrap gap-2">
            {(['easy', 'right', 'hard'] as const).map((r) => (
              <button key={r} type="button" aria-pressed={rating === r} onClick={() => setRating(r)}
                className={`h-10 rounded-lg px-3.5 text-[0.9rem] font-medium ${rating === r ? 'bg-ink text-on-ink' : 'border-[1.5px] border-line text-fg-secondary hover:border-line-hover'}`}>
                {RATING_WORD[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.95rem] font-semibold">Anything that was hard? <span className="font-normal text-fg-muted">optional</span></span>
          <textarea className="form-input py-2.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I froze on the second question; the th sound is still hard" />
        </label>
        {error && <p role="alert" className="m-0 text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save('done')} disabled={saving} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
            {saving ? 'Saving…' : <>Finish today <Icon name="check" size={16} strokeWidth={2.4} /></>}
          </button>
          <span className="text-[0.85rem] text-fg-muted">{doneCount} of {c.steps.length} steps ticked{checks.length ? ` · ${checks.length} answer${checks.length === 1 ? '' : 's'} checked` : ''}</span>
          <button type="button" onClick={() => save('skipped')} disabled={saving} className="ml-auto text-[0.85rem] font-medium text-fg-muted hover:text-fg">Skip this day</button>
        </div>
      </section>
    </article>
  );
}

/** Drill items: the text, with its answer hidden until asked for. */
function StepItems({ items }: { items: SessionStep['items'] }) {
  const [show, setShow] = useState(false);
  const hasAnswers = items.some((it) => it.answer);
  return (
    <div className="flex flex-col gap-3">
      <ol className="m-0 flex flex-col gap-2.5 pl-6">
        {items.map((it, j) => (
          <li key={j} className="text-[1rem] leading-relaxed">
            <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(it.text) }} />
            {show && it.answer && <div className="lesson-prose mt-1 text-[0.95rem] text-fg-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(`→ ${it.answer}`) }} />}
          </li>
        ))}
      </ol>
      {hasAnswers && (
        <button type="button" onClick={() => setShow((v) => !v)} className="btn btn-secondary h-9 self-start py-0 text-[0.85rem]">
          {show ? 'Hide answers' : 'Show answers'}
        </button>
      )}
    </div>
  );
}
