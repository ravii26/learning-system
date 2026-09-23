import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * The 3-second capture inbox — the payload for accretion-mode domains with
 * no syllabus (investing, politics, business; see the project plan's
 * Example C). Deliberately the smallest possible write: a title/rawText
 * and optional URL, no decision about what it becomes. That decision
 * happens later, in the weekly triage ritual (POST /api/captures/[id]/process).
 *
 * URL metadata is fetched client-side via the existing /api/scrape
 * endpoint before this is called, not server-to-server here — "reusing
 * api/scrape" per the plan means the same authenticated, SSRF-guarded
 * endpoint the resource-adding flow already uses, not a second copy of its
 * fetch-and-parse logic.
 */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const captures = await db.captureItem.findMany({
      where: { userId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(captures);
  } catch (e) {
    console.error('Failed to list captures:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { rawText, url, title, sourceType, sourceAuthor, sourceMeta, highlight, tags } = body;

    if (!rawText?.trim() && !url?.trim() && !title?.trim()) {
      return NextResponse.json({ error: 'At least one of rawText, url, or title is required' }, { status: 400 });
    }

    const capture = await db.captureItem.create({
      data: {
        userId,
        rawText: rawText?.trim() || null,
        url: url?.trim() || null,
        title: title?.trim() || null,
        sourceType: sourceType || null,
        sourceAuthor: sourceAuthor || null,
        sourceMeta: sourceMeta ?? undefined,
        highlight: highlight || null,
        tags: Array.isArray(tags) ? tags : [],
        status: 'inbox',
      },
    });

    return NextResponse.json(capture);
  } catch (e) {
    console.error('Failed to create capture:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
