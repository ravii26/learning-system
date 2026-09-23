/**
 * Picks the single "what to do next" card for the Today screen.
 *
 * The whole point of a Today screen is that the system decides, not the
 * user — see the plan's Fix 2. This function is deliberately small and
 * pure so the decision is inspectable and testable: it always returns a
 * `reason`, and the UI must always show it, or the pick isn't trustworthy.
 *
 * Picking logic, in order:
 *   1. Only active topics with a real (non-empty, non-"nothing") nextAction
 *      are candidates — a topic with no concrete next step can't be started.
 *   2. Prefer the primary slot over the secondary one.
 *   3. Among equally-preferred topics, prefer whichever has gone longer
 *      without being touched — that's the one at risk of going stale.
 *   4. No eligible topic -> null. The Today screen shows an empty state,
 *      it does not invent a task.
 */

export interface TopicForNextAction {
  id: string;
  title: string;
  nextAction: string | null;
  activeSlotType: string | null; // 'primary' | 'secondary' | null
  lastTouchedDate: string | Date;
  status: string;
}

export interface NextActionPick {
  topicId: string;
  topicTitle: string;
  nextAction: string;
  reason: string;
  daysSinceTouched: number;
  isStale: boolean;
}

const STALE_DAYS = 7;

const GENERIC_NEXT_ACTIONS = new Set(['', 'nothing', 'n/a', 'none', 'tbd']);

function hasRealNextAction(t: TopicForNextAction): boolean {
  const v = (t.nextAction || '').trim().toLowerCase();
  return v.length > 0 && !GENERIC_NEXT_ACTIONS.has(v);
}

function daysSince(date: string | Date, now: Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function slotWeight(slot: string | null): number {
  if (slot === 'primary') return 2;
  if (slot === 'secondary') return 1;
  return 0;
}

export function pickNextAction(topics: TopicForNextAction[], now: Date = new Date()): NextActionPick | null {
  const candidates = topics.filter((t) => t.status === 'active' && hasRealNextAction(t));
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
    const slotDiff = slotWeight(b.activeSlotType) - slotWeight(a.activeSlotType);
    if (slotDiff !== 0) return slotDiff;
    return daysSince(b.lastTouchedDate, now) - daysSince(a.lastTouchedDate, now);
  });

  const chosen = ranked[0];
  const days = daysSince(chosen.lastTouchedDate, now);
  const isStale = days >= STALE_DAYS;
  const slotLabel = chosen.activeSlotType === 'primary' ? 'primary slot' : chosen.activeSlotType === 'secondary' ? 'secondary slot' : 'active';
  const touchedLabel = days === 0 ? 'touched today' : days === 1 ? 'untouched 1 day' : `untouched ${days} days`;

  const reason = isStale
    ? `${slotLabel}, ${touchedLabel} — this one is going stale`
    : `${slotLabel}, ${touchedLabel}`;

  return {
    topicId: chosen.id,
    topicTitle: chosen.title,
    nextAction: (chosen.nextAction || '').trim(),
    reason,
    daysSinceTouched: days,
    isStale,
  };
}
