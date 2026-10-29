import { describe, expect, it } from 'vitest';
import { kindsByTitle, parseKindName, resolveModuleKind, KIND_PROMPT_GUIDE } from './moduleKinds';
import { LESSON_KINDS } from './lessonKinds';

describe('parseKindName', () => {
  it('accepts real kinds in common spellings', () => {
    expect(parseKindName('decision')).toBe('decision');
    expect(parseKindName(' Decision ')).toBe('decision');
    expect(parseKindName('case study')).toBe('case_study');
    expect(parseKindName('case-study')).toBe('case_study');
    expect(parseKindName('Exam prep')).toBe('exam_prep');
  });
  it('rejects anything else', () => {
    expect(parseKindName('quiz')).toBeNull();
    expect(parseKindName('')).toBeNull();
    expect(parseKindName(3)).toBeNull();
    expect(parseKindName(undefined)).toBeNull();
  });
});

describe('resolveModuleKind', () => {
  it('trusts a valid label from the AI, even "concept"', () => {
    expect(resolveModuleKind('drill', 'Choosing a database: SQL vs NoSQL')).toBe('drill');
    expect(resolveModuleKind('concept', 'Choosing a database: SQL vs NoSQL')).toBe('concept');
  });
  it('falls back to the keyword guess when the label is missing or invalid', () => {
    expect(resolveModuleKind(undefined, 'Choosing a database: SQL vs NoSQL')).toBe('decision');
    expect(resolveModuleKind('nonsense', 'Case study: designing a URL shortener')).toBe('case_study');
  });
  it('ends at concept when nothing matches', () => {
    expect(resolveModuleKind(null, 'Requirements and estimation')).toBe('concept');
  });
});

describe('kindsByTitle', () => {
  it('keeps valid labels keyed by title and ignores plain strings and bad labels', () => {
    const out = kindsByTitle(['plain', { title: 'A', kind: 'decision' }, { title: 'B', kind: 'bogus' }, { kind: 'drill' }, null]);
    expect(out).toEqual({ A: 'decision' });
  });
  it('cleans titles the same way the caller does', () => {
    expect(kindsByTitle([{ title: '  A   b ', kind: 'drill' }], (t) => t.replace(/\s+/g, ' ').trim())).toEqual({ 'A b': 'drill' });
  });
  it('tolerates a non-array', () => {
    expect(kindsByTitle('x')).toEqual({});
  });
});

describe('KIND_PROMPT_GUIDE', () => {
  it('names every kind', () => {
    for (const k of LESSON_KINDS) expect(KIND_PROMPT_GUIDE).toContain(`- ${k}:`);
  });
});
