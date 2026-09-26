'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Friends: people who can see what you mark shared, and whose shared
 * topics and goals you can see. Mutual, request-and-accept, off by default.
 */

interface Person { id: string; name: string; email: string | null }
interface FriendRow { friendshipId: string; user: Person }
interface Friends { friends: FriendRow[]; incoming: FriendRow[]; outgoing: FriendRow[] }
interface Shareable { id: string; title: string; status: string; shared: boolean; area?: string }

export default function FriendsPage() {
  const [data, setData] = useState<Friends>({ friends: [], incoming: [], outgoing: [] });
  const [sharing, setSharing] = useState<{ topics: Shareable[]; goals: Shareable[] }>({ topics: [], goals: [] });
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([fetch('/api/friends'), fetch('/api/sharing')]);
      if (f.ok) setData(await f.json());
      if (s.ok) setSharing(await s.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage({ text: d.message });
        setEmail('');
        load();
      } else {
        setMessage({ text: d.error || 'Could not send the request.', error: true });
      }
    } catch {
      setMessage({ text: 'Could not reach the server.', error: true });
    } finally {
      setSending(false);
    }
  };

  const respond = async (friendshipId: string, action: 'accept' | 'decline' | 'cancel' | 'remove') => {
    setBusyId(friendshipId);
    try {
      await fetch(`/api/friends/${friendshipId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const toggleShare = async (kind: 'topic' | 'goal', item: Shareable) => {
    const key = kind === 'topic' ? 'topics' : 'goals';
    // Optimistic: flip now, put it back if the server says no.
    const flip = (shared: boolean) =>
      setSharing((prev) => ({ ...prev, [key]: prev[key].map((x) => (x.id === item.id ? { ...x, shared } : x)) }));
    flip(!item.shared);
    const res = await fetch('/api/sharing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id: item.id, shared: !item.shared }),
    }).catch(() => null);
    if (!res?.ok) flip(item.shared);
  };

  const ghost = 'h-9 rounded-lg px-3 text-[0.85rem] font-medium text-fg-secondary hover:bg-fill-2 hover:text-fg';
  const row = 'flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0';

  const ShareList = ({ kind, items }: { kind: 'topic' | 'goal'; items: Shareable[] }) => (
    <ul className="m-0 list-none p-0">
      {items.map((item) => (
        <li key={item.id} className={row}>
          <span className="min-w-0 truncate text-[0.95rem] text-fg">{item.title}</span>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[0.85rem] text-fg-secondary">
            <input
              type="checkbox"
              role="switch"
              aria-label={`Share ${item.title}`}
              checked={item.shared}
              onChange={() => toggleShare(kind, item)}
              className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
            />
            {item.shared ? 'Shared' : 'Private'}
          </label>
        </li>
      ))}
    </ul>
  );

  if (loading) return <p className="text-fg-muted">Loading…</p>;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">Friends</h1>
        <p className="m-0 max-w-[600px] text-[1.05rem] text-fg-secondary">
          Learn alongside people you choose. Friends see only the topics and goals you mark shared: progress and plan, never your notes.
        </p>
      </header>

      <section aria-labelledby="add-h" className="flex flex-col gap-3">
        <h2 id="add-h" className="m-0 text-[1.2rem] font-semibold">Add a friend</h2>
        <form onSubmit={sendRequest} className="flex flex-wrap gap-2">
          <label htmlFor="friend-email" className="sr-only">Friend's email</label>
          <input
            id="friend-email"
            type="email"
            className="form-input h-11 min-w-[240px] flex-1 py-0"
            placeholder="Their email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary h-11 py-0" disabled={sending || !email.trim()}>
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </form>
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={`m-0 text-[0.875rem] ${message.error ? 'text-danger' : 'text-fg-secondary'}`}>
            {message.text}
          </p>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section aria-labelledby="incoming-h" className="flex flex-col gap-2">
          <h2 id="incoming-h" className="m-0 text-[1.2rem] font-semibold">Requests for you <span className="font-normal text-fg-muted">{data.incoming.length}</span></h2>
          <ul className="m-0 list-none p-0">
            {data.incoming.map((r) => (
              <li key={r.friendshipId} className={row}>
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-fg">{r.user.name}</span>
                  {r.user.email && <span className="text-[0.85rem] text-fg-muted"> · {r.user.email}</span>}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className="btn btn-secondary h-9 py-0 text-[0.85rem]" disabled={busyId === r.friendshipId} onClick={() => respond(r.friendshipId, 'accept')}>Accept</button>
                  <button type="button" className={ghost} disabled={busyId === r.friendshipId} onClick={() => respond(r.friendshipId, 'decline')}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="friends-h" className="flex flex-col gap-2">
        <h2 id="friends-h" className="m-0 text-[1.2rem] font-semibold">Your friends <span className="font-normal text-fg-muted">{data.friends.length}</span></h2>
        {data.friends.length === 0 ? (
          <p className="m-0 text-[0.95rem] text-fg-muted">No friends yet. Send a request above; once they accept, you can see each other's shared learning.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {data.friends.map((f) => (
              <li key={f.friendshipId} className={row}>
                <Link href={`/friends/${f.user.id}`} className="min-w-0 truncate text-[1rem] font-semibold text-fg">{f.user.name}</Link>
                <span className="flex shrink-0 gap-1">
                  <Link href={`/friends/${f.user.id}`} className="btn btn-secondary h-9 py-0 text-[0.85rem] no-underline hover:no-underline">Compare</Link>
                  <button type="button" className={ghost} disabled={busyId === f.friendshipId} onClick={() => respond(f.friendshipId, 'remove')}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.outgoing.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-[0.85rem] font-semibold text-fg-secondary">Waiting for them to accept</span>
            <ul className="m-0 list-none p-0">
              {data.outgoing.map((r) => (
                <li key={r.friendshipId} className={row}>
                  <span className="min-w-0 truncate text-[0.95rem] text-fg-secondary">{r.user.email ?? r.user.name}</span>
                  <button type="button" className={ghost} disabled={busyId === r.friendshipId} onClick={() => respond(r.friendshipId, 'cancel')}>Cancel</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="share-h" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="share-h" className="m-0 text-[1.2rem] font-semibold">What you share</h2>
          <p className="m-0 text-[0.9rem] text-fg-muted">Everything starts private. Shared items show friends the title, status, progress and module plan.</p>
        </div>
        {sharing.goals.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[0.85rem] font-semibold text-fg-secondary">Goals</span>
            <ShareList kind="goal" items={sharing.goals} />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-semibold text-fg-secondary">Topics</span>
          {sharing.topics.length === 0
            ? <p className="m-0 text-[0.9rem] text-fg-muted">No topics yet.</p>
            : <ShareList kind="topic" items={sharing.topics} />}
        </div>
      </section>
    </div>
  );
}
