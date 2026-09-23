/** Shared by the areas-to-skills backfill and any code that creates Skill rows on the fly (e.g. POST /api/goals), so the slugging rule can't drift between them. */
export function slugifySkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
