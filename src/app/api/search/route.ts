import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { htmlToText } from '@/lib/htmlText';
import { MIN_QUERY, cleanQuery, escapeLike, flattenStrings, matches, snippetAround, type SearchResult } from '@/lib/search';

const PER_KIND = 6;
const CANDIDATES = 40;
const NO_TEXT_LIMIT = 1_000_000;

const moduleHref = (topicId: string, moduleId?: string | null) =>
  `/topics/${topicId}${moduleId ? `?module=${encodeURIComponent(moduleId)}` : ''}`;

/** One search box over your topics, goals, lessons, notes and review cards. */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const q = cleanQuery(new URL(request.url).searchParams.get('q'));
    if (q.length < MIN_QUERY) return NextResponse.json({ results: [] });

    const contains = { contains: escapeLike(q), mode: 'insensitive' as const };
    const liveTopic = { deletedAt: null };
    const pattern = `%${escapeLike(q)}%`;

    const [topics, goals, modules, written, notes, cards] = await Promise.all([
      db.topic.findMany({ where: { userId, ...liveTopic, title: contains }, select: { id: true, title: true }, take: PER_KIND }),
      db.goal.findMany({ where: { userId, OR: [{ title: contains }, { outcome: contains }] }, select: { id: true, title: true, outcome: true }, take: PER_KIND }),
      db.curriculumItem.findMany({
        where: { userId, removed: false, topic: liveTopic, OR: [{ title: contains }, { notes: contains }] },
        select: { topicId: true, legacyId: true, title: true, notes: true, topic: { select: { title: true } } },
        take: CANDIDATES,
      }),
      db.$queryRaw<Array<{ topicId: string; moduleId: string; moduleTitle: string; content: unknown; topicTitle: string }>>`
        SELECT g."topicId", g."moduleId", g."moduleTitle", g."content", t."title" AS "topicTitle"
        FROM "GeneratedLesson" g JOIN "Topic" t ON t."id" = g."topicId"
        WHERE g."userId" = ${userId} AND t."deletedAt" IS NULL AND g."content"::text ILIKE ${pattern}
        LIMIT ${CANDIDATES}`,
      db.note.findMany({ where: { userId, OR: [{ title: contains }, { body: contains }] }, select: { id: true, title: true, body: true }, take: CANDIDATES }),
      db.concept.findMany({
        where: { userId, suspended: false, topic: liveTopic, OR: [{ title: contains }, { prompt: contains }, { answer: contains }] },
        select: { id: true, title: true, prompt: true, answer: true, topicId: true, sourceModuleId: true },
        take: PER_KIND,
      }),
    ]);

    const lessons = new Map<string, SearchResult>();
    for (const m of modules) {
      const inTitle = matches(m.title, q);
      const noteHit = snippetAround(htmlToText(m.notes, NO_TEXT_LIMIT), q);
      if (!inTitle && !noteHit) continue; // the match was only inside HTML markup
      lessons.set(`${m.topicId}|${m.legacyId}`, {
        kind: 'lesson', id: `${m.topicId}:${m.legacyId}`, title: m.title,
        snippet: noteHit ? `In your notes: ${noteHit}` : m.topic.title,
        href: moduleHref(m.topicId, m.legacyId),
      });
    }
    for (const w of written) {
      const key = `${w.topicId}|${w.moduleId}`;
      if (lessons.has(key)) continue;
      // The main text first, so a snippet reads as prose where it can.
      const { explanation, summary, ...rest } = (w.content ?? {}) as Record<string, unknown>;
      const hit = snippetAround(flattenStrings([explanation, summary, rest]), q);
      if (!hit) continue; // the match was only a field name in the saved data
      lessons.set(key, { kind: 'lesson', id: `${w.topicId}:${w.moduleId}`, title: w.moduleTitle, snippet: hit, href: moduleHref(w.topicId, w.moduleId) });
    }

    const noteResults = notes.flatMap((n): SearchResult[] => {
      const text = htmlToText(n.body, NO_TEXT_LIMIT);
      const hit = snippetAround(text, q);
      return matches(n.title, q) || hit ? [{ kind: 'note', id: n.id, title: n.title, snippet: hit ?? text.slice(0, 120), href: `/notes/${n.id}` }] : [];
    });

    const results: SearchResult[] = [
      ...topics.map((t): SearchResult => ({ kind: 'topic', id: t.id, title: t.title, snippet: null, href: `/topics/${t.id}` })),
      ...goals.map((g): SearchResult => ({ kind: 'goal', id: g.id, title: g.title, snippet: snippetAround(g.outcome, q), href: `/goals/${g.id}` })),
      ...Array.from(lessons.values()).slice(0, PER_KIND),
      ...noteResults.slice(0, PER_KIND),
      ...cards.map((c): SearchResult => ({
        kind: 'card', id: c.id, title: c.prompt ?? c.title,
        snippet: c.answer ? snippetAround(c.answer, q) ?? c.answer.slice(0, 120) : null,
        href: moduleHref(c.topicId, c.sourceModuleId),
      })),
    ];
    return NextResponse.json({ results });
  } catch (e) {
    console.error('Search failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
