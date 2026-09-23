import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { computeRepScore } from '@/lib/practiceScore';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get('topicId');

    const reps = await db.practiceRep.findMany({
      where: { userId, ...(topicId ? { topicId } : {}) },
      orderBy: { occurredAt: 'desc' },
    });
    return NextResponse.json(reps);
  } catch (e) {
    console.error('Failed to fetch practice reps:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { topicId, promptText, promptConceptId, rubricScores, invertedKeys, recordingUrl, transcript, aiFeedback, durationSeconds } = body as {
      topicId?: string;
      promptText?: string;
      promptConceptId?: string;
      rubricScores?: Record<string, number>;
      invertedKeys?: string[];
      recordingUrl?: string;
      transcript?: string;
      aiFeedback?: string;
      durationSeconds?: number;
    };

    if (!topicId) {
      return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
    }
    if (!promptText || !promptText.trim()) {
      return NextResponse.json({ error: 'promptText is required' }, { status: 400 });
    }
    if (!rubricScores || Object.keys(rubricScores).length === 0) {
      return NextResponse.json({ error: 'rubricScores must have at least one dimension' }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null } });
    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    if (promptConceptId) {
      const concept = await db.concept.findFirst({ where: { id: promptConceptId, userId } });
      if (!concept) {
        return NextResponse.json({ error: 'promptConceptId does not reference a concept you own' }, { status: 400 });
      }
    }

    const score = computeRepScore({ scores: rubricScores, invertedKeys: invertedKeys || [] });

    const rep = await db.practiceRep.create({
      data: {
        userId,
        topicId,
        promptText: promptText.trim(),
        promptConceptId: promptConceptId || null,
        rubricScores,
        invertedKeys: invertedKeys || [],
        score,
        recordingUrl: recordingUrl || null,
        transcript: transcript || null,
        aiFeedback: aiFeedback || null,
        durationSeconds: durationSeconds ?? null,
      },
    });

    return NextResponse.json(rep);
  } catch (e) {
    console.error('Failed to create practice rep:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
