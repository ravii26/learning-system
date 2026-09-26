/**
 * Computes a Goal's readiness as `criteria met / criteria total` — per the
 * project plan's honesty rule, never a percentage-with-confidence. With a
 * handful of goals, a "68% ready, 41 days left" projection is fiction;
 * "6 of 9 things done, here's what's left" is honest and actionable.
 *
 * One criterion per REQUIRED linked topic. When the topic has evidence
 * (module / idea states from lib/moduleState.ts, problems solved cold) it
 * is met only when that evidence says so — not by ticking boxes or
 * marking it done. Topics with no evidence yet fall back to the old rule:
 * graduated to maintenance, or progress past a threshold. This is a real, computable signal derived from actual topic
 * progress, not a fabricated AI-authored rubric — a richer criteria set
 * (the kind Example A's plan sketch shows, like "solve 2 mediums cold")
 * would need api/generate-roadmap to generate structured criteria, which
 * it doesn't today. That's a natural follow-up, not done here.
 */

export interface ReadinessEvidence {
  /** Course topics are measured per module; anything else per idea. */
  unit: 'module' | 'idea';
  counts: { unseen: number; learning: number; solid: number; fading: number };
  /** Problems solved without help (lib/problems.ts). */
  problemsCold: number;
}

export interface ReadinessTopicInput {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  required: boolean;
  depthTarget?: string | null;
  /** When present, readiness comes from what you've proven, not progress %. */
  evidence?: ReadinessEvidence | null;
}

export interface ReadinessCriterion {
  topicId: string;
  label: string;
  met: boolean;
  /** Plain words: why it's met, or what's still missing. */
  reason: string;
}

export interface ReadinessResult {
  met: number;
  total: number;
  criteria: ReadinessCriterion[];
}

// Legacy rule, used only when a topic has no evidence yet: graduated to
// maintenance, or checkbox progress past this line.
export const READINESS_COMPLETION_THRESHOLD = 80;
/** Share of a course's modules that must be solid. */
export const READY_SOLID_SHARE = 0.8;
/** Solved-cold problems an interview-ready topic needs. */
export const READY_PROBLEMS_COLD = 5;
/** Depth targets that mean "interview-ready" (see /learn/new). */
const INTERVIEW_DEPTHS = new Set(['Deep', 'Mastery']);

function judge(t: ReadinessTopicInput): { met: boolean; reason: string } {
  const e = t.evidence;
  const total = e ? e.counts.unseen + e.counts.learning + e.counts.solid + e.counts.fading : 0;

  if (e && e.unit === 'module' && total > 0) {
    const needSolid = Math.ceil(total * READY_SOLID_SHARE);
    const gaps: string[] = [];
    if (e.counts.solid < needSolid) gaps.push(`${e.counts.solid} of ${needSolid} modules solid`);
    if (e.counts.fading > 0) gaps.push(`${e.counts.fading} slipping`);
    const interview = INTERVIEW_DEPTHS.has(t.depthTarget ?? '');
    if (interview && e.problemsCold < READY_PROBLEMS_COLD) gaps.push(`${e.problemsCold} of ${READY_PROBLEMS_COLD} problems solved cold`);
    if (gaps.length === 0) {
      return { met: true, reason: `${e.counts.solid} of ${total} modules solid${interview ? `, ${e.problemsCold} problems solved cold` : ''}` };
    }
    return { met: false, reason: gaps.join(' · ') };
  }

  if (e && e.unit === 'idea' && total > 0) {
    return e.counts.fading > 0
      ? { met: false, reason: `${e.counts.fading} idea${e.counts.fading === 1 ? '' : 's'} slipping` }
      : { met: e.counts.solid > 0, reason: `${e.counts.solid} ideas solid` };
  }

  if (t.status === 'maintenance') return { met: true, reason: 'Marked done' };
  if (t.progressPct >= READINESS_COMPLETION_THRESHOLD) return { met: true, reason: `${t.progressPct}% through` };
  return { met: false, reason: 'Nothing proven yet' };
}

export function computeGoalReadiness(topics: ReadinessTopicInput[]): ReadinessResult {
  const criteria: ReadinessCriterion[] = topics
    .filter((t) => t.required)
    .map((t) => ({ topicId: t.id, label: t.title, ...judge(t) }));

  return {
    met: criteria.filter((c) => c.met).length,
    total: criteria.length,
    criteria,
  };
}
