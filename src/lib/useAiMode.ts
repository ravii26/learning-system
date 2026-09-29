'use client';

import { useCallback, useEffect, useState } from 'react';

export type AiMode = 'app' | 'manual';

// One fetch per page load, shared by every component that asks.
let cached: Promise<AiMode> | null = null;
const listeners = new Set<(m: AiMode) => void>();

function load(): Promise<AiMode> {
  cached ??= fetch('/api/auth')
    .then((r) => r.json())
    .then((d) => (d?.user?.aiMode === 'manual' ? 'manual' : 'app') as AiMode)
    .catch(() => 'app' as AiMode);
  return cached;
}

/**
 * The learner's choice: the app's AI writes plans/lessons/practice days
 * ("app"), or they run our prompt in their own ChatGPT/Claude ("manual").
 */
export function useAiMode() {
  const [mode, setModeState] = useState<AiMode | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((m) => alive && setModeState(m));
    listeners.add(setModeState);
    return () => { alive = false; listeners.delete(setModeState); };
  }, []);

  const setMode = useCallback(async (m: AiMode) => {
    cached = Promise.resolve(m);
    listeners.forEach((l) => l(m));
    await fetch('/api/me/ai-mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiMode: m }) }).catch(() => {});
  }, []);

  return { mode, manual: mode === 'manual', setMode };
}
