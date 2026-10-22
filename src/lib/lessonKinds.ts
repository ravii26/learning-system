import { BLOCK_TYPES, type BlockType } from './lessonBlocks';

/**
 * What a lesson has to leave you able to do. This decides which sections the
 * lesson has; the subject's archetype (program/fieldGuide.ts) still decides
 * how it teaches. Stored on the lesson as `content.kind`; a lesson without
 * one is a plain concept lesson, which is every lesson written so far.
 */
export const LESSON_KINDS = [
  'concept', 'decision', 'survey', 'roadmap', 'case_study',
  'drill', 'memorise', 'exam_prep', 'project', 'resource', 'explore',
] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  concept: 'Understand a concept',
  decision: 'Make a decision',
  survey: 'Map a field',
  roadmap: 'Follow a path',
  case_study: 'Learn from a case',
  drill: 'Practise a skill',
  memorise: 'Memorise it',
  exam_prep: 'Prepare for an exam',
  project: 'Build something',
  resource: 'Work through a resource',
  explore: 'Just explore',
};

/** The short word on a badge in the module list. */
export const LESSON_KIND_BADGE: Record<LessonKind, string> = {
  concept: 'Concept',
  decision: 'Decision',
  survey: 'Overview',
  roadmap: 'Path',
  case_study: 'Case study',
  drill: 'Practice',
  memorise: 'Memorise',
  exam_prep: 'Exam prep',
  project: 'Project',
  resource: 'Resource',
  explore: 'Explore',
};

/** Roughly how long one lesson of each kind takes to work through, in minutes. Used for previews and as a module's default. */
export const KIND_MINUTES: Record<LessonKind, number> = {
  concept: 20, decision: 20, survey: 15, roadmap: 15, case_study: 20,
  drill: 25, memorise: 15, exam_prep: 30, project: 45, resource: 30, explore: 10,
};

/**
 * The sections a new lesson of each kind gets, in reading order, unless the
 * learner drops some. Concept lessons have none: they are the original fixed
 * lesson.
 */
export const KIND_DEFAULT_BLOCKS: Record<LessonKind, readonly BlockType[]> = {
  concept: [],
  decision: ['comparison_table', 'pros_cons', 'cost_chart', 'matrix_2x2', 'decision_flow'],
  survey: ['landscape', 'comparison_table', 'matrix_2x2'],
  roadmap: ['timeline', 'decision_flow'],
  case_study: ['case_study', 'comparison_table'],
  drill: ['steps', 'routine'],
  memorise: ['memory_list'],
  exam_prep: ['landscape', 'question_patterns'],
  project: ['timeline', 'steps'],
  resource: ['study_guide'],
  explore: ['key_ideas'],
};

/** Sections a kind can have but does not get unless asked for: they only make sense when the topic has that shape. */
const KIND_OPTIONAL_BLOCKS: Record<LessonKind, readonly BlockType[]> = {
  concept: [],
  decision: ['state_diagram'],
  survey: ['state_diagram'],
  roadmap: [],
  case_study: ['state_diagram'],
  drill: [],
  memorise: ['comparison_table'],
  exam_prep: ['timeline'],
  project: ['comparison_table'],
  resource: ['timeline'],
  explore: ['timeline', 'case_study'],
};

/** Everything a kind can have (its defaults plus the optional ones), in reading order. */
export const KIND_BLOCKS: Record<LessonKind, readonly BlockType[]> = Object.fromEntries(
  LESSON_KINDS.map((k) => [k, BLOCK_TYPES.filter((t) => KIND_DEFAULT_BLOCKS[k].includes(t) || KIND_OPTIONAL_BLOCKS[k].includes(t))]),
) as unknown as Record<LessonKind, readonly BlockType[]>;

/** True when a choice of sections is exactly the kind's default, so nothing needs to be stored. */
export function isDefaultBlueprint(kind: LessonKind, value: readonly BlockType[]): boolean {
  const d = KIND_DEFAULT_BLOCKS[kind];
  return value.length === d.length && d.every((t) => value.includes(t));
}

export function isLessonKind(v: unknown): v is LessonKind {
  return typeof v === 'string' && (LESSON_KINDS as readonly string[]).includes(v);
}

/** Anything unknown or missing reads as a concept lesson. */
export function lessonKindOf(v: unknown): LessonKind {
  return isLessonKind(v) ? v : 'concept';
}

const APP_NOUNS = 'app|apps|api|website|site|bot|tool|game|clone|shortener|dashboard|server|cli|plugin|extension|script|scraper|chatbot|pipeline|compiler|engine|portfolio|blog|store|shop|calculator|tracker|service|library|parser|interpreter|database|cache|queue';

/**
 * Title patterns for the free suggestion, per kind. Order matters: the first
 * kind with any matching pattern wins, so a title that compares things stays a
 * decision even if it also says "roadmap". Every pattern errs on the side of
 * NOT matching: a missed suggestion costs one click, a wrong one is a surprise.
 */
const GUESSES: Array<[LessonKind, RegExp[]]> = [
  ['decision', [
    /\b(vs\.?|versus|choos(e|es|ing)|compar(e|es|ing|ison)|pros and cons|trade-?offs?|difference between|alternatives? to|pick(ing)? (a|an|the|between)|tech stack|should i (use|learn|pick|choose)|which (one )?(is better|to use|should))\b/i,
    /\b(decide|decision) (between|on|whether)\b/i,
    /\b(better|worse) than\b/i,
    /\bshould (we|you)\b/i,
    /\b(is it worth|worth (it|learning|using|switching|the))\b/i,
    /\b(best|right|ideal) (tool|framework|language|database|library|stack|cloud|host(ing)?|platform|approach|architecture|option|choice|plan|laptop|editor|ide)s?\b/i,
    /\b(which|what) (database|framework|language|tool|library|cloud|stack|platform|plan|approach|architecture|editor|laptop|hosting)\b/i,
    /\b(switch(ing)?|migrat(e|ing)|mov(e|ing)) (away )?from [\w.+#-]+ to\b/i,
    /\b[\w.+#-]{2,} or [\w.+#-]{2,}\?/i,
  ]],
  ['case_study', [
    /\b(case stud(y|ies)|post-?mortems?|how .{2,40} (scaled|migrated|moved|switched|rebuilt)|lessons from|what went wrong)\b/i,
    /\bhow .{2,40} (grew|survived|handled|recovered|failed|reduced|saved|won|lost|dealt with)\b/i,
    /\bwhy .{2,40} (failed|succeeded|won|lost|collapsed)\b/i,
    /\b(success|failure|war) stor(y|ies)\b/i,
    /\b(rise|fall|story) of\b/i,
    /\b(real[- ]world|real) (examples?|cases?|stories)\b/i,
    /\bstories (of|from)\b/i,
    /\b(lessons? learned|what we learned)\b/i,
    /\b(incident|outage) (review|report|analysis)s?\b/i,
    /\b(teardown|anatomy of|behind the scenes)\b/i,
  ]],
  ['roadmap', [
    /\b(road ?map|learning path|study plan|how to become|path to|zero to)\b/i,
    /\b(become|becoming) (a|an)\b/i,
    /\b(career|study) (path|plan|track|journey)\b/i,
    /\b\d+[- ]?(day|week|month)s? (plan|challenge|roadmap|schedule|curriculum|program)\b/i,
    /\b(beginner|novice)s? to (advanced|expert|pro|professional|job[- ]ready)\b/i,
    /\bfrom scratch to\b/i,
    /\b(best|fastest|right) way to (learn|master|get started|start)\b/i,
    /\b(how to|learn) .{2,40} in \d+ (days?|weeks?|months?|years?)\b/i,
    /\b(what to learn|learning order|order to learn|where to start|how to start learning)\b/i,
  ]],
  ['exam_prep', [
    /\b(upsc|ielts|toefl|gmat|neet|jee|pyqs?)\b/i,
    /\b(gre|sat|cat|gate) (exam|prep|preparation|test|syllabus)\b/i,
    /\bprepar(e|ing|ation) for\b/i,
    /\b(exam|interview|test) (prep|preparation|questions|practice|tips|strategy)\b/i,
    /\b(mock|practice) (test|exam|interview)s?\b/i,
    /\bcrack(ing)? (the |a )?([\w-]+ )?(exam|interview)\b/i,
    /\b(certification|certificate) (prep|exam|study)\b/i,
    /\b(aws|azure|gcp|cka|pmp|cfa) (certified|certification|exam)\b/i,
    /\b(previous|past) years?('s)? (questions|papers)\b/i,
  ]],
  ['memorise', [
    /\b(memori[sz]e|memori[sz]ing|memori[sz]ation|mnemonics?|flashcards?|by heart)\b/i,
    /\b(vocabulary|vocab)\b/i,
    /\bcheat ?sheet\b/i,
    /\b(times tables?|periodic table|key terms)\b/i,
  ]],
  ['project', [
    // A verb of making, then an article ("build a ..."), plus something you could ship. A bare "code" or "server" is not enough.
    new RegExp(`^(?=.*\\b(?:build|building|create|creating|make|making|code|coding) (?:a|an|your|my|our|the|this)\\b)(?=.*\\b(?:${APP_NOUNS})\\b)`, 'i'),
    /\b(capstone|mini[- ]?project|side project|hands[- ]on project|project[- ]based)\b/i,
    /\b(step[- ]by[- ]step (guide|tutorial|walkthrough)|walk[- ]?through)\b/i,
    /\blet'?s build\b/i,
  ]],
  ['resource', [
    /\b(read(ing)?|study(ing)?|work(ing)? through|go(ing)? through|finish(ing)?|follow(ing)?|notes (on|from)|summary of) .{0,40}\b(book|course|video|lecture|series|paper|playlist|podcast|textbook)\b/i,
    /\b(book|course|video|lecture|playlist|podcast|textbook) (notes|summary|club|study|guide)\b/i,
    /\bchapter \d+\b/i,
  ]],
  ['drill', [
    /\b(practi[sc]e|practi[sc]ing|drills?|warm[- ]?ups?|daily practice)\b/i,
    /\b(speaking|typing|listening|writing) practice\b/i,
  ]],
  ['explore', [
    /\b(just exploring|for fun|out of curiosity|curious about|fun facts?|story behind|rabbit hole|interesting facts?)\b/i,
    /\bwhy (do|does|is|are) (we|people|the sky|cats|dogs)\b/i,
  ]],
  ['survey', [
    /\b(overview of|landscape|ecosystem|types of|kinds of|map of|introduction to the field|what are the (main )?(options|categories|types))\b/i,
    /\b(top|best)[- ]?\d{1,3}\b/i,
    /\b\d{1,3}\+? (\w+ ){0,2}(types|kinds|ways|tools|ideas|options|categories|frameworks|languages|techniques|methods|strategies|examples|businesses|companies|products|platforms)\b/i,
    /\b(list|catalog(ue)?|directory|taxonomy|glossary|categories|families) of\b/i,
    /\b(different|various|main|common|major) (types|kinds|ways|approaches|categories|options|methods|models|styles)\b/i,
    /\b(state of|big picture|at a glance|field guide|lay of the land|what('?s| is) out there)\b/i,
    /\b(tools|libraries|frameworks|platforms|options|resources|ideas) (for|available|out there)\b/i,
  ]],
];

/** A free keyword guess from a title, shown as a suggestion the learner can change. No AI call. */
export function guessLessonKind(text: string): LessonKind {
  return GUESSES.find(([, res]) => res.some((re) => re.test(text)))?.[0] ?? 'concept';
}
