import type { StateDiagramBlock, StateStyle } from './lessonBlocks';

/**
 * Turns a lifecycle (states on a small grid + transitions) into geometry the
 * component can draw: boxes, arrow paths and label positions. Pure and
 * deterministic so it can be tested without a browser.
 *
 * Routing is deliberately simple and always keeps arrows in the gaps between
 * boxes, never through one:
 *   - neighbours in a row or column: a straight arrow across the gap (a pair
 *     of opposite arrows runs side by side)
 *   - states in adjacent rows: down/up to a horizontal "lane" in the gap
 *     between the rows, across, then into the other box
 *   - states in one row but not neighbours: out of the bottom, along a lane
 *     under the row, back up
 * Anything else (rows two or more apart) or anything that would overcrowd a
 * box edge is left undrawn; the component lists every transition as text, so
 * nothing is lost.
 */

export const GEO = {
  boxW: 176,
  boxH: 74,
  colGap: 120,
  rowGap: 150,
  padX: 34,
  padTop: 44,
  /** Vertical distance between lanes sharing a gap; fits a two-line label. */
  lane: 34,
  /** Where the first lane under the bottom row starts, below the boxes. */
  outerGap: 54,
  /** x offsets from a box's centre for arrows entering/leaving its top or bottom, nearest-lane first. */
  slots: [76, 60, 44],
  pairH: 20,
  pairV: 22,
  maxLanes: 4,
} as const;

export interface PlacedState {
  id: string;
  label: string;
  detailLines: string[];
  style: StateStyle;
  start: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface PlacedRoute {
  /** Index into the block's transitions. */
  index: number;
  from: string;
  to: string;
  label: string;
  /** Axis-aligned polyline, in drawing order; the arrowhead is at the last point. */
  points: Array<[number, number]>;
  labelAt: [number, number];
  labelLines: string[];
  pill: { w: number; h: number };
}

export interface DiagramLayout {
  width: number;
  height: number;
  states: PlacedState[];
  routes: PlacedRoute[];
  /** Indexes of transitions that could not be drawn (they are still listed as text). */
  undrawn: number[];
}

/** Greedy word wrap that never exceeds `maxLines`; the last line ends in an ellipsis if text was cut. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const clip = (l: string) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l);
  if (lines.length <= maxLines) return lines.map(clip);
  const kept = lines.slice(0, maxLines).map(clip);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  return kept;
}

type Kind = 'H' | 'V' | 'Z' | 'N';

interface Route {
  index: number;
  a: PlacedState;
  b: PlacedState;
  ar: number;
  br: number;
  ac: number;
  bc: number;
  kind: Kind | null;
  dropped: boolean;
  label: string;
  /** Row channel the lane lives in (the gap below this row). */
  chan: number;
  laneY: number;
  offA: number;
  offB: number;
}

const kindOf = (ac: number, ar: number, bc: number, br: number): Kind | null => {
  const dc = bc - ac;
  const dr = br - ar;
  if (dr === 0 && Math.abs(dc) === 1) return 'H';
  if (dc === 0 && Math.abs(dr) === 1) return 'V';
  if (Math.abs(dr) === 1 && dc !== 0) return 'Z';
  if (dr === 0 && Math.abs(dc) >= 2) return 'N';
  return null; // rows two or more apart
};

export function layoutStateDiagram(block: StateDiagramBlock): DiagramLayout {
  // Close up empty columns and rows, so a gap in the model's grid does not become a gap on screen.
  const cols = Array.from(new Set(block.states.map((s) => s.col))).sort((p, q) => p - q);
  const rows = Array.from(new Set(block.states.map((s) => s.row))).sort((p, q) => p - q);
  const maxRow = rows.length - 1;
  const { boxW: W, boxH: H } = GEO;

  const cell = new Map<string, { c: number; r: number }>();
  const states: PlacedState[] = block.states.map((s) => {
    const c = cols.indexOf(s.col);
    const r = rows.indexOf(s.row);
    const x = GEO.padX + c * (W + GEO.colGap);
    const y = GEO.padTop + r * (H + GEO.rowGap);
    cell.set(s.id, { c, r });
    return {
      id: s.id,
      label: s.label,
      detailLines: wrapText(s.detail, 30, 2),
      style: s.style,
      start: s.start,
      x, y, w: W, h: H, cx: x + W / 2, cy: y + H / 2,
    };
  });
  const byId = new Map(states.map((s) => [s.id, s]));

  const routes: Route[] = block.transitions.map((t, index) => {
    const a = byId.get(t.from)!;
    const b = byId.get(t.to)!;
    const ca = cell.get(t.from)!;
    const cb = cell.get(t.to)!;
    return { index, a, b, ar: ca.r, br: cb.r, ac: ca.c, bc: cb.c, kind: kindOf(ca.c, ca.r, cb.c, cb.r), dropped: false, label: t.label, chan: 0, laneY: 0, offA: 0, offB: 0 };
  });
  for (const r of routes) {
    if (r.kind === 'Z') r.chan = Math.min(r.ar, r.br);
    else if (r.kind === 'N') r.chan = r.ar;
  }
  const lanes = () => routes.filter((r) => (r.kind === 'Z' || r.kind === 'N') && !r.dropped);

  const rowBottom = (r: number) => GEO.padTop + r * (H + GEO.rowGap) + H;
  const edgeY = (s: PlacedState, side: 'top' | 'bottom') => (side === 'bottom' ? s.y + H : s.y);
  const sidesOf = (r: Route): ['top' | 'bottom', 'top' | 'bottom'] =>
    r.kind === 'N' ? ['bottom', 'bottom'] : r.br > r.ar ? ['bottom', 'top'] : ['top', 'bottom'];

  // Settle lanes and ports. A route that would overcrowd a channel or a box edge is dropped, and
  // everything is worked out again without it.
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;

    const byChan = new Map<number, Route[]>();
    for (const r of lanes()) byChan.set(r.chan, [...(byChan.get(r.chan) ?? []), r]);
    byChan.forEach((group, chan) => {
      group.slice(GEO.maxLanes).forEach((r) => { r.dropped = true; changed = true; });
      const live = group.filter((r) => !r.dropped);
      const n = live.length;
      // Between rows the lanes are centred in the gap; under the last row they start a fixed distance below the boxes.
      const centre = chan < maxRow ? rowBottom(chan) + GEO.rowGap / 2 : rowBottom(chan) + GEO.outerGap + ((n - 1) * GEO.lane) / 2;
      live.forEach((r, k) => { r.laneY = centre + (k - (n - 1) / 2) * GEO.lane; });
    });

    // Ports: arrows on one side of a box, grouped by which way they head. The route whose lane is nearest the
    // box takes the outermost slot, deeper lanes sit inside it, so neighbouring routes do not cross at the box.
    const groups = new Map<string, Array<{ r: Route; end: 'a' | 'b'; depth: number }>>();
    for (const r of lanes()) {
      const [sa, sb] = sidesOf(r);
      for (const end of ['a', 'b'] as const) {
        const s = end === 'a' ? r.a : r.b;
        const far = end === 'a' ? r.b : r.a;
        const side = end === 'a' ? sa : sb;
        const key = `${s.id}|${side}|${far.cx < s.cx ? 'L' : 'R'}`;
        groups.set(key, [...(groups.get(key) ?? []), { r, end, depth: Math.abs(r.laneY - edgeY(s, side)) }]);
      }
    }
    groups.forEach((entries, key) => {
      entries.sort((p, q) => p.depth - q.depth || p.r.index - q.r.index);
      entries.slice(GEO.slots.length).forEach((e) => { e.r.dropped = true; changed = true; });
      const sign = key.endsWith('|L') ? -1 : 1;
      entries.slice(0, GEO.slots.length).forEach((e, k) => {
        const off = sign * GEO.slots[k];
        if (e.end === 'a') e.r.offA = off;
        else e.r.offB = off;
      });
    });

    if (!changed) break;
  }

  // Opposite arrows between the same two neighbours run side by side.
  const pairKey = (r: Route) => `${r.a.id}>${r.b.id}`;
  const keys = new Set(routes.filter((r) => r.kind === 'H' || r.kind === 'V').map(pairKey));
  const hasReverse = (r: Route) => keys.has(`${r.b.id}>${r.a.id}`);

  const placed: PlacedRoute[] = [];
  const undrawn: number[] = [];
  for (const r of routes) {
    if (r.kind === null || r.dropped) { undrawn.push(r.index); continue; }
    let points: Array<[number, number]>;
    let labelAt: [number, number];
    let maxChars: number;

    if (r.kind === 'H') {
      const dir = r.bc > r.ac ? 1 : -1;
      const y = r.a.cy + (hasReverse(r) ? (dir > 0 ? -GEO.pairH : GEO.pairH) : 0);
      const x1 = dir > 0 ? r.a.x + W : r.a.x;
      const x2 = dir > 0 ? r.b.x : r.b.x + W;
      points = [[x1, y], [x2, y]];
      labelAt = [(x1 + x2) / 2, y];
      maxChars = Math.floor((GEO.colGap - 28) / 6);
    } else if (r.kind === 'V') {
      const dir = r.br > r.ar ? 1 : -1;
      const x = r.a.cx + (hasReverse(r) ? (dir > 0 ? -GEO.pairV : GEO.pairV) : 0);
      const y1 = dir > 0 ? r.a.y + H : r.a.y;
      const y2 = dir > 0 ? r.b.y : r.b.y + H;
      points = [[x, y1], [x, y2]];
      // A pair of arrows share the gap, so their labels sit at different heights. `t` counts from the
      // arrow's own start, so the same value puts the downward label high and the upward one low.
      const t = hasReverse(r) ? 0.36 : 0.5;
      labelAt = [x, y1 + (y2 - y1) * t];
      maxChars = 22;
    } else {
      const [sa, sb] = sidesOf(r);
      const xa = r.a.cx + r.offA;
      const xb = r.b.cx + r.offB;
      points = [[xa, edgeY(r.a, sa)], [xa, r.laneY], [xb, r.laneY], [xb, edgeY(r.b, sb)]];
      labelAt = [(xa + xb) / 2, r.laneY];
      maxChars = Math.max(14, Math.min(40, Math.floor((Math.abs(xb - xa) - 30) / 6)));
    }

    const labelLines = wrapText(r.label, maxChars, 2);
    const longest = Math.max(...labelLines.map((l) => l.length));
    placed.push({
      index: r.index,
      from: r.a.id,
      to: r.b.id,
      label: r.label,
      points,
      labelAt,
      labelLines,
      pill: { w: Math.round(longest * 6 + 18), h: labelLines.length * 13 + 6 },
    });
  }

  // A label on a long lane can sit anywhere along it. Move it off other arrows' vertical runs when there is room.
  const verticals = placed.flatMap((p) =>
    p.points.slice(0, -1).flatMap((pt, i) => {
      const nx = p.points[i + 1];
      return pt[0] === nx[0] ? [{ idx: p.index, x: pt[0], y1: Math.min(pt[1], nx[1]), y2: Math.max(pt[1], nx[1]) }] : [];
    }),
  );
  for (const p of placed) {
    if (p.points.length !== 4) continue; // only the routes that run along a lane
    const [, [x1, y], [x2]] = p.points;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    const clashes = (cx: number) =>
      verticals.filter((v) => v.idx !== p.index && v.x > cx - p.pill.w / 2 - 3 && v.x < cx + p.pill.w / 2 + 3 && v.y2 > y - p.pill.h / 2 && v.y1 < y + p.pill.h / 2).length;
    let best = { cx: p.labelAt[0], n: Infinity };
    for (const t of [0.5, 0.35, 0.65, 0.22, 0.78, 0.12, 0.88]) {
      const cx = x1 + (x2 - x1) * t;
      if (cx - p.pill.w / 2 < lo + 2 || cx + p.pill.w / 2 > hi - 2) continue; // would hang off the lane
      const n = clashes(cx);
      if (n < best.n) best = { cx, n };
    }
    p.labelAt = [best.cx, y];
  }

  const ncols = cols.length;
  const lowestLane = Math.max(0, ...lanes().map((r) => r.laneY));
  return {
    width: GEO.padX * 2 + ncols * W + (ncols - 1) * GEO.colGap,
    height: Math.max(rowBottom(maxRow) + 30, lowestLane + 34),
    states,
    routes: placed,
    undrawn,
  };
}
