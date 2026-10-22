/** Best-effort, tab-local continuity. No learning evidence is inferred from drafts. */
export function readStudySession<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(`learning-os:${key}`) ?? 'null'); }
  catch { return null; }
}

export function writeStudySession(key: string, value: unknown) {
  try { sessionStorage.setItem(`learning-os:${key}`, JSON.stringify(value)); }
  catch { /* Studying still works when browser storage is unavailable. */ }
}
