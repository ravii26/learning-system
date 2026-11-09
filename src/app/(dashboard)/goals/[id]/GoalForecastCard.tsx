'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { formatMinutes } from '@/lib/pace';
import type { DeadlineVerdict, GoalForecast } from '@/lib/goalForecast';

const VERDICT_WORD: Record<DeadlineVerdict, string> = { on_track: 'On track', tight: 'Tight', not_realistic: 'Not realistic' };
const MAX_DATED_WEEKS = 104;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** yyyy-mm-dd in local time, as a date input expects. */
function inputDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function headline(f: GoalForecast): string {
  switch (f.status) {
    case 'not_enough_data': return 'Not enough data yet. A forecast appears after two weeks of studying this goal.';
    case 'no_recent_study': return 'No study time on this goal in the last four weeks, so there is no recent pace to forecast from.';
    case 'nothing_left': return 'No planned lessons are left on this goal.';
    case 'forecast':
      return f.weeksHigh > MAX_DATED_WEEKS
        ? 'At your recent pace, this would take more than two years.'
        : `At your recent pace, you would finish between ${day(f.finishLow)} and ${day(f.finishHigh)}.`;
  }
}

function verdictLine(f: Extract<GoalForecast, { status: 'forecast' }>): string | null {
  if (!f.verdict || !f.deadline) return null;
  if (f.verdict === 'on_track') return `You should finish before ${day(f.deadline)}.`;
  if (f.verdict === 'tight') return `${day(f.deadline)} is possible only if your pace holds.`;
  return f.neededWeeklyMinutes
    ? `${day(f.deadline)} would take about ${formatMinutes(f.neededWeeklyMinutes)} a week. Move the date, or pause lower-priority topics.`
    : `${day(f.deadline)} has passed. Set a new date.`;
}

export default function GoalForecastCard({ goalId, onDeadlineChanged }: { goalId: string; onDeadlineChanged: () => void }) {
  const toast = useToast();
  const [forecast, setForecast] = useState<GoalForecast | null>(null);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/goals/${goalId}/forecast`).catch(() => null);
    if (!res?.ok) return;
    const data: GoalForecast = await res.json();
    setForecast(data);
    setDate(inputDate(data.deadline));
  }, [goalId]);

  useEffect(() => { void load(); }, [load]);

  const saveDeadline = async (value: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: value ? new Date(`${value}T12:00:00`).toISOString() : null }),
      });
      if (!res.ok) throw new Error('save failed');
      await load();
      onDeadlineChanged();
    } catch {
      toast.error('Couldn’t save the deadline.');
    } finally {
      setSaving(false);
    }
  };

  if (!forecast) return null;
  const isForecast = forecast.status === 'forecast';
  const verdict = isForecast ? verdictLine(forecast) : null;

  return (
    <section aria-labelledby="forecast-h" className="glass-panel flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="forecast-h" className="m-0 text-[1.15rem] font-semibold">When you might finish</h2>
        {isForecast && forecast.verdict && (
          <span className={`rounded-md px-2 py-0.5 text-[0.8rem] font-semibold ${forecast.verdict === 'on_track' ? 'bg-ink text-on-ink' : 'bg-fill-3 text-fg'}`}>{VERDICT_WORD[forecast.verdict]}</span>
        )}
      </div>
      <p className="m-0 text-[1rem]">{headline(forecast)}</p>
      {verdict && <p className="m-0 text-[0.95rem] text-fg-secondary">{verdict}</p>}
      {isForecast && (
        <p className="m-0 text-[0.85rem] text-fg-muted">
          Based on {formatMinutes(forecast.weeklyMinutes)} a week recently and about {formatMinutes(forecast.remainingMinutes)} left
          {forecast.usedPersonalPace ? ', adjusted to your real lesson pace.' : ', using estimates.'}
        </p>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void saveDeadline(date); }}
      >
        <label htmlFor="goal-deadline" className="text-[0.9rem] font-semibold text-fg-secondary">Deadline</label>
        <input id="goal-deadline" type="date" className="form-input h-9 w-auto py-0" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit" disabled={saving || date === inputDate(forecast.deadline)} className="btn btn-secondary h-9 py-0 text-[0.85rem]">Save</button>
        {forecast.deadline && (
          <button type="button" disabled={saving} onClick={() => void saveDeadline('')} className="bg-transparent p-0 text-[0.85rem] text-fg-secondary underline underline-offset-2 hover:text-fg">Remove</button>
        )}
      </form>
    </section>
  );
}
