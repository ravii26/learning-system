import { describe, expect, it } from 'vitest';
import { filterLessonNotes, groupLessonNotes, type LessonNoteRow } from './lessonNotes';

const row = (over: Partial<LessonNoteRow>): LessonNoteRow => ({
  topicId: 't1', topicTitle: 'DSA', moduleId: 'm1', moduleTitle: 'Two pointers', order: 1, notes: '<p>Sorted input</p>', updatedAt: new Date('2026-01-01'), ...over,
});

describe('groupLessonNotes', () => {
  it('turns notes into plain text under their topic', () => {
    expect(groupLessonNotes([row({})])).toEqual([{ topicId: 't1', topicTitle: 'DSA', topicNotes: null, lessons: [{ moduleId: 'm1', title: 'Two pointers', text: 'Sorted input' }] }]);
  });

  it('skips an emptied editor', () => {
    expect(groupLessonNotes([row({ notes: '<p></p>' })])).toEqual([]);
  });

  it('keeps lessons in course order and puts the most recent topic first', () => {
    const groups = groupLessonNotes([
      row({ moduleId: 'm2', moduleTitle: 'Second', order: 2 }),
      row({ moduleId: 'm1', moduleTitle: 'First', order: 1 }),
      row({ topicId: 't2', topicTitle: 'English', updatedAt: new Date('2026-03-01') }),
    ]);
    expect(groups.map((g) => g.topicTitle)).toEqual(['English', 'DSA']);
    expect(groups[1].lessons.map((l) => l.title)).toEqual(['First', 'Second']);
  });

  it('includes notes written on the whole topic', () => {
    const [group] = groupLessonNotes([], [{ id: 't1', title: 'DSA', notes: '<p>Old note</p>', updatedAt: new Date() }]);
    expect(group).toMatchObject({ topicNotes: 'Old note', lessons: [] });
  });
});

describe('filterLessonNotes', () => {
  const groups = groupLessonNotes([row({}), row({ moduleId: 'm2', moduleTitle: 'Binary search', notes: '<p>Halve it</p>' })]);

  it('returns everything for an empty search', () => {
    expect(filterLessonNotes(groups, '  ')).toBe(groups);
  });

  it('keeps only matching lessons', () => {
    expect(filterLessonNotes(groups, 'halve')[0].lessons.map((l) => l.moduleId)).toEqual(['m2']);
  });

  it('keeps a whole topic when its name matches', () => {
    expect(filterLessonNotes(groups, 'dsa')[0].lessons).toHaveLength(2);
  });

  it('drops topics with no match', () => {
    expect(filterLessonNotes(groups, 'nothing')).toEqual([]);
  });
});
