'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FocusKind, FocusView } from './focusData';
import type { Ranked, Rhythm } from './focusQueue';

export type FocusEntry = Ranked<FocusView>;
export interface FocusTarget { kind: FocusKind; goalId?: string; topicId?: string; moduleId?: string }
export type FocusAction = 'done' | 'undo' | 'skip' | 'unskip' | 'add';

const tz = () => new Date().getTimezoneOffset();
const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);

export function findPin(items: FocusEntry[], target: FocusTarget): FocusEntry | undefined {
  return items.find((i) => i.kind === target.kind && (i.goalId ?? undefined) === target.goalId && (i.topicId ?? undefined) === target.topicId && (i.moduleId ?? undefined) === target.moduleId);
}

export function useFocus() {
  const router = useRouter();
  const [items, setItems] = useState<FocusEntry[]>([]);
  const [setupDone, setSetupDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dueCards, setDueCards] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/focus?tz=${tz()}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        setItems(data.items ?? []);
        setSetupDone(!!data.setupDone);
        setDueCards(data.dueCards ?? 0);
        setReviewedToday(!!data.reviewedToday);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const finish = useCallback(async (res: Response | null) => {
    if (!res?.ok) return false;
    await refresh();
    return true;
  }, [refresh]);

  // The sidebar lists your Focus and is drawn on the server.
  const finishAndRedraw = useCallback(async (res: Response | null) => {
    const ok = await finish(res);
    if (ok) router.refresh();
    return ok;
  }, [finish, router]);

  const pin = useCallback(async (input: FocusTarget & { title?: string; rhythm?: Rhythm; targetDate?: string; addToday?: boolean }) =>
    finishAndRedraw(await send('/api/focus', 'POST', { ...input, tz: tz() })), [finishAndRedraw]);
  const unpin = useCallback(async (id: string) => finishAndRedraw(await send(`/api/focus/${id}`, 'DELETE')), [finishAndRedraw]);
  const update = useCallback(async (id: string, change: { rhythm?: Rhythm; targetDate?: string }) =>
    finish(await send(`/api/focus/${id}`, 'PATCH', change)), [finish]);
  const act = useCallback(async (id: string, action: FocusAction) =>
    finishAndRedraw(await send(`/api/focus/${id}`, 'PATCH', { action, tz: tz() })), [finishAndRedraw]);
  const finishSetup = useCallback(async (pins: Array<FocusTarget & { rhythm: Rhythm }>) =>
    finishAndRedraw(await send('/api/focus/setup', 'POST', { pins, tz: tz() })), [finishAndRedraw]);

  const renameGoal = useCallback(async (goalId: string, shortName: string) =>
    finishAndRedraw(await send(`/api/goals/${goalId}`, 'PATCH', { shortName })), [finishAndRedraw]);

  return { items, setupDone, loaded, dueCards, reviewedToday, refresh, pin, unpin, update, act, finishSetup, renameGoal };
}

export type FocusApi = ReturnType<typeof useFocus>;
