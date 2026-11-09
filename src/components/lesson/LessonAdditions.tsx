'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MarkdownProse } from '@/components/MarkdownProse';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ToastProvider';
import { confirmDialog } from '@/components/dialogs';
import { asChecklist, searchHref, type ChecklistItem } from '@/lib/lessonAssist';
import type { ProblemOutcome } from '@/lib/problems';

interface Addition {
  id: string;
  type: string;
  heading: string;
  body: string;
  items: unknown;
}

const MARKS: Array<{ outcome: ProblemOutcome; label: string }> = [
  { outcome: 'cold', label: 'Solved alone' },
  { outcome: 'hint', label: 'Needed a hint' },
  { outcome: 'stuck', label: 'Stuck' },
];
const small = 'h-8 rounded-lg border border-line bg-transparent px-2.5 text-[0.82rem] font-medium text-fg-secondary hover:border-line-hover hover:text-fg disabled:opacity-50';
const quiet = 'bg-transparent p-0 text-[0.82rem] font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline';

function ChecklistRow({ item, busy, onMark, onClear, onRemove }: {
  item: ChecklistItem;
  busy: boolean;
  onMark: (outcome: ProblemOutcome, notes?: string) => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  const [needsIdea, setNeedsIdea] = useState<ProblemOutcome | null>(null);
  const [idea, setIdea] = useState('');
  const href = item.url ?? searchHref(item);

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] ${item.outcome ? 'bg-ink text-on-ink' : 'shadow-[inset_0_0_0_1.5px_var(--border-strong)]'}`}>
          {item.outcome && <Icon name="check" size={14} strokeWidth={2.6} />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[1rem] font-semibold text-fg">{item.title}</a>
          <span className="text-[0.82rem] text-fg-muted">
            {[item.platform, item.difficulty, item.suggested ? 'AI-suggested' : null].filter(Boolean).join(' · ')}
          </span>
          {item.why && <span className="text-[0.9rem] text-fg-secondary">{item.why}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        {item.outcome ? (
          <>
            <span className="text-[0.85rem] font-semibold text-fg">{MARKS.find((m) => m.outcome === item.outcome)?.label}</span>
            <button type="button" disabled={busy} className={quiet} onClick={onClear}>Change</button>
          </>
        ) : (
          MARKS.map((m) => (
            <button key={m.outcome} type="button" disabled={busy} aria-pressed={needsIdea === m.outcome} className={small} onClick={() => (m.outcome === 'cold' ? onMark('cold') : setNeedsIdea(m.outcome))}>{m.label}</button>
          ))
        )}
        <span className="flex-1" />
        <a href={searchHref(item)} target="_blank" rel="noopener noreferrer" className="text-[0.82rem] font-medium text-fg-muted">Search</a>
        <button type="button" disabled={busy} className={quiet} onClick={onRemove}>Remove</button>
      </div>

      {needsIdea && !item.outcome && (
        <form className="flex flex-col gap-2 pl-8" onSubmit={(e) => { e.preventDefault(); onMark(needsIdea, idea); }}>
          <label htmlFor={`idea-${item.id}`} className="text-[0.85rem] text-fg-secondary">What was the key idea? It comes back as a review card.</label>
          <input id={`idea-${item.id}`} className="form-input h-10 py-0" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Optional" autoFocus />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-secondary h-9 py-0 text-[0.85rem]">Save</button>
            <button type="button" className={quiet} onClick={() => setNeedsIdea(null)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

/** What you've added to this lesson. Never touched by rewriting the lesson. */
export default function LessonAdditions({ topicId, moduleId, refreshKey, onEvidenceChanged }: {
  topicId: string;
  moduleId: string;
  refreshKey: number;
  onEvidenceChanged?: () => void;
}) {
  const toast = useToast();
  const base = `/api/topics/${topicId}/modules/${moduleId}/additions`;
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(base).catch(() => null);
    if (res?.ok) setAdditions((await res.json()).additions ?? []);
  }, [base]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const patch = async (additionId: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`${base}/${additionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Couldn’t save that.'); return; }
      setAdditions((prev) => prev.map((a) => (a.id === additionId ? data.addition : a)));
      if (data.cardsAdded > 0) toast.success('Its key idea comes back in Review in 3 days');
      onEvidenceChanged?.();
    } catch {
      toast.error('Couldn’t reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove this from the lesson?', danger: true, confirmLabel: 'Remove' }))) return;
    const res = await fetch(`${base}/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) setAdditions((prev) => prev.filter((a) => a.id !== id));
    else toast.error('Couldn’t remove that.');
  };

  const addOwn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const url = link.trim() ? (/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`) : '';
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'practice', items: [{ title: title.trim(), url }] }) }).catch(() => null);
    if (res?.ok) { setTitle(''); setLink(''); await load(); }
    else toast.error('Couldn’t add that.');
  };

  const practice = additions.find((a) => a.type === 'practice');
  const sections = additions.filter((a) => a.type === 'section');
  const items = asChecklist(practice?.items);
  const finished = items.filter((i) => i.outcome).length;

  return (
    <div className="flex flex-col gap-9">
      {sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[1.15rem] font-semibold">{s.heading}</h3>
            <span className="flex items-center gap-3">
              <span className="text-[0.8rem] text-fg-muted">You added this</span>
              <button type="button" className={quiet} onClick={() => void removeSection(s.id)}>Remove</button>
            </span>
          </div>
          <MarkdownProse className="lesson-prose" markdown={s.body} />
        </section>
      ))}

      <section aria-label="Practice problems" className="flex flex-col gap-2">
        {items.length > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="m-0 text-[1.15rem] font-semibold">Practice problems</h3>
              <span className="text-[0.85rem] text-fg-muted">{finished} of {items.length} done</span>
            </div>
            <ul className="m-0 list-none p-0">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onMark={(outcome, notes) => void patch(practice!.id, { itemId: item.id, outcome, notes })}
                  onClear={() => void patch(practice!.id, { itemId: item.id, clear: true })}
                  onRemove={() => void patch(practice!.id, { itemId: item.id, remove: true })}
                />
              ))}
            </ul>
          </>
        )}
        <details>
          <summary className="cursor-pointer text-[0.88rem] font-medium text-fg-secondary">Add a problem you found</summary>
          <form onSubmit={(e) => void addOwn(e)} className="mt-2 flex flex-wrap gap-2">
            <label htmlFor="own-title" className="sr-only">Problem name</label>
            <input id="own-title" className="form-input h-10 min-w-[180px] flex-1 py-0" placeholder="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="own-link" className="sr-only">Link</label>
            <input id="own-link" className="form-input h-10 min-w-[180px] flex-1 py-0" placeholder="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} />
            <button type="submit" disabled={!title.trim()} className="btn btn-secondary h-10 py-0">Add</button>
          </form>
        </details>
      </section>
    </div>
  );
}
