/**
 * Where you left off, worked out from what you actually did: lessons you spent
 * real time in or finished. Client-safe.
 */

/** Shorter visits are misclicks and shouldn't move your place. */
export const MIN_STUDY_SECONDS = 60;
/** After this long away, Learn offers a refresher. */
export const AWAY_DAYS = 14;
/** How long "X finished" stays worth mentioning. */
export const JUST_FINISHED_DAYS = 7;

const DEADLINE_SOON_DAYS = 14;
const DAY_MS = 86_400_000;

export interface LessonFacts { legacyId: string; completed: boolean; completedAt: Date | null }
export interface Visit { moduleId: string | null; at: Date }
export interface Touch { lessonId: string | null; at: Date | null }

/** The latest thing you did in a topic, and the lesson it was in if there was one. */
export function lastTouch(lessons: LessonFacts[], visits: Visit[]): Touch {
  const ids = new Set(lessons.map((l) => l.legacyId));
  const events: Visit[] = [
    ...visits,
    ...lessons.filter((l) => l.completedAt).map((l) => ({ moduleId: l.legacyId, at: l.completedAt as Date })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    lessonId: events.find((e) => e.moduleId && ids.has(e.moduleId))?.moduleId ?? null,
    at: events[0]?.at ?? null,
  };
}

/** The lesson to open: one still in progress, else the next after your last, else the first left. */
export function resumeLesson<T extends LessonFacts>(lessons: T[], touch: Touch): T | null {
  const firstLeft = lessons.find((l) => !l.completed) ?? null;
  const index = lessons.findIndex((l) => l.legacyId === touch.lessonId);
  if (index < 0) return firstLeft;
  if (!lessons[index].completed) return lessons[index];
  return lessons.slice(index + 1).find((l) => !l.completed) ?? firstLeft;
}

export interface TopicChoice<T> { topic: T | null; movedOnFrom: T | null }

/** The topic to continue in a goal. Paused topics aren't where you left off. */
export function pickTopic<T extends { id: string; status: string }>(
  topics: T[],
  hasLessonLeft: (t: T) => boolean,
  hasLessons: (t: T) => boolean,
  touchedAt: (t: T) => Date | null,
): TopicChoice<T> {
  const latest = topics
    .filter((t) => t.status !== 'paused' && touchedAt(t))
    .sort((a, b) => (touchedAt(b) as Date).getTime() - (touchedAt(a) as Date).getTime())[0];

  if (latest && hasLessonLeft(latest)) return { topic: latest, movedOnFrom: null };

  const after = latest ? topics.slice(topics.indexOf(latest) + 1) : [];
  const notPaused = (t: T) => t.status !== 'paused';
  const topic = after.find((t) => notPaused(t) && hasLessonLeft(t))
    ?? topics.find((t) => t.status === 'active' && hasLessonLeft(t))
    ?? topics.find((t) => notPaused(t) && hasLessonLeft(t))
    ?? topics.find(hasLessonLeft)
    ?? topics.find((t) => !hasLessons(t))
    ?? null;
  return { topic, movedOnFrom: latest && topic && topic !== latest && hasLessons(latest) ? latest : null };
}

/** "3 of 12 done" while you're early on, "2 lessons left" once the end is closer. */
export function progressLabel(done: number, total: number): string | null {
  if (total <= 0) return null;
  const left = total - done;
  if (left <= 0) return 'Finished';
  if (done === 0) return `${total} lesson${total === 1 ? '' : 's'}`;
  return done / total < 0.5 ? `${done} of ${total} done` : `${left} lesson${left === 1 ? '' : 's'} left`;
}

const wholeDaysBetween = (from: Date, to: Date) => {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / DAY_MS);
};

export const daysSince = (iso: string | null, now: Date = new Date()): number | null =>
  iso ? wholeDaysBetween(new Date(iso), now) : null;

export function whenLabel(iso: string | null, now: Date = new Date()): string | null {
  const days = daysSince(iso, now);
  if (days === null) return null;
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** Only speaks when a deadline is close enough to matter. */
export function deadlineLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const days = wholeDaysBetween(now, new Date(iso));
  if (days < 0) return 'Deadline passed';
  if (days > DEADLINE_SOON_DAYS) return null;
  if (days === 0) return 'Due today';
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

interface LearnItem {
  kind: string;
  topicId: string | null;
  finished: boolean;
  doneToday: boolean;
  lastActivityAt: string | null;
  steps: Array<{ id: string }>;
}

/** A book or habit ticked off today has nothing to pick up, so it can't lead. */
export const canLead = (item: Pick<LearnItem, 'kind' | 'finished' | 'doneToday'>) =>
  !item.finished && !(item.kind === 'custom' && item.doneToday);

/** How many steps a Learn card shows before "Show all". */
export const STEPS_SHOWN = 5;

/** The part of a long path worth seeing: the step you're on, with the one before it. */
export function nearbySteps<T extends { state: string }>(steps: T[], limit: number = STEPS_SHOWN): T[] {
  if (steps.length <= limit) return steps;
  const current = steps.findIndex((s) => s.state === 'current');
  const firstLeft = steps.findIndex((s) => s.state !== 'done');
  const place = current >= 0 ? current : firstLeft >= 0 ? firstLeft : steps.length - 1;
  const start = Math.max(0, Math.min(place - 1, steps.length - limit));
  return steps.slice(start, start + limit);
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "2 goals and 1 topic in progress, 47 of 92 lessons done". */
export function learnSummary(items: Array<{ kind: string; finished: boolean; lessonsDone: number; lessonsTotal: number }>): string | null {
  const active = items.filter((i) => !i.finished && (i.kind === 'goal' || i.kind === 'topic'));
  if (active.length === 0) return null;
  const goals = active.filter((i) => i.kind === 'goal').length;
  const topics = active.length - goals;
  const names = [goals ? count(goals, 'goal') : null, topics ? count(topics, 'topic') : null].filter(Boolean).join(' and ');
  const done = active.reduce((sum, i) => sum + i.lessonsDone, 0);
  const total = active.reduce((sum, i) => sum + i.lessonsTotal, 0);
  return `${names} in progress${total > 0 ? `, ${done} of ${total} lessons done` : ''}`;
}

/** One entry per thing, most recently studied first and finished things last. */
export function learnList<T extends LearnItem>(items: T[]): T[] {
  const insideGoals = new Set(items.filter((i) => i.kind === 'goal').flatMap((i) => i.steps.map((s) => s.id)));
  const time = (i: T) => (i.lastActivityAt ? new Date(i.lastActivityAt).getTime() : 0);
  const visible = items.filter((i) => i.kind === 'goal' || !i.topicId || !insideGoals.has(i.topicId));
  return [
    ...visible.filter(canLead).sort((a, b) => time(b) - time(a)),
    ...visible.filter((i) => !canLead(i) && !i.finished),
    ...visible.filter((i) => i.finished),
  ];
}
