import { describe, it, expect } from 'vitest';
import { normalizeBlocks, type StateDiagramBlock } from './lessonBlocks';
import { GEO, layoutStateDiagram, wrapText, type DiagramLayout } from './stateDiagramLayout';
import { KIND_BLOCKS, KIND_DEFAULT_BLOCKS, isDefaultBlueprint } from './lessonKinds';
import { buildKindMessages } from './kindLessons';
import { buildDecisionMessages } from './decisionLesson';

const st = (id: string, col: number, row: number, extra: Record<string, unknown> = {}) => ({ id, label: id.toUpperCase(), col, row, ...extra });
const tr = (from: string, to: string, label = `${from} to ${to}`) => ({ from, to, label });

/** The subscription lifecycle from the design mockup. */
const subscription = {
  type: 'state_diagram',
  title: 'Subscription',
  states: [
    st('free', 0, 0, { label: 'Free trial', detail: '60 days from creation, +30 days once (feedback)', start: true }),
    st('trial', 1, 0, { label: 'Trial, card on file', detail: '$0 paid, charged when trial ends' }),
    st('active', 2, 0, { label: 'Active', detail: '$40/month or $400/year, renews automatically', style: 'main' }),
    st('locked', 0, 1, { label: 'Locked', detail: 'owner sent to Billing, staff cannot log in', style: 'restricted' }),
    st('grace', 1, 1, { label: 'Grace', detail: 'renewal payment failed, 3 days to fix the card', style: 'temporary' }),
    st('cancelled', 2, 1, { label: 'Cancelled', detail: 'usable until period end, undo in Stripe portal' }),
  ],
  transitions: [
    tr('free', 'trial', 'subscribes'), tr('trial', 'free', 'cancelled: days kept'), tr('trial', 'active', 'trial ends, $40 charged'),
    tr('free', 'locked', '60 days pass, no card'), tr('grace', 'locked', '3 days pass'), tr('active', 'grace', 'renewal fails'),
    tr('grace', 'active', 'card fixed'), tr('active', 'cancelled', 'cancel'), tr('cancelled', 'active', 'undo'),
    tr('cancelled', 'locked', 'period ends'), tr('locked', 'active', 'subscribes again, first $40 charged now'),
  ],
};

const parse = (raw: unknown): StateDiagramBlock => {
  const [b] = normalizeBlocks([raw]);
  if (!b || b.type !== 'state_diagram') throw new Error('expected a state_diagram');
  return b;
};

describe('normalizeBlocks: state_diagram', () => {
  it('keeps the subscription example whole', () => {
    const b = parse(subscription);
    expect(b.states).toHaveLength(6);
    expect(b.transitions).toHaveLength(11);
    expect(b.states.find((s) => s.id === 'active')!.style).toBe('main');
    expect(b.states.find((s) => s.id === 'free')!.start).toBe(true);
  });

  it('defaults the style, and ignores a style it does not know', () => {
    const b = parse({ ...subscription, states: subscription.states.map((s, i) => (i === 1 ? { ...s, style: 'glowing' } : s)) });
    expect(b.states[1].style).toBe('normal');
  });

  it('drops states with a bad id, label, cell or a cell already taken', () => {
    const b = parse({
      ...subscription,
      states: [
        ...subscription.states,
        st('off', 9, 0), st('off2', 0, 7), st('', 3, 2), { id: 'nolabel', label: '', col: 3, row: 0 },
        st('active', 3, 2), // duplicate id
        st('clash', 0, 0), // cell already taken by "free"
      ],
    });
    expect(b.states.map((s) => s.id)).toEqual(['free', 'trial', 'active', 'locked', 'grace', 'cancelled']);
  });

  it('drops transitions to unknown states, to itself, unlabeled, or repeated', () => {
    const b = parse({
      ...subscription,
      transitions: [...subscription.transitions, tr('free', 'ghost'), tr('free', 'free'), { from: 'free', to: 'trial', label: '' }, tr('free', 'trial', 'again')],
    });
    expect(b.transitions).toHaveLength(11);
  });

  it('drops a state nothing connects to, and needs 3 states and 3 transitions to survive', () => {
    const lone = parse({ ...subscription, states: [...subscription.states, st('island', 3, 0)] });
    expect(lone.states.map((s) => s.id)).not.toContain('island');
    expect(normalizeBlocks([{ ...subscription, transitions: subscription.transitions.slice(0, 2) }])).toEqual([]);
    expect(normalizeBlocks([{ ...subscription, states: subscription.states.slice(0, 2), transitions: [tr('free', 'trial')] }])).toEqual([]);
  });

  it('caps states and transitions', () => {
    const many = Array.from({ length: 12 }, (_, i) => st(`s${i}`, i % 4, Math.floor(i / 4)));
    const links = many.slice(1).map((s, i) => tr(many[i].id, s.id)).concat(many.slice(1).map((s, i) => tr(s.id, many[i].id, 'back')));
    const b = parse({ type: 'state_diagram', states: many, transitions: links });
    expect(b.states.length).toBeLessThanOrEqual(8);
    expect(b.transitions.length).toBeLessThanOrEqual(14);
  });
});

describe('wrapText', () => {
  it('wraps on words and stops at the line limit with an ellipsis', () => {
    expect(wrapText('trial ends, $40 charged', 12, 2)).toEqual(['trial ends,', '$40 charged']);
    expect(wrapText('one two three four five six', 8, 2)).toEqual(['one two', 'three…']);
    expect(wrapText('', 10, 2)).toEqual([]);
    expect(wrapText('supercalifragilistic', 8, 2)).toEqual(['superca…']);
  });
});

// ── geometry checks ──────────────────────────────────────────────────────────

/** True when an axis-aligned segment passes through the inside of a box (touching an edge is fine). */
const crossesBox = (a: [number, number], b: [number, number], box: { x: number; y: number; w: number; h: number }) => {
  const eps = 0.5;
  const [x1, y1] = a, [x2, y2] = b;
  const insideX = (x: number) => x > box.x + eps && x < box.x + box.w - eps;
  const insideY = (y: number) => y > box.y + eps && y < box.y + box.h - eps;
  if (y1 === y2) return insideY(y1) && Math.max(x1, x2) > box.x + eps && Math.min(x1, x2) < box.x + box.w - eps;
  if (x1 === x2) return insideX(x1) && Math.max(y1, y2) > box.y + eps && Math.min(y1, y2) < box.y + box.h - eps;
  return true; // a diagonal segment would mean a routing bug
};

const expectClean = (layout: DiagramLayout, name: string) => {
  for (const r of layout.routes) {
    r.points.forEach(([x, y]) => {
      expect(x, `${name}: x in canvas`).toBeGreaterThanOrEqual(0);
      expect(x, `${name}: x in canvas`).toBeLessThanOrEqual(layout.width);
      expect(y, `${name}: y in canvas`).toBeGreaterThanOrEqual(0);
      expect(y, `${name}: y in canvas`).toBeLessThanOrEqual(layout.height);
    });
    for (let i = 0; i + 1 < r.points.length; i++) {
      for (const s of layout.states) {
        expect(crossesBox(r.points[i], r.points[i + 1], s), `${name}: route ${r.from}->${r.to} segment ${i} crosses ${s.id}`).toBe(false);
      }
    }
    // The label pill must not sit on a box either.
    const [lx, ly] = r.labelAt;
    for (const s of layout.states) {
      const overlap = lx + r.pill.w / 2 > s.x && lx - r.pill.w / 2 < s.x + s.w && ly + r.pill.h / 2 > s.y && ly - r.pill.h / 2 < s.y + s.h;
      expect(overlap, `${name}: label "${r.label}" overlaps ${s.id}`).toBe(false);
    }
  }
};

describe('layoutStateDiagram: the subscription example', () => {
  const layout = layoutStateDiagram(parse(subscription));

  it('draws every transition', () => {
    expect(layout.undrawn).toEqual([]);
    expect(layout.routes).toHaveLength(11);
  });

  it('never routes an arrow through a state, and keeps everything inside the canvas', () => {
    expectClean(layout, 'subscription');
  });

  it('places the grid as designed: three columns, two rows', () => {
    const x = (id: string) => layout.states.find((s) => s.id === id)!.x;
    const y = (id: string) => layout.states.find((s) => s.id === id)!.y;
    expect(x('free')).toBeLessThan(x('trial'));
    expect(x('trial')).toBeLessThan(x('active'));
    expect(y('locked')).toBeGreaterThan(y('free'));
    expect(x('locked')).toBe(x('free'));
  });

  it('opposite neighbours run side by side, not on top of each other', () => {
    const ys = (from: string, to: string) => layout.routes.find((r) => r.from === from && r.to === to)!.points[0][1];
    expect(ys('free', 'trial')).not.toBe(ys('trial', 'free'));
    const xs = (from: string, to: string) => layout.routes.find((r) => r.from === from && r.to === to)!.points[0][0];
    expect(xs('active', 'cancelled')).not.toBe(xs('cancelled', 'active'));
  });

  it('labels of a pair of opposite vertical arrows sit at different heights, so one never hides the other', () => {
    const at = (from: string, to: string) => layout.routes.find((r) => r.from === from && r.to === to)!.labelAt[1];
    expect(Math.abs(at('active', 'cancelled') - at('cancelled', 'active'))).toBeGreaterThan(20);
  });

  it('no two labels overlap each other', () => {
    for (let i = 0; i < layout.routes.length; i++) {
      for (let j = i + 1; j < layout.routes.length; j++) {
        const a = layout.routes[i], b = layout.routes[j];
        const hit = Math.abs(a.labelAt[0] - b.labelAt[0]) < (a.pill.w + b.pill.w) / 2 && Math.abs(a.labelAt[1] - b.labelAt[1]) < (a.pill.h + b.pill.h) / 2;
        expect(hit, `"${a.label}" overlaps "${b.label}"`).toBe(false);
      }
    }
  });

  it('every route ends on the edge of its target and starts on the edge of its source', () => {
    for (const r of layout.routes) {
      const a = layout.states.find((s) => s.id === r.from)!;
      const b = layout.states.find((s) => s.id === r.to)!;
      const on = (p: [number, number], s: typeof a) => {
        const [x, y] = p;
        const onVert = (x === s.x || x === s.x + s.w) && y >= s.y && y <= s.y + s.h;
        const onHoriz = (y === s.y || y === s.y + s.h) && x >= s.x && x <= s.x + s.w;
        return onVert || onHoriz;
      };
      expect(on(r.points[0], a), `${r.from}->${r.to} starts on ${r.from}`).toBe(true);
      expect(on(r.points[r.points.length - 1], b), `${r.from}->${r.to} ends on ${r.to}`).toBe(true);
    }
  });

  it('gives every label at most two lines', () => {
    for (const r of layout.routes) expect(r.labelLines.length).toBeLessThanOrEqual(2);
  });
});

describe('layoutStateDiagram: other shapes', () => {
  it('a straight chain', () => {
    const b = parse({ type: 'state_diagram', states: [st('a', 0, 0), st('b', 1, 0), st('c', 2, 0), st('d', 3, 0)], transitions: [tr('a', 'b'), tr('b', 'c'), tr('c', 'd')] });
    const l = layoutStateDiagram(b);
    expect(l.undrawn).toEqual([]);
    expectClean(l, 'chain');
  });

  it('a skip across a row goes under the boxes', () => {
    const b = parse({ type: 'state_diagram', states: [st('a', 0, 0), st('b', 1, 0), st('c', 2, 0)], transitions: [tr('a', 'b'), tr('b', 'c'), tr('a', 'c', 'skip ahead')] });
    const l = layoutStateDiagram(b);
    expect(l.undrawn).toEqual([]);
    const skip = l.routes.find((r) => r.label === 'skip ahead')!;
    expect(skip.points).toHaveLength(4);
    expect(skip.points[1][1]).toBeGreaterThan(GEO.padTop + GEO.boxH); // below the row
    expectClean(l, 'skip');
  });

  it('rows two apart are not drawn but still reported, and the rest still draws', () => {
    const b = parse({
      type: 'state_diagram',
      states: [st('a', 0, 0), st('b', 0, 1), st('c', 0, 2), st('d', 1, 0)],
      transitions: [tr('a', 'b'), tr('b', 'c'), tr('a', 'c', 'too far'), tr('d', 'a')],
    });
    const l = layoutStateDiagram(b);
    expect(l.undrawn).toEqual([2]);
    expect(l.routes).toHaveLength(3);
    expectClean(l, 'far');
  });

  it('closes up empty columns and rows', () => {
    const b = parse({ type: 'state_diagram', states: [st('a', 0, 0), st('b', 3, 0), st('c', 3, 2)], transitions: [tr('a', 'b'), tr('b', 'c'), tr('c', 'a')] });
    const l = layoutStateDiagram(b);
    const [a, bb] = [l.states[0], l.states[1]];
    expect(bb.x - a.x).toBe(GEO.boxW + GEO.colGap); // columns 0 and 3 sit side by side
    expect(l.undrawn).toEqual([]);
    expectClean(l, 'closed');
  });

  it('is deterministic', () => {
    const b = parse(subscription);
    expect(JSON.stringify(layoutStateDiagram(b))).toBe(JSON.stringify(layoutStateDiagram(b)));
  });
});

describe('layoutStateDiagram: many random lifecycles never cross a box', () => {
  // A small seeded generator so a failure can be reproduced.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  it('300 random diagrams on the full 4x3 grid', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed);
      const cells = Array.from({ length: 12 }, (_, i) => ({ col: i % 4, row: Math.floor(i / 4) })).sort(() => rand() - 0.5);
      const n = 3 + Math.floor(rand() * 6);
      const states = cells.slice(0, n).map((c, i) => st(`s${i}`, c.col, c.row));
      const transitions: Array<ReturnType<typeof tr>> = [];
      const want = 3 + Math.floor(rand() * 12);
      for (let k = 0; k < want * 4 && transitions.length < want; k++) {
        const a = Math.floor(rand() * n), b = Math.floor(rand() * n);
        if (a !== b && !transitions.some((t) => t.from === `s${a}` && t.to === `s${b}`)) transitions.push(tr(`s${a}`, `s${b}`, `go ${a} ${b}`));
      }
      const raw = { type: 'state_diagram', states, transitions };
      const [block] = normalizeBlocks([raw]);
      if (!block || block.type !== 'state_diagram') continue; // too sparse to be a valid diagram
      const layout = layoutStateDiagram(block);
      expectClean(layout, `seed ${seed}`);
      expect(layout.routes.length + layout.undrawn.length, `seed ${seed}: every transition is drawn or reported`).toBe(block.transitions.length);
    }
  });
});

describe('state_diagram in lessons', () => {
  it('is optional: allowed for decision, survey and case study, never on by default', () => {
    for (const k of ['decision', 'survey', 'case_study'] as const) {
      expect(KIND_BLOCKS[k]).toContain('state_diagram');
      expect(KIND_DEFAULT_BLOCKS[k]).not.toContain('state_diagram');
    }
    expect(KIND_BLOCKS.roadmap).not.toContain('state_diagram');
    expect(KIND_BLOCKS.concept).toEqual([]);
  });

  it('knows when a choice of sections is just the default', () => {
    expect(isDefaultBlueprint('decision', KIND_DEFAULT_BLOCKS.decision)).toBe(true);
    expect(isDefaultBlueprint('decision', [...KIND_DEFAULT_BLOCKS.decision, 'state_diagram'])).toBe(false);
    expect(isDefaultBlueprint('decision', ['comparison_table'])).toBe(false);
  });

  it('a normal decision lesson prompt does not ask for a diagram; a chosen one does', () => {
    const input = { topicTitle: 'T', moduleTitle: 'Choosing a plan', area: 'Tech', learnerLevel: 'beginner', priorKnowledge: '', planBlock: '', coursePosition: '', weaknesses: [], mistakes: [], today: 'October 2026' };
    expect(buildDecisionMessages(input)[0].content).not.toContain('"type": "state_diagram"');
    const [s] = buildDecisionMessages({ ...input, blueprint: ['comparison_table', 'state_diagram'] });
    expect(s.content).toContain('"type": "state_diagram"');
    expect(s.content).toMatch(/ONLY for something that really has a lifecycle/);
    expect(s.content).toMatch(/cannot be drawn/);
    expect(buildKindMessages('survey', { ...input, blueprint: ['landscape', 'state_diagram'] })[0].content).toContain('"type": "state_diagram"');
    expect(buildKindMessages('roadmap', { ...input, blueprint: ['state_diagram'] })[0].content).not.toContain('"type": "state_diagram"');
  });

  it('the prompt example is itself a valid, drawable diagram', () => {
    const input = { topicTitle: 'T', moduleTitle: 'M', area: 'Tech', learnerLevel: 'beginner', priorKnowledge: '', planBlock: '', coursePosition: '', weaknesses: [], mistakes: [], today: 'October 2026' };
    const [s] = buildDecisionMessages({ ...input, blueprint: ['state_diagram'] });
    const open = s.content.indexOf('[', s.content.indexOf('"blocks": ['));
    let depth = 0, end = open;
    for (let i = open; i < s.content.length; i++) {
      if (s.content[i] === '[') depth++;
      if (s.content[i] === ']' && --depth === 0) { end = i; break; }
    }
    const blocks = normalizeBlocks(JSON.parse(s.content.slice(open, end + 1)));
    expect(blocks.map((b) => b.type)).toEqual(['state_diagram']);
    const l = layoutStateDiagram(blocks[0] as StateDiagramBlock);
    expect(l.undrawn).toEqual([]);
    expectClean(l, 'prompt example');
  });
});
