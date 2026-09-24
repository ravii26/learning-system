import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { SEED_USER_ID } from '@/lib/currentUser';

/**
 * Capture from a phone without a browser session — for iOS Shortcuts,
 * Android "HTTP Shortcuts", or a share-sheet action:
 *
 *   POST /api/capture-hook
 *   Authorization: Bearer <CAPTURE_TOKEN>
 *   Content-Type: application/json
 *   { "text": "margin of safety", "url": "https://...", "title": "..." }
 *
 * Disabled (404) unless CAPTURE_TOKEN is set. The token is accepted only in
 * the Authorization header, never a query string, so it can't leak into
 * server logs or browser history. Single-user app: captures go to the seed
 * user. Items land in the same inbox as every other capture.
 */
const MAX_LEN = 5000;

function tokenMatches(provided: string, expected: string): boolean {
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.CAPTURE_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { text?: unknown; url?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_LEN) : null);
  const text = str(body.text);
  const title = str(body.title);
  let url = str(body.url);

  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'url must start with http:// or https://' }, { status: 400 });
  }
  // A share sheet often sends just a URL as "text".
  if (!url && text && /^https?:\/\/\S+$/i.test(text)) url = text;
  if (!text && !url && !title) {
    return NextResponse.json({ error: 'Send at least one of text, url or title' }, { status: 400 });
  }

  try {
    const capture = await db.captureItem.create({
      data: {
        userId: SEED_USER_ID,
        rawText: text && text !== url ? text : null,
        url,
        title,
        sourceType: url ? 'article' : 'thought',
        tags: ['mobile'],
      },
      select: { id: true, createdAt: true },
    });
    return NextResponse.json({ ok: true, id: capture.id });
  } catch (e) {
    console.error('capture-hook failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
