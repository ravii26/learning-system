'use client';

import { useEffect, useState } from 'react';

/**
 * App-wide "something is happening" feedback, so no action is silent:
 *   - a thin bar at the top while any /api call or page load is in flight
 *   - the button that started a call shows a spinner and ignores repeat clicks
 *   - calls that run long (AI writing a lesson, drafting a plan) get a small
 *     note at the bottom saying what is happening and that it takes a while
 *
 * It works by wrapping window.fetch once, so every existing fetch gets this
 * without changes. A call can opt out with the header `x-quiet: 1`
 * (background polling, autosave).
 */

type Op = { id: number; label: string | null; start: number; button: HTMLElement | null };

const SLOW_LABELS: Array<[RegExp, string]> = [
  [/\/api\/generate-lesson/, 'Writing your lesson'],
  [/\/api\/generate-roadmap/, 'Building your roadmap'],
  [/\/api\/programs\/draft/, 'Drafting your plan'],
  [/\/quiz(\?|$)/, 'Writing your quiz'],
  [/\/placement/, 'Preparing your placement check'],
  [/\/api\/socratic/, 'Thinking about your answer'],
  [/\/api\/captures\/suggest/, 'Working out where this belongs'],
  [/\/checkin/, 'Reading your week'],
  [/\/api\/library/, 'Working on your list'],
];

const ops = new Map<number, Op>();
const listeners = new Set<() => void>();
const busyCount = new WeakMap<HTMLElement, number>();
let nextId = 1;
let lastClicked: { el: HTMLElement; at: number } | null = null;

const emit = () => listeners.forEach((l) => l());

function headerValue(init: RequestInit | undefined, input: RequestInfo | URL, name: string): string | null {
  const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name)?.[1] ?? null;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name);
  return key ? (h as Record<string, string>)[key] : null;
}

function markBusy(el: HTMLElement, delta: 1 | -1) {
  const n = (busyCount.get(el) ?? 0) + delta;
  busyCount.set(el, Math.max(0, n));
  if (n > 0) {
    el.setAttribute('data-busy', '');
    el.setAttribute('aria-busy', 'true');
  } else {
    el.removeAttribute('data-busy');
    el.removeAttribute('aria-busy');
  }
}

function install() {
  const w = window as Window & { __activityFetch?: boolean };
  if (w.__activityFetch) return;
  w.__activityFetch = true;

  // Remember the last button pressed, so a call it starts can be tied to it.
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], input[type="submit"]') as HTMLElement | null;
      lastClicked = el ? { el, at: performance.now() } : null;
    },
    true,
  );
  document.addEventListener(
    'submit',
    (e) => {
      const btn = (e as SubmitEvent).submitter ?? (e.target as HTMLFormElement).querySelector('button[type="submit"], button:not([type])');
      if (btn) lastClicked = { el: btn as HTMLElement, at: performance.now() };
    },
    true,
  );

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null;
    try {
      url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    } catch {
      /* not a URL we track */
    }
    const sameOrigin = url?.origin === location.origin;
    const isApi = sameOrigin && url!.pathname.startsWith('/api/');
    const isPage = sameOrigin && !isApi && (!!headerValue(init, input, 'rsc') || url!.searchParams.has('_rsc'));
    const isPrefetch = !!headerValue(init, input, 'next-router-prefetch');
    const quiet = headerValue(init, input, 'x-quiet') === '1';

    if ((!isApi && !isPage) || isPrefetch || quiet) return original(input, init);

    const path = url!.pathname + url!.search;
    const label = isApi ? SLOW_LABELS.find(([re]) => re.test(path))?.[1] ?? null : null;
    let button: HTMLElement | null = null;
    if (isApi && lastClicked && performance.now() - lastClicked.at < 800 && lastClicked.el.isConnected) {
      button = lastClicked.el;
      markBusy(button, 1);
    }
    const id = nextId++;
    ops.set(id, { id, label, start: performance.now(), button });
    emit();
    try {
      return await original(input, init);
    } finally {
      ops.delete(id);
      if (button) markBusy(button, -1);
      emit();
    }
  };
}

export function ActivityIndicator() {
  const [, setTick] = useState(0);

  useEffect(() => {
    install();
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    // Re-render while something runs, so the delayed bar and slow note appear on time.
    const timer = setInterval(() => ops.size && l(), 400);
    return () => {
      listeners.delete(l);
      clearInterval(timer);
    };
  }, []);

  const now = performance.now();
  const running = Array.from(ops.values());
  // A short delay keeps instant calls from flashing the bar.
  const showBar = running.some((o) => now - o.start > 150);
  const slow = running
    .filter((o) => now - o.start > (o.label ? 1200 : 4000))
    .sort((a, b) => a.start - b.start)[0];
  const secs = slow ? Math.floor((now - slow.start) / 1000) : 0;

  return (
    <>
      <div className={`activity-bar${showBar ? ' is-on' : ''}`} role="progressbar" aria-hidden={!showBar} aria-label="Loading" />
      {slow && (
        <div className="activity-note" role="status" aria-live="polite">
          <span className="activity-spinner" aria-hidden />
          <span>
            {slow.label ?? 'Still working'}…
            <span className="activity-note-sub">
              {slow.label ? ' AI can take up to a minute.' : ' The server is taking a moment.'}
              {secs >= 3 ? ` ${secs}s` : ''}
            </span>
          </span>
        </div>
      )}
    </>
  );
}
