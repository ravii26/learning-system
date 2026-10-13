'use client';

import React from 'react';
import { BLOCK_LABEL, BLOCK_TYPES, type BlockType } from '@/lib/lessonBlocks';

/**
 * Which sections a lesson should have, out of the ones its kind can have
 * (KIND_BLOCKS). At least one stays ticked: an empty choice would mean "the
 * default", which would be a surprise.
 */
export function BlueprintPicker({ allowed, value, onChange }: { allowed: readonly BlockType[]; value: BlockType[]; onChange: (next: BlockType[]) => void }) {
  const toggle = (t: BlockType) => {
    const on = value.includes(t);
    if (on && value.length === 1) return;
    onChange(BLOCK_TYPES.filter((x) => (x === t ? !on : value.includes(x))));
  };
  // A single-section kind has nothing to choose.
  if (allowed.length < 2) return null;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[0.9rem] font-semibold text-fg-secondary">Sections in this lesson</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {allowed.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-2 text-[0.9rem]">
            <input type="checkbox" checked={value.includes(t)} onChange={() => toggle(t)} className="h-4 w-4 accent-[var(--ink)]" />
            {BLOCK_LABEL[t]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
