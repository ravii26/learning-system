/**
 * Words for a goal's status and what choosing it does to the goal's topics
 * (the behaviour itself is in goalStatus.ts — keep the two in step).
 * Client-safe: no Prisma imports.
 */
export type GoalStatusName = 'draft' | 'active' | 'paused' | 'achieved' | 'abandoned';

/** In the order the picker shows them. */
export const GOAL_STATUSES: GoalStatusName[] = ['active', 'paused', 'achieved', 'abandoned', 'draft'];

export const GOAL_STATUS_WORD: Record<GoalStatusName, string> = {
  draft: 'Not started',
  active: 'Working on it',
  paused: 'Paused',
  achieved: 'Achieved',
  abandoned: 'Let go',
};

export const GOAL_STATUS_EFFECT: Record<GoalStatusName, string> = {
  draft: 'Its topics wait in your Inbox until you start.',
  active: 'Its topics go back to where they were.',
  paused: 'Its topics rest: they leave Now and Next and daily practice stops. Review of what you learned keeps going.',
  achieved: 'What you studied is kept fresh by review. Topics you never started are filed as Reference.',
  abandoned: 'Its topics are archived and their review cards stop. You can bring it back later.',
};
