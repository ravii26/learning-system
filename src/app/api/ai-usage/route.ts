import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { SEED_USER_ID } from '@/lib/currentUser';

/**
 * AI spend for the app's owner: totals for today / 7 / 30 days, broken down
 * by feature, model and user, plus the latest calls. Other accounts get 403:
 * what the AI costs is the business's number, not the learner's.
 */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== SEED_USER_ID) return NextResponse.json({ error: 'Only the owner can see AI usage.' }, { status: 403 });

  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(Date.now() - 7 * 86_400_000);

  const rows = await db.aiCall.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
  const users = await db.user.findMany({
    where: { id: { in: Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))) } },
    select: { id: true, email: true, name: true },
  });
  const who = (id: string | null) => (id ? users.find((u) => u.id === id)?.email ?? users.find((u) => u.id === id)?.name ?? 'deleted account' : 'scripts / tests');

  type Bucket = { key: string; calls: number; failed: number; costInr: number; promptTokens: number; completionTokens: number; ms: number };
  const group = (list: typeof rows, keyOf: (r: (typeof rows)[number]) => string): Bucket[] => {
    const m = new Map<string, Bucket>();
    for (const r of list) {
      const k = keyOf(r);
      const b = m.get(k) ?? { key: k, calls: 0, failed: 0, costInr: 0, promptTokens: 0, completionTokens: 0, ms: 0 };
      b.calls++;
      if (!r.ok) b.failed++;
      b.costInr += r.costInr ?? 0;
      b.promptTokens += r.promptTokens ?? 0;
      b.completionTokens += r.completionTokens ?? 0;
      b.ms += r.durationMs;
      m.set(k, b);
    }
    return Array.from(m.values()).sort((a, b) => b.costInr - a.costInr || b.calls - a.calls);
  };
  const total = (list: typeof rows) => ({
    calls: list.length,
    failed: list.filter((r) => !r.ok).length,
    costInr: list.reduce((s, r) => s + (r.costInr ?? 0), 0),
    unpriced: list.filter((r) => r.costInr === null && r.provider === 'aicredits' && r.ok).length,
  });

  return NextResponse.json({
    days,
    budgetInr: Number(process.env.AI_DAILY_BUDGET_INR) || null,
    today: total(rows.filter((r) => r.createdAt >= today)),
    week: total(rows.filter((r) => r.createdAt >= week)),
    period: total(rows),
    byPurpose: group(rows, (r) => r.purpose),
    byModel: group(rows, (r) => `${r.provider} · ${r.model}`),
    byUser: group(rows, (r) => who(r.userId)),
    recent: rows.slice(0, 60).map((r) => ({
      at: r.createdAt, purpose: r.purpose, provider: r.provider, model: r.model, ok: r.ok, status: r.status, error: r.error,
      promptTokens: r.promptTokens, completionTokens: r.completionTokens, reasoningTokens: r.reasoningTokens,
      costInr: r.costInr, durationMs: r.durationMs, user: who(r.userId),
    })),
  });
}
