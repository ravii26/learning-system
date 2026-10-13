import { BLOCK_LABEL, type BlockType } from './lessonBlocks';
import { KIND_DEFAULT_BLOCKS, KIND_MINUTES, LESSON_KIND_LABEL, guessLessonKind, type LessonKind } from './lessonKinds';

/**
 * "Start learning": three plain questions (what, what for, how big) mapped
 * onto the machinery the app already has. Nothing here talks to the server;
 * it works out what would be created, so the page can show it first and then
 * send it.
 */

export type IntentKey =
  | 'understand' | 'decide' | 'map' | 'path' | 'cases'
  | 'practise' | 'memorise' | 'exam' | 'build' | 'resource' | 'explore';

export interface Intent {
  key: IntentKey;
  label: string;
  hint: string;
  /** The lesson kind a lesson with this purpose uses. */
  kind: LessonKind;
  /** What "ongoing, no finish line" means for this purpose, if it makes sense at all. */
  ongoing?: 'practice' | 'accretion';
}

export const INTENTS: readonly Intent[] = [
  { key: 'understand', label: 'Understand it', hint: 'How something works, explained and tested', kind: 'concept', ongoing: 'accretion' },
  { key: 'decide', label: 'Choose between options', hint: 'Compare them side by side and decide', kind: 'decision' },
  { key: 'map', label: 'See the whole field', hint: 'The big picture and where to start', kind: 'survey' },
  { key: 'path', label: 'Follow a path', hint: 'What to learn, in what order', kind: 'roadmap' },
  { key: 'cases', label: 'Learn from real examples', hint: 'How others made the choice, and why', kind: 'case_study' },
  { key: 'practise', label: 'Practise a skill', hint: 'Drills you repeat until it is easy', kind: 'drill', ongoing: 'practice' },
  { key: 'memorise', label: 'Memorise it', hint: 'Facts, words or formulas to recall', kind: 'memorise' },
  { key: 'exam', label: 'Prepare for an exam or interview', hint: 'How it is asked, the traps, the strategy', kind: 'exam_prep' },
  { key: 'build', label: 'Build something', hint: 'A small real project, step by step', kind: 'project' },
  { key: 'resource', label: 'Work through a book, course or video', hint: 'A way to get more out of it', kind: 'resource' },
  { key: 'explore', label: 'Just explore', hint: 'Curiosity, with no pressure', kind: 'explore', ongoing: 'accretion' },
];

export function intentByKey(key: string): Intent | undefined {
  return INTENTS.find((i) => i.key === key);
}

/** The purpose a title most likely has, from the same free keyword guess the module form uses. */
export function guessIntent(title: string): Intent | undefined {
  const kind = guessLessonKind(title);
  return kind === 'concept' ? undefined : INTENTS.find((i) => i.kind === kind);
}

export type SizeKey = 'lesson' | 'series' | 'plan' | 'ongoing';

export const SIZES: ReadonlyArray<{ key: SizeKey; label: string; hint: string }> = [
  { key: 'lesson', label: 'One lesson', hint: 'About one sitting' },
  { key: 'series', label: 'A short series', hint: 'Several lessons you can trim' },
  { key: 'plan', label: 'A full plan', hint: 'Phases, hours a week, a finish line' },
  { key: 'ongoing', label: 'Ongoing', hint: 'No finish line' },
];

/** Which sizes make sense for a purpose: "ongoing" only where the app has something open-ended to offer. */
export function sizesFor(intent: Intent): SizeKey[] {
  return intent.ongoing ? ['lesson', 'series', 'plan', 'ongoing'] : ['lesson', 'series', 'plan'];
}

export interface PlannedModule {
  title: string;
  kind: LessonKind;
  estimatedMinutes: number;
  blueprint?: BlockType[];
}

export interface StartInput {
  title: string;
  intent: Intent;
  size: SizeKey;
  why?: string;
  /** Sections chosen instead of the kind's defaults. */
  blueprint?: BlockType[];
}

export type StartPlan =
  | {
    type: 'create';
    mode: 'syllabus' | 'practice' | 'accretion';
    title: string;
    modules: PlannedModule[];
    /** What the learner will get, one plain line each. */
    preview: string[];
    minutes: number;
    nextAction: string;
    /** Where to go after creating. */
    redirect: 'topic' | 'notes';
  }
  | { type: 'handoff'; href: string; preview: string[] };

/** "comparison table, pros and cons and how-to-decide flowchart" */
export function sectionList(kind: LessonKind, blueprint?: readonly BlockType[]): string {
  const blocks = blueprint?.length ? blueprint : KIND_DEFAULT_BLOCKS[kind];
  if (blocks.length === 0) return 'an explanation, a worked example and the common mistakes';
  const names = blocks.map((b) => BLOCK_LABEL[b].toLowerCase());
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const CORE = 'a quiz, exercises and review cards';

export function planStart(input: StartInput): StartPlan {
  const title = input.title.trim();
  const { intent, size } = input;
  const kind = intent.kind;
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

  if (size === 'plan') {
    return {
      type: 'handoff',
      href: `/learn/program?${q({ goal: title })}`,
      preview: [
        'The plan builder: a few questions about your level and time, then a plan in phases.',
        'You approve it before anything is created.',
        `Lessons inside it will still be written for what you want: ${LESSON_KIND_LABEL[kind].toLowerCase()}.`,
      ],
    };
  }

  if (size === 'series') {
    return {
      type: 'handoff',
      href: `/learn/new?${q({ title, kind: 'syllabus', ...(input.why ? { why: input.why } : {}), ...(kind !== 'concept' ? { moduleKind: kind } : {}) })}`,
      preview: [
        'A short list of lessons, in order. You can untick any you do not need.',
        kind === 'concept' ? 'Each lesson is a standard lesson.' : `Each lesson is written as “${LESSON_KIND_LABEL[kind].toLowerCase()}”: ${sectionList(kind)}.`,
        `Each also has ${CORE}.`,
      ],
    };
  }

  if (size === 'ongoing') {
    if (intent.ongoing === 'practice') {
      return {
        type: 'create', mode: 'practice', title, modules: [], minutes: 0, nextAction: 'Do today’s rep', redirect: 'topic',
        preview: ['A daily practice topic: one short rep each day, a scoring rubric, and a trend line of how you are improving.', 'No finish line and no lessons to complete.'],
      };
    }
    return {
      type: 'create', mode: 'accretion', title, modules: [], minutes: 0, nextAction: 'Capture the first idea', redirect: 'notes',
      preview: ['A place in your Notebook. Ideas you capture land here, and the ones worth keeping become review cards.', 'No finish line. You can add a lesson to it any time.'],
    };
  }

  // One lesson.
  const minutes = KIND_MINUTES[kind];
  const blueprint = input.blueprint?.length ? input.blueprint : undefined;
  return {
    type: 'create',
    mode: 'syllabus',
    title,
    modules: [{ title, kind, estimatedMinutes: minutes, ...(blueprint ? { blueprint } : {}) }],
    minutes,
    nextAction: `Study: ${title}`,
    redirect: 'topic',
    preview: [
      `1 lesson, about ${minutes} minutes: ${LESSON_KIND_LABEL[kind].toLowerCase()}.`,
      `Sections: ${sectionList(kind, blueprint)}. Plus ${CORE}.`,
    ],
  };
}

export interface TopicRequest {
  title: string;
  area: string;
  mode: 'syllabus' | 'practice' | 'accretion';
  status: 'active' | 'queued';
  depthTarget: string;
  why: string;
  nextAction: string;
  currentStage: string;
  curriculum: Array<Record<string, unknown>>;
}

/** The body for POST /api/topics, the same shape the Learn something new page sends. */
export function topicRequest(plan: Extract<StartPlan, { type: 'create' }>, opts: { area: string; why?: string; status: 'active' | 'queued'; newId?: () => string }): TopicRequest {
  const id = opts.newId ?? (() => Math.random().toString(36).slice(2, 9));
  return {
    title: plan.title,
    area: opts.area,
    mode: plan.mode,
    status: opts.status,
    depthTarget: 'Working Knowledge',
    why: opts.why?.trim() || `I want to learn ${plan.title}`,
    nextAction: plan.nextAction,
    currentStage: 'Fundamentals',
    curriculum: plan.modules.map((m, i) => ({
      id: id(),
      order: i + 1,
      title: m.title,
      estimatedMinutes: m.estimatedMinutes,
      completed: false,
      completedAt: null,
      notes: '',
      // Left out for a concept lesson, so it looks exactly like every lesson made before kinds existed.
      ...(m.kind !== 'concept' ? { kind: m.kind } : {}),
      ...(m.blueprint?.length ? { blueprint: m.blueprint } : {}),
    })),
  };
}
