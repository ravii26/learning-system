'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Icon } from '@/components/ui/Icon';
import { MarkdownProse } from '@/components/MarkdownProse';
import ManualAiPanel, { postManual } from '@/components/ManualAiPanel';
import { useToast } from '@/components/ToastProvider';
import { ASSIST_PRESETS, type AssistAction, type AssistDraft } from '@/lib/lessonAssist';

/**
 * The bar under a lesson: ask about it, add to it, or improve it. Nothing
 * changes the lesson until you've seen the result and chosen to keep it.
 */

export interface AssistRequest {
  action: AssistAction;
  request: string;
  selection: string | null;
  /** Changes on each request, so asking the same thing twice still runs. */
  nonce: number;
}

const TABS: Array<{ key: AssistAction; label: string; placeholder: string }> = [
  { key: 'ask', label: 'Ask', placeholder: 'Ask anything about this lesson' },
  { key: 'add', label: 'Add', placeholder: 'What should be added? e.g. 3 LeetCode problems' },
  { key: 'improve', label: 'Improve', placeholder: 'What should change?' },
];
const ACTION_TITLE: Record<AssistAction, string> = { ask: 'Your question', add: 'Add to this lesson', improve: 'Improve this lesson' };

const MAX_NOTE_LENGTH = 4900; // a note quote is capped at 5000 characters

const chip = 'h-8 whitespace-nowrap rounded-full border border-line bg-transparent px-3 text-[0.82rem] font-medium text-fg-secondary hover:border-line-hover hover:text-fg';

export default function LessonAssistant({ topicId, moduleId, manual, incoming, onSaveToNotes, onAdded }: {
  topicId: string;
  moduleId: string;
  manual: boolean;
  incoming: AssistRequest | null;
  onSaveToNotes: (text: string) => Promise<void>;
  onAdded: () => void;
}) {
  const toast = useToast();
  const url = `/api/topics/${topicId}/modules/${moduleId}/assist`;
  const [tab, setTab] = useState<AssistAction>('ask');
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AssistRequest | null>(null);
  const [draft, setDraft] = useState<AssistDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualHere, setManualHere] = useState(false);
  const [offerManual, setOfferManual] = useState(false);
  const [ticked, setTicked] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);
  const counter = useRef(0);
  const latest = useRef(0);

  const useOwnChat = manual || manualHere;

  const showDraft = useCallback((next: AssistDraft) => {
    setDraft(next);
    setTicked(next.type === 'practice' ? next.items.map(() => true) : []);
    setSavedToNotes(false);
  }, []);

  const run = useCallback(async (req: AssistRequest) => {
    latest.current = req.nonce;
    setCurrent(req);
    setOpen(true);
    setDraft(null);
    setError(null);
    setOfferManual(false);
    if (useOwnChat) return;
    setLoading(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      const data = await res.json().catch(() => ({}));
      if (latest.current !== req.nonce) return;
      if (res.ok && data.draft) showDraft(data.draft);
      else {
        setError(data.error || 'That didn’t work. Try again.');
        setOfferManual(true);
      }
    } catch {
      if (latest.current === req.nonce) setError('Couldn’t reach the server.');
    } finally {
      if (latest.current === req.nonce) setLoading(false);
    }
  }, [showDraft, url, useOwnChat]);

  useEffect(() => {
    if (incoming) void run(incoming);
    // Runs once per request from the selection menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.nonce]);

  const start = (action: AssistAction, request: string) => {
    if (!request.trim()) return;
    counter.current -= 1; // negative, so these never collide with the parent's numbers
    void run({ action, request: request.trim(), selection: null, nonce: counter.current });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(tab, input);
    setInput('');
  };

  const close = () => {
    latest.current = 0;
    setOpen(false);
    setLoading(false);
  };

  const keep = async () => {
    if (!draft || draft.type === 'answer') return;
    const body = draft.type === 'section'
      ? { type: 'section', heading: draft.heading, body: draft.body }
      : { type: 'practice', suggested: true, items: draft.items.filter((_, i) => ticked[i]) };
    setSaving(true);
    try {
      const res = await fetch(`/api/topics/${topicId}/modules/${moduleId}/additions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Couldn’t add that.'); return; }
      toast.success('Added to this lesson');
      onAdded();
      close();
    } catch {
      toast.error('Couldn’t reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const saveAnswer = async () => {
    if (draft?.type !== 'answer' || !current) return;
    setSaving(true);
    try {
      // Notes are plain quotes, so markdown symbols would show up literally.
      await onSaveToNotes(`${current.request}\n${draft.text}`.replace(/\*\*|__|`/g, '').slice(0, MAX_NOTE_LENGTH));
      setSavedToNotes(true);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Couldn’t save that to your notes.');
    } finally {
      setSaving(false);
    }
  };

  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const presets = tab === 'ask' ? [] : ASSIST_PRESETS[tab];
  const canKeep = draft?.type === 'section' || (draft?.type === 'practice' && ticked.some(Boolean));

  return (
    <>
      <div className="sticky bottom-[84px] z-30 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-card md:bottom-4">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="What to do" className="flex rounded-xl bg-sunk p-1">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`h-8 rounded-[9px] px-3 text-[0.85rem] ${tab === t.key ? 'bg-surface font-semibold text-fg shadow-card' : 'bg-transparent font-medium text-fg-secondary hover:text-fg'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <label htmlFor="assist-input" className="sr-only">{active.placeholder}</label>
          <input id="assist-input" className="form-input h-10 min-w-[180px] flex-1 py-0" placeholder={active.placeholder} value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" aria-label="Send" disabled={!input.trim()} className="btn btn-primary h-10 px-3 py-0"><Icon name="arrowRight" size={16} /></button>
        </form>
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => <button key={p.label} type="button" className={chip} onClick={() => start(tab, p.request)}>{p.label}</button>)}
          </div>
        )}
      </div>

      <Drawer open={open} onClose={close} label={current ? ACTION_TITLE[current.action] : 'Lesson help'} title={current ? ACTION_TITLE[current.action] : ''} width={620}>
        {current && (
          <div className="flex flex-col gap-1">
            <p className="m-0 text-[0.95rem] font-medium text-fg">{current.request}</p>
            {current.selection && <p className="m-0 line-clamp-3 text-[0.85rem] italic text-fg-muted">“{current.selection}”</p>}
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="m-0 text-[0.95rem] text-fg-secondary">Working on it…</p>
            {[92, 100, 76].map((w) => <div key={w} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />)}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="m-0 text-[0.95rem] text-danger">{error}</p>
            {offerManual && !useOwnChat && current && (
              <button type="button" className="btn btn-secondary h-10 py-0" onClick={() => { setManualHere(true); setError(null); setOfferManual(false); }}>Use my own ChatGPT or Claude</button>
            )}
          </div>
        )}

        {useOwnChat && current && !draft && (
          <ManualAiPanel
            key={current.nonce}
            title="Get this from your own chat"
            what="the result"
            getPrompt={async () => {
              const r = await postManual<{ prompt: string }>(url, { ...current, step: 'prompt' });
              if (!r.ok) throw new Error(r.problems[0]);
              return r.data.prompt;
            }}
            importReply={async (reply) => {
              const r = await postManual<{ draft: AssistDraft }>(url, { ...current, step: 'import', reply });
              if (!r.ok) return r;
              showDraft(r.data.draft);
              return { ok: true };
            }}
          />
        )}

        {draft?.type === 'answer' && (
          <>
            <MarkdownProse className="lesson-prose" markdown={draft.text} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary h-10 py-0" disabled={saving || savedToNotes} onClick={() => void saveAnswer()}>{savedToNotes ? 'Saved to notes' : 'Save to notes'}</button>
              {current && <button type="button" className="btn btn-secondary h-10 py-0" onClick={() => void run({ ...current, nonce: current.nonce - 1000 })}>Try again</button>}
            </div>
            <p className="m-0 text-[0.8rem] text-fg-muted">Written by AI. Check anything important.</p>
          </>
        )}

        {draft?.type === 'section' && (
          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-[1.1rem] font-semibold">{draft.heading}</h3>
            <MarkdownProse className="lesson-prose" markdown={draft.body} />
          </section>
        )}

        {draft?.type === 'practice' && (
          <section className="flex flex-col gap-3">
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {draft.items.map((item, i) => (
                <li key={item.title}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-fill-2">
                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]" checked={!!ticked[i]} onChange={(e) => setTicked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[1rem] font-semibold text-fg">{item.title}{item.difficulty ? <span className="font-normal text-fg-muted"> · {item.difficulty}</span> : null}</span>
                      {item.why && <span className="text-[0.88rem] text-fg-secondary">{item.why}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[0.8rem] text-fg-muted">Suggested by AI, so a name or link can be wrong. Each one gets a search link in case.</p>
          </section>
        )}

        {(draft?.type === 'section' || draft?.type === 'practice') && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary h-10 py-0" disabled={saving || !canKeep} onClick={() => void keep()}>{saving ? 'Adding…' : 'Add to lesson'}</button>
            {current && <button type="button" className="btn btn-secondary h-10 py-0" disabled={saving} onClick={() => void run({ ...current, nonce: current.nonce - 1000 })}>Try again</button>}
            <button type="button" className="bg-transparent text-[0.9rem] font-medium text-fg-muted hover:text-fg" onClick={close}>Cancel</button>
          </div>
        )}
      </Drawer>
    </>
  );
}
