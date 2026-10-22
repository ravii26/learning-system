export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const writes = new Map<string, Promise<void>>();
const latestEdits = new Map<string, object>();
async function writeNote(key: string | undefined, revision: object, save: () => void | Promise<void>) {
  if (!key) { await save(); return; }
  const previous = writes.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    // An editor that closed can still have buffered work. Never let that
    // work replace edits made after the same note was reopened.
    if (latestEdits.get(key) !== revision) return;
    await save();
    if (latestEdits.get(key) === revision) latestEdits.delete(key);
  });
  writes.set(key, current);
  try { await current; }
  finally { if (writes.get(key) === current) writes.delete(key); }
}

/** Serialize writes so a slow older request cannot overwrite newer notes. */
export function createNoteAutosave(save: (html: string) => void | Promise<void>, status: (state: SaveStatus) => void, delay: number, key?: string) {
  let pending: { html: string; revision: object } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const flush = async () => {
    clearTimeout(timer);
    if (running || pending === undefined) return;
    running = true;
    while (pending !== undefined) {
      const edit = pending;
      pending = undefined;
      status('saving');
      try {
        await writeNote(key, edit.revision, () => save(edit.html));
      } catch {
        if (pending === undefined) pending = edit;
        status('error');
        running = false;
        return;
      }
    }
    running = false;
    status('saved');
  };
  return {
    update(html: string) {
      const revision = {};
      pending = { html, revision };
      if (key) latestEdits.set(key, revision);
      status('unsaved');
      clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delay);
    },
    flush,
    hasPending: () => running || pending !== undefined,
  };
}
