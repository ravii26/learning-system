import { describe, it, expect } from 'vitest';
import { planPlacement, parsePlacement, gradePlacement, placementCard, questionsPerModule, MAX_QUESTIONS } from './placement';

const mods = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, title: `Module ${i + 1}` }));
const q = (moduleId: string, correctIndex = 0, extra: Record<string, unknown> = {}) => ({
  moduleId,
  question: `What about ${moduleId}?`,
  options: ['a', 'b', 'c', 'd'],
  correctIndex,
  explanation: 'because',
  ...extra,
});

describe('planPlacement', () => {
  it('asks two per module for short syllabi and one for long ones, capped', () => {
    expect(questionsPerModule(5)).toBe(2);
    expect(questionsPerModule(7)).toBe(2);
    expect(questionsPerModule(8)).toBe(1);
    expect(planPlacement(mods(20)).modules).toHaveLength(MAX_QUESTIONS);
    expect(planPlacement([]).perModule).toBe(0);
  });
});

describe('parsePlacement', () => {
  const plan = { modules: mods(3), perModule: 2 };

  it('keeps valid questions in syllabus order, at most perModule each', () => {
    const raw = JSON.stringify({ questions: [q('m2'), q('m1'), q('m1'), q('m1'), q('m3')] });
    expect(parsePlacement(raw, plan).map((x) => x.moduleId)).toEqual(['m1', 'm1', 'm2', 'm3']);
  });

  it('drops malformed questions and unknown modules', () => {
    const raw = JSON.stringify({
      questions: [
        q('m9'),
        q('m1', 7),
        q('m1', 0, { options: ['same', 'same', 'x', 'y'] }),
        q('m1', 0, { options: ['only one'] }),
        q('m1', 0, { question: '  ' }),
        q('m2', 3),
      ],
    });
    const out = parsePlacement(raw, plan);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ moduleId: 'm2', correctIndex: 3 });
  });

  it('returns nothing for non-JSON', () => {
    expect(parsePlacement('nope', plan)).toEqual([]);
  });
});

describe('gradePlacement', () => {
  it('passes a module only when every question is right', () => {
    const questions = [q('m1', 0), q('m1', 1), q('m2', 2), q('m3', 0)].map((x) => x as never);
    const results = gradePlacement(questions, { 0: 0, 1: 1, 2: 0 });
    expect(results).toEqual([
      { moduleId: 'm1', correct: 2, total: 2, passed: true },
      { moduleId: 'm2', correct: 0, total: 1, passed: false },
      { moduleId: 'm3', correct: 0, total: 1, passed: false },
    ]);
  });
});

describe('placementCard', () => {
  it('asks the question and answers with the right option and why', () => {
    const card = placementCard({ moduleId: 'm1', question: 'Why X?', options: ['wrong', 'right'], correctIndex: 1, explanation: 'Because Y.' });
    expect(card).toMatchObject({ prompt: 'Why X?', answer: 'right. Because Y.', sourceKind: 'placement' });
  });
});
