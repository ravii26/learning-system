'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { LessonNote, LessonNoteGroup } from '@/lib/lessonNotes';

const PREVIEW_LENGTH = 320;
const linkClass = 'text-[0.85rem] font-medium text-fg-secondary';

function NoteText({ text, open }: { text: string; open: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > PREVIEW_LENGTH;
  const shown = open || expanded || !long ? text : `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="m-0 whitespace-pre-wrap text-[0.98rem] leading-relaxed text-fg-secondary">{shown}</p>
      {long && !open && (
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="bg-transparent p-0 text-[0.85rem] font-medium text-fg-muted hover:text-fg">
          {expanded ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

function LessonRow({ topicId, note, open }: { topicId: string; note: LessonNote; open: boolean }) {
  const lessonId = encodeURIComponent(note.moduleId);
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link href={`/topics/${topicId}?module=${lessonId}`} className="text-[1rem] font-semibold text-fg">{note.title}</Link>
        <Link href={`/topics/${topicId}?module=${lessonId}&notes=1`} className={linkClass}>Edit</Link>
      </div>
      <NoteText text={note.text} open={open} />
    </li>
  );
}

/** Every note from your lessons. While searching, matches are shown in full. */
export default function LessonNotesList({ groups, searching }: { groups: LessonNoteGroup[]; searching: boolean }) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section key={g.topicId} className="flex flex-col gap-1">
          <h3 className="m-0 font-serif text-[1.35rem] font-medium">
            <Link href={`/topics/${g.topicId}`} className="text-fg no-underline hover:underline">{g.topicTitle}</Link>
          </h3>
          <ul className="m-0 list-none p-0">
            {g.lessons.map((note) => <LessonRow key={note.moduleId} topicId={g.topicId} note={note} open={searching} />)}
            {g.topicNotes && (
              <li className="flex flex-col gap-2 py-3.5">
                <span className="text-[0.85rem] font-semibold text-fg-muted">Notes on the whole topic</span>
                <NoteText text={g.topicNotes} open={searching} />
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
