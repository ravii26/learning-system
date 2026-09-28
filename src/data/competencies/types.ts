/**
 * Competency maps: the trusted, hand-reviewed skeleton a learning program is
 * built on. The AI may choose emphasis, order and pacing inside a map; it
 * may not add competencies to it. See src/lib/program/.
 */

/** How far the learner wants to go. Maps from Topic.depthTarget via targetFromDepth(). */
export type TargetLevel = 'aware' | 'use' | 'build' | 'interview';
export const TARGET_LEVELS: TargetLevel[] = ['aware', 'use', 'build', 'interview'];

export type Importance = 'core' | 'supporting' | 'optional';

/**
 * What kind of ability a competency is. Drives which evidence proves it:
 * a concept is proven by recall and explanation, an algorithm by problems
 * solved cold, a design skill by design problems, a build skill by a project.
 */
export type CompetencyKind = 'concept' | 'algorithm' | 'design' | 'build' | 'skill';

export interface Competency {
  key: string;
  title: string;
  /** Section of the map, e.g. "Fundamentals". Used to group phases. */
  group: string;
  kind: CompetencyKind;
  importance: Importance;
  /** The lowest target level at which this competency is part of the plan. */
  from: TargetLevel;
  /** Keys in the same map that should come first. */
  prerequisites?: string[];
  /** One line: what being able to do this means. */
  summary: string;
  /**
   * AI-drafted maps: the concrete lessons inside this topic, in order, each
   * one sitting (e.g. "Present simple: habits and facts"). Each becomes its
   * own module, so a 7-hour topic isn't squeezed into one lesson.
   */
  lessons?: string[];
}

export interface CompetencyMap {
  key: string;
  title: string;
  /** Lower-case phrases that identify this field in free text ("hld", "system design"). */
  aliases: string[];
  description: string;
  competencies: Competency[];
  /** What kind of learning this is (language, exam, hands-on skill...). See src/lib/program/fieldGuide.ts. */
  archetype?: string;
}

/** One piece of evidence a checkpoint can require for a competency. */
export type EvidenceRequirement =
  | { kind: 'quiz'; minScore: number }          // ModuleAttempt kind=quiz, best score
  | { kind: 'explain' }                          // ModuleAttempt kind=challenge, verdict passed
  | { kind: 'recall'; minCards: number }         // review cards from the module, none lapsing
  | { kind: 'problems_cold'; count: number }     // ProblemAttempt outcome=cold on the module
  | { kind: 'project' }                          // an Artifact on the item's topic
  | { kind: 'practice'; minReps: number };       // PracticeRep count on the item's topic

/** Module ids for competencies use this prefix, so evidence maps back to a competency. */
export const COMPETENCY_MODULE_PREFIX = 'c:';
/** Lesson 2+ of a competency: "c:<key>~2". Keys are slugs, so "~" never appears in one. */
export const LESSON_SEPARATOR = '~';
export const moduleIdFor = (competencyKey: string, lesson = 1) =>
  `${COMPETENCY_MODULE_PREFIX}${competencyKey}${lesson > 1 ? `${LESSON_SEPARATOR}${lesson}` : ''}`;
export const competencyFromModuleId = (moduleId: string | null | undefined): string | null =>
  moduleId && moduleId.startsWith(COMPETENCY_MODULE_PREFIX) ? moduleId.slice(COMPETENCY_MODULE_PREFIX.length).split(LESSON_SEPARATOR)[0] : null;
/** The lessons a competency is taught in: its drafted lesson list, or one lesson named after it. */
export const lessonsOf = (c: Competency): string[] => (c.lessons?.length ? c.lessons : [c.title]);
