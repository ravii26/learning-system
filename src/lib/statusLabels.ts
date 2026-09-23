/**
 * Display labels for Topic.status, per the plan's Fix 1 (cut the vocabulary
 * from ~32 terms to ~12). The underlying DB values are unchanged — inbox,
 * queued, active, paused, maintenance, reference, dropped — because the
 * status machine, the active-topic-limit checks, and ActivityLog diffing
 * throughout the API all key off those exact strings. Renaming the enum
 * itself would be a much larger, riskier change than the UX problem
 * justifies; a display-layer mapping gets the plain-English win without it.
 *
 * Scope note: only the new Today screen (src/app/(dashboard)/page.tsx) uses
 * this so far. /plan and the topic detail page still show the raw status
 * strings — carrying the full relabel through those is future work, not
 * done here to avoid rewriting screens that are mid-edit elsewhere.
 */

export const STATUS_LABELS: Record<string, string> = {
  inbox: 'Inbox',
  queued: 'Next',
  active: 'Now',
  paused: 'Resting',
  maintenance: 'Maintaining',
  reference: 'Reference',
  dropped: 'Archived',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}
