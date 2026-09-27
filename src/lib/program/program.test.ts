import { describe, it, expect } from 'vitest';
import { getMap, competenciesForTarget, requiredEvidence, type CompetencyMap } from '@/data/competencies';
import { buildSkeleton, estimateHours, scopeCompetencies } from './skeleton';
import { parseAdjustments } from './adapt';
import { composeDraft, sanitizeClientAdjustments } from './generate';
import { parseMapDraft, sanitizeMap } from './mapDraft';
import { parseIntake, inferTarget } from './intake';
import { factualWhy } from './why';
import type { Intake, ProgramDraft } from './types';

const sd = getMap('system-design')!;
const intake = (over: Partial<Intake> = {}): Intake => ({
  goal: 'become interview-ready in system design', path: 'serious', currentLevel: 'beginner',
  hoursPerWeek: 7, target: 'interview', budget: 'free_only', ...over,
});
const skeleton = (i: Intake = intake(), map: CompetencyMap = sd) =>
  buildSkeleton(map, i, { field: map.key, mapQuality: map.key === 'custom' ? 'approved_draft' : 'curated' });
const items = (d: ProgramDraft) => d.phases.flatMap((p) => p.items);

describe('buildSkeleton on System Design, interview-ready', () => {
  const d = skeleton();

  it('covers every competency in scope, core included', () => {
    const inScope = competenciesForTarget(sd, 'interview');
    for (const c of inScope) expect(d.coverage.find((r) => r.key === c.key)!.itemIds.length, c.key).toBeGreaterThan(0);
  });

  it('mixes shapes: course, practice and a project', () => {
    const shapes = new Set(items(d).map((i) => i.shape));
    expect(shapes).toEqual(new Set(['course', 'practice', 'project']));
  });

  it('never schedules a competency before its prerequisites', () => {
    const phaseOf = new Map(items(d).flatMap((it) => it.competencyKeys.map((k) => [k, it.phase] as const)));
    for (const c of sd.competencies) for (const p of c.prerequisites ?? []) {
      expect(phaseOf.get(p)!, `${p} before ${c.key}`).toBeLessThanOrEqual(phaseOf.get(c.key)!);
    }
  });

  it('has at most 5 phases, each with a checkpoint on its non-optional competencies', () => {
    expect(d.phases.length).toBeLessThanOrEqual(5);
    for (const p of d.phases) {
      const phaseKeys = p.items.flatMap((i) => i.competencyKeys);
      const nonOptional = phaseKeys.filter((k) => sd.competencies.find((c) => c.key === k)!.importance !== 'optional');
      expect([...p.checkpoint.competencyKeys].sort()).toEqual([...nonOptional].sort()); // copies: d is shared
    }
  });

  it('gives every course item a curated primary, and respects a free-only budget', () => {
    for (const it of items(d).filter((i) => i.shape === 'course')) {
      expect(it.resources[0]?.quality, it.id).toBe('curated');
      expect(it.resources[0]?.role, it.id).toBe('primary');
    }
    expect(items(d).flatMap((i) => i.resources).every((r) => r.pricing !== 'paid')).toBe(true);
  });

  it('fits the weekly hours', () => {
    for (const p of d.phases) {
      const perWeek = p.items.reduce((s, i) => s + i.hoursPerWeek, 0);
      expect(perWeek).toBeLessThanOrEqual(7 + 0.5); // rounding slack
    }
  });

  it('is deterministic: the same answers give the same plan', () => {
    expect(JSON.stringify(skeleton())).toBe(JSON.stringify(d));
  });
});

describe('scoping and hours', () => {
  it('a paid budget can pick the DDIA book', () => {
    const d = skeleton(intake({ budget: 'any' }));
    expect(items(d).flatMap((i) => i.resources).some((r) => r.catalogKey === 'sd-ddia')).toBe(true);
  });

  it('a tight deadline drops optional, then supporting, never core, and says so', () => {
    const { comps, dropped, warnings } = scopeCompetencies(sd, intake({ deadlineWeeks: 4 }));
    expect(dropped.some((c) => c.importance === 'core')).toBe(false);
    expect(comps.filter((c) => c.importance === 'core').length).toBe(sd.competencies.filter((c) => c.importance === 'core').length);
    expect(warnings.join(' ')).toMatch(/left out/);
    expect(warnings.join(' ')).toMatch(/h\/week/);
  });

  it('keeps a supporting competency that a core one depends on', () => {
    // sd-availability (core) has no supporting prereqs, so build a tiny map to prove the rule.
    const map: CompetencyMap = { key: 't', title: 'T', aliases: [], description: '', competencies: [
      { key: 's', title: 'S', group: 'g', kind: 'build', importance: 'supporting', from: 'aware', summary: 's' },
      { key: 'c', title: 'C', group: 'g', kind: 'build', importance: 'core', from: 'aware', prerequisites: ['s'], summary: 's' },
      { key: 'o', title: 'O', group: 'g', kind: 'build', importance: 'supporting', from: 'aware', summary: 's' },
    ] };
    const { dropped } = scopeCompetencies(map, intake({ hoursPerWeek: 1, deadlineWeeks: 1 }));
    expect(dropped.map((c) => c.key)).toEqual(['o']);
  });

  it('placement shortens strong topics and lengthens weak ones', () => {
    const c = sd.competencies.find((x) => x.key === 'sd-caching')!;
    const base = estimateHours(c, intake());
    expect(estimateHours(c, intake({ placement: { strong: ['sd-caching'], weak: [] } }))).toBeLessThan(base);
    expect(estimateHours(c, intake({ placement: { strong: [], weak: ['sd-caching'] } }))).toBeGreaterThan(base);
  });

  it('an awareness goal becomes exploration, not a fake course', () => {
    const d = skeleton(intake({ target: 'aware' }));
    expect(items(d).every((i) => i.shape === 'exploration')).toBe(true);
  });

  it('a book goal becomes chapters of reading with the book as an unreviewed search link', () => {
    const d = skeleton(intake({ target: 'use', bookTitle: 'Designing Data-Intensive Applications' }));
    const reading = items(d).filter((i) => i.shape === 'reading');
    expect(reading.length).toBeGreaterThan(0);
    expect(reading[0].resources[0]).toMatchObject({ source: 'ai', quality: 'unreviewed' });
    expect(reading[0].resources[0].url).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
  });
});

describe('AI adjustments are clamped to the skeleton', () => {
  const d = skeleton();

  it('drops unknown keys, clamps emphasis, keeps valid titles and focus', () => {
    const adj = parseAdjustments(JSON.stringify({
      emphasis: { 'sd-caching': 9, 'sd-databases': 0.1, 'made-up': 1.2 },
      phaseTitles: { 1: 'Foundations first', 99: 'nope' },
      focus: { 'p1-course': 'Do the estimation drills.', 'p9-course': 'x' },
      whyThisPlan: 'You are starting from zero, so the plan front-loads fundamentals before any mock interviews begin.',
    }), d);
    expect(adj.emphasis).toEqual({ 'sd-caching': 1.5, 'sd-databases': 0.5 });
    expect(adj.phaseTitles).toEqual({ 1: 'Foundations first' });
    expect(Object.keys(adj.focus)).toEqual(['p1-course']);
    expect(adj.whyThisPlan).toMatch(/front-loads/);
  });

  it('rejects a "mastery" claim and unreadable replies', () => {
    expect(parseAdjustments(JSON.stringify({ whyThisPlan: 'After this plan you will have mastered system design completely, guaranteed.' }), d).whyThisPlan).toBeNull();
    expect(parseAdjustments('not json', d)).toEqual({ emphasis: {}, phaseTitles: {}, focus: {}, whyThisPlan: null, namedResources: [] });
  });

  it('ignores named resources on curated maps (the catalogue decides)', () => {
    const adj = parseAdjustments(JSON.stringify({ namedResources: [{ itemId: 'p1-course', title: 'Some Book', type: 'BOOK' }] }), d);
    expect(adj.namedResources).toEqual([]);
  });

  it('a tampered client payload can only nudge emphasis within bounds', () => {
    const adj = sanitizeClientAdjustments({ emphasis: { 'sd-caching': 1000 }, addItems: [{ shape: 'course' }] }, { map: sd, field: sd.key, mapQuality: 'curated', intake: intake() });
    expect(adj.emphasis['sd-caching']).toBeGreaterThan(1);
    expect(adj.emphasis['sd-caching']).toBeLessThanOrEqual(1.5); // clamped, then normalised (emphasis is relative)
  });
});

describe('composeDraft', () => {
  it('uses the factual why when the AI gave none', () => {
    const d = composeDraft({ map: sd, field: sd.key, mapQuality: 'curated', intake: intake({ doneMeans: 'solve design questions alone' }) });
    expect(d.whyThisPlan).toBe(factualWhy(d));
    expect(d.whyThisPlan).toMatch(/solve design questions alone/);
  });

  it("honours the learner's removals but flags uncovered core topics", () => {
    const d = composeDraft({ map: sd, field: sd.key, mapQuality: 'curated', intake: intake(), removedItemIds: ['p1-course'] });
    expect(items(d).some((i) => i.id === 'p1-course')).toBe(false);
    expect(d.warnings.join(' ')).toMatch(/Not covered after your edits/);
  });
});

describe('unknown fields: AI-drafted maps', () => {
  const draft = {
    title: 'Marketing',
    competencies: [
      { key: 'Audience Research', title: 'Audience research', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 'Know who you sell to.' },
      { key: 'positioning', title: 'Positioning', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', prerequisites: ['Audience Research', 'channels'] },
      { key: 'channels', title: 'Channels', group: 'Growth', kind: 'wizardry', importance: 'huge', from: 'use' },
      { key: 'campaign', title: 'Run a first campaign project', group: 'Practice', kind: 'build', importance: 'core', from: 'use', prerequisites: ['positioning'] },
    ],
  };

  it('repairs keys and enums, remaps prerequisites and drops forward references', () => {
    const { map, problems } = parseMapDraft(JSON.stringify(draft), 'marketing');
    expect(problems).toEqual([]);
    expect(map!.competencies.map((c) => c.key)).toEqual(['audience-research', 'positioning', 'channels', 'campaign']);
    expect(map!.competencies[1].prerequisites).toEqual(['audience-research']); // 'channels' comes later → dropped
    expect(map!.competencies[2]).toMatchObject({ kind: 'concept', importance: 'supporting' });
  });

  it('builds an Exploration + Project plan with an honest no-resources warning', () => {
    const { map } = sanitizeMap(draft, 'marketing');
    const d = skeleton(intake({ goal: 'learn marketing', target: 'use' }), map!);
    expect(new Set(items(d).map((i) => i.shape))).toEqual(new Set(['course', 'project']));
    expect(d.warnings.join(' ')).toMatch(/no curated resources/);
  });

  it('rejects drafts that are unusable', () => {
    expect(parseMapDraft('{"competencies":[{"title":"Only one"}]}', 'x').map).toBeNull();
    expect(parseMapDraft('nope', 'x').problems[0]).toMatch(/readable/);
  });
});

describe('intake', () => {
  it('infers the target from the goal wording in quick start', () => {
    expect(inferTarget('crack system design interviews')).toBe('interview');
    expect(inferTarget('build a portfolio site')).toBe('build');
    expect(inferTarget('curious what quantum computing is')).toBe('aware');
    expect(inferTarget('learn SQL')).toBe('use');
  });

  it('validates and clamps', () => {
    expect(parseIntake({ goal: 'x', hoursPerWeek: 5 }).ok).toBe(false);
    expect(parseIntake({ goal: 'learn sql', hoursPerWeek: 0 }).ok).toBe(false);
    const r = parseIntake({ goal: '  learn   sql ', hoursPerWeek: '6', budget: 'lots', formats: ['read', 'smell'], deadlineWeeks: 500 });
    expect(r.ok && r.intake).toMatchObject({ goal: 'learn sql', hoursPerWeek: 6, budget: 'free_only', formats: ['read'], deadlineWeeks: undefined, target: 'use' });
  });
});

describe('phase balancing', () => {
  it('keeps phases reasonably even after a deadline cut (no 1-topic 2-week phases next to a 13-week one)', () => {
    const d = skeleton(intake({ deadlineWeeks: 16, placement: { strong: [], weak: ['sd-databases', 'sd-partitioning'] } }));
    const weeks = d.phases.map((p) => p.weeks);
    const avg = weeks.reduce((a, b) => a + b, 0) / weeks.length;
    for (const w of weeks) {
      expect(w).toBeGreaterThanOrEqual(Math.floor(avg * 0.4));
      expect(w).toBeLessThanOrEqual(Math.ceil(avg * 2.2));
    }
    expect(new Set(d.phases.map((p) => p.title)).size).toBe(d.phases.length); // split halves are named apart
  });

  it('balancing never breaks prerequisite order', () => {
    for (const target of ['use', 'build', 'interview'] as const) {
      for (const hours of [3, 7, 15]) {
        const d = skeleton(intake({ target, hoursPerWeek: hours, deadlineWeeks: 10 }));
        const phaseOf = new Map(items(d).flatMap((it) => it.competencyKeys.map((k) => [k, it.phase] as const)));
        for (const c of sd.competencies) for (const p of c.prerequisites ?? []) {
          if (phaseOf.has(p) && phaseOf.has(c.key)) expect(phaseOf.get(p)!).toBeLessThanOrEqual(phaseOf.get(c.key)!);
        }
      }
    }
  });
});

describe('unbacked claims in AI text', () => {
  const d = skeleton();
  it('drops a why or focus note that states numbers of weeks or statistics', () => {
    const adj = parseAdjustments(JSON.stringify({
      whyThisPlan: 'This 53-week plan front-loads fundamentals so later phases build on something solid, which is how most people succeed.',
      focus: { 'p1-course': 'These patterns appear in 60% of interview questions.', 'p2-course': 'Draw the data flow before choosing a database.' },
    }), d);
    expect(adj.whyThisPlan).toBeNull();
    expect(adj.focus).toEqual({ 'p2-course': 'Draw the data flow before choosing a database.' });
  });
});

describe('every checkpoint requirement is achievable by its item', () => {
  it('practice items ask only for reps; explore items only for review cards', () => {
    for (const target of ['aware', 'use', 'build', 'interview'] as const) {
      const d = skeleton(intake({ target }));
      for (const it of items(d)) {
        for (const k of it.competencyKeys) {
          const kind = sd.competencies.find((c) => c.key === k)!.kind;
          const reqs = requiredEvidence(kind, target).map((r) => r.kind);
          if (it.shape === 'practice') expect(reqs).toEqual(['practice']);
          if (it.shape === 'exploration') expect(reqs).toEqual(['recall']);
        }
      }
    }
  });
});

describe('custom-field fixes found in e2e', () => {
  const oneGroupMap: CompetencyMap = {
    key: 'custom', title: 'Marketing', aliases: [], description: '',
    competencies: [
      { key: 'research', title: 'Market research', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 's' },
      { key: 'audience', title: 'Audience', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', prerequisites: ['research'], summary: 's' },
      { key: 'content', title: 'Content', group: 'Foundations', kind: 'skill', importance: 'core', from: 'use', prerequisites: ['audience'], summary: 's' },
      { key: 'channels', title: 'Channels', group: 'Foundations', kind: 'concept', importance: 'core', from: 'use', summary: 's' },
      { key: 'planning', title: 'Campaign planning', group: 'Foundations', kind: 'concept', importance: 'core', from: 'use', summary: 's' },
      { key: 'analytics', title: 'Analytics', group: 'Foundations', kind: 'concept', importance: 'core', from: 'build', prerequisites: ['planning'], summary: 's' },
      { key: 'campaign', title: 'Run a first campaign project', group: 'Foundations', kind: 'build', importance: 'core', from: 'build', prerequisites: ['analytics'], summary: 's' },
    ],
  };

  it('pulls in the project (and its prerequisites) when "done" describes doing something', () => {
    const d = skeleton(intake({ goal: 'learn marketing', target: 'use', hoursPerWeek: 4, doneMeans: 'run a small campaign that gets my first 100 users' }), oneGroupMap);
    const keys = items(d).flatMap((i) => i.competencyKeys);
    expect(keys).toContain('campaign');
    expect(keys).toContain('analytics'); // build-level prerequisite came along
    expect(items(d).some((i) => i.shape === 'project')).toBe(true);
    const without = skeleton(intake({ goal: 'learn marketing', target: 'use', hoursPerWeek: 4, doneMeans: 'understand how marketing works' }), oneGroupMap);
    expect(items(without).flatMap((i) => i.competencyKeys)).not.toContain('campaign');
  });

  it('splits a single long group so no phase runs past ~6 weeks', () => {
    const d = skeleton(intake({ goal: 'learn marketing', target: 'build', hoursPerWeek: 2 }), oneGroupMap);
    expect(d.phases.length).toBeGreaterThan(1);
    for (const p of d.phases) if (p.items.flatMap((i) => i.competencyKeys).length > 1) expect(p.weeks).toBeLessThanOrEqual(7);
  });

  it('emphasis is relative: raising everything changes nothing', () => {
    const d = skeleton();
    const all = Object.fromEntries(d.coverage.map((c) => [c.key, 1.5]));
    expect(parseAdjustments(JSON.stringify({ emphasis: all }), d).emphasis).toEqual({});
    const one = parseAdjustments(JSON.stringify({ emphasis: { 'sd-caching': 1.5 } }), d).emphasis;
    expect(one['sd-caching']).toBeGreaterThan(1);
  });
});
