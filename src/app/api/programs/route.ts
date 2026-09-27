import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseIntake } from '@/lib/program/intake';
import { resolveMap } from '@/lib/program/resolve';
import { composeDraft, sanitizeClientAdjustments } from '@/lib/program/generate';
import { persistProgram } from '@/lib/program/persist';
import { recomputeGoalReadiness } from '@/lib/goalReadinessRecompute';
import { checkinDueAt } from '@/lib/program/checkinServer';

/** Your active programs, with whether a weekly check-in is due or waiting — for the Today card. */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const programs = await db.program.findMany({
      where: { userId, status: 'active', goal: { status: 'active' } },
      select: { goalId: true, version: true, goal: { select: { title: true } } },
    });
    const out = [];
    for (const p of programs) {
      const [dueAt, pending] = await Promise.all([
        checkinDueAt(db, userId, p.goalId),
        db.weeklyCheckin.count({ where: { userId, goalId: p.goalId, status: 'proposed' } }),
      ]);
      out.push({ goalId: p.goalId, title: p.goal.title, version: p.version, dueAt, checkinDue: !!dueAt && Date.now() >= dueAt.getTime(), checkinPending: pending > 0 });
    }
    return NextResponse.json(out);
  } catch (e) {
    console.error('Failed to list programs:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Approves a draft. The program is rebuilt here from trusted parts — the
 * intake, a curated or re-validated map, re-clamped adjustments and the
 * learner's removals — never taken from the client's copy of the draft.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseIntake(body.intake);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const resolved = resolveMap(body, parsed.intake.goal);
    if (resolved.kind !== 'map') {
      return NextResponse.json({ error: 'Approve a topic list before creating the program.' }, { status: 400 });
    }

    const base = { map: resolved.map, field: resolved.field, mapQuality: resolved.mapQuality, intake: parsed.intake };
    const adjustments = sanitizeClientAdjustments(body.adjustments, base);
    const removedItemIds = Array.isArray(body.removedItemIds)
      ? body.removedItemIds.filter((x): x is string => typeof x === 'string').slice(0, 50)
      : [];
    const draft = composeDraft({ ...base, adjustments, removedItemIds });
    if (draft.phases.length === 0) return NextResponse.json({ error: 'The plan is empty.' }, { status: 400 });

    const result = await db.$transaction((tx) => persistProgram(tx, { userId, draft, adjustments }), { timeout: 60_000 });
    await recomputeGoalReadiness(db, userId, result.goalId).catch(() => {});
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error('Failed to create program:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
