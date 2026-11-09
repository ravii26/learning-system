import { htmlToText } from './htmlText';

/** Your notes from every lesson, gathered by topic for the Notes page. Client-safe. */

const FULL_TEXT = 1_000_000;

export interface LessonNoteRow {
  topicId: string;
  topicTitle: string;
  moduleId: string;
  moduleTitle: string;
  order: number;
  notes: string;
  updatedAt: Date;
}

export interface LessonNote {
  moduleId: string;
  title: string;
  text: string;
}

export interface LessonNoteGroup {
  topicId: string;
  topicTitle: string;
  /** Notes written on the whole topic, before notes moved to each lesson. */
  topicNotes: string | null;
  lessons: LessonNote[];
}

export function groupLessonNotes(rows: LessonNoteRow[], topics: Array<{ id: string; title: string; notes: string | null; updatedAt: Date }> = []): LessonNoteGroup[] {
  const groups = new Map<string, LessonNoteGroup & { latest: number; orders: Map<string, number> }>();
  const groupFor = (topicId: string, topicTitle: string) => {
    const existing = groups.get(topicId);
    if (existing) return existing;
    const created = { topicId, topicTitle, topicNotes: null, lessons: [], latest: 0, orders: new Map<string, number>() };
    groups.set(topicId, created);
    return created;
  };

  for (const row of rows) {
    const text = htmlToText(row.notes, FULL_TEXT);
    if (!text) continue; // an emptied editor still stores markup
    const group = groupFor(row.topicId, row.topicTitle);
    group.lessons.push({ moduleId: row.moduleId, title: row.moduleTitle, text });
    group.orders.set(row.moduleId, row.order);
    group.latest = Math.max(group.latest, row.updatedAt.getTime());
  }
  for (const topic of topics) {
    const text = htmlToText(topic.notes, FULL_TEXT);
    if (!text) continue;
    const group = groupFor(topic.id, topic.title);
    group.topicNotes = text;
    group.latest = Math.max(group.latest, topic.updatedAt.getTime());
  }

  return Array.from(groups.values())
    .sort((a, b) => b.latest - a.latest)
    .map(({ latest: _latest, orders, ...group }) => ({
      ...group,
      lessons: group.lessons.sort((a, b) => (orders.get(a.moduleId) ?? 0) - (orders.get(b.moduleId) ?? 0)),
    }));
}

/** Keeps only what matches; a topic name match keeps that whole topic. */
export function filterLessonNotes(groups: LessonNoteGroup[], query: string): LessonNoteGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const has = (s: string | null) => !!s && s.toLowerCase().includes(q);
  return groups.flatMap((g) => {
    if (has(g.topicTitle)) return [g];
    const lessons = g.lessons.filter((l) => has(l.title) || has(l.text));
    const topicNotes = has(g.topicNotes) ? g.topicNotes : null;
    return lessons.length || topicNotes ? [{ ...g, lessons, topicNotes }] : [];
  });
}
