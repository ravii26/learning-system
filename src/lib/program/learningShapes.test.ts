import { describe, expect, it } from 'vitest';
import { competencyFromModuleId, lessonsOf, moduleIdFor } from '@/data/competencies';
import { guessArchetype } from './fieldGuide';
import { parseQuestions, parseAnswers } from './questions';
import { parseMapDraft } from './mapDraft';
import { parseSessions, minutesPerSession } from './sessions';
import { normalizeExercises } from './lessonGuide';
import { parseCheck } from './exerciseCheck';
import { targetLabel } from './why';

describe('lesson module ids', () => {
  it('lesson 1 keeps the old id; later lessons map back to the same competency', () => {
    expect(moduleIdFor('articles')).toBe('c:articles');
    expect(moduleIdFor('articles', 3)).toBe('c:articles~3');
    expect(competencyFromModuleId('c:articles~3')).toBe('articles');
    expect(competencyFromModuleId('c:articles')).toBe('articles');
    expect(competencyFromModuleId('m-123')).toBeNull();
  });
  it('a competency without drafted lessons is one lesson named after it', () => {
    const c = { key: 'k', title: 'Two pointers', group: 'g', kind: 'algorithm' as const, importance: 'core' as const, from: 'use' as const, summary: 's' };
    expect(lessonsOf(c)).toEqual(['Two pointers']);
    expect(lessonsOf({ ...c, lessons: ['a', 'b'] })).toEqual(['a', 'b']);
  });
});

describe('guessArchetype', () => {
  it.each([
    ['English speaking for job interviews', 'language'],
    ['Crack UPSC prelims 2027', 'exam'],
    ['Get band 7 in IELTS', 'exam'],
    ['Learn guitar', 'performance'],
    ['Learn to cook Indian food', 'performance'],
    ['DSA for placements', 'technical'],
    ['Learn digital marketing', 'professional'],
    ['Learn photography with my phone', 'creative'],
    ['History of the Roman empire', 'academic'],
  ])('%s → %s', (goal, kind) => expect(guessArchetype(goal)).toBe(kind));
});

describe('parseQuestions', () => {
  it('keeps well-formed questions, drops ones without options, dedupes ids', () => {
    const raw = JSON.stringify({
      archetype: 'language', fieldTitle: 'Spoken English for interviews',
      questions: [
        { id: 'situation', question: 'For what?', options: ['Interviews', 'Office', 'Interviews', 'Other (type your own)'] },
        { id: 'situation', question: 'Hardest part?', options: ['Freezing', 'Grammar'], multi: true },
        { id: 'bad', question: 'No options', options: [] },
      ],
    });
    const q = parseQuestions(raw, 'english');
    expect(q.archetype).toBe('language');
    expect(q.questions.map((x) => x.id)).toEqual(['situation', 'situation_2']);
    expect(q.questions[0].options).toEqual(['Interviews', 'Office']);
    expect(q.questions[1].multi).toBe(true);
  });
  it('falls back to a guessed kind on unreadable output', () => {
    expect(parseQuestions('not json', 'learn guitar')).toMatchObject({ archetype: 'performance', questions: [] });
  });
  it('answers: drops empty ones', () => {
    expect(parseAnswers([{ question: 'Q', answer: 'A' }, { question: 'Q2', answer: '' }, 'x'])).toEqual([{ question: 'Q', answer: 'A' }]);
  });
});

describe('parseMapDraft', () => {
  it('keeps lessons and lifts a topic above the level of what it depends on', () => {
    const raw = JSON.stringify({
      title: 'DSA', archetype: 'technical',
      competencies: [
        { key: 'graphs', title: 'Graphs: BFS and DFS', group: 'G', kind: 'algorithm', importance: 'core', from: 'interview', summary: 's', lessons: ['BFS', 'DFS', 'BFS'] },
        { key: 'sysd', title: 'Design a URL shortener', group: 'G', kind: 'design', importance: 'core', from: 'aware', prerequisites: ['graphs'], summary: 's' },
        { key: 'arrays', title: 'Arrays', group: 'G', kind: 'concept', importance: 'core', from: 'aware', summary: 's' },
      ],
    });
    const { map } = parseMapDraft(raw, 'DSA');
    expect(map!.competencies[0].lessons).toEqual(['BFS', 'DFS']);
    expect(map!.competencies.find((c) => c.key === 'sysd')!.from).toBe('interview');
    expect(map!.competencies.find((c) => c.key === 'arrays')!.from).toBe('aware');
    expect(map!.archetype).toBe('technical');
  });
});

describe('parseSessions', () => {
  const session = (title: string) => ({
    day: 99, title, focus: 'intro', minutes: 20, goal: 'g', successCheck: 's',
    steps: [
      { kind: 'speak', title: 'Talk', minutes: 8, instructions: 'Say it', items: [{ text: 'Tell me about yourself', answer: 'I am...' }], target: '90 s' },
      { kind: 'nonsense', title: 'Drill', minutes: 7, instructions: 'Do', items: ['plain string item'] },
      { kind: 'drill', title: 'Empty', minutes: 5, instructions: '', items: [] },
    ],
  });
  it('numbers days from fromDay, validates focus and step kinds, drops empty steps', () => {
    const out = parseSessions(JSON.stringify({ sessions: [session('A'), session('B'), session('C'), session('D')] }), 8, 3, ['intro'], 20);
    expect(out.map((s) => s.day)).toEqual([8, 9, 10]);
    expect(out[0].focus).toBe('intro');
    expect(out[0].content.steps.map((s) => s.kind)).toEqual(['speak', 'drill']);
    expect(out[0].content.steps[1].items).toEqual([{ text: 'plain string item' }]);
    expect(out[0].minutes).toBe(15);
  });
  it('drops a day far shorter than planned', () => {
    expect(parseSessions(JSON.stringify({ sessions: [session('A')] }), 1, 3, ['intro'], 40)).toEqual([]);
  });
  it('unknown focus becomes null; junk returns nothing', () => {
    expect(parseSessions(JSON.stringify({ sessions: [session('A')] }), 1, 3, ['other'], 20)[0].focus).toBeNull();
    expect(parseSessions('oops', 1, 3, [], 20)).toEqual([]);
  });
  it('session length follows weekly hours, within 10-60 minutes', () => {
    expect(minutesPerSession(2)).toBe(25);
    expect(minutesPerSession(0.5)).toBe(10);
    expect(minutesPerSession(20)).toBe(60);
  });
});

describe('exercises and checks', () => {
  it('normalizeExercises defaults bad types and drops answerless items', () => {
    const ex = normalizeExercises([{ type: 'say', instruction: 'i', prompt: 'p', answer: 'a' }, { type: 'x', prompt: 'p', answer: 'a' }, { prompt: 'no answer' }]);
    expect(ex.map((e) => e.type)).toEqual(['say', 'write']);
  });
  it('parseCheck clears the correction on a correct answer and rejects empty feedback', () => {
    expect(parseCheck('{"verdict":"correct","feedback":"Good.","corrected":"x"}')).toEqual({ verdict: 'correct', feedback: 'Good.', corrected: '' });
    expect(parseCheck('{"verdict":"wrong","feedback":""}')).toBeNull();
  });
});

describe('targetLabel', () => {
  it('uses the words of the kind of learning', () => {
    expect(targetLabel('interview', 'performance')).toBe('advanced');
    expect(targetLabel('interview', 'technical')).toBe('interview-ready');
    expect(targetLabel('interview')).toBe('interview-ready');
  });
});
