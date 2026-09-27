import {
  competencyFromModuleId, requiredEvidence,
  type Competency, type EvidenceRequirement, type TargetLevel,
} from '@/data/competencies';

/**
 * The competency evidence matrix: for each competency in a program, what its
 * target level requires, what the existing evidence tables show, and the
 * resulting status. Pure — the route loads rows, this decides. Evidence is
 * only counted from the program's own topics, and per competency through the
 * c:<key> module ids, so nothing is guessed.
 */

export type EvidenceStatus = 'not_started' | 'in_progress' | 'ready';

export interface EvidenceItem { shape: string; topicId: string | null; competencyKeys: string[] }

export interface EvidenceRows {
  attempts: Array<{ topicId: string; moduleId: string; kind: string; score: number | null; verdict: string | null }>;
  problems: Array<{ topicId: string; moduleId: string | null; outcome: string }>;
  cards: Array<{ topicId: string; sourceModuleId: string | null; state: string; reps: number }>;
  artifacts: Array<{ topicId: string }>;
  reps: Array<{ topicId: string }>;
}

export interface ActualEvidence {
  quizBest: number | null;
  recallCards: number;
  coldProblems: number;
  explained: boolean;
  project: boolean;
  practiceReps: number;
}

export interface MatrixRow {
  key: string;
  title: string;
  importance: Competency['importance'];
  required: EvidenceRequirement[];
  actual: ActualEvidence;
  /** Requirement kinds already met. */
  met: EvidenceRequirement['kind'][];
  status: EvidenceStatus;
}

export function isMet(r: EvidenceRequirement, a: ActualEvidence): boolean {
  switch (r.kind) {
    case 'quiz': return a.quizBest !== null && a.quizBest >= r.minScore;
    case 'recall': return a.recallCards >= r.minCards;
    case 'problems_cold': return a.coldProblems >= r.count;
    case 'explain': return a.explained;
    case 'project': return a.project;
    case 'practice': return a.practiceReps >= r.minReps;
  }
}

const hasAny = (a: ActualEvidence) =>
  a.quizBest !== null || a.recallCards > 0 || a.coldProblems > 0 || a.explained || a.project || a.practiceReps > 0;

export function evaluateMatrix(
  competencies: Competency[], target: TargetLevel, items: EvidenceItem[], rows: EvidenceRows,
): MatrixRow[] {
  const topicIds = new Set(items.map((i) => i.topicId).filter((x): x is string => !!x));
  const inProgram = <T extends { topicId: string }>(list: T[]) => list.filter((r) => topicIds.has(r.topicId));
  const attempts = inProgram(rows.attempts);
  const problems = inProgram(rows.problems);
  const cards = inProgram(rows.cards);

  // Topic-level evidence (no modules): shared by the competencies of the item on that topic.
  const itemOf = (key: string) => items.filter((i) => i.competencyKeys.includes(key) && i.topicId);
  const repsOn = (topicId: string) => rows.reps.filter((r) => r.topicId === topicId).length;
  const artifactOn = (topicId: string) => rows.artifacts.some((r) => r.topicId === topicId);
  const exploreCards = (item: EvidenceItem) => {
    // Explore topics have no modules: their review cards are split evenly across the item's competencies.
    const n = cards.filter((c) => c.topicId === item.topicId && c.state === 'Review').length;
    return Math.floor(n / Math.max(1, item.competencyKeys.length));
  };

  return competencies.map((c) => {
    const forKey = <T extends { moduleId?: string | null; sourceModuleId?: string | null }>(list: T[]) =>
      list.filter((r) => competencyFromModuleId(r.moduleId ?? r.sourceModuleId) === c.key);
    const quizzes = forKey(attempts).filter((a) => a.kind === 'quiz' && a.score !== null);
    const its = itemOf(c.key);
    const actual: ActualEvidence = {
      quizBest: quizzes.length ? Math.max(...quizzes.map((q) => q.score!)) : null,
      recallCards: forKey(cards).filter((k) => k.state === 'Review').length
        + its.filter((i) => i.shape === 'exploration').reduce((s, i) => s + exploreCards(i), 0),
      coldProblems: forKey(problems).filter((p) => p.outcome === 'cold').length,
      explained: forKey(attempts).some((a) => a.kind === 'challenge' && a.verdict === 'correct'),
      project: its.some((i) => i.shape === 'project' && artifactOn(i.topicId!)),
      practiceReps: its.filter((i) => i.shape === 'practice').reduce((s, i) => s + repsOn(i.topicId!), 0),
    };
    const required = requiredEvidence(c.kind, target);
    const met = required.filter((r) => isMet(r, actual)).map((r) => r.kind);
    const status: EvidenceStatus = met.length === required.length ? 'ready' : hasAny(actual) ? 'in_progress' : 'not_started';
    return { key: c.key, title: c.title, importance: c.importance, required, actual, met, status };
  });
}

/** A checkpoint is ready when every competency it lists is ready. */
export function checkpointStatus(keys: string[], matrix: MatrixRow[]): EvidenceStatus {
  const rows = matrix.filter((r) => keys.includes(r.key));
  if (rows.length && rows.every((r) => r.status === 'ready')) return 'ready';
  return rows.some((r) => r.status !== 'not_started') ? 'in_progress' : 'not_started';
}
