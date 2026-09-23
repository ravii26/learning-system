/**
 * The 9-level mastery ladder, and the mapping between its two
 * representations:
 *   - the JSON/display string used everywhere in the UI and in the legacy
 *     knowledgeMap blob: 'Unknown', 'Can Recall', 'Can Teach', ...
 *   - the Postgres enum on Concept.masteryLevel, which can't contain spaces:
 *     Unknown, CanRecall, CanTeach, ...
 *
 * This is the one place that mapping is allowed to exist. A typo here is a
 * silent data-corruption bug (a concept quietly resets to Unknown), so it's
 * fully unit tested against every ladder value.
 */

export const MASTERY_LADDER = [
  'Unknown',
  'Exposed',
  'Understood',
  'Can Recall',
  'Can Apply',
  'Can Solve',
  'Can Explain',
  'Can Teach',
  'Can Create',
] as const;

export type MasteryLevelLabel = (typeof MASTERY_LADDER)[number];

// Must match the `MasteryLevel` enum in prisma/schema.prisma exactly, same order.
export const MASTERY_ENUM_VALUES = [
  'Unknown',
  'Exposed',
  'Understood',
  'CanRecall',
  'CanApply',
  'CanSolve',
  'CanExplain',
  'CanTeach',
  'CanCreate',
] as const;

export type MasteryLevelEnum = (typeof MASTERY_ENUM_VALUES)[number];

const LABEL_TO_ENUM = new Map<string, MasteryLevelEnum>(
  MASTERY_LADDER.map((label, i) => [label, MASTERY_ENUM_VALUES[i]])
);
const ENUM_TO_LABEL = new Map<string, MasteryLevelLabel>(
  MASTERY_ENUM_VALUES.map((v, i) => [v, MASTERY_LADDER[i]])
);

/** JSON display label ('Can Recall') -> Postgres enum value ('CanRecall'). Unknown input falls back to 'Unknown'. */
export function labelToEnum(label: string | null | undefined): MasteryLevelEnum {
  return (label && LABEL_TO_ENUM.get(label)) || 'Unknown';
}

/** Postgres enum value ('CanRecall') -> JSON display label ('Can Recall'). */
export function enumToLabel(value: string): MasteryLevelLabel {
  return ENUM_TO_LABEL.get(value) || 'Unknown';
}

export function ladderIndex(label: string): number {
  return MASTERY_LADDER.indexOf(label as MasteryLevelLabel);
}
