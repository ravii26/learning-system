'use client';

import React, { useMemo, useState } from 'react';
import type { StateDiagramBlock } from '@/lib/lessonBlocks';
import { layoutStateDiagram, type PlacedState } from '@/lib/stateDiagramLayout';

/**
 * Draws a lifecycle. Colour is reserved for knowledge state in this app, so
 * what kind of state something is shows in its border: thick = the main
 * state, dashed = temporary, double = restricted, a dot = where it starts.
 * Every transition is also listed as text under the picture, so the picture
 * never carries meaning alone (and arrows that could not be drawn still show).
 */

const INK = 'var(--ink)';
const EDGE = 'var(--border-strong)';
const SOFT = 'var(--color-text-secondary)';

function Box({ s, dim, selected, onPick }: { s: PlacedState; dim: boolean; selected: boolean; onPick: () => void }) {
  const fill = s.style === 'main' ? 'var(--bg-sunk)' : 'var(--bg-surface)';
  const stroke = s.style === 'normal' ? EDGE : INK;
  const [focused, setFocused] = useState(false);
  // SVG groups get no browser focus ring, so keyboard focus thickens the border instead.
  const width = (s.style === 'main' ? 3 : s.style === 'restricted' ? 1.4 : 1.6) + (focused ? 1.6 : 0);
  const labelY = s.detailLines.length === 0 ? s.cy + 5 : s.y + 27;
  return (
    <g
      className="cursor-pointer outline-none"
      style={{ opacity: dim ? 0.3 : 1, transition: 'opacity .15s' }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${s.label}${s.detailLines.length ? `: ${s.detailLines.join(' ')}` : ''}`}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } }}
    >
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={10} fill={fill} stroke={stroke} strokeWidth={width} strokeDasharray={s.style === 'temporary' ? '7 4' : undefined} />
      {s.style === 'restricted' && <rect x={s.x + 6} y={s.y + 6} width={s.w - 12} height={s.h - 12} rx={7} fill="none" stroke={stroke} strokeWidth={1.4} />}
      <text x={s.cx} y={labelY} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-text-primary)">{s.label}</text>
      {s.detailLines.map((l, i) => (
        <text key={i} x={s.cx} y={labelY + 19 + i * 14} textAnchor="middle" fontSize={11} fill={SOFT}>{l}</text>
      ))}
    </g>
  );
}

export function StateDiagram({ block }: { block: StateDiagramBlock }) {
  const layout = useMemo(() => layoutStateDiagram(block), [block]);
  const [picked, setPicked] = useState<string | null>(null);
  const name = (id: string) => block.states.find((s) => s.id === id)?.label ?? id;
  const used = new Set(block.states.map((s) => s.style));
  const hasStart = block.states.some((s) => s.start);

  const linked = (id: string) => picked === null || id === picked || block.transitions.some((t) => (t.from === picked && t.to === id) || (t.to === picked && t.from === id));
  const onPath = (from: string, to: string) => picked === null || from === picked || to === picked;

  const out = picked ? block.transitions.filter((t) => t.from === picked) : [];
  const into = picked ? block.transitions.filter((t) => t.to === picked) : [];

  const summary = block.transitions.map((t) => `${name(t.from)} to ${name(t.to)}: ${t.label}`).join('. ');

  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 text-[1.15rem] font-semibold">{block.title}</h3>
      <div className="overflow-x-auto rounded-xl border border-line p-3">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: '100%', minWidth: Math.min(layout.width, 720), maxWidth: layout.width }} role="img" aria-label={block.title}>
          <title>{block.title}</title>
          <desc>{summary}</desc>
          <defs>
            <marker id="sd-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M2 1L8.5 5L2 9" fill="none" stroke={SOFT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {layout.routes.map((r) => (
            <path
              key={r.index}
              d={r.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')}
              fill="none"
              stroke={SOFT}
              strokeWidth={1.4}
              markerEnd="url(#sd-arrow)"
              style={{ opacity: onPath(r.from, r.to) ? 1 : 0.1, transition: 'opacity .15s' }}
            />
          ))}

          {layout.states.filter((s) => s.start).map((s) => (
            <g key={`start-${s.id}`} style={{ opacity: linked(s.id) ? 1 : 0.3 }}>
              <circle cx={s.cx} cy={s.y - 32} r={4} fill={INK} />
              <path d={`M${s.cx} ${s.y - 28} L${s.cx} ${s.y - 2}`} stroke={SOFT} strokeWidth={1.4} fill="none" markerEnd="url(#sd-arrow)" />
            </g>
          ))}

          {layout.states.map((s) => (
            <Box key={s.id} s={s} dim={!linked(s.id)} selected={picked === s.id} onPick={() => setPicked(picked === s.id ? null : s.id)} />
          ))}

          {layout.routes.map((r) => (
            <g key={`l-${r.index}`} style={{ opacity: onPath(r.from, r.to) ? 1 : 0.1, transition: 'opacity .15s' }} pointerEvents="none">
              <rect x={r.labelAt[0] - r.pill.w / 2} y={r.labelAt[1] - r.pill.h / 2} width={r.pill.w} height={r.pill.h} rx={Math.min(9, r.pill.h / 2)} fill="var(--bg-base)" />
              {r.labelLines.map((l, i) => (
                <text key={i} x={r.labelAt[0]} y={r.labelAt[1] - ((r.labelLines.length - 1) * 13) / 2 + i * 13 + 4} textAnchor="middle" fontSize={11} fill={SOFT}>{l}</text>
              ))}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8rem] text-fg-secondary">
        {used.has('main') && <span>Thick border: the main state</span>}
        {used.has('temporary') && <span>Dashed border: temporary</span>}
        {used.has('restricted') && <span>Double border: restricted</span>}
        {hasStart && <span>Dot: where it starts</span>}
        <span>Click a state to follow its arrows</span>
      </div>

      <p className="m-0 min-h-[2.8em] text-[0.9rem] text-fg-secondary" aria-live="polite">
        {picked && (
          <>
            <strong className="font-semibold text-fg">{name(picked)}.</strong>{' '}
            Goes to: {out.length ? out.map((t) => `${name(t.to)} (${t.label})`).join('; ') : 'nowhere, it is an end state'}.{' '}
            Reached from: {into.length ? into.map((t) => `${name(t.from)} (${t.label})`).join('; ') : 'nowhere, it is where things start'}.
          </>
        )}
      </p>

      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[0.85rem] text-fg-secondary">
        {block.transitions.map((t, i) => (
          <li key={i}>
            {name(t.from)} → {name(t.to)}: {t.label}
            {layout.undrawn.includes(i) ? ' (not drawn above)' : ''}
          </li>
        ))}
      </ul>
      {block.note && <p className="m-0 text-[0.85rem] text-fg-muted">{block.note}</p>}
    </section>
  );
}
