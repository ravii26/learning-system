import { describe, expect, it } from 'vitest';
import { buildLessonMessages, type LessonPromptInput } from './lessonPrompt';

const base: LessonPromptInput = {
  kind: 'concept',
  moduleTitle: 'Binary search',
  topicTitle: 'Data structures and algorithms',
  area: 'Tech',
  learnerLevel: 'beginner',
  priorKnowledge: 'Expert in Excel',
  planBlock: "The learner's goal: become a data analyst.",
  coursePosition: 'Module 6 of 50',
  weaknesses: ['off-by-one errors'],
  mistakes: ['never moved mid'],
  archetype: 'technical',
  today: 'November 2026',
};

describe('buildLessonMessages', () => {
  it('puts everything known about the learner into a concept lesson prompt', () => {
    const [system, user] = buildLessonMessages(base);
    expect(system.role).toBe('system');
    expect(user.role).toBe('user');
    const all = `${system.content}\n${user.content}`;
    for (const s of ['Binary search', 'beginner', 'Expert in Excel', 'become a data analyst', 'Module 6 of 50', 'off-by-one errors', 'never moved mid']) {
      expect(all).toContain(s);
    }
  });

  it('says so when nothing is known about the learner', () => {
    const [, user] = buildLessonMessages({ ...base, priorKnowledge: '', weaknesses: [], mistakes: [], coursePosition: '' });
    expect(user.content).toContain('Prior knowledge:\nNone provided');
    expect(user.content).toContain('Standalone lesson');
  });

  it('hands other kinds to their own prompt, with the date stamped in', () => {
    const msgs = buildLessonMessages({ ...base, kind: 'decision', moduleTitle: 'Postgres vs MongoDB' });
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('Postgres vs MongoDB');
    expect(all).toContain('November 2026');
  });
});
