import type { EvidenceRequirement } from '@/data/competencies';
import type { DraftResource, Shape } from './types';

/** Plain-language labels shared by the draft screen and the goal page. */

export const SHAPE_LABEL: Record<Shape, string> = {
  course: 'Course',
  reading: 'Reading',
  practice: 'Practice',
  exploration: 'Explore',
  project: 'Project',
};

export function describeRequirement(r: EvidenceRequirement): string {
  switch (r.kind) {
    case 'quiz': return `quiz ${Math.round(r.minScore * 100)}%+`;
    case 'recall': return `recall ${r.minCards} cards days later`;
    case 'problems_cold': return `${r.count} problem${r.count === 1 ? '' : 's'} solved without hints`;
    case 'explain': return 'explain it in your own words';
    case 'project': return 'a finished project';
    case 'practice': return `${r.minReps} practice reps`;
  }
}

export const describeRequirements = (reqs: EvidenceRequirement[]) => reqs.map(describeRequirement).join(' · ');

export function resourceBadges(r: DraftResource): string[] {
  const out = [r.quality === 'curated' ? 'Curated' : 'Unreviewed'];
  if (r.pricing === 'free') out.push('Free');
  else if (r.pricing === 'freemium') out.push('Free tier');
  else if (r.pricing === 'paid') out.push('Paid');
  if (r.source === 'ai') out.push('Search link');
  if (r.source === 'search') out.push('Found & link-checked');
  return out;
}
