import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { mirrorConceptsToJson } from '@/lib/conceptSync';

const MAX_PROMPT = 500;
const MAX_ANSWER = 5000;

type Params = { params: { id: string } };

/** Fix a card's question or answer. Its schedule and history stay as they are. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; answer?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT) : '';
    const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, MAX_ANSWER) : '';
    if (!prompt || !answer) return NextResponse.json({ error: 'A card needs a question and an answer.' }, { status: 400 });

    const result = await db.concept.updateMany({ where: { id: params.id, userId }, data: { prompt, answer } });
    if (result.count === 0) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    return NextResponse.json({ prompt, answer });
  } catch (e) {
    console.error('Failed to edit card:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Takes a card out of review. It's hidden rather than erased, so its history is kept. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const concept = await db.concept.findFirst({ where: { id: params.id, userId }, select: { id: true, topicId: true } });
    if (!concept) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    await db.$transaction(async (tx) => {
      await tx.concept.update({ where: { id: concept.id }, data: { suspended: true } });
      const mirror = await mirrorConceptsToJson(tx, concept.topicId);
      await tx.topic.update({ where: { id: concept.topicId }, data: { knowledgeMap: mirror as object } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to remove card:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
