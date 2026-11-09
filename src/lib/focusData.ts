import type { Prisma, PrismaClient } from '@prisma/client';
import { localDateKey } from './timeSummary';
import { goalDisplayName, isRhythm, rankFocus, type FocusFacts, type Ranked, type Rhythm } from './focusQueue';

type Db = PrismaClient | Prisma.TransactionClient;

export type FocusKind = 'goal' | 'topic' | 'lesson' | 'custom';

export interface FocusView extends FocusFacts {
  kind: FocusKind;
  goalId: string | null;
  topicId: string | null;
  moduleId: string | null;
  title: string;
  /** The concrete next thing to do, when there is one. */
  nextStep: string | null;
  href: string | null;
  estimatedMinutes: number | null;
  lessonKind: string | null;
  /** Marked done by hand today, so it can be taken back. */
  canUndo: boolean;
  /** "Topic 2 of 7" or "Lesson 3 of 5", when there's a path to be on. */
  position: string | null;
  /** The topics of a goal or the lessons of a topic, in order. */
  steps: PathStep[];
  lessonsDone: number;
  lessonsTotal: number;
}

export interface PathStep {
  id: string;
  title: string;
  state: 'done' | 'current' | 'todo';
  href: string;
  /** Lessons inside this step; only topics have them. */
  lessonsDone?: number;
  lessonsTotal?: number;
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const DONE_HISTORY_DAYS = 30;
const HISTORY_DAYS = 15;
const MAX_TITLE = 200;
const COUNTS_AS_SESSION_SECONDS = 5 * 60;
const COUNTS_AS_DONE_SECONDS = 10 * 60;
const SET_ASIDE = new Set(['dropped', 'reference', 'maintenance']);
const GOAL_OVER = new Set(['achieved', 'abandoned']);

export function parseTz(value: unknown): number {
  const tz = Number(value);
  return Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? tz : 0;
}

export const todayKey = (tz: number, now: Date = new Date()) => localDateKey(now, tz);

export const recentDoneAt = (doneAt: Date[], now: Date) =>
  doneAt.filter((d) => now.getTime() - d.getTime() < DONE_HISTORY_DAYS * DAY_MS);

interface ModuleRow {
  topicId: string;
  legacyId: string;
  title: string;
  order: number;
  completed: boolean;
  completedAt: Date | null;
  estimatedMinutes: number;
  kind: string;
}

/** Every pinned item with what to do next and how it has been going, best next first. */
export async function loadFocus(db: Db, userId: string, tz: number, now: Date = new Date()): Promise<Array<Ranked<FocusView>>> {
  const today = todayKey(tz, now);
  const rows = await db.focusItem.findMany({
    where: { userId, OR: [{ completedAt: null }, { completedAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } }] },
    include: {
      goal: { select: { title: true, shortName: true, status: true, targetDate: true, links: { where: { topicId: { not: null } }, orderBy: { order: 'asc' }, select: { topicId: true } } } },
      topic: { select: { title: true, status: true, deletedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  // A "just once" item finished on an earlier day has left the list.
  const live = rows.filter((r) => !r.completedAt || localDateKey(r.completedAt, tz) === today);

  const topicIds = Array.from(new Set(live.flatMap((r) => [r.topicId, ...(r.goal?.links.map((l) => l.topicId) ?? [])]).filter((id): id is string => !!id)));
  const weekAgo = new Date(now.getTime() - WEEK_DAYS * DAY_MS);
  const weekAgoKey = localDateKey(weekAgo, tz);
  const historyStart = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
  const [topics, modules, entries, lastStudied] = await Promise.all([
    db.topic.findMany({ where: { userId, id: { in: topicIds } }, select: { id: true, title: true, status: true, deletedAt: true } }),
    db.curriculumItem.findMany({
      where: { userId, topicId: { in: topicIds }, removed: false },
      orderBy: { order: 'asc' },
      select: { topicId: true, legacyId: true, title: true, order: true, completed: true, completedAt: true, estimatedMinutes: true, kind: true },
    }),
    db.studyTimeEntry.findMany({ where: { userId, topicId: { in: topicIds }, startedAt: { gte: historyStart } }, select: { topicId: true, moduleId: true, seconds: true, startedAt: true } }),
    db.studyTimeEntry.groupBy({ by: ['topicId'], where: { userId, topicId: { in: topicIds } }, _max: { startedAt: true } }),
  ]);

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const lastByTopic = new Map(lastStudied.map((l) => [l.topicId, l._max.startedAt]));
  const modulesOf = (topicId: string): ModuleRow[] => modules.filter((m) => m.topicId === topicId);
  const nextIn = (topicId: string) => modulesOf(topicId).find((m) => !m.completed) ?? null;
  const topicHref = (topicId: string, moduleId?: string) => `/topics/${topicId}${moduleId ? `?module=${encodeURIComponent(moduleId)}` : ''}`;

  const views: FocusView[] = live.map((row) => {
    let title = row.title ?? 'Untitled';
    let nextStep: string | null = null;
    let href: string | null = null;
    let next: ModuleRow | null = null;
    let finished = false;
    let scope: string[] = [];
    let position: string | null = null;
    let steps: PathStep[] = [];
    let lessonsDone = 0;
    let lessonsTotal = 0;
    const lessonSteps = (topicId: string, current: ModuleRow | null): PathStep[] =>
      modulesOf(topicId).map((m) => ({
        id: m.legacyId,
        title: m.title,
        state: m.completed ? 'done' : m.legacyId === current?.legacyId ? 'current' : 'todo',
        href: topicHref(topicId, m.legacyId),
      }));

    if (row.kind === 'goal') {
      title = row.goal ? goalDisplayName(row.goal) : title;
      href = `/goals/${row.goalId}`;
      const usable = (row.goal?.links ?? [])
        .map((l) => topicById.get(l.topicId as string))
        .filter((t): t is NonNullable<typeof t> => !!t && !t.deletedAt && !SET_ASIDE.has(t.status));
      scope = usable.map((t) => t.id);
      const chosen = usable.find((t) => t.status === 'active' && nextIn(t.id))
        ?? usable.find((t) => nextIn(t.id))
        ?? usable.find((t) => modulesOf(t.id).length === 0);
      if (chosen) {
        next = nextIn(chosen.id);
        nextStep = next?.title ?? chosen.title;
        href = topicHref(chosen.id, next?.legacyId);
        position = `Topic ${usable.indexOf(chosen) + 1} of ${usable.length}`;
      }
      steps = usable.map((t) => {
        const inside = modulesOf(t.id);
        const done = inside.filter((m) => m.completed).length;
        lessonsDone += done;
        lessonsTotal += inside.length;
        const stepNext = nextIn(t.id);
        return {
          id: t.id,
          title: t.title,
          state: t.id === chosen?.id ? 'current' : inside.length > 0 && !stepNext ? 'done' : 'todo',
          href: topicHref(t.id, stepNext?.legacyId),
          lessonsDone: done,
          lessonsTotal: inside.length,
        };
      });
      finished = GOAL_OVER.has(row.goal?.status ?? '') || (usable.length > 0 && !chosen);
    } else if (row.kind === 'topic') {
      title = row.topic?.title ?? title;
      scope = row.topicId ? [row.topicId] : [];
      next = row.topicId ? nextIn(row.topicId) : null;
      nextStep = next?.title ?? null;
      href = row.topicId ? topicHref(row.topicId, next?.legacyId) : null;
      const inside = row.topicId ? modulesOf(row.topicId) : [];
      finished = !!row.topic?.deletedAt || row.topic?.status === 'dropped' || (inside.length > 0 && !next);
      if (row.topicId) steps = lessonSteps(row.topicId, next);
      lessonsDone = inside.filter((m) => m.completed).length;
      lessonsTotal = inside.length;
      if (next) position = `Lesson ${inside.indexOf(next) + 1} of ${inside.length}`;
    } else if (row.kind === 'lesson') {
      title = row.topic?.title ?? title;
      scope = row.topicId ? [row.topicId] : [];
      const lesson = row.topicId ? modulesOf(row.topicId).find((m) => m.legacyId === row.moduleId) ?? null : null;
      next = lesson && !lesson.completed ? lesson : null;
      nextStep = lesson?.title ?? null;
      href = row.topicId ? topicHref(row.topicId, row.moduleId ?? undefined) : null;
      finished = !!row.topic?.deletedAt || !lesson || lesson.completed;
    }

    const inScope = (topicId: string, moduleId: string | null) =>
      scope.includes(topicId) && (row.kind !== 'lesson' || moduleId === row.moduleId);

    const secondsByDay = new Map<string, number>();
    for (const e of entries) {
      if (!inScope(e.topicId, e.moduleId)) continue;
      const key = localDateKey(e.startedAt, tz);
      secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + e.seconds);
    }
    const sessionDays = new Set(Array.from(secondsByDay.entries()).filter(([k, s]) => k >= weekAgoKey && s >= COUNTS_AS_SESSION_SECONDS).map(([k]) => k));
    const manualDays = new Set(row.doneAt.map((d) => localDateKey(d, tz)));
    row.doneAt.filter((d) => d >= weekAgo).forEach((d) => sessionDays.add(localDateKey(d, tz)));

    const finishedLessonToday = modules.some((m) => inScope(m.topicId, m.legacyId) && m.completedAt && localDateKey(m.completedAt, tz) === today);
    const doneDays = Array.from(new Set([
      ...Array.from(secondsByDay.entries()).filter(([, s]) => s >= COUNTS_AS_DONE_SECONDS).map(([k]) => k),
      ...Array.from(manualDays),
      ...modules.filter((m) => inScope(m.topicId, m.legacyId) && m.completedAt).map((m) => localDateKey(m.completedAt as Date, tz)),
    ]));
    const completedToday = !!row.completedAt;
    const doneToday = (secondsByDay.get(today) ?? 0) >= COUNTS_AS_DONE_SECONDS || finishedLessonToday || manualDays.has(today) || completedToday;

    const activity = [...scope.map((id) => lastByTopic.get(id) ?? null), ...row.doneAt].filter((d): d is Date => !!d);
    const lastActivityAt = activity.length ? new Date(Math.max(...activity.map((d) => d.getTime()))).toISOString() : null;
    const target = row.targetDate ?? row.goal?.targetDate ?? null;

    return {
      id: row.id,
      kind: row.kind as FocusKind,
      goalId: row.goalId,
      topicId: row.topicId,
      moduleId: row.moduleId,
      rhythm: (isRhythm(row.rhythm) ? row.rhythm : 'few_weekly') as Rhythm,
      targetDate: target ? target.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      lastActivityAt,
      sessionsThisWeek: sessionDays.size,
      doneToday,
      skippedToday: row.skippedDay === today,
      addedToday: row.addedDay === today,
      finished: finished || completedToday,
      title,
      nextStep,
      href,
      estimatedMinutes: next?.estimatedMinutes ?? null,
      lessonKind: next?.kind ?? null,
      canUndo: manualDays.has(today),
      doneDays,
      position,
      steps,
      lessonsDone,
      lessonsTotal,
    };
  });

  return rankFocus(views, now);
}

export type PinResult = { ok: true; id: string } | { ok: false; status: number; error: string };

/** Pins something, or updates the existing pin so nothing appears twice. */
export async function savePin(db: Db, userId: string, input: Record<string, unknown>, today: string): Promise<PinResult> {
  const kind = input.kind;
  const rhythm = input.rhythm === undefined ? 'few_weekly' : input.rhythm;
  if (!isRhythm(rhythm)) return { ok: false, status: 400, error: 'Choose how often this should come up.' };

  let targetDate: Date | null = null;
  if (typeof input.targetDate === 'string' && input.targetDate) {
    targetDate = new Date(input.targetDate);
    if (Number.isNaN(targetDate.getTime())) return { ok: false, status: 400, error: 'That date isn’t valid.' };
  }
  if (rhythm === 'by_date' && !targetDate) return { ok: false, status: 400, error: 'Pick a date.' };

  const goalId = typeof input.goalId === 'string' ? input.goalId : null;
  const topicId = typeof input.topicId === 'string' ? input.topicId : null;
  const moduleId = typeof input.moduleId === 'string' ? input.moduleId : null;
  const missing: PinResult = { ok: false, status: 404, error: 'That couldn’t be found.' };
  let title: string | null = null;

  if (kind === 'goal') {
    if (!goalId || !(await db.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } }))) return missing;
  } else if (kind === 'topic') {
    if (!topicId || !(await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } }))) return missing;
  } else if (kind === 'lesson') {
    if (!topicId || !moduleId || !(await db.curriculumItem.findFirst({ where: { userId, topicId, legacyId: moduleId, removed: false }, select: { id: true } }))) return missing;
  } else if (kind === 'custom') {
    title = typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE) : '';
    if (!title) return { ok: false, status: 400, error: 'Say what it is.' };
  } else {
    return { ok: false, status: 400, error: 'Unknown kind of item.' };
  }

  const refs = {
    goalId: kind === 'goal' ? goalId : null,
    topicId: kind === 'topic' || kind === 'lesson' ? topicId : null,
    moduleId: kind === 'lesson' ? moduleId : null,
  };
  const addedDay = input.addToday === true ? today : undefined;
  const existing = kind === 'custom' ? null : await db.focusItem.findFirst({ where: { userId, kind, ...refs, completedAt: null }, select: { id: true } });
  if (existing) {
    await db.focusItem.update({ where: { id: existing.id }, data: { rhythm, targetDate, ...(addedDay ? { addedDay } : {}) } });
    return { ok: true, id: existing.id };
  }
  const created = await db.focusItem.create({ data: { userId, kind, ...refs, title, rhythm, targetDate, ...(addedDay ? { addedDay } : {}) }, select: { id: true } });
  return { ok: true, id: created.id };
}
