'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

const linkClass = 'self-start bg-transparent p-0 text-[0.85rem] text-fg-secondary underline underline-offset-2 hover:text-fg disabled:opacity-50';

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Status = 'loading' | 'hidden' | 'unsupported' | 'blocked' | 'off' | 'on';

/** Stays out of the way until the server has reminders set up. */
export default function ReminderControl() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch('/api/push').catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!alive) return;
      if (!data?.enabled) { setStatus('hidden'); return; }
      setPublicKey(data.publicKey);
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setStatus('unsupported'); return; }
      if (Notification.permission === 'denied') { setStatus('blocked'); return; }
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      if (alive) setStatus(existing ? 'on' : 'off');
    })().catch(() => alive && setStatus('unsupported'));
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'off'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON(), tz: new Date().getTimezoneOffset() }) });
      if (!res.ok) {
        await subscription.unsubscribe();
        throw new Error('rejected');
      }
      setStatus('on');
      toast.success('Daily reminder is on');
    } catch {
      toast.error('Couldn’t turn the reminder on here.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setStatus('off');
    } catch {
      toast.error('Couldn’t turn the reminder off.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    const res = await fetch('/api/push/test', { method: 'POST' }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) toast.success('Sent. It should appear in a moment.');
    else toast.error(data?.error || 'Couldn’t send a test.');
    setBusy(false);
  };

  if (status === 'loading' || status === 'hidden') return null;

  return (
    <section aria-labelledby="reminder-h" className="flex flex-col gap-1.5">
      <h2 id="reminder-h" className="m-0 text-[0.95rem] font-semibold">Daily reminder</h2>
      {status === 'unsupported' && <p className="m-0 text-[0.85rem] text-fg-muted">This browser can’t show reminders. On an iPhone, add this site to your Home Screen first.</p>}
      {status === 'blocked' && <p className="m-0 text-[0.85rem] text-fg-muted">Notifications are blocked for this site. Allow them in your browser settings to turn this on.</p>}
      {status === 'off' && (
        <>
          <p className="m-0 text-[0.85rem] text-fg-muted">One nudge each morning, only when something is waiting.</p>
          <button type="button" disabled={busy} className={linkClass} onClick={() => void turnOn()}>Turn on</button>
        </>
      )}
      {status === 'on' && (
        <>
          <p className="m-0 text-[0.85rem] text-fg-muted">On for this device, each morning.</p>
          <span className="flex gap-3">
            <button type="button" disabled={busy} className={linkClass} onClick={() => void sendTest()}>Send a test</button>
            <button type="button" disabled={busy} className={linkClass} onClick={() => void turnOff()}>Turn off</button>
          </span>
        </>
      )}
    </section>
  );
}
