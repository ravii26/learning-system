import { describe, it, expect } from 'vitest';
import { classifyStatus, verifyLink } from './verifyLink';
import { normalizeTitle, titlesMatch } from './openLibrary';
import { enrichResources, reverifyFound } from './enrich';
import { getMap } from '@/data/competencies';
import { sanitizeMap } from '@/lib/program/mapDraft';
import { buildSkeleton } from '@/lib/program/skeleton';
import { EMPTY_ADJUSTMENTS } from '@/lib/program/adapt';
import type { Intake } from '@/lib/program/types';

const res = (status: number, location?: string) =>
  ({ status, headers: { get: (h: string) => (h.toLowerCase() === 'location' ? location ?? null : null) } }) as unknown as Response;
const safeAll = async () => ({ safe: true });

describe('verifyLink', () => {
  it('treats bot walls as reachable and 404s as broken', () => {
    expect(classifyStatus(200)).toBe('ok');
    expect(classifyStatus(301)).toBe('ok');
    expect(classifyStatus(403)).toBe('blocked');
    expect(classifyStatus(429)).toBe('blocked');
    expect(classifyStatus(404)).toBe('broken');
    expect(classifyStatus(500)).toBe('broken');
  });

  it('follows redirects and checks every hop against the SSRF guard', async () => {
    const hops = new Map([['https://a.test/x', res(301, 'https://b.test/y')], ['https://b.test/y', res(200)]]);
    const ok = await verifyLink('https://a.test/x', { fetchImpl: (async (u: string) => hops.get(u)!) as any, safety: safeAll });
    expect(ok).toMatchObject({ status: 'ok', finalUrl: 'https://b.test/y' });

    const toMetadata = await verifyLink('https://a.test/x', {
      fetchImpl: (async () => res(302, 'http://169.254.169.254/latest')) as any,
      safety: async (u: string) => ({ safe: !u.includes('169.254') }),
    });
    expect(toMetadata.status).toBe('broken');
  });

  it('retries with GET when HEAD is not allowed, and fails closed on errors and loops', async () => {
    let calls: string[] = [];
    const r = await verifyLink('https://a.test', {
      fetchImpl: (async (_u: string, init: any) => { calls.push(init.method); return init.method === 'HEAD' ? res(405) : res(200); }) as any,
      safety: safeAll,
    });
    expect(r.status).toBe('ok');
    expect(calls).toEqual(['HEAD', 'GET']);
    expect((await verifyLink('https://a.test', { fetchImpl: (async () => { throw new Error('dns'); }) as any, safety: safeAll })).status).toBe('broken');
    expect((await verifyLink('https://a.test', { fetchImpl: (async () => res(301, 'https://a.test')) as any, safety: safeAll })).status).toBe('broken');
    expect((await verifyLink('ftp://a.test', { safety: safeAll })).status).toBe('broken');
  });
});

describe('book title matching', () => {
  it('compares main titles, ignoring subtitles, articles and punctuation', () => {
    expect(normalizeTitle('The Lean Startup: How Today’s Entrepreneurs…')).toBe('lean startup');
    expect(titlesMatch('The Intelligent Investor', 'The intelligent investor')).toBe(true);
    expect(titlesMatch('Content Inc.: How Entrepreneurs Use Content', 'Content Inc.')).toBe(true);
    expect(titlesMatch('Campaigns That Work', 'Campaigns That Work Better Together')).toBe(false);
  });
});

describe('enrichResources', () => {
  const marketing = sanitizeMap({
    title: 'Marketing', competencies: [
      { key: 'basics', title: 'Marketing basics', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'channels', title: 'Channels', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'campaign', title: 'Run a first campaign project', group: 'Doing', kind: 'build', importance: 'core', from: 'use' },
    ],
  }, 'marketing').map!;
  const intake: Intake = { goal: 'learn marketing', path: 'quick', currentLevel: 'beginner', hoursPerWeek: 4, target: 'use', budget: 'free_only' };
  const draft = buildSkeleton(marketing, intake, { field: 'custom', mapQuality: 'approved_draft' });
  const courseId = draft.phases.flatMap((p) => p.items).find((i) => i.shape === 'course')!.id;
  const books: Record<string, { title: string; author: string; year: number; url: string }> = {
    'The Lean Startup': { title: 'The Lean Startup', author: 'Eric Ries', year: 2011, url: 'https://openlibrary.org/works/OL1W' },
  };
  const deps = {
    findBookImpl: async (t: string) => books[t] ?? null,
    verify: async (u: string) => !u.includes('dead'),
    webEnabled: false,
    videoEnabled: false,
  };

  it('keeps real books as real links and drops ones that may not exist', async () => {
    const adj = { ...EMPTY_ADJUSTMENTS, namedResources: [
      { itemId: courseId, title: 'The Lean Startup', type: 'BOOK' as const },
      { itemId: courseId, title: 'Campaigns That Work: A Guide to Marketing Strategy', type: 'BOOK' as const },
      { itemId: courseId, title: 'Some Online Course', type: 'COURSE' as const },
    ] };
    const { adjustments, notes } = await enrichResources(draft, adj, deps);
    expect(adjustments.foundResources).toEqual([{ itemId: courseId, title: 'The Lean Startup (Eric Ries)', url: 'https://openlibrary.org/works/OL1W', type: 'BOOK', via: 'openlibrary' }]);
    expect(adjustments.namedResources.map((n) => n.title)).toEqual(['Some Online Course']); // non-books stay as search links
    expect(notes[0]).toMatch(/couldn’t confirm exist.*Campaigns That Work/);
  });

  it('live search fills empty items with link-checked results only', async () => {
    const { adjustments } = await enrichResources(draft, EMPTY_ADJUSTMENTS, {
      ...deps, webEnabled: true,
      searchWebImpl: async () => [
        { title: 'Dead guide', url: 'https://dead.test', type: 'ARTICLE' as const },
        { title: 'Good guide', url: 'https://good.test', type: 'ARTICLE' as const },
      ],
    });
    const found = adjustments.foundResources ?? [];
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.url === 'https://good.test' && f.via === 'web')).toBe(true);
  });

  it('never searches curated plans (the catalogue decides there)', async () => {
    const sd = getMap('system-design')!;
    const curated = buildSkeleton(sd, { ...intake, target: 'use' }, { field: sd.key, mapQuality: 'curated' });
    let searched = false;
    await enrichResources(curated, EMPTY_ADJUSTMENTS, { ...deps, webEnabled: true, searchWebImpl: async () => { searched = true; return []; } });
    expect(searched).toBe(false);
  });

  it('approval re-checks every found link', async () => {
    const kept = await reverifyFound([
      { itemId: 'p1-course', title: 'a', url: 'https://good.test', type: 'ARTICLE', via: 'web' },
      { itemId: 'p1-course', title: 'b', url: 'https://dead.test', type: 'ARTICLE', via: 'web' },
    ], deps.verify);
    expect(kept.map((k) => k.title)).toEqual(['a']);
  });
});

describe('found in the book e2e', () => {
  it('a verified "Title (Author)" matches the plain title, so the book is not listed twice', () => {
    expect(titlesMatch('The Intelligent Investor', 'The Intelligent Investor (Benjamin Graham)')).toBe(true);
    expect(normalizeTitle('Grokking Algorithms - Second Edition')).toBe('grokking algorithms');
  });

  it('AI-drafted build competencies are labelled as projects and become Project items', () => {
    const map = sanitizeMap({ title: 'Investing', competencies: [
      { key: 'a', title: 'Value basics', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'b', title: 'Statements', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'c', title: 'Real Company Analysis', kind: 'build', importance: 'core', from: 'use' },
    ] }, 'investing').map!;
    expect(map.competencies[2].title).toBe('Real Company Analysis (project)');
    const intake: Intake = { goal: 'invest', path: 'serious', currentLevel: 'beginner', hoursPerWeek: 3, target: 'use', budget: 'free_only', bookTitle: 'The Intelligent Investor' };
    const d = buildSkeleton(map, intake, { field: 'custom', mapQuality: 'approved_draft' });
    const shapes = d.phases.flatMap((p) => p.items).map((i) => i.shape);
    expect(shapes).toContain('project');
    expect(shapes).toContain('reading');
  });
});
