import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

const VALID_KINDS = ['project', 'writing', 'presentation', 'mock_interview', 'other'];

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get('topicId');

    const artifacts = await db.artifact.findMany({
      where: { userId, ...(topicId ? { topicId } : {}) },
      orderBy: { occurredAt: 'desc' },
    });
    return NextResponse.json(artifacts);
  } catch (e) {
    console.error('Failed to fetch artifacts:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { topicId, title, description, url, kind, occurredAt } = body as {
      topicId?: string;
      title?: string;
      description?: string;
      url?: string;
      kind?: string;
      occurredAt?: string;
    };

    if (!topicId) {
      return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (kind && !VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: `Invalid kind: ${kind}` }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null } });
    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const artifact = await db.artifact.create({
      data: {
        userId,
        topicId,
        title: title.trim(),
        description: description || null,
        url: url || null,
        kind: kind || null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    });

    return NextResponse.json(artifact);
  } catch (e) {
    console.error('Failed to create artifact:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
