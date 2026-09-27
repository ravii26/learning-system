'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface ProgramRow { goalId: string; title: string; checkinDue: boolean; checkinPending: boolean }

/** Today: a nudge when a learning plan's weekly check-in is ready or waiting for a decision. */
export default function CheckinsDue() {
  const [rows, setRows] = useState<ProgramRow[]>([]);

  useEffect(() => {
    fetch('/api/programs')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ProgramRow[]) => setRows(Array.isArray(d) ? d.filter((p) => p.checkinDue || p.checkinPending) : []))
      .catch(() => {});
  }, []);

  if (!rows.length) return null;
  return (
    <section aria-labelledby="checkin-due-h" className="flex flex-col gap-2 rounded-xl border-[1.5px] border-line px-6 py-4">
      <h2 id="checkin-due-h" className="m-0 text-[1rem] font-semibold">Weekly check-in</h2>
      {rows.map((p) => (
        <Link key={p.goalId} href={`/goals/${p.goalId}`} className="flex items-center justify-between gap-3 text-[0.95rem] no-underline hover:no-underline">
          <span className="text-fg">{p.title}</span>
          <span className="text-[0.88rem] text-fg-secondary">{p.checkinPending ? 'Changes waiting for you →' : 'Review last week →'}</span>
        </Link>
      ))}
    </section>
  );
}
