import type { GeneratedTopic } from '@/app/api/generate-roadmap/route';
import { kindsByTitle } from './moduleKinds';

/** Cleans the roadmap AI's topic list; null when too few usable topics came back. */
export function sanitizeTopics(raw: unknown): GeneratedTopic[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const valid: GeneratedTopic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title || '').trim();
    if (!title || title.length < 3) continue;
    const why = String(item.why || `Build foundational capability in ${title}.`).trim();
    const nextAction = String(item.nextAction || `Review the core concepts of ${title} and complete the first exercise.`).trim();
    const rawHours = typeof item.estimatedHours === 'number' ? item.estimatedHours : parseInt(String(item.estimatedHours || '10'), 10);
    const estimatedHours = isNaN(rawHours) ? 10 : Math.max(2, Math.min(100, rawHours));
    const curriculum = Array.isArray(item.curriculum) && item.curriculum.length > 0
      ? item.curriculum.map((c: any) => typeof c === 'object' && c?.title ? String(c.title) : String(c))
      : [`Core Principles of ${title}`, `Practical Examples of ${title}`, `Hands-on Practice with ${title}`];
    // Items may be plain titles or { title, kind }; keep any valid labels.
    const curriculumKinds = kindsByTitle(item.curriculum, (t) => String(t));

    valid.push({
      title,
      area: String(item.area || 'Tech'),
      why,
      depthTarget: item.depthTarget || 'Working Knowledge',
      estimatedHours,
      nextAction,
      mode: (item.mode === 'self_directed' || item.mode === 'project' || item.mode === 'course') ? item.mode : 'course',
      curriculum,
      ...(Object.keys(curriculumKinds).length ? { curriculumKinds } : {}),
      outcome: typeof item.outcome === 'string' ? item.outcome : `Able to understand and apply ${title} independently.`,
      completionCriteria: Array.isArray(item.completionCriteria) ? item.completionCriteria.map((c: any) => String(c)) : [`Demonstrate understanding of ${title}`],
    });
  }
  return valid.length >= 3 ? valid : null;
}
