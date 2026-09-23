/**
 * Shared domain types, consolidating declarations that were copy-pasted
 * across components (the same `interface Concept { id, title, status }`
 * existed in 4+ files, `interface Topic` in 7+).
 *
 * Scope note: this pass only consolidates types in files this session
 * hasn't touched, to avoid colliding with in-flight edits elsewhere
 * (topics/[id]/page.tsx, PrioritizationPortal.tsx, SpacedReviewQueue.tsx,
 * dashboard page.tsx, review/page.tsx, CurriculumView.tsx, SocraticCoach.tsx
 * still declare their own richer/older local Topic — those are Phase 3+
 * candidates for the real schema-backed types once Concept becomes a row).
 */

// The minimal Topic shape used for session planning and quick-start flows.
// Canonical source is sessionHeuristics.ts (tested, in production use);
// re-exported here under a distinct name so it isn't confused with the
// much larger Topic interface still declared locally in topics/[id]/page.tsx.
export type { Topic as TopicSummary } from '@/lib/sessionHeuristics';

// The knowledge-map concept shape. Canonical source is KnowledgeMap.tsx,
// which has the fullest field set (difficulty/importance/parentId); other
// components only read a subset (id/title/status) and accept this superset
// structurally.
export type { Concept } from '@/app/(dashboard)/topics/[id]/KnowledgeMap';
