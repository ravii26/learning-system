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
 * different by "progress"). Only `syllabus` has real underlying data
 * today — PracticeRep (practice) and Note (accretion) don't exist until
 * Phases 8/9, and no UI can set a topic to a non-syllabus mode yet (every
 * topic defaults to 'syllabus' — see the Phase 5 migration). The other
 * three branches currently delegate to the same calculation as syllabus;
 * they're separated here so the mode dispatch exists and each branch has
 * an obvious place to diverge once its backing feature lands, rather than
 * bolting mode-awareness on later as a bigger change.
 */
export function calculateTopicProgressForMode(mode: string, topic: TopicProgressData): number {
  switch (mode) {
    case 'practice': // TODO(Phase 9): rep cadence x rubric trend, rendered as a curve, not this weighted blend
    case 'accretion': // TODO(Phase 8): note/link growth, capped, never 100%
    case 'reference': // TODO: no percentage at all once there's a UI that can show that — see below
    case 'syllabus':
    default:
      return calculateTopicProgress(topic);
  }
}
