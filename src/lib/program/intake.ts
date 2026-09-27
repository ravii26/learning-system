import { TARGET_LEVELS, type TargetLevel } from '@/data/competencies';
import type { Budget, ResourceFormat } from '@/data/resources';
import type { CurrentLevel, Intake } from './types';

const LEVELS: CurrentLevel[] = ['beginner', 'intermediate', 'advanced'];
const BUDGETS: Budget[] = ['free_only', 'free_preferred', 'any'];
const FORMATS: ResourceFormat[] = ['read', 'watch', 'do'];

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : undefined);
const keys = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, 60) : []);

/** Quick start without a stated target: infer it from the goal's own words. */
/** Reads the goal and "done" text together: "get a high paying job" is as telling as "interview". */
export function inferTarget(goal: string): TargetLevel {
  const g = goal.toLowerCase();
  if (/\b(interview|interviews|crack|faang|maang|placement|job[- ]ready|master|hired|high[- ]paying|senior)\b/.test(g)) return 'interview';
  if (/\b(build|ship|deploy|project|develop|production|make an? )\b/.test(g)) return 'build';
  if (/\b(basics|overview|curious|understand|intro|what is)\b/.test(g)) return 'aware';
  return 'use';
}

/** Validates and normalises intake answers from the client. */
export function parseIntake(body: unknown): { ok: true; intake: Intake } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const goal = text(b.goal, 300);
  if (!goal || goal.length < 3) return { ok: false, error: 'Tell us what you want to learn.' };
  const hours = Math.round(Number(b.hoursPerWeek));
  if (!Number.isFinite(hours) || hours < 1 || hours > 60) return { ok: false, error: 'Hours per week must be between 1 and 60.' };
  const currentLevel = LEVELS.includes(b.currentLevel as CurrentLevel) ? (b.currentLevel as CurrentLevel) : 'beginner';
  const target = TARGET_LEVELS.includes(b.target as TargetLevel) ? (b.target as TargetLevel) : inferTarget(goal);
  const budget = BUDGETS.includes(b.budget as Budget) ? (b.budget as Budget) : 'free_only';
  const deadline = Math.round(Number(b.deadlineWeeks));
  const placement = b.placement && typeof b.placement === 'object'
    ? { strong: keys((b.placement as any).strong), weak: keys((b.placement as any).weak) }
    : undefined;

  return {
    ok: true,
    intake: {
      goal,
      path: b.path === 'serious' ? 'serious' : 'quick',
      currentLevel,
      hoursPerWeek: hours,
      target,
      budget,
      why: text(b.why, 400),
      doneMeans: text(b.doneMeans, 400),
      deadlineWeeks: Number.isFinite(deadline) && deadline >= 1 && deadline <= 104 ? deadline : undefined,
      formats: Array.isArray(b.formats) ? (b.formats as unknown[]).filter((f): f is ResourceFormat => FORMATS.includes(f as ResourceFormat)) : undefined,
      bookTitle: text(b.bookTitle, 160),
      placement,
    },
  };
}
