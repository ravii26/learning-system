'use client';

import React, { useEffect, useState } from 'react';

/**
 * "Use your own ChatGPT / Claude / Gemini": copy our prompt, run it in your
 * own chat, paste the reply (or upload it as a file) and we check it and
 * build from it exactly as if our AI had written it. Free for the app.
 */

export type ImportOutcome = { ok: true } | { ok: false; problems: string[]; fixPrompt?: string };

const CHATS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ManualAiPanel({ title, what, getPrompt, importReply, onCancel }: {
  title: string;
  /** One line: what the chat will write, e.g. "your topic list". */
  what: string;
  getPrompt: () => Promise<string>;
  importReply: (reply: string) => Promise<ImportOutcome>;
  onCancel?: () => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'prompt' | 'fix' | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [fix, setFix] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPrompt().then((p) => alive && setPrompt(p)).catch((e) => alive && setLoadError(e instanceof Error ? e.message : 'Could not prepare the prompt.'));
    return () => { alive = false; };
    // The prompt is fetched once per panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCopy = async (text: string, which: 'prompt' | 'fix') => {
    if (await copy(text)) {
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } else if (which === 'prompt') setShowPrompt(true); // select it by hand
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) return setProblems(['That file is too big. Paste the reply instead.']);
    setReply(await file.text());
    setProblems(null);
  };

  const submit = async () => {
    setBusy(true);
    setProblems(null);
    setFix(null);
    try {
      const r = await importReply(reply);
      if (!r.ok) {
        setProblems(r.problems);
        setFix(r.fixPrompt ?? null);
      }
    } catch (e) {
      setProblems([e instanceof Error ? e.message : 'Could not import that.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={title} className="glass-panel flex flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-[1.25rem] font-semibold">{title}</h2>
        <p className="m-0 text-[0.95rem] text-fg-secondary">
          Free: your own ChatGPT, Claude or Gemini writes {what}, and we check it and build from it. Their free plans work.
        </p>
      </header>

      <ol className="m-0 flex list-none flex-col gap-5 p-0">
        <li className="flex flex-col gap-2">
          <span className="font-semibold">1. Copy the prompt</span>
          {loadError ? <p role="alert" className="m-0 text-danger">{loadError}</p> : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!prompt} onClick={() => prompt && doCopy(prompt, 'prompt')} className="btn btn-primary h-10 py-0">
                {!prompt ? 'Preparing…' : copied === 'prompt' ? 'Copied ✓' : 'Copy prompt'}
              </button>
              {prompt && (
                <button type="button" onClick={() => setShowPrompt((v) => !v)} className="text-[0.85rem] font-medium text-fg-muted hover:text-fg">
                  {showPrompt ? 'Hide' : 'Show'} prompt ({Math.round(prompt.length / 1000)}k characters)
                </button>
              )}
            </div>
          )}
          {showPrompt && prompt && (
            <textarea readOnly value={prompt} rows={8} className="form-input py-2 font-mono text-[0.78rem]" onFocus={(e) => e.currentTarget.select()} aria-label="Prompt to copy" />
          )}
        </li>

        <li className="flex flex-col gap-2">
          <span className="font-semibold">2. Paste it into a new chat and send</span>
          <div className="flex flex-wrap gap-2">
            {CHATS.map((c) => (
              <a key={c.name} href={c.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary h-10 py-0 no-underline hover:no-underline">
                Open {c.name}
              </a>
            ))}
          </div>
          <span className="text-[0.85rem] text-fg-muted">Wait until it has finished writing. If it stops halfway, type “continue”.</span>
        </li>

        <li className="flex flex-col gap-2">
          <label htmlFor="manual-reply" className="font-semibold">3. Copy its whole reply and paste it here</label>
          <textarea id="manual-reply" rows={6} value={reply} onChange={(e) => { setReply(e.target.value); setProblems(null); }}
            className="form-input py-2 text-[0.9rem]" placeholder="Paste the chat’s reply…" />
          <label className="self-start text-[0.85rem] font-medium text-fg-secondary">
            Or upload it as a file (.json, .txt, .md){' '}
            <input type="file" accept=".json,.txt,.md,application/json,text/plain,text/markdown" className="text-[0.85rem]" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </li>
      </ol>

      {problems && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <span className="font-semibold">That reply couldn’t be used</span>
          <ul className="m-0 flex flex-col gap-1 pl-5 text-[0.92rem]">{problems.slice(0, 5).map((p) => <li key={p}>{p}</li>)}</ul>
          {fix && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => doCopy(fix, 'fix')} className="btn btn-secondary h-9 py-0 text-[0.85rem]">
                {copied === 'fix' ? 'Copied ✓' : 'Copy a “please fix it” message'}
              </button>
              <span className="text-[0.85rem] text-fg-muted">Send it in the same chat, then paste the new reply.</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="button" onClick={submit} disabled={!reply.trim() || busy} className="btn btn-primary h-12 px-6 py-0 text-[1rem]">
          {busy ? 'Checking…' : 'Use this reply'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-[0.9rem] font-medium text-fg-muted hover:text-fg">Cancel</button>}
      </div>
    </section>
  );
}

/** Posts a manual step to a route and turns its answer into an ImportOutcome. */
export async function postManual<T>(url: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; problems: string[]; fixPrompt?: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, mode: 'manual' }) });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data: data as T };
  return { ok: false, problems: Array.isArray(data.problems) && data.problems.length ? data.problems : [data.error || 'Could not import that.'], fixPrompt: data.fixPrompt };
}
