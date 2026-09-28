import type { Adjustments, FoundResource } from '@/lib/program/adapt';
import type { ProgramDraft } from '@/lib/program/types';
import { findBook, type FoundBook } from './openLibrary';
import { searchVideos, searchWeb, tavilyEnabled, youtubeEnabled, type SearchHit } from './search';
import { isUsable, verifyLink } from './verifyLink';

/**
 * Tiers 2–3 of the resource pipeline, for plans without a curated catalogue
 * (and book goals):
 *   - every book the AI named is looked up in Open Library; found → a real
 *     link, not found → dropped (it may not exist)
 *   - the learner's own book is confirmed the same way
 *   - optional live search fills items that still have nothing
 * Everything found is link-checked and stays quality 'unreviewed'.
 */

export interface EnrichDeps {
  findBookImpl?: (title: string) => Promise<FoundBook | null>;
  searchWebImpl?: (q: string, max: number) => Promise<SearchHit[]>;
  searchVideosImpl?: (q: string, max: number) => Promise<SearchHit[]>;
  verify?: (url: string) => Promise<boolean>;
  webEnabled?: boolean;
  videoEnabled?: boolean;
}

const bookLabel = (b: FoundBook) => `${b.title}${b.author ? ` (${b.author})` : ''}`;
const MAX_SEARCHED_ITEMS = 8;

export async function enrichResources(draft: ProgramDraft, adj: Adjustments, deps: EnrichDeps = {}): Promise<{ adjustments: Adjustments; notes: string[] }> {
  const find = deps.findBookImpl ?? ((t: string) => findBook(t));
  const web = deps.searchWebImpl ?? searchWeb;
  const videos = deps.searchVideosImpl ?? searchVideos;
  const verify = deps.verify ?? (async (u: string) => isUsable((await verifyLink(u)).status));
  const webOn = deps.webEnabled ?? tavilyEnabled();
  const videoOn = deps.videoEnabled ?? youtubeEnabled();
  const items = draft.phases.flatMap((p) => p.items);
  const found: FoundResource[] = [...(adj.foundResources ?? [])];
  const notes: string[] = [];

  // 1. The learner's own book.
  if (draft.intake.bookTitle) {
    const book = await find(draft.intake.bookTitle);
    if (book) {
      for (const it of items.filter((i) => i.shape === 'reading')) {
        found.push({ itemId: it.id, title: bookLabel(book), url: book.url, type: 'BOOK', via: 'openlibrary' });
      }
    } else {
      notes.push(`We couldn’t confirm “${draft.intake.bookTitle}” in Open Library. Check the title; the plan links to a search for now.`);
    }
  }

  // 2. Books the AI named: keep only ones that exist.
  const named: Adjustments['namedResources'] = [];
  const dropped: string[] = [];
  for (const r of adj.namedResources) {
    if (r.type !== 'BOOK') {
      named.push(r);
      continue;
    }
    const book = await find(r.title);
    if (book) found.push({ itemId: r.itemId, title: bookLabel(book), url: book.url, type: 'BOOK', via: 'openlibrary' });
    else dropped.push(r.title);
  }
  if (dropped.length) notes.push(`Left out ${dropped.length} AI-suggested book${dropped.length === 1 ? '' : 's'} we couldn’t confirm exist${dropped.length === 1 ? 's' : ''}: ${dropped.join('; ')}.`);

  // 3. Live search for items with nothing yet (custom fields only; curated ones have the catalogue).
  if (draft.mapQuality !== 'curated' && (webOn || videoOn)) {
    const hasSomething = (id: string) => found.some((f) => f.itemId === id) || named.some((n) => n.itemId === id);
    const wantsVideo = !draft.intake.formats?.length || draft.intake.formats.includes('watch');
    for (const it of items.filter((i) => !hasSomething(i.id)).slice(0, MAX_SEARCHED_ITEMS)) {
      const topic = `${it.title.replace(/:.*$/, '')} ${draft.map.title}`.trim();
      const hits: SearchHit[] = [];
      if (webOn) hits.push(...(await web(`${topic} beginner guide${draft.intake.budget === 'free_only' ? ' free' : ''}`, 3)));
      if (videoOn && wantsVideo) hits.push(...(await videos(`${topic} tutorial`, 1)));
      let kept = 0;
      for (const h of hits) {
        if (kept >= 2) break;
        if (await verify(h.url)) {
          found.push({ itemId: it.id, title: h.title, url: h.url, type: h.type, via: h.type === 'VIDEO' ? 'youtube' : 'web' });
          kept++;
        }
      }
    }
  }

  return { adjustments: { ...adj, namedResources: named, foundResources: found }, notes };
}

/** Approval: every found link from the client is checked again before it is saved. */
export async function reverifyFound(found: FoundResource[], verify?: (url: string) => Promise<boolean>): Promise<FoundResource[]> {
  const check = verify ?? (async (u: string) => isUsable((await verifyLink(u)).status));
  const results = await Promise.all(found.map(async (f) => ((await check(f.url)) ? f : null)));
  return results.filter((f): f is FoundResource => !!f);
}
