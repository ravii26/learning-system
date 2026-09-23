/**
 * Computes a Goal's readiness as `criteria met / criteria total` — per the
 * project plan's honesty rule, never a percentage-with-confidence. With a
 * handful of goals, a "68% ready, 41 days left" projection is fiction;
 * "6 of 9 things done, here's what's left" is honest and actionable.
 *
 * v1: one criterion per REQUIRED linked topic — "met" once that topic has
 * reached maintenance (graduated) or its progress crosses a completion
 * threshold. This is a real, computable signal derived from actual topic
 * progress, not a fabricated AI-authored rubric — a richer criteria set
 * (the kind Example A's plan sketch shows, like "solve 2 mediums cold")
 * would need api/generate-roadmap to generate structured criteria, which
 * it doesn't today. That's a natural follow-up, not done here.
 */

export interface ReadinessTopicInput {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  required: boolean;
}

export interface ReadinessCriterion {
  topicId: string;
  label: string;
  met: boolean;
}

export interface ReadinessResult {
  met: number;
  total: number;
  criteria: ReadinessCriterion[];
}

// A topic counts as "done enough" once it's graduated to maintenance, or
// its progress crosses this line. Matches no existing constant elsewhere —
// deliberately a bit below 100, since a topic can sit at "essentially done"
// for a while without every last checkbox ticked.
export const READINESS_COMPLETION_THRESHOLD = 80;

export function computeGoalReadiness(topics: ReadinessTopicInput[]): ReadinessResult {
  const required = topics.filter((t) => t.required);

  const criteria: ReadinessCriterion[] = required.map((t) => ({
    topicId: t.id,
    label: t.title,
    met: t.status === 'maintenance' || t.progressPct >= READINESS_COMPLETION_THRESHOLD,
  }));

  return {
    met: criteria.filter((c) => c.met).length,
    total: criteria.length,
    criteria,
  };
}
