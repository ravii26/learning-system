import { describe, it, expect } from 'vitest';
import {
  CURATED_MAPS, validateMap, matchMap, competenciesForTarget, requiredEvidence, orderByPrerequisites,
  targetFromDepth, moduleIdFor, competencyFromModuleId, type CompetencyMap,
} from './competencies';
import { CATALOG, findCatalogResources, allowedByBudget } from './resources';

describe('curated competency maps', () => {
  it.each(CURATED_MAPS.map((m) => [m.key, m] as const))('%s is structurally valid', (_k, map) => {
    expect(validateMap(map)).toEqual([]);
  });

  it('keys are unique across all maps (evidence is keyed by competency)', () => {
    const keys = CURATED_MAPS.flatMap((m) => m.competencies.map((c) => c.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every map has core competencies at the lowest level, so even a quick plan has substance', () => {
    for (const m of CURATED_MAPS) {
      expect(competenciesForTarget(m, 'aware').some((c) => c.importance === 'core')).toBe(true);
    }
  });

  it('higher targets include everything lower targets do', () => {
    for (const m of CURATED_MAPS) {
      const aware = competenciesForTarget(m, 'aware').length;
      const use = competenciesForTarget(m, 'use').length;
      const interview = competenciesForTarget(m, 'interview').length;
      expect(aware).toBeLessThanOrEqual(use);
      expect(use).toBeLessThanOrEqual(interview);
      expect(interview).toBe(m.competencies.length);
    }
  });

  it('a prerequisite never starts at a higher level than what depends on it', () => {
    const order = ['aware', 'use', 'build', 'interview'];
    for (const m of CURATED_MAPS) {
      const byKey = new Map(m.competencies.map((c) => [c.key, c]));
      for (const c of m.competencies) {
        for (const p of c.prerequisites ?? []) {
          expect(order.indexOf(byKey.get(p)!.from), `${c.key} needs ${p}`).toBeLessThanOrEqual(order.indexOf(c.from));
        }
      }
    }
  });
});

describe('matchMap', () => {
  it.each([
    ['I want to become interview-ready in System Design', 'system-design'],
    ['crack HLD rounds', 'system-design'],
    ['learn DSA for FAANG', 'dsa'],
    ['get good at React', 'frontend'],
    ['Node.js APIs', 'backend'],
    ['operating systems for my exams', 'os'],
    ['SQL and databases', 'dbms'],
    ['computer networks', 'networking'],
  ])('%s → %s', (text, key) => {
    expect(matchMap(text)?.key).toBe(key);
  });

  it('returns null for fields without a curated map', () => {
    expect(matchMap('learn photography')).toBeNull();
    expect(matchMap('marketing for my startup')).toBeNull();
  });
});

describe('requiredEvidence', () => {
  it('raises the bar with the target level', () => {
    expect(requiredEvidence('algorithm', 'aware')).toEqual([{ kind: 'recall', minCards: 2 }]); // aware → Explore topic: review cards, no quiz
    const interview = requiredEvidence('algorithm', 'interview');
    expect(interview).toContainEqual({ kind: 'problems_cold', count: 6 });
    expect(interview).toContainEqual({ kind: 'explain' });
  });

  it('asks each kind of competency for its natural proof', () => {
    expect(requiredEvidence('build', 'build')).toContainEqual({ kind: 'project' });
    expect(requiredEvidence('design', 'build')).toContainEqual({ kind: 'problems_cold', count: 1 });
    expect(requiredEvidence('skill', 'use')).toEqual([{ kind: 'practice', minReps: 3 }]); // practice topics have no quiz or modules
    expect(requiredEvidence('concept', 'use').map((r) => r.kind)).not.toContain('problems_cold');
  });
});

describe('ordering and ids', () => {
  it('puts prerequisites first', () => {
    const map: CompetencyMap = {
      key: 't', title: 'T', aliases: [], description: '',
      competencies: [
        { key: 'b', title: 'B', group: 'g', kind: 'concept', importance: 'core', from: 'aware', prerequisites: ['a'], summary: 's' },
        { key: 'a', title: 'A', group: 'g', kind: 'concept', importance: 'core', from: 'aware', summary: 's' },
      ],
    };
    expect(orderByPrerequisites(map.competencies).map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('module ids round-trip to competency keys', () => {
    expect(competencyFromModuleId(moduleIdFor('sd-caching'))).toBe('sd-caching');
    expect(competencyFromModuleId('x7k2p')).toBeNull();
  });

  it('maps depth targets to levels', () => {
    expect(targetFromDepth('Deep')).toBe('interview');
    expect(targetFromDepth('Awareness')).toBe('aware');
  });
});

describe('validateMap rejects bad AI drafts', () => {
  const base = (competencies: any[]): CompetencyMap => ({ key: 'x', title: 'X', aliases: [], description: '', competencies });
  const c = (key: string, extra: object = {}) => ({ key, title: key, group: 'g', kind: 'concept', importance: 'core', from: 'aware', summary: 's', ...extra });

  it('catches cycles, unknown prerequisites, duplicates and bad enums', () => {
    expect(validateMap(base([c('a', { prerequisites: ['b'] }), c('b', { prerequisites: ['a'] }), c('c')]))).toContain('prerequisites form a cycle');
    expect(validateMap(base([c('a', { prerequisites: ['zzz'] }), c('b'), c('c')])).join()).toMatch(/unknown prerequisite/);
    expect(validateMap(base([c('a'), c('a'), c('b')])).join()).toMatch(/duplicate/);
    expect(validateMap(base([c('a', { kind: 'magic' }), c('b'), c('c')])).join()).toMatch(/bad kind/);
    expect(validateMap(base([c('a')])).join()).toMatch(/at least 3/);
  });
});

describe('resource catalogue', () => {
  const allKeys = new Set(CURATED_MAPS.flatMap((m) => m.competencies.map((c) => c.key)));
  const mapKeys = new Set(CURATED_MAPS.map((m) => m.key));

  it('entries have unique keys, https URLs and point at real fields and competencies', () => {
    expect(new Set(CATALOG.map((r) => r.key)).size).toBe(CATALOG.length);
    for (const r of CATALOG) {
      expect(r.url, r.key).toMatch(/^https:\/\//);
      for (const f of r.fields) expect(mapKeys.has(f), `${r.key} field ${f}`).toBe(true);
      for (const k of r.competencyKeys) expect(allKeys.has(k), `${r.key} competency ${k}`).toBe(true);
    }
  });

  it('every field has a free or freemium primary resource', () => {
    for (const m of CURATED_MAPS) {
      const primaries = CATALOG.filter((r) => r.fields.includes(m.key) && r.role === 'primary' && allowedByBudget(r, 'free_only'));
      expect(primaries.length, m.key).toBeGreaterThan(0);
    }
  });

  it('every core competency has at least one resource on a free-only budget', () => {
    for (const m of CURATED_MAPS) {
      for (const c of m.competencies.filter((x) => x.importance === 'core')) {
        expect(findCatalogResources({ field: m.key, competencyKeys: [c.key], budget: 'free_only' }).length, c.key).toBeGreaterThan(0);
      }
    }
  });

  it('respects free-only budgets and prefers specific coverage', () => {
    const picks = findCatalogResources({ field: 'system-design', competencyKeys: ['sd-replication'], budget: 'free_only' });
    expect(picks.every((r) => r.pricing !== 'paid')).toBe(true);
    const any = findCatalogResources({ field: 'system-design', competencyKeys: ['sd-replication'], budget: 'any' });
    expect(any[0].key).toBe('sd-ddia'); // the book that actually covers replication in depth
  });
});
