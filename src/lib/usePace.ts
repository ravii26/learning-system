'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaceByKind } from './pace';

export function usePace(topicId?: string) {
  const [byKind, setByKind] = useState<PaceByKind>({});
  const [moduleSeconds, setModuleSeconds] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/pace${topicId ? `?topicId=${encodeURIComponent(topicId)}` : ''}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null);
    if (!data) return;
    setByKind(data.byKind ?? {});
    setModuleSeconds(data.moduleSeconds ?? {});
  }, [topicId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { byKind, moduleSeconds, refresh };
}
