import { Prisma, type GoalStatus, type PrismaClient } from '@prisma/client';
import { ensureAreaSkillId } from './areaSkill';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * What a goal's status means for the topics under it. A goal is the thing
 * you want; its topics are how you get there — so changing the goal moves
 * them with it:
 *
 *   draft (Not started) → its topics wait in the Inbox, out of Now and Next.
 *   active (Working on it) → topics go back to exactly where they were.
 *   paused             → topics rest: they leave Now/Next, daily practice stops,
 *                        review cards for what you learned keep coming.
 *   achieved           → what you studied is kept fresh by review; topics you
 *                        never started are filed as Reference.
 *   abandoned (Let go) → topics are archived and their review cards stop.
 *
 * Leaving `active` saves each moved topic's status ({ before, set }), so
 * coming back restores it — but only for topics still where the goal put
 * them; anything you moved by hand since then is yours and stays put.
 */

export interface GoalTopic {
  id: string;
  status: string;
  mode: string;
  started: boolean;
  /** Also serves another goal that is still being worked on — leave it alone. */
  heldByOtherGoal: boolean;
}

export type StatusSnapshot = Record<string, { before: string; set: string }>;

export interface TransitionPlan {
  updates: Array<{ id: string; status: string }>;
  snapshot: StatusSnapshot | null;
}

/** Where a topic belongs under a goal in `goal` status, given where it was while the goal was active. */
export function targetStatus(goal: GoalStatus, original: string, t: Pick<GoalTopic, 'mode' | 'started'>): string {
  if (original === 'dropped' || original === 'reference') return original;
  const practice = t.mode === 'practice';
  const inPlay = original === 'active' || original === 'queued' || (original === 'maintenance' && practice);
  switch (goal) {
    case 'paused':
      return inPlay ? 'paused' : original;
    case 'draft':
      return inPlay || original === 'paused' ? 'inbox' : original;
    case 'achieved':
      if (!t.started && (original === 'inbox' || original === 'queued')) return 'reference';
      if (practice) return original === 'maintenance' || original === 'active' ? 'paused' : original;
      return original === 'active' || original === 'queued' || original === 'paused' ? 'maintenance' : original;
    case 'abandoned':
      return 'dropped';
    default:
      return original;
  }
}

export function planGoalTransition(input: {
  to: GoalStatus;
  topics: GoalTopic[];
  snapshot: StatusSnapshot | null;
  /** Free Now slots (the 2-active limit), for restoring active topics. */
  slotsFree: number;
}): TransitionPlan {
  const { to, topics } = input;
  const prev = input.snapshot ?? {};
  const updates: TransitionPlan['updates'] = [];

  if (to === 'active') {
    let slots = input.slotsFree;
    for (const t of topics) {
      const s = prev[t.id];
      if (!s || t.status !== s.set || s.before === t.status) continue;
      let status = s.before;
      if (status === 'active') {
        if (slots > 0) slots--;
        else status = 'queued';
      }
      updates.push({ id: t.id, status });
    }
    return { updates, snapshot: null };
  }

  const snapshot: StatusSnapshot = {};
  for (const t of topics) {
    // Still where an earlier goal change put it → judge from where it was before that.
    const kept = prev[t.id] && prev[t.id].set === t.status ? prev[t.id] : null;
    const original = kept ? kept.before : t.status;
    if (t.heldByOtherGoal && !kept) continue;
    const status = targetStatus(to, original, t);
    if (status !== original) snapshot[t.id] = { before: original, set: status };
    if (status !== t.status) updates.push({ id: t.id, status });
  }
  return { updates, snapshot: Object.keys(snapshot).length ? snapshot : null };
}

/** Applies a goal status change to its topics. Returns how many topics moved. */
export async function applyGoalStatus(tx: Tx, userId: string, goalId: string, to: GoalStatus): Promise<number> {
  const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { topicStatusBefore: true } });
  if (!goal) return 0;
  const links = await tx.goalLink.findMany({
    where: { goalId, userId, topicId: { not: null }, topic: { deletedAt: null } },
    select: {
      topic: {
        select: {
          id: true, status: true, mode: true, startedDate: true, progressPct: true,
          goalLinks: { where: { goalId: { not: goalId } }, select: { goal: { select: { status: true } } } },
        },
      },
    },
  });
  const topics: GoalTopic[] = links.flatMap((l) => (l.topic ? [{
    id: l.topic.id,
    status: l.topic.status,
    mode: l.topic.mode,
    started: !!l.topic.startedDate || l.topic.progressPct > 0,
    heldByOtherGoal: l.topic.goalLinks.some((o) => o.goal.status === 'active'),
  }] : []));

  const activeNow = await tx.topic.count({ where: { userId, status: 'active', deletedAt: null } });
  const plan = planGoalTransition({
    to,
    topics,
    snapshot: (goal.topicStatusBefore as StatusSnapshot | null) ?? null,
    slotsFree: Math.max(0, 2 - activeNow),
  });

  let primaryTaken = (await tx.topic.count({ where: { userId, status: 'active', activeSlotType: 'primary', deletedAt: null } })) > 0;
  const byId = new Map(topics.map((t) => [t.id, t]));
  for (const u of plan.updates) {
    let activeSlotType: 'primary' | 'secondary' | null = null;
    if (u.status === 'active') {
      activeSlotType = primaryTaken ? 'secondary' : 'primary';
      primaryTaken = true;
    }
    await tx.topic.update({ where: { id: u.id }, data: { status: u.status, activeSlotType } });
    await tx.activityLog.create({
      data: { userId, topicId: u.id, fieldChanged: 'status', oldValue: byId.get(u.id)?.status ?? null, newValue: u.status },
    });
  }
  await tx.goal.update({
    where: { id: goalId },
    data: { topicStatusBefore: plan.snapshot ?? Prisma.DbNull },
  });
  return plan.updates.length;
}

/** Re-types a goal and every topic under it; topics linked to a finer-grained skill keep it. */
export async function applyGoalArea(tx: Tx, userId: string, goalId: string, area: string): Promise<number> {
  await tx.goal.update({ where: { id: goalId }, data: { area } });
  const links = await tx.goalLink.findMany({
    where: { goalId, userId, topicId: { not: null }, topic: { deletedAt: null } },
    select: { topic: { select: { id: true, area: true, skill: { select: { kind: true } } } } },
  });
  const skillId = await ensureAreaSkillId(tx, userId, area);
  let changed = 0;
  for (const { topic } of links) {
    if (!topic || topic.area === area) continue;
    const followSkill = !topic.skill || topic.skill.kind === 'area';
    await tx.topic.update({ where: { id: topic.id }, data: { area, ...(followSkill ? { skillId } : {}) } });
    changed++;
  }
  return changed;
}
