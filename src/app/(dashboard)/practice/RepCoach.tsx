'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui';
import { useSpeechToText } from '@/lib/useSpeechToText';
import { useAiMode } from '@/lib/useAiMode';
import ManualAiPanel, { postManual } from '@/components/ManualAiPanel';
import type { RubricTemplate } from '@/lib/practiceRubrics';
import type { RepFeedback, SpeechStats } from '@/lib/practiceFeedback';

/**
 * Do the rep here (speak or type), then get coached: the app's own
 * measurements (time, pace, filler words) and AI feedback on the topic's
 * rubric, with each mistake fixed and a better version. The AI's scores
 * fill in the form below; the learner can still change them.
 */

export interface CoachResult { transcript: string; seconds: number | null; feedback: RepFeedback | null }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function RepCoach({ topicId, promptText, template, onFeedback }: {
  topicId: string;
  promptText: string;
  template: RubricTemplate;
  onFeedback: (r: CoachResult) => void;
}) {
  const speech = useSpeechToText();
  const { manual } = useAiMode();
  const [typed, setTyped] = useState('');
  const [spoken, setSpoken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RepFeedback | null>(null);
  const [stats, setStats] = useState<SpeechStats | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showBetter, setShowBetter] = useState(false);

  const answer = spoken ? speech.transcript : typed;
  const seconds = spoken ? speech.seconds || speech.elapsed : null;
  const body = () => ({ topicId, promptText, answer, durationSeconds: seconds ?? undefined, spoken });
  const dimLabel = (k: string) => template.dimensions.find((d) => d.key === k)?.label ?? k;

  const got = (f: RepFeedback, st: SpeechStats) => {
    setFeedback(f);
    setStats(st);
    setShowManual(false);
    onFeedback({ transcript: answer, seconds, feedback: f });
  };

  const ask = async () => {
    if (manual) return setShowManual(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/practice-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (!res.ok) throw new Error(data.error || 'Could not get feedback.');
      got(data.feedback, data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get feedback.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFeedback(null);
    setStats(null);
    setShowBetter(false);
    onFeedback({ transcript: '', seconds: null, feedback: null });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-center gap-2">
        {speech.supported && (
          <button type="button" disabled={busy}
            onClick={() => { if (speech.listening) speech.stop(); else { setSpoken(true); reset(); speech.start(); } }}
            className={`btn h-11 py-0 ${speech.listening ? 'btn-primary' : 'btn-secondary'}`}>
            <Icon name="mic" size={16} /> {speech.listening ? 'Stop' : speech.transcript ? 'Say it again' : 'Speak your answer'}
          </button>
        )}
        {speech.listening && <span className="font-mono text-[1rem] tabular-nums" aria-live="polite">{mmss(speech.elapsed)} · listening…</span>}
        {!speech.listening && spoken && speech.seconds > 0 && <span className="text-[0.9rem] text-fg-muted">{mmss(speech.seconds)} spoken</span>}
        {!speech.supported && <span className="text-[0.85rem] text-fg-muted">Speaking works in Chrome and Edge. Here, type what you would say.</span>}
      </div>
      {speech.error && <p role="alert" className="m-0 text-[0.9rem] text-danger">{speech.error}</p>}

      <label className="sr-only" htmlFor="rep-answer">Your answer</label>
      <textarea
        id="rep-answer"
        rows={5}
        className="form-input py-2.5 text-[1rem]"
        placeholder={speech.supported ? 'What you said appears here. You can also type instead.' : 'Type what you would say'}
        value={answer}
        onChange={(e) => { setSpoken(false); speech.setTranscript(''); setTyped(e.target.value); if (feedback) reset(); }}
      />

      {!feedback && !showManual && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={ask} disabled={busy || speech.listening || answer.trim().split(/\s+/).length < 5} className="btn btn-primary h-11 py-0">
            {busy ? 'Listening back…' : manual ? 'Get feedback from your own chat' : 'Get feedback'}
          </button>
          <span className="text-[0.85rem] text-fg-muted">Scores, every mistake with a better way to say it, and an improved version.</span>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-[0.9rem] text-danger">
          {error}{' '}
          {!manual && <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { setError(null); setShowManual(true); }}>Use your own ChatGPT or Claude instead</button>}
        </p>
      )}

      {showManual && (
        <ManualAiPanel
          title="Feedback from your own chat"
          what="feedback on your answer, with scores and corrections"
          getPrompt={async () => {
            const r = await postManual<{ prompt: string; stats: SpeechStats }>('/api/practice-feedback', { ...body(), step: 'prompt' });
            if (!r.ok) throw new Error(r.problems[0]);
            setStats(r.data.stats);
            return r.data.prompt;
          }}
          importReply={async (reply) => {
            const r = await postManual<{ feedback: RepFeedback; stats: SpeechStats }>('/api/practice-feedback', { ...body(), step: 'import', reply });
            if (!r.ok) return r;
            got(r.data.feedback, r.data.stats);
            return { ok: true };
          }}
          onCancel={() => setShowManual(false)}
        />
      )}

      {stats && (
        <dl className="m-0 grid grid-cols-2 gap-3 rounded-xl bg-sunk p-4 text-[0.9rem] sm:grid-cols-4">
          <div><dt className="text-fg-muted">Time</dt><dd className="m-0 font-semibold">{stats.seconds ? mmss(stats.seconds) : '—'}</dd></div>
          <div><dt className="text-fg-muted">Words</dt><dd className="m-0 font-semibold">{stats.words}</dd></div>
          <div>
            <dt className="text-fg-muted">Pace</dt>
            <dd className="m-0 font-semibold">{stats.wordsPerMinute ? `${stats.wordsPerMinute} wpm` : '—'}</dd>
            {stats.wordsPerMinute && <dd className="m-0 text-[0.78rem] text-fg-muted">{stats.wordsPerMinute < 110 ? 'slow' : stats.wordsPerMinute > 170 ? 'fast' : 'comfortable'}</dd>}
          </div>
          <div>
            <dt className="text-fg-muted">Filler words</dt>
            <dd className="m-0 font-semibold">{stats.fillerCount}</dd>
            {stats.fillers.length > 0 && <dd className="m-0 text-[0.78rem] text-fg-muted">{stats.fillers.map((f) => `${f.word} ×${f.count}`).join(', ')}</dd>}
          </div>
        </dl>
      )}

      {feedback && (
        <section aria-label="Feedback" className="flex flex-col gap-4">
          {feedback.summary && <p className="m-0 text-[1.02rem] leading-relaxed">{feedback.summary}</p>}
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {Object.entries(feedback.scores).map(([k, v]) => (
              <li key={k} className="rounded-lg bg-fill-2 px-2.5 py-1 text-[0.85rem]"><span className="text-fg-muted">{dimLabel(k)}</span> <strong>{v}</strong>/5</li>
            ))}
          </ul>
          {feedback.strengths.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="m-0 text-[0.95rem] font-semibold">What worked</h3>
              <ul className="m-0 flex flex-col gap-1 pl-5 text-[0.95rem]">{feedback.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {feedback.fixes.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[0.95rem] font-semibold">Fix these</h3>
              <ol className="m-0 flex flex-col gap-3 pl-5 text-[0.95rem]">
                {feedback.fixes.map((f, i) => (
                  <li key={i} className="leading-relaxed">
                    {f.said && <span className="text-fg-muted line-through decoration-1">{f.said}</span>}
                    {f.said && ' → '}<strong>{f.better}</strong>
                    {f.why && <span className="block text-[0.85rem] text-fg-secondary">{f.why}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {feedback.betterVersion && (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setShowBetter((v) => !v)} className="self-start text-[0.95rem] font-semibold underline underline-offset-2">
                {showBetter ? 'Hide' : 'Show'} a stronger version of your answer
              </button>
              {showBetter && <p className="m-0 whitespace-pre-wrap rounded-xl border border-line p-4 text-[0.98rem] leading-relaxed">{feedback.betterVersion}</p>}
              {showBetter && <span className="text-[0.85rem] text-fg-muted">Read it aloud twice, then say your own answer again without looking.</span>}
            </div>
          )}
          {feedback.nextFocus && <p className="m-0 text-[0.95rem]"><span className="font-semibold">Next time: </span>{feedback.nextFocus}</p>}
          <p className="m-0 text-[0.82rem] text-fg-muted">Judged from the words only: accent and pronunciation can’t be checked from text. Scores below are filled in from this feedback; change any you disagree with.</p>
        </section>
      )}
    </div>
  );
}
