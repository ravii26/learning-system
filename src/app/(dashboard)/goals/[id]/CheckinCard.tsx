'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { CheckinView } from '@/lib/program/checkinServer';
import type { Decision } from '@/lib/program/checkin';

/**
 * Weekly check-in: what happened this week (facts), and up to three changes
 * the learner accepts, adjusts or declines. Nothing changes without a click;
 * accepted changes become the next plan version.
 */

interface State { dueAt: string; due: boolean; pending: CheckinView | null }

export default function CheckinCard({ goalId, onPlanChanged }: { goalId: string; onPlanChanged: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<CheckinView | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/goals/${goalId}/checkin`).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, [goalId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/goals/${goalId}/checkin`, { method: 'POST' }).catch(() => null);
    const data = res ? await res.json() : null;
    if (res?.ok) {
      setResult(data);
      setDecisions(Object.fromEntries((data.proposal ?? []).map((_: unknown, i: number) => [i, { index: i, action: 'accept' }])));
    } else setMessage(data?.error ?? 'Could not run the check-in.');
    setBusy(false);
    load();
  };

  const apply = async (checkin: CheckinView) => {
    setBusy(true);
    const res = await fetch(`/api/goals/${goalId}/checkin/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send a decision for every change, exactly as shown: untouched ones display
      // "Accept", so they must be sent as accept (a pending check-in loaded from
      // the server starts with no recorded clicks).
      body: JSON.stringify({ checkinId: checkin.id, decisions: checkin.proposal.map((_, i) => decisions[i] ?? { index: i, action: 'accept' }) }),
    }).catch(() => null);
    const data = res ? await res.json() : null;
    setBusy(false);
    if (res?.ok) {
      setResult(null);
      setMessage(data.created ? `Plan updated to version ${data.version}. The old version is kept in Plan history.` : 'No changes made. Your plan stays as it is.');
      onPlanChanged();
      load();
    } else setMessage(data?.error ?? 'Could not apply your decisions.');
  };

  if (!state) return null;
  const checkin = result ?? state.pending;
  const h = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;

  if (checkin && checkin.status === 'no_change') {
    return (
      <section className="glass-panel flex flex-col gap-1.5 p-5">
        <h2 className="m-0 text-[1rem] font-semibold">Weekly check-in: on track</h2>
        <p className="m-0 text-[0.92rem] text-fg-secondary">
          {h(checkin.summary.actualMinutes)} of {h(checkin.summary.plannedMinutes)} studied, nothing slipping. No changes needed.
        </p>
      </section>
    );
  }

  if (checkin && checkin.status === 'proposed') {
    const set = (i: number, d: Partial<Decision>) => setDecisions((p) => ({ ...p, [i]: { ...p[i], index: i, ...d } as Decision }));
    return (
      <section aria-labelledby="checkin-h" className="glass-panel flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 id="checkin-h" className="m-0 text-[1.1rem] font-semibold">Weekly check-in</h2>
          <span className="text-[0.85rem] text-fg-muted">
            Planned {h(checkin.summary.plannedMinutes)} · studied {h(checkin.summary.actualMinutes)} · {checkin.summary.modulesCompleted.length} modules done · {checkin.summary.problems.cold} problems solved cold · {checkin.summary.practiceReps} practice reps
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {checkin.signals.map((s) => <li key={s.id} className="text-[0.92rem] text-fg-secondary">⚠ {s.text}</li>)}
        </ul>
        <div className="flex flex-col gap-3">
          <span className="text-[0.9rem] font-semibold">Suggested changes</span>
          {checkin.proposal.map((c, i) => {
            const d = decisions[i] ?? { index: i, action: 'accept' };
            return (
              <div key={i} className="flex flex-col gap-2 rounded-xl border-[1.5px] border-line p-3.5">
                <span className="font-semibold">{c.label}</span>
                <span className="text-[0.85rem] text-fg-muted">{c.reason}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {(['accept', 'modify', 'decline'] as const).map((a) => (
                    <button key={a} type="button" aria-pressed={d.action === a} onClick={() => set(i, { action: a })}
                      className={`h-8 rounded-md px-3 text-[0.82rem] font-medium ${d.action === a ? 'bg-ink text-on-ink' : 'border border-line text-fg-secondary hover:border-line-hover'}`}>
                      {a === 'accept' ? 'Accept' : a === 'modify' ? 'Adjust' : 'Decline'}
                    </button>
                  ))}
                  {d.action === 'modify' && c.type !== 'focus' && (
                    <input type="number" aria-label="New value" step={c.type === 'emphasize' ? 0.1 : 1}
                      min={c.type === 'emphasize' ? 0.5 : 1} max={c.type === 'emphasize' ? 1.5 : 60}
                      defaultValue={c.type === 'set_hours' ? c.hoursPerWeek : c.factor}
                      onChange={(e) => set(i, { value: Number(e.target.value) })} className="form-input h-8 w-20 py-0" />
                  )}
                  {d.action === 'modify' && c.type === 'focus' && (
                    <input type="text" aria-label="Focus note" defaultValue={c.text} onChange={(e) => set(i, { value: e.target.value })} className="form-input h-8 min-w-[220px] flex-1 py-0" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => apply(checkin)} disabled={busy} className="btn btn-primary h-10 py-0">{busy ? 'Applying…' : 'Apply my choices'}</button>
          <span className="text-[0.82rem] text-fg-muted">Accepted changes make a new plan version; your topics and progress stay.</span>
        </div>
        {message && <p role="status" className="m-0 text-[0.9rem] text-fg-secondary">{message}</p>}
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-line px-5 py-4">
      <span className="text-[0.95rem]">
        {state.due
          ? <><strong>Your weekly check-in is ready.</strong> <span className="text-fg-secondary">A quick look at last week, and any changes worth making.</span></>
          : <span className="text-fg-secondary">Next weekly check-in: {new Date(state.dueAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
      </span>
      {state.due && <button type="button" onClick={run} disabled={busy} className="btn btn-primary h-10 py-0">{busy ? 'Looking at your week…' : 'Start check-in'}</button>}
      {message && <p role="status" className="m-0 w-full text-[0.9rem] text-fg-secondary">{message}</p>}
    </section>
  );
}
