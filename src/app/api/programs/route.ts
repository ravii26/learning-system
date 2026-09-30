import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseIntake } from '@/lib/program/intake';
import { resolveFieldForUser, saveFieldMap, trustedResources } from '@/lib/program/library';
import { composeDraft, sanitizeClientAdjustments } from '@/lib/program/generate';
import { persistProgram } from '@/lib/program/persist';
import { recomputeGoalReadiness } from '@/lib/goalReadinessRecompute';
import { checkinDueAt } from '@/lib/program/checkinServer';
import { reverifyFound } from '@/lib/resources/enrich';
import { isUsable, verifyLink } from '@/lib/resources/verifyLink';

export const maxDuration = 60;

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

    const resolved = await resolveFieldForUser(db, userId, body, parsed.intake.goal);
    if (resolved.kind !== 'map') {
      return NextResponse.json({ error: 'Approve a topic list before creating the program.' }, { status: 400 });
    }

    const base = { map: resolved.map, field: resolved.field, mapQuality: resolved.mapQuality, intake: parsed.intake };
    const trusted = await trustedResources(db, userId, resolved.field);
    const adjustments = sanitizeClientAdjustments(body.adjustments, base);
    adjustments.foundResources = await reverifyFound(
      adjustments.foundResources ?? [],
      (u) => verifyLink(u, { timeoutMs: 2500 }).then((r) => isUsable(r.status))
    );
    const removedItemIds = Array.isArray(body.removedItemIds)
      ? body.removedItemIds.filter((x): x is string => typeof x === 'string').slice(0, 50)
      : [];
    const draft = composeDraft({ ...base, adjustments, removedItemIds, trusted });
    if (draft.phases.length === 0) return NextResponse.json({ error: 'The plan is empty.' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      // A topic list you just approved joins your library, so the next plan
      // for this field starts from it instead of a fresh AI draft.
      if (resolved.origin === 'approved') {
        const sources = Array.isArray(body.mapSources)
          ? body.mapSources
              .filter((x: any) => x && typeof x.title === 'string' && typeof x.url === 'string' && /^https:\/\//.test(x.url))
              .slice(0, 8)
              .map((x: any) => ({ title: String(x.title).slice(0, 140), url: String(x.url).slice(0, 500) }))
          : null;
        await saveFieldMap(tx, userId, resolved.map, { source: 'ai', sources });
      }
      return persistProgram(tx, { userId, draft, adjustments });
    }, { timeout: 60_000 });
    await recomputeGoalReadiness(db, userId, result.goalId).catch(() => {});
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error('Failed to create program:', e);
    const message = e instanceof Error ? e.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
