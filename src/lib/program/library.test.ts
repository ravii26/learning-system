import { describe, it, expect } from 'vitest';
import { getMap, matchMap, type CompetencyMap } from '@/data/competencies';
import { resolveFieldForUser, sanitizeEditedMap } from './library';
import { pickBetterMap, sanitizeMap } from './mapDraft';
import { buildSkeleton, type TrustedResource } from './skeleton';
import type { Intake } from './types';

const marketingComps = [
  { key: 'research', title: 'Market research', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 's' },
  { key: 'audience', title: 'Audience', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 's' },
  { key: 'channels', title: 'Channels', group: 'Growth', kind: 'concept', importance: 'core', from: 'use', summary: 's' },
];
const fakeDb = (rows: any[]) => ({ fieldMap: { findMany: async () => rows } }) as any;
const intake = (over: Partial<Intake> = {}): Intake => ({ goal: 'x', path: 'quick', currentLevel: 'beginner', hoursPerWeek: 5, target: 'use', budget: 'free_only', ...over });

describe('resolveFieldForUser', () => {
  it('uses your library list before the built-in one', async () => {
    const mySd = { key: 'system-design', title: 'System Design', aliases: ['system design'], description: '', competencies: getMap('system-design')!.competencies.slice(0, 5), source: 'edited', basedOn: 'system-design' };
    const r = await resolveFieldForUser(fakeDb([mySd]), 'u', {}, 'learn system design');
    expect(r).toMatchObject({ kind: 'map', origin: 'library', mapQuality: 'curated', field: 'system-design' });
    expect(r.kind === 'map' && r.map.competencies.length).toBe(5);
  });

  it('finds an AI-approved field by its title, and keeps it as your own quality', async () => {
    const mk = { key: 'marketing', title: 'Marketing', aliases: [], description: '', competencies: marketingComps, source: 'ai', basedOn: null };
    const r = await resolveFieldForUser(fakeDb([mk]), 'u', {}, 'learn marketing for my side project');
    expect(r).toMatchObject({ kind: 'map', origin: 'library', mapQuality: 'approved_draft', field: 'marketing' });
  });

  it('falls back to built-in, then asks for a draft', async () => {
    expect(await resolveFieldForUser(fakeDb([]), 'u', {}, 'crack DSA')).toMatchObject({ kind: 'map', origin: 'builtin', field: 'dsa' });
    expect(await resolveFieldForUser(fakeDb([]), 'u', {}, 'learn pottery')).toEqual({ kind: 'needs_map' });
  });

  it('a list you just approved gets a stable key from its title', async () => {
    const r = await resolveFieldForUser(fakeDb([]), 'u', { customMap: { title: 'Digital Marketing', competencies: marketingComps } }, 'learn marketing');
    expect(r).toMatchObject({ kind: 'map', origin: 'approved', field: 'digital-marketing' });
  });
});

describe('editing a list', () => {
  it('keeps existing topic keys (progress is keyed by them) and validates', () => {
    const sd = getMap('system-design')!;
    const edited = { ...sd, competencies: [...sd.competencies.slice(0, 4), { key: '', title: 'Event sourcing', group: 'Distributed systems', kind: 'concept', importance: 'optional', from: 'interview', summary: 'x' }] };
    const { map, problems } = sanitizeEditedMap(edited, 'system-design', 'System Design');
    expect(problems).toEqual([]);
    expect(map!.key).toBe('system-design');
    expect(map!.competencies.slice(0, 4).map((c) => c.key)).toEqual(sd.competencies.slice(0, 4).map((c) => c.key));
    expect(map!.competencies[4].key).toBe('event-sourcing');
  });

  it('rejects a list that is too short to plan from', () => {
    expect(sanitizeEditedMap({ title: 'X', competencies: marketingComps.slice(0, 2) }, 'x', 'X').map).toBeNull();
  });
});

describe('expert review pass', () => {
  const first = sanitizeMap({ title: 'Marketing', competencies: marketingComps }, 'marketing').map!;
  it('uses the reviewed list when it is the same field and not smaller', () => {
    const better = sanitizeMap({ title: 'Marketing', competencies: [...marketingComps, { key: 'seo', title: 'SEO', group: 'Growth', kind: 'concept', importance: 'core', from: 'use', summary: 's' }] }, 'marketing').map!;
    expect(pickBetterMap(first, better)).toMatchObject({ improved: true });
  });
  it('keeps the first draft when the review drifts to another field or fails', () => {
    const other = sanitizeMap({ title: 'Cooking', competencies: [
      { key: 'knife', title: 'Knife skills', kind: 'skill', importance: 'core', from: 'aware' },
      { key: 'heat', title: 'Heat', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'salt', title: 'Salt', kind: 'concept', importance: 'core', from: 'aware' },
    ] }, 'cooking').map!;
    expect(pickBetterMap(first, other)).toEqual({ map: first, improved: false });
    expect(pickBetterMap(first, null)).toEqual({ map: first, improved: false });
  });
});

describe('trusted resources in plans', () => {
  const sd = getMap('system-design')!;
  const trusted: TrustedResource[] = [
    { title: 'My favourite caching guide', url: 'https://example.com/cache', type: 'ARTICLE', pricing: 'free', role: 'primary', competencyKeys: ['sd-caching'] },
    { title: 'A paid course', url: 'https://example.com/paid', type: 'COURSE', pricing: 'paid', role: 'primary', competencyKeys: [] },
  ];
  it('come first for the topics they cover, marked as trusted by you', () => {
    const d = buildSkeleton(sd, intake({ target: 'use' }), { field: 'system-design', mapQuality: 'curated', trusted });
    const withCaching = d.phases.flatMap((p) => p.items).find((i) => i.competencyKeys.includes('sd-caching'))!;
    expect(withCaching.resources[0]).toMatchObject({ title: 'My favourite caching guide', quality: 'evaluated', role: 'primary' });
    expect(withCaching.resources.filter((r) => r.role === 'primary')).toHaveLength(1);
  });
  it('respect a free-only budget', () => {
    const d = buildSkeleton(sd, intake({ target: 'use' }), { field: 'system-design', mapQuality: 'curated', trusted });
    expect(d.phases.flatMap((p) => p.items).flatMap((i) => i.resources).some((r) => r.title === 'A paid course')).toBe(false);
  });
});

describe('matchMap over any maps', () => {
  it('matches a map by its title as well as its aliases', () => {
    const m: CompetencyMap = { key: 'marketing', title: 'Marketing', aliases: [], description: '', competencies: [] };
    expect(matchMap('learn marketing basics', [m])?.key).toBe('marketing');
    expect(matchMap('learn pottery', [m])).toBeNull();
  });
});

describe('AI drafts keep at most two projects (found in e2e: 4 "(project)" topics)', () => {
  it('turns extra build topics into skills, keeping the ones titled as projects', async () => {
    const { parseMapDraft } = await import('./mapDraft');
    const raw = JSON.stringify({ title: 'Marketing', competencies: [
      { key: 'a', title: 'Basics', kind: 'concept', importance: 'core', from: 'aware' },
      { key: 'b', title: 'Social media execution', kind: 'build', importance: 'core', from: 'use' },
      { key: 'c', title: 'Email marketing', kind: 'build', importance: 'core', from: 'use' },
      { key: 'd', title: 'Run a first campaign project', kind: 'build', importance: 'core', from: 'build' },
      { key: 'e', title: 'Influencer marketing', kind: 'build', importance: 'supporting', from: 'build' },
    ] });
    const { map } = parseMapDraft(raw, 'marketing');
    const byKey = Object.fromEntries(map!.competencies.map((c) => [c.key, c]));
    expect(map!.competencies.filter((c) => c.kind === 'build')).toHaveLength(2);
    expect(byKey.d).toMatchObject({ kind: 'build', title: 'Run a first campaign project' });
    expect(byKey.b.kind).toBe('skill');
    expect(byKey.b.title).toBe('Social media execution'); // no "(project)" label on skills
  });
});
