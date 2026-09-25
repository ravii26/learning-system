'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Measures time actually spent studying on a topic page, so "how much time
 * did I give" is real rather than what a timer was set to:
 *
 *  - A second counts only while the tab is visible AND you've used the
 *    mouse/keyboard/scroll in the last IDLE_MS (or `forceActive` is on —
 *    e.g. a running focus timer, for reading without touching anything).
 *  - Each (topic, module) visit is one session, reported to
 *    /api/time/heartbeat every FLUSH_MS and on tab hide/close via
 *    sendBeacon. The server keeps the max, so re-sends never double-count.
 *  - Opening an external link (a video, book, docs) starts an "away" clock;
 *    coming back 2-120 minutes later offers to count that time too.
 */

const IDLE_MS = 5 * 60 * 1000;
const FLUSH_MS = 30 * 1000;
const AWAY_MIN_MS = 2 * 60 * 1000;
const AWAY_MAX_MS = 120 * 60 * 1000;

const newSessionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`;

export interface AwayPrompt {
  minutes: number;
  label: string;
}

export function useStudyTracker({ topicId, moduleId, forceActive = false }: { topicId: string; moduleId: string | null; forceActive?: boolean }) {
  const session = useRef({ id: newSessionId(), startedAt: null as string | null, seconds: 0, flushed: 0 });
  const lastInput = useRef(Date.now());
  const forceRef = useRef(forceActive);
  forceRef.current = forceActive;

  const [unflushedSeconds, setUnflushedSeconds] = useState(0);
  const [flushCount, setFlushCount] = useState(0);
  const [awayPrompt, setAwayPrompt] = useState<AwayPrompt | null>(null);
  const away = useRef<{ at: number; label: string } | null>(null);

  const payload = useCallback(() => {
    const s = session.current;
    return JSON.stringify({ topicId, moduleId, clientSessionId: s.id, startedAt: s.startedAt, seconds: s.seconds });
  }, [topicId, moduleId]);

  const flush = useCallback(async (useBeacon = false) => {
    const s = session.current;
    if (s.seconds <= s.flushed || !s.startedAt) return;
    const body = payload();
    const sent = s.seconds;
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/time/heartbeat', new Blob([body], { type: 'application/json' }));
      s.flushed = sent;
      return;
    }
    try {
      const res = await fetch('/api/time/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      if (res.ok) {
        s.flushed = Math.max(s.flushed, sent);
        setUnflushedSeconds(s.seconds - s.flushed);
        setFlushCount((n) => n + 1);
      }
    } catch {
      // try again on the next tick
    }
  }, [payload]);

  // New session per topic/module; flush the previous one on the way out.
  useEffect(() => {
    session.current = { id: newSessionId(), startedAt: null, seconds: 0, flushed: 0 };
    setUnflushedSeconds(0);
    return () => {
      flush(false);
    };
  }, [topicId, moduleId, flush]);

  // Activity signals.
  useEffect(() => {
    const onInput = () => { lastInput.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onInput, { capture: true }));
  }, []);

  // The clock.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!forceRef.current && Date.now() - lastInput.current > IDLE_MS) return;
      const s = session.current;
      if (!s.startedAt) s.startedAt = new Date().toISOString();
      s.seconds += 1;
      setUnflushedSeconds(s.seconds - s.flushed);
    }, 1000);
    const periodic = setInterval(() => flush(false), FLUSH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(periodic);
    };
  }, [flush]);

  // Tab hidden/closed: beacon out; coming back: maybe ask about away time.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush(true);
        return;
      }
      lastInput.current = Date.now();
      const a = away.current;
      away.current = null;
      if (!a) return;
      const elapsed = Date.now() - a.at;
      if (elapsed >= AWAY_MIN_MS && elapsed <= AWAY_MAX_MS) {
        setAwayPrompt({ minutes: Math.round(elapsed / 60000), label: a.label });
      }
    };
    const onPageHide = () => flush(true);
    // Any external link opened in a new tab from this page starts the away clock.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !/^https?:/i.test(a.href) || a.origin === window.location.origin) return;
      away.current = { at: Date.now(), label: (a.textContent || a.hostname).replace(/\s+/g, ' ').trim().slice(0, 60) };
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('click', onClick, true);
    };
  }, [flush]);

  const confirmAway = useCallback(async (minutes: number, label: string) => {
    setAwayPrompt(null);
    const res = await fetch('/api/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, moduleId, minutes, source: 'away', note: label ? `Away: ${label}` : 'Away from the app' }),
    }).catch(() => null);
    if (res?.ok) setFlushCount((n) => n + 1);
    return !!res?.ok;
  }, [topicId, moduleId]);

  return {
    /** Seconds counted but not yet saved — add to server totals for a live figure. */
    unflushedSeconds,
    /** Increments whenever something was saved; refetch totals when it changes. */
    flushCount,
    awayPrompt,
    confirmAway,
    dismissAway: () => setAwayPrompt(null),
  };
}
