import type { TargetLevel } from '@/data/competencies';
import type { ProgramDraft } from './types';
import { LEVEL_WORDS, isArchetype } from './fieldGuide';

export const TARGET_LABEL: Record<TargetLevel, string> = {
  aware: 'know about it',
  use: 'use it day to day',
  build: 'build real things with it',
  interview: 'interview-ready',
};

/** The level in the words of this kind of learning: "advanced" for cooking, "interview-ready" for DSA. */
export function targetLabel(target: TargetLevel, archetype?: unknown): string {
  return isArchetype(archetype) ? LEVEL_WORDS[archetype][target] : TARGET_LABEL[target];
}

/**
 * "Why this plan?" built only from facts: the intake, the scope and the
 * placement result. Used as-is when the AI is unavailable, and as the
 * factual base the AI's version must agree with.
 */
export function factualWhy(d: ProgramDraft): string {
  const i = d.intake;
  const core = d.coverage.filter((c) => c.importance === 'core' && c.itemIds.length).length;
  const parts = [
    `You want to reach "${targetLabel(i.target, i.archetype ?? d.map.archetype)}" in ${d.map.title}${i.doneMeans ? `, which for you means: ${i.doneMeans.trim()}` : ''}.`,
    `You're starting as a ${i.currentLevel} with ${i.hoursPerWeek} hours a week, so the plan runs about ${d.totalWeeks} weeks in ${d.phases.length} phases.`,
    `It covers ${core} core topics, with prerequisites always before what depends on them.`,
  ];
  const title = (k: string) => d.map.competencies.find((c) => c.key === k)?.title ?? k;
  if (i.placement?.weak.length) parts.push(`Your placement check showed gaps in ${i.placement.weak.map(title).join(', ')}, so those get extra time.`);
  if (i.placement?.strong.length) parts.push(`You already did well on ${i.placement.strong.map(title).join(', ')}, so those are shortened.`);
  if (d.mapQuality === 'approved_draft') parts.push('The topic list was drafted by AI and approved by you, so treat it as a starting point.');
  return parts.join(' ');
}
