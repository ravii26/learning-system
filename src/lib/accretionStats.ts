/**
 * Accretion mode's progress view (project plan, Example C): counts, a
 * weekly growth series for a sparkline, and where the knowledge is dense
 * vs thin — never a percentage, because a note base has no finish line.
 * Clusters are tags; notes with no tags don't form a cluster.
 */

export interface NoteForStats {
  createdAt: string | Date;
  tags: string[];
  _count?: { outgoing: number; incoming?: number };
}

export interface AccretionStats {
  noteCount: number;
  linkCount: number;
  weekly: number[]; // notes added per week, oldest -> newest, length = weeks
  addedThisWeek: number;
  densest: { tag: string; count: number } | null;
  thinnest: { tag: string; count: number } | null;
}

const DAY = 24 * 60 * 60 * 1000;

export function computeAccretionStats(notes: NoteForStats[], now: Date = new Date(), weeks = 8): AccretionStats {
  const weekly = new Array(weeks).fill(0);
  const nowMs = now.getTime();
  for (const n of notes) {
    const ageDays = (nowMs - new Date(n.createdAt).getTime()) / DAY;
    if (ageDays < 0) continue;
    const bucketFromEnd = Math.floor(ageDays / 7);
    if (bucketFromEnd < weeks) weekly[weeks - 1 - bucketFromEnd]++;
  }

  // Each link is one row read bidirectionally, so count outgoing only.
  const linkCount = notes.reduce((sum, n) => sum + (n._count?.outgoing ?? 0), 0);

  const byTag = new Map<string, number>();
  for (const n of notes) {
    for (const tag of Array.from(new Set(n.tags))) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
  }
  const clusters = Array.from(byTag, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return {
    noteCount: notes.length,
    linkCount,
    weekly,
    addedThisWeek: weekly[weeks - 1],
    densest: clusters[0] ?? null,
    // With a single cluster, "thinnest" would just repeat "densest" — say nothing instead.
    thinnest: clusters.length > 1 ? clusters[clusters.length - 1] : null,
  };
}
