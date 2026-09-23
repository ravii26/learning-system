/**
 * Picks a practice prompt drawn from a concept currently in review — the
 * cross-mode payoff the project plan calls out in Example D: "communication
 * practice doubles as retrieval practice for DSA." Pure and deterministic
 * (same day + same candidates -> same prompt) so it's testable and so a
 * page reload mid-session doesn't hand back a different prompt.
 */

export interface ConceptForPrompt {
  id: string;
  title: string;
  nextReview: string | Date | null;
}

export interface PracticePromptPick {
  conceptId: string;
  conceptTitle: string;
  promptText: string;
}

const TEMPLATES: Array<(title: string) => string> = [
  (title) => `Explain "${title}" to someone with no background in it.`,
  (title) => `In 60 seconds, argue why "${title}" matters.`,
  (title) => `Describe "${title}" using only everyday language — no jargon.`,
  (title) => `Teach "${title}" to a curious 12-year-old.`,
  (title) => `What's the most common misunderstanding about "${title}"? Explain it out loud.`,
];

function toTime(d: string | Date | null): number {
  if (d === null) return Infinity; // never reviewed yet — least urgent, sorts last
  return (typeof d === 'string' ? new Date(d) : d).getTime();
}

/**
 * Picks the most-due concept (earliest nextReview) as the prompt's subject —
 * the one retrieval practice would help most — and a template chosen by the
 * day, so the prompt varies day to day without needing any stored state.
 */
export function pickPracticePrompt(concepts: ConceptForPrompt[], now: Date = new Date()): PracticePromptPick | null {
  if (concepts.length === 0) return null;

  const sorted = [...concepts].sort((a, b) => toTime(a.nextReview) - toTime(b.nextReview));
  const chosen = sorted[0];

  const dayIndex = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  const template = TEMPLATES[dayIndex % TEMPLATES.length];

  return { conceptId: chosen.id, conceptTitle: chosen.title, promptText: template(chosen.title) };
}
