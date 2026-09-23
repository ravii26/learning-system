/**
 * Parses `[[Title]]` references out of a note's body and reconciles
 * NoteLink rows to match — the backlink mechanism for accretion-mode notes
 * (see the project plan's Phase 8). Runs on every note save.
 *
 * v1 scope: links only to notes that already exist (matched by title,
 * case-insensitive, for this user). A reference to a title with no
 * matching note is left as plain text — this does NOT auto-create a stub
 * note for it. Some Zettelkasten tools do that; it's a deliberate
 * omission here, not an oversight, to keep the link graph free of
 * placeholder notes nobody asked for. Interactive `[[` autocomplete in the
 * editor is also not built — this is parse-on-save only.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

const WIKILINK_RE = /\[\[([^[\]]+)\]\]/g;

/** Pure: every distinct `[[Title]]` reference in a note body, trimmed, de-duplicated. */
export function extractWikilinkTitles(body: string): string[] {
  const titles = new Set<string>();
  let match: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    const title = match[1].trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

/**
 * Reconciles this note's outgoing NoteLinks against its current body:
 * creates links for newly-referenced existing notes, removes links whose
 * reference disappeared from the body. Self-references are skipped.
 */
export async function syncNoteLinksFromBody(db: DbClient, userId: string, noteId: string, body: string): Promise<void> {
  const titles = extractWikilinkTitles(body);

  const matched = titles.length > 0
    ? await db.note.findMany({
        where: { userId, id: { not: noteId }, title: { in: titles, mode: 'insensitive' } },
        select: { id: true },
      })
    : [];
  const targetIds = new Set(matched.map((n) => n.id));

  const existingLinks = await db.noteLink.findMany({ where: { userId, fromId: noteId }, select: { id: true, toId: true } });
  const existingTargetIds = new Set(existingLinks.map((l) => l.toId));

  const toRemove = existingLinks.filter((l) => !targetIds.has(l.toId));
  if (toRemove.length > 0) {
    await db.noteLink.deleteMany({ where: { id: { in: toRemove.map((l) => l.id) } } });
  }

  const toAdd = Array.from(targetIds).filter((id) => !existingTargetIds.has(id));
  for (const toId of toAdd) {
    await db.noteLink.create({ data: { userId, fromId: noteId, toId, kind: 'related' } });
  }
}
