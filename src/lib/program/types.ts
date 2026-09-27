import type { CompetencyMap, TargetLevel } from '@/data/competencies';
import type { Budget, Pricing, ResourceFormat, ResourceRole, ResourceType } from '@/data/resources';

export type Shape = 'course' | 'reading' | 'practice' | 'exploration' | 'project';
export const SHAPES: Shape[] = ['course', 'reading', 'practice', 'exploration', 'project'];

export type CurrentLevel = 'beginner' | 'intermediate' | 'advanced';

/** The learner's answers. Quick start fills the first five; Serious plan adds the rest. */
export interface Intake {
  goal: string;                 // in their own words: "become interview-ready in system design"
  path: 'quick' | 'serious';
  currentLevel: CurrentLevel;
  hoursPerWeek: number;
  target: TargetLevel;
  budget: Budget;
  why?: string;
  doneMeans?: string;           // their success criterion, in their words
  deadlineWeeks?: number;
  formats?: ResourceFormat[];
  bookTitle?: string;           // "learn investing from The Intelligent Investor"
  placement?: { strong: string[]; weak: string[] };
}

export interface DraftResource {
  catalogKey: string | null;    // set for catalogue picks
  title: string;
  url: string;
  source: 'catalog' | 'ai';
  quality: 'curated' | 'unreviewed';
  pricing: Pricing;
  role: ResourceRole;
  type: ResourceType;
}

export interface DraftItem {
  id: string;                   // stable within a draft, e.g. "p2-course"
  phase: number;
  shape: Shape;
  title: string;
  competencyKeys: string[];
  hoursPerWeek: number;
  weeks: number;
  resources: DraftResource[];
  focus?: string;               // one line from the AI: what to pay attention to
}

export interface DraftPhase {
  phase: number;
  title: string;
  weeks: number;
  items: DraftItem[];
  checkpoint: { title: string; competencyKeys: string[] };
}

export interface CoverageRow {
  key: string;
  title: string;
  importance: 'core' | 'supporting' | 'optional';
  itemIds: string[];
}

export interface ProgramDraft {
  field: string;                // curated map key or "custom"
  mapQuality: 'curated' | 'approved_draft';
  map: CompetencyMap;
  intake: Intake;
  phases: DraftPhase[];
  hoursPerWeek: number;
  totalWeeks: number;
  whyThisPlan: string;
  coverage: CoverageRow[];
  /** Honest notes, e.g. "doesn't fit 8 weeks at 5 h/week; optional topics dropped". */
  warnings: string[];
}
