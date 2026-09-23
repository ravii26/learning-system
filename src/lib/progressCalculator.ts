export interface TopicProgressData {
  subtasks?: Array<{ completed?: boolean }>;
  curriculum?: Array<{ completed?: boolean }>;
  knowledgeMap?: {
    concepts?: Array<{ status?: string }>;
  };
  manualOverridePct?: number | null;
}

export function calculateTopicProgress(topic: TopicProgressData): number {
  const subtasks = topic.subtasks || [];
  const curriculum = topic.curriculum || [];
  const concepts = topic.knowledgeMap?.concepts || [];

  const factors: Array<{ weight: number; pct: number }> = [];

  // 1. Subtasks completion percentage
  if (subtasks.length > 0) {
    const completed = subtasks.filter(s => s.completed).length;
    factors.push({ weight: 0.3, pct: Math.round((completed / subtasks.length) * 100) });
  }

  // 2. Curriculum modules completion percentage
  if (curriculum.length > 0) {
    const completed = curriculum.filter(m => m.completed).length;
    factors.push({ weight: 0.35, pct: Math.round((completed / curriculum.length) * 100) });
  }

  // 3. Knowledge Map concept completion percentage
  if (concepts.length > 0) {
    // Mastery stages that count towards competence: Understood, Can Recall, Can Apply, Can Solve, Can Explain, Can Teach, Can Create
    const mastered = concepts.filter(c => 
      c.status && c.status !== 'Unknown' && c.status !== 'Exposed'
    ).length;
    factors.push({ weight: 0.35, pct: Math.round((mastered / concepts.length) * 100) });
  }

  // If no structured elements exist, return manualOverridePct or 0
  if (factors.length === 0) {
    return topic.manualOverridePct !== undefined && topic.manualOverridePct !== null 
      ? Math.min(100, Math.max(0, topic.manualOverridePct))
      : 0;
  }

  // Compute weighted average across available factors
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedSum = factors.reduce((sum, f) => sum + (f.pct * f.weight), 0);

  return Math.min(100, Math.max(0, Math.round(weightedSum / totalWeight)));
}

/**
 * Mode-aware entry point, per the project plan's Part 3 progress table
 * (syllabus / practice / accretion / reference each mean something
 * different by "progress"). Only `syllabus` has a meaningful percentage —
 * a syllabus topic has a finish line (curriculum coverage x concept
 * mastery x artifacts), so 0-100% is honest.
 *
 * `practice` and `accretion` topics have no finish line by design (Example
 * C/D in the plan: "no percentage anywhere," "success is a curve, not a
 * bar"). This function still returns a number, since `progressPct` is a
 * required Int column read by other UI (e.g. the Today screen's active-
 * topic cards), but a practice/accretion topic naturally has zero
 * subtasks/curriculum/concepts, so `calculateTopicProgress` already
 * returns 0 for them — which is the honest answer for "% complete" on a
 * mode that never completes. Their real progress signal lives in a
 * dedicated curve/trend UI instead (src/lib/practiceTrend.ts for practice,
 * the /notes growth sparkline for accretion), not this percentage.
 */
export function calculateTopicProgressForMode(mode: string, topic: TopicProgressData): number {
  switch (mode) {
    case 'practice':
    case 'accretion':
    case 'reference': // TODO: no percentage at all once there's a UI that can show that — see below
    case 'syllabus':
    default:
      return calculateTopicProgress(topic);
  }
}
