/**
 * Curated resource catalogue (tier 1). Entries here are hand-picked, so they
 * carry quality 'curated'. Search and AI finds never land here directly;
 * the owner promotes them after using them.
 */

export type ResourceType = 'BOOK' | 'COURSE' | 'VIDEO' | 'DOCS' | 'ARTICLE' | 'PRACTICE' | 'TOOL';
export type Pricing = 'free' | 'freemium' | 'paid' | 'unknown';
export type ResourceRole = 'primary' | 'practice' | 'reference' | 'supplementary';
export type ResourceLevel = 'beginner' | 'intermediate' | 'advanced' | 'all';
/** How you consume it — matched against the intake's preferred formats. */
export type ResourceFormat = 'read' | 'watch' | 'do';

export interface CatalogResource {
  key: string;
  title: string;
  url: string;
  type: ResourceType;
  format: ResourceFormat;
  pricing: Pricing;
  role: ResourceRole;
  level: ResourceLevel;
  /** Competency map keys this resource serves. */
  fields: string[];
  /** Competencies it covers well; empty means the field in general. */
  competencyKeys: string[];
  /** One line: why this one, and when to use it. */
  bestFor: string;
}
