/**
 * Stores every AI request attempt (AiCall table) with its tokens and ₹ cost,
 * and enforces the optional daily spending cap. Logging never breaks the
 * call it describes: a failed write is only reported to the console.
 */
import type { AttemptLog } from './attempt';
import { costOf, priceFor } from './pricing';

const inTests = () => Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';

// Imported lazily so code that only builds prompts (and its tests) never opens a DB connection.
const database = async () => (await import('../db')).db;

export async function logAttempts(purpose: string, userId: string | null, attempts: AttemptLog[]): Promise<void> {
  if (!attempts.length || inTests()) return;
  try {
    const rows = await Promise.all(attempts.map(async (a) => ({
      userId,
      purpose: purpose.slice(0, 60),
      provider: a.provider,
      model: a.model.slice(0, 120),
      ok: a.ok,
      status: a.status ?? null,
      error: a.error?.slice(0, 300) ?? null,
      promptTokens: a.promptTokens ?? null,
      completionTokens: a.completionTokens ?? null,
      reasoningTokens: a.reasoningTokens ?? null,
      // Groq is billed separately (or free tier): no ₹ price for it here.
      costInr: a.provider === 'manual' ? 0 : a.provider === 'aicredits' ? costOf(await priceFor(a.model), a.promptTokens ?? null, a.completionTokens ?? null) : null,
      reportedCost: a.reportedCost ?? null,
      durationMs: Math.round(a.durationMs),
    })));
    await (await database()).aiCall.createMany({ data: rows });
  } catch (e) {
    console.error('Could not log AI usage:', e instanceof Error ? e.message : e);
  }
}

export class AiBudgetReachedError extends Error {
  constructor(spent: number, budget: number) {
    super(`Today's AI budget is used up (₹${spent.toFixed(2)} of ₹${budget}). It resets at midnight, or raise AI_DAILY_BUDGET_INR.`);
    this.name = 'AiBudgetReachedError';
  }
}

/** Throws once today's logged AICredits spend reaches AI_DAILY_BUDGET_INR (unset = no cap). */
export async function assertWithinDailyBudget(): Promise<void> {
  const budget = Number(process.env.AI_DAILY_BUDGET_INR);
  if (!Number.isFinite(budget) || budget <= 0 || inTests()) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let spent = 0;
  try {
    const sum = await (await database()).aiCall.aggregate({ where: { createdAt: { gte: start } }, _sum: { costInr: true } });
    spent = sum._sum.costInr ?? 0;
  } catch (e) {
    // Can't read the log: don't take every AI feature down over it.
    console.error('Could not check the AI budget:', e instanceof Error ? e.message : e);
    return;
  }
  if (spent >= budget) throw new AiBudgetReachedError(spent, budget);
}

/** A reply the learner got from their own ChatGPT/Claude and pasted in: ₹0 to us, logged so /usage shows the saving. */
export async function logManualImport(purpose: string, userId: string | null, via = 'manual'): Promise<void> {
  await logAttempts(purpose, userId, [{ provider: 'manual', model: via === 'manual' ? 'learner’s own chat' : via, ok: true, durationMs: 0 }]);
}
