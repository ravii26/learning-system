import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { asChecklist, type ChecklistItem } from '@/lib/lessonAssist';
import { parseProblemInput, problemReviewCard } from '@/lib/problems';
import { addReviewCards } from '@/lib/reviewCardPersist';

type Params = { params: { id: string; moduleId: string; additionId: string } };

/**
 * Track a checklist problem: `outcome` records how it went in the problem log,
 * `clear` takes that back, and `remove` drops it from the list.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const addition = await db.lessonAddition.findFirst({ where: { id: params.additionId, userId, topicId: params.id, moduleId: params.moduleId, type: 'practice' } });
    if (!addition) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const items = asChecklist(addition.items);
    const item = items.find((i) => i.id === body.itemId);
    if (!item) return NextResponse.json({ error: 'That problem isn’t on the list.' }, { status: 404 });

    const save = (tx: Prisma.TransactionClient, next: ChecklistItem[]) =>
      tx.lessonAddition.update({ where: { id: addition.id }, data: { items: next as unknown as Prisma.InputJsonValue } });
    const forget = (tx: Prisma.TransactionClient) =>
      item.attemptId ? tx.problemAttempt.deleteMany({ where: { id: item.attemptId, userId } }) : Promise.resolve();

    if (body.remove === true || body.clear === true) {
      const next = body.remove === true
        ? items.filter((i) => i.id !== item.id)
        : items.map((i) => (i.id === item.id ? { ...i, outcome: null, attemptId: null } : i));
      const updated = await db.$transaction(async (tx) => {
        await forget(tx);
        return save(tx, next);
      });
      return NextResponse.json({ addition: updated });
    }

    const parsed = parseProblemInput({ title: item.title, url: item.url, difficulty: item.difficulty, outcome: body.outcome, notes: body.notes, moduleId: params.moduleId });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { attemptedAt: _unused, ...fields } = parsed.value;

    const result = await db.$transaction(async (tx) => {
      await forget(tx);
      const attempt = await tx.problemAttempt.create({ data: { ...fields, userId, topicId: params.id } });
      const card = problemReviewCard(attempt as { title: string; outcome: 'cold' | 'hint' | 'stuck'; notes: string | null });
      const cards = card ? await addReviewCards(tx, userId, params.id, params.moduleId, [card], { dueInDays: 3 }) : { added: 0 };
      const updated = await save(tx, items.map((i) => (i.id === item.id ? { ...i, outcome: fields.outcome, attemptId: attempt.id } : i)));
      return { addition: updated, cardsAdded: cards.added };
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to update checklist:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await db.lessonAddition.deleteMany({ where: { id: params.additionId, userId: auth.userId, topicId: params.id, moduleId: params.moduleId } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete addition:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
