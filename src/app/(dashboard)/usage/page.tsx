'use client';

import React, { useEffect, useState } from 'react';

/**
 * What the AI costs: every call the app (and scripts) made, in ₹, by
 * feature, model and user. Owner only. Costs are estimated from AICredits'
 * published per-token prices and the token counts each response reports.
 */

interface Totals { calls: number; failed: number; costInr: number; unpriced: number }
interface Bucket { key: string; calls: number; failed: number; costInr: number; promptTokens: number; completionTokens: number; ms: number }
interface Call {
  at: string; purpose: string; provider: string; model: string; ok: boolean; status: number | null; error: string | null;
  promptTokens: number | null; completionTokens: number | null; reasoningTokens: number | null; costInr: number | null; durationMs: number; user: string;
}
interface Usage { days: number; budgetInr: number | null; today: Totals; week: Totals; period: Totals; byPurpose: Bucket[]; byModel: Bucket[]; byUser: Bucket[]; recent: Call[] }

const PURPOSE: Record<string, string> = {
  'plan.questions': 'Plan: questions', 'plan.draft': 'Plan: topic list', 'plan.adapt': 'Plan: tailoring',
  lesson: 'Lessons', quiz: 'Quizzes', 'practice.sessions': 'Daily sessions', 'exercise.check': 'Answer checks',
  'explain.check': 'Explain-it checks', socratic: 'Socratic coach', placement: 'Placement checks', checkin: 'Weekly check-ins',
  roadmap: 'Roadmaps', 'topic.curriculum': 'Topic syllabus', 'topic.concepts': 'Topic concepts', 'capture.suggest': 'Capture suggestions', other: 'Other',
};

const rs = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n < 1 && n > 0 ? `₹${n.toFixed(2)}` : `₹${n.toFixed(n < 100 ? 2 : 0)}`);
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/ai-usage?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load usage.'); setData(d); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load usage.'));
  }, [days]);

  if (error) return <div className="mx-auto max-w-[900px]"><p role="alert" className="text-danger">{error}</p></div>;
  if (!data) return <div className="mx-auto flex max-w-[900px] flex-col gap-3" aria-busy="true">{[60, 100, 80].map((w, i) => <div key={i} className="skeleton h-5 rounded" style={{ width: `${w}%` }} />)}</div>;

  const Stat = ({ label, t }: { label: string; t: Totals }) => (
    <div className="glass-panel flex flex-col gap-1 p-5">
      <span className="text-[0.85rem] text-fg-muted">{label}</span>
      <span className="font-serif text-[2rem] leading-none">{rs(t.costInr)}</span>
      <span className="text-[0.85rem] text-fg-secondary">{t.calls} call{t.calls === 1 ? '' : 's'}{t.failed ? ` · ${t.failed} failed` : ''}{t.unpriced ? ` · ${t.unpriced} without a price` : ''}</span>
    </div>
  );

  const Table = ({ title, rows, label }: { title: string; rows: Bucket[]; label?: (k: string) => string }) => (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[1.1rem] font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="m-0 text-[0.9rem] text-fg-muted">Nothing yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[0.9rem]">
            <thead>
              <tr className="border-b border-line text-left text-fg-muted">
                <th className="py-2 pr-3 font-medium"> </th><th className="py-2 pr-3 text-right font-medium">Cost</th>
                <th className="py-2 pr-3 text-right font-medium">Calls</th><th className="py-2 pr-3 text-right font-medium">Per call</th>
                <th className="py-2 pr-3 text-right font-medium">Tokens in / out</th><th className="py-2 text-right font-medium">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.key} className="border-b border-line last:border-b-0">
                  <td className="py-2 pr-3">{label ? label(b.key) : b.key}{b.failed ? <span className="text-fg-muted"> · {b.failed} failed</span> : null}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{rs(b.costInr)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.calls}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{rs(b.calls ? b.costInr / b.calls : 0)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{k(b.promptTokens)} / {k(b.completionTokens)}</td>
                  <td className="py-2 text-right tabular-nums">{(b.ms / Math.max(1, b.calls) / 1000).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-9">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-serif text-[2.4rem] font-normal leading-tight">AI usage</h1>
        <p className="m-0 text-fg-secondary">
          Every AI call, in rupees. Worked out from AICredits’ price list and the tokens each reply reports, so it can differ slightly from your AICredits bill. Gemini (free key) and Groq calls have no ₹ price here: they're billed by Google and Groq, and are free within their free tiers.
          {data.budgetInr ? <> Daily cap: <strong>₹{data.budgetInr}</strong> (AI stops for the day once it’s reached).</> : <> No daily cap set (<code>AI_DAILY_BUDGET_INR</code>).</>}
        </p>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className={`h-9 rounded-lg px-3 text-[0.85rem] font-medium ${days === d ? 'bg-ink text-on-ink' : 'border-[1.5px] border-line text-fg-secondary hover:border-line-hover'}`}>
              {d} days
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today" t={data.today} />
        <Stat label="Last 7 days" t={data.week} />
        <Stat label={`Last ${data.days} days`} t={data.period} />
      </div>

      <Table title="By feature" rows={data.byPurpose} label={(key) => PURPOSE[key] ?? key} />
      <Table title="By model" rows={data.byModel} />
      <Table title="By user" rows={data.byUser} />

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[1.1rem] font-semibold">Latest calls</h2>
        {data.recent.length === 0 ? <p className="m-0 text-[0.9rem] text-fg-muted">No AI calls logged yet. Logging starts from this version.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[0.85rem]">
              <thead>
                <tr className="border-b border-line text-left text-fg-muted">
                  <th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Feature</th><th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 text-right font-medium">In / out</th><th className="py-2 pr-3 text-right font-medium">Cost</th><th className="py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((c, i) => (
                  <tr key={i} className="border-b border-line align-top last:border-b-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-fg-secondary">{new Date(c.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-1.5 pr-3">{PURPOSE[c.purpose] ?? c.purpose}<div className="text-[0.78rem] text-fg-muted">{c.user}</div></td>
                    <td className="py-1.5 pr-3">{c.model}{!c.ok && <div className="text-[0.78rem] text-danger">{c.status ? `${c.status} · ` : ''}{c.error?.slice(0, 80) ?? 'failed'}</div>}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{c.promptTokens ?? '—'} / {c.completionTokens ?? '—'}{c.reasoningTokens ? <div className="text-[0.78rem] text-fg-muted">{c.reasoningTokens} thinking</div> : null}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rs(c.costInr)}</td>
                    <td className="py-1.5 text-right tabular-nums">{(c.durationMs / 1000).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
