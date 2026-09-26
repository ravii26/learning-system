import { forgettingCurve } from './fsrs';

/**
 * What the learner knows, in the four states every screen colours by:
 *
 *   unseen   — not started
 *   learning — studied, but nothing proves it has stuck yet
 *   solid    — proven: passed a check (or took none) AND recalled at
 *              spaced intervals
 *   fading   — was proven, but its review cards are now slipping
 *
 * Pure and deterministic (pass `now`), so the same evidence always gives
 * the same colour and every rule below is covered by tests.
 */

export type Knowledge = 'unseen' | 'learning' | 'solid' | 'fading';

/** Latest quiz at or above this counts as passing the check. */
export const QUIZ_PASS = 0.75;
/** A reviewed card whose recall probability drops below this is slipping. */
export const FADING_BELOW = 0.8;
/** Share of a module's cards that must have survived a spaced review. */
export const RETAINED_SHARE = 0.6;
/** Less than a minute of tracked time doesn't count as having started. */
export const MIN_STUDY_SECONDS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CardEvidence {
  state: string; // FSRS state: New | Learning | Review | Relearning
  reps: number;
  stability: number | null;
  lastReview: Date | string | null;
}

export interface ModuleEvidenceInput {
  completed: boolean;
  studySeconds?: number;
  /** `placement`: the pass came from the placement check, not from studying the module. */
  latestQuiz?: { score: number | null; placement?: boolean } | null;
  latestChallenge?: { verdict: string | null } | null;
  cards: CardEvidence[];
}

export interface KnowledgeResult {
  state: Knowledge;
  /** One plain sentence saying why — shown next to the colour. */
  reason: string;
}

/** Probability of recalling this card right now, or null if never reviewed. */
export function recallProbability(card: CardEvidence, now: Date): number | null {
  if (card.reps < 1 || !card.lastReview || !card.stability || card.stability <= 0) return null;
  const last = new Date(card.lastReview).getTime();
  if (Number.isNaN(last)) return null;
  const elapsedDays = Math.max(0, (now.getTime() - last) / DAY_MS);
  return forgettingCurve(elapsedDays, card.stability);
}

function isSlipping(card: CardEvidence, now: Date): boolean {
  if (card.state === 'Relearning') return true;
  const r = recallProbability(card, now);
  return r !== null && r < FADING_BELOW;
}

/** A card that has passed at least one spaced review and is not lapsed. */
function isRetained(card: CardEvidence): boolean {
  return card.state === 'Review' && card.reps >= 1;
}

/**
 * The state of one standalone card — used for topics with no syllabus,
 * where collected ideas are the unit instead of modules.
 */
export function cardKnowledge(card: CardEvidence, now: Date = new Date()): Knowledge {
  if (isRetained(card) || card.state === 'Relearning') return isSlipping(card, now) ? 'fading' : 'solid';
  return 'learning';
}

export function moduleKnowledge(input: ModuleEvidenceInput, now: Date = new Date()): KnowledgeResult {
  const { cards } = input;
  const quiz = input.latestQuiz?.score ?? null;
  const verdict = input.latestChallenge?.verdict ?? null;
  const tookCheck = quiz !== null || verdict !== null;
  const passedCheck = (quiz !== null && quiz >= QUIZ_PASS) || verdict === 'correct';
  const failedCheck = tookCheck && !passedCheck;

  const retained = cards.filter(isRetained);
  const everRetained = retained.length > 0 || cards.some((c) => c.state === 'Relearning');
  const slipping = cards.filter((c) => isSlipping(c, now));

  const started =
    input.completed ||
    tookCheck ||
    cards.length > 0 ||
    (input.studySeconds ?? 0) >= MIN_STUDY_SECONDS;
  if (!started) return { state: 'unseen', reason: 'Not started yet' };

  // Fading needs something that was once known: a card that survived a
  // spaced review. A module you never proved can't "slip" — it's learning.
  if (everRetained && slipping.length > 0) {
    const n = slipping.length;
    return { state: 'fading', reason: `${n} review card${n === 1 ? ' is' : 's are'} slipping — a quick review keeps it` };
  }

  if (failedCheck) {
    const reason =
      quiz !== null && quiz < QUIZ_PASS
        ? `Last quiz ${Math.round(quiz * 100)}% — ${Math.round(QUIZ_PASS * 100)}% or better proves it`
        : 'Last explanation wasn’t there yet — try the challenge again';
    return { state: 'learning', reason };
  }

  if (cards.length === 0) {
    if (passedCheck && input.completed) return { state: 'solid', reason: 'Finished and passed the check' };
    if (passedCheck) return { state: 'learning', reason: 'Passed the check — mark the module finished' };
    return { state: 'learning', reason: input.completed ? 'Finished — take the quiz to prove it' : 'In progress' };
  }

  if (retained.length / cards.length >= RETAINED_SHARE) {
    // Placement seeds cards as recalled once; until a real review happens,
    // say what the evidence actually is.
    if (input.latestQuiz?.placement && cards.every((c) => c.reps <= 1)) {
      return { state: 'solid', reason: 'Placed out by the placement check — a review soon confirms it' };
    }
    return { state: 'solid', reason: passedCheck ? 'Passed the check and recalled it at spaced intervals' : 'Recalled at spaced intervals' };
  }

  const reviewed = cards.filter((c) => c.reps >= 1).length;
  return {
    state: 'learning',
    reason: reviewed === 0 ? 'Waiting for its first spaced review' : `${retained.length} of ${cards.length} review cards recalled so far`,
  };
}

export interface KnowledgeCounts {
  unseen: number;
  learning: number;
  solid: number;
  fading: number;
}

export function countKnowledge(states: Knowledge[]): KnowledgeCounts {
  const counts: KnowledgeCounts = { unseen: 0, learning: 0, solid: 0, fading: 0 };
  for (const s of states) counts[s] += 1;
  return counts;
}
