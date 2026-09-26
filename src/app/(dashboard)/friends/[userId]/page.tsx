'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';

interface Module { legacyId: string; title: string; order: number; completed: boolean; estimatedMinutes: number }
interface SharedTopic {
  id: string; title: string; area: string; status: string; mode: string; depthTarget: string | null;
  progressPct: number; lastTouchedDate: string; modules: Module[]; yourCopyId: string | null;
}
interface SharedGoal {
  id: string; title: string; outcome: string; status: string; targetDate: string | null;
  readinessMet: number; readinessTotal: number; topics: { title: string; sharedTopicId: string | null }[];
}
interface FriendView {
  friend: { id: string; name: string };
  week: { yourMinutes: number; theirMinutes: number };
  topics: SharedTopic[];
  goals: SharedGoal[];
}

const STATUS_WORD: Record<string, string> = {
  inbox: 'Inbox', queued: 'Up next', active: 'Learning now', paused: 'Resting',
  maintenance: 'Keeping fresh', reference: 'Reference', dropped: 'Let go',
  draft: 'Draft', achieved: 'Achieved', abandoned: 'Let go',
};

const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function ModuleStrip({ modules }: { modules: Module[] }) {
  if (modules.length === 0) return null;
  const done = modules.filter((m) => m.completed).length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-[3px]" aria-hidden>
        {modules.map((m) => (
          <span
            key={m.legacyId}
            title={`${m.title}${m.completed ? ' (done)' : ''}`}
            className={`h-2 flex-1 rounded-sm ${m.completed ? 'bg-[var(--color-accent)]' : 'bg-fill-2'}`}
          />
        ))}
      </div>
      <span className="text-[0.82rem] text-fg-muted">{done} of {modules.length} modules done</span>
    </div>
  );
}

export default function FriendPage({ params }: { params: { userId: string } }) {
  const [data, setData] = useState<FriendView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/friends/view/${params.userId}`);
      if (res.ok) setData(await res.json());
      else setError(res.status === 404 ? 'This person is not in your friends.' : 'Could not load their progress.');
    } catch {
      setError('Could not reach the server.');
    }
  }, [params.userId]);

  useEffect(() => {
    load();
  }, [load]);

  const back = (
    <Link href="/friends" className="flex items-center gap-1.5 self-start text-[0.9rem] text-fg-secondary no-underline hover:text-fg hover:no-underline">
      <Icon name="arrowLeft" size={16} /> Friends
    </Link>
  );

  if (error) return <div className="mx-auto flex max-w-[860px] flex-col gap-4">{back}<p className="text-fg-secondary">{error}</p></div>;
  if (!data) return <p className="text-fg-muted">Loading…</p>;

  const { friend, week, topics, goals } = data;
  const max = Math.max(week.yourMinutes, week.theirMinutes, 1);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9">
      {back}
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em]">{friend.name}</h1>
        <p className="m-0 text-[1.05rem] text-fg-secondary">What {friend.name} shares with you. Your own progress stays yours.</p>
      </header>

      <section aria-labelledby="week-h" className="glass-panel flex flex-col gap-4 p-6">
        <h2 id="week-h" className="m-0 text-[1.05rem] font-semibold">Last 7 days on shared topics</h2>
        {[['You', week.yourMinutes], [friend.name, week.theirMinutes]].map(([who, m]) => (
          <div key={who as string} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
            <span className="truncate text-[0.95rem] text-fg">{who}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-fill-2">
              <span className="block h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${((m as number) / max) * 100}%` }} />
            </span>
            <span className="text-[0.9rem] tabular-nums text-fg-secondary">{minutes(m as number)}</span>
          </div>
        ))}
        {week.yourMinutes === 0 && (
          <p className="m-0 text-[0.85rem] text-fg-muted">Your side only counts topics you share. Pick some on the Friends page.</p>
        )}
      </section>

      {goals.length > 0 && (
        <section aria-labelledby="goals-h" className="flex flex-col gap-3">
          <h2 id="goals-h" className="m-0 text-[1.2rem] font-semibold">Shared goals</h2>
          {goals.map((g) => (
            <div key={g.id} className="glass-panel flex flex-col gap-3 p-5">
              <div className="flex flex-col gap-1">
                <span className="text-[0.82rem] text-fg-muted">
                  {STATUS_WORD[g.status] ?? g.status}
                  {g.readinessTotal > 0 && ` · ${g.readinessMet} of ${g.readinessTotal} ready`}
                  {g.targetDate && ` · by ${new Date(g.targetDate).toLocaleDateString()}`}
                </span>
                <span className="font-serif text-[1.35rem] leading-tight text-fg">{g.title}</span>
                <span className="text-[0.92rem] text-fg-secondary">{g.outcome}</span>
              </div>
              {g.topics.length > 0 && (
                <ol className="m-0 flex flex-col gap-1 pl-5 text-[0.92rem] text-fg-secondary">
                  {g.topics.map((t, i) => <li key={i}>{t.title}</li>)}
                </ol>
              )}
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="topics-h" className="flex flex-col gap-3">
        <h2 id="topics-h" className="m-0 text-[1.2rem] font-semibold">Shared topics <span className="font-normal text-fg-muted">{topics.length}</span></h2>
        {topics.length === 0 ? (
          <p className="m-0 text-[0.95rem] text-fg-muted">{friend.name} hasn't shared any topics yet.</p>
        ) : (
          topics.map((t) => (
            <div key={t.id} className="glass-panel flex flex-col gap-3 p-5">
              <div className="flex flex-col gap-1">
                <span className="text-[0.82rem] text-fg-muted">
                  {t.area} · {STATUS_WORD[t.status] ?? t.status}
                  {t.depthTarget && ` · aiming for ${t.depthTarget}`}
                </span>
                <span className="text-[1.1rem] font-semibold text-fg">{t.title}</span>
              </div>
              {t.modules.length > 0
                ? <ModuleStrip modules={t.modules} />
                : <span className="text-[0.85rem] text-fg-muted">{t.progressPct}% progress</span>}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
