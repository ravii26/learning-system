/**
 * Structured lesson sections ("blocks") for lessons that aren't a plain
 * concept explanation, e.g. choosing between technologies. The AI returns
 * plain data; the components in src/components/lesson/ draw it, so a bad
 * answer can never break the page. normalizeBlocks() is the only door: it
 * drops a block that can't be drawn and trims the rest to safe sizes.
 *
 * A lesson with no `blocks` renders exactly as before.
 */

export const OPTION_MARKS = ['●', '■', '▲', '◆', '✚'] as const;

export interface TableCell {
  text: string;
  /** 1 = weakest, 3 = strongest on this criterion. Shown as dots, never as colour. */
  rating?: 1 | 2 | 3;
  /** The strongest option on this row. */
  best?: boolean;
}

export interface ComparisonTableBlock {
  type: 'comparison_table';
  title: string;
  options: string[];
  rows: Array<{ criterion: string; cells: TableCell[] }>;
  /** e.g. "Pricing and outlook change often: verify as of Oct 2026." */
  note?: string;
}

export interface ProsConsBlock {
  type: 'pros_cons';
  title: string;
  items: Array<{ option: string; pros: string[]; cons: string[] }>;
  note?: string;
}

/** A node asks a yes/no question, or ends in an outcome. */
export interface FlowNode {
  id: string;
  question?: string;
  yes?: string;
  no?: string;
  outcome?: string;
}

export interface DecisionFlowBlock {
  type: 'decision_flow';
  title: string;
  start: string;
  nodes: FlowNode[];
  note?: string;
}

/** Rough cost per option at a few scales. Numbers are the model's estimates, drawn as "~", never as quotes. */
export interface CostChartBlock {
  type: 'cost_chart';
  title: string;
  /** e.g. "USD per month, rough estimate". */
  unit: string;
  scenarios: Array<{ label: string; assumption: string }>;
  /** One value per scenario, in the same order. */
  series: Array<{ option: string; values: number[] }>;
  note?: string;
}

/** Options placed on two relative scales, 0 to 10 each. */
export interface Matrix2x2Block {
  type: 'matrix_2x2';
  title: string;
  xAxis: { label: string; low: string; high: string };
  yAxis: { label: string; low: string; high: string };
  points: Array<{ option: string; x: number; y: number }>;
  note?: string;
}

/** A field cut into categories, each with a few real examples. */
export interface LandscapeBlock {
  type: 'landscape';
  title: string;
  categories: Array<{ name: string; summary: string; items: Array<{ name: string; note: string }> }>;
  note?: string;
}

/** A learning path in order: phases with a goal and observable milestones. */
export interface TimelineBlock {
  type: 'timeline';
  title: string;
  phases: Array<{ label: string; duration: string; goal: string; milestones: string[] }>;
  note?: string;
}

/** One real (or clearly labelled illustrative) case: what happened and what to take from it. */
export interface CaseStudyBlock {
  type: 'case_study';
  title: string;
  /** "documented" = a public, well-known case; "illustrative" = a made-up scenario, shown as such. */
  basis: 'documented' | 'illustrative';
  situation: string;
  choice: string;
  reasons: string[];
  outcome: string;
  lesson: string;
  note?: string;
}

/** How a state is drawn. Border style, not colour, says what kind of state it is. */
export const STATE_STYLES = ['normal', 'main', 'temporary', 'restricted'] as const;
export type StateStyle = (typeof STATE_STYLES)[number];

/** A lifecycle: states placed on a small grid, and what moves you between them. */
export interface StateDiagramBlock {
  type: 'state_diagram';
  title: string;
  states: Array<{
    id: string;
    label: string;
    /** A line or two under the label, e.g. "$40 a month, renews automatically". */
    detail: string;
    col: number;
    row: number;
    style: StateStyle;
    /** The state a new thing begins in (drawn with a dot and an arrow). */
    start: boolean;
  }>;
  transitions: Array<{ from: string; to: string; label: string }>;
  note?: string;
}

/** Do this, then this: ordered steps, each with how to know it worked and what usually goes wrong. */
export interface StepsBlock {
  type: 'steps';
  title: string;
  steps: Array<{ title: string; instruction: string; check: string; snag: string }>;
  note?: string;
}

/** One practice session split into timed parts, each with a target to hit. */
export interface RoutineBlock {
  type: 'routine';
  title: string;
  parts: Array<{ label: string; minutes: number; instruction: string; target: string }>;
  note?: string;
}

/** Things to memorise, each with a memory aid. */
export interface MemoryListBlock {
  type: 'memory_list';
  title: string;
  items: Array<{ term: string; meaning: string; hook: string }>;
  note?: string;
}

/** How an exam or interview tends to ask about a topic, and the traps in it. */
export interface QuestionPatternsBlock {
  type: 'question_patterns';
  title: string;
  patterns: Array<{ name: string; asked: string; trap: string; tip: string }>;
  note?: string;
}

/** How to work through a book, course or video the learner already has. */
export interface StudyGuideBlock {
  type: 'study_guide';
  title: string;
  resource: { title: string; kind: 'book' | 'course' | 'video' | 'article' | 'other' };
  /** "real_structure" = the parts are the resource's own chapters; "by_position" = we split it by position because its chapters are not known. */
  basis: 'real_structure' | 'by_position';
  before: string[];
  parts: Array<{ label: string; focus: string; questions: string[] }>;
  after: string[];
  note?: string;
}

/** A few ideas worth knowing, and why each is interesting, plus questions to wonder about. */
export interface KeyIdeasBlock {
  type: 'key_ideas';
  title: string;
  ideas: Array<{ idea: string; why: string }>;
  wonder: string[];
  note?: string;
}

export type LessonBlock =
  | ComparisonTableBlock | ProsConsBlock | CostChartBlock | Matrix2x2Block | DecisionFlowBlock
  | LandscapeBlock | TimelineBlock | CaseStudyBlock | StateDiagramBlock
  | StepsBlock | RoutineBlock | MemoryListBlock | QuestionPatternsBlock | StudyGuideBlock | KeyIdeasBlock;
export type BlockType = LessonBlock['type'];

/** Canonical order: how a lesson reads, whatever order the sections were chosen in. */
export const BLOCK_TYPES = [
  'key_ideas', 'landscape', 'study_guide', 'timeline', 'case_study', 'steps', 'routine', 'memory_list', 'question_patterns',
  'comparison_table', 'pros_cons', 'cost_chart', 'matrix_2x2', 'state_diagram', 'decision_flow',
] as const satisfies readonly BlockType[];

export const BLOCK_LABEL: Record<BlockType, string> = {
  key_ideas: 'Key ideas',
  study_guide: 'Study guide',
  steps: 'Step by step',
  routine: 'Practice session',
  memory_list: 'Things to memorise',
  question_patterns: 'How it is asked',
  state_diagram: 'Lifecycle diagram',
  landscape: 'Map of the field',
  timeline: 'Learning path',
  case_study: 'Case study',
  comparison_table: 'Comparison table',
  pros_cons: 'Pros and cons',
  cost_chart: 'Cost at different sizes',
  matrix_2x2: 'Trade-off map (2×2)',
  decision_flow: 'How-to-decide flowchart',
};

export const BLOCK_LIMITS = {
  blocks: 8,
  options: 5,
  rows: 12,
  proCon: 6,
  scenarios: 4,
  categories: 6,
  categoryItems: 6,
  states: 8,
  /** The grid a lifecycle is placed on: columns 0-3, rows 0-2. */
  stateCols: 4,
  stateRows: 3,
  transitions: 14,
  steps: 12,
  routineParts: 6,
  routineMinutes: 180,
  memoryItems: 30,
  patterns: 8,
  studyParts: 10,
  studyQuestions: 4,
  ideas: 8,
  wonder: 4,
  phases: 8,
  milestones: 5,
  reasons: 5,
  flowNodes: 15,
  /** A node reached by two paths is drawn twice; this stops that growing without bound. */
  flowDrawn: 30,
};

const MAX_COST = 1_000_000_000;

/**
 * Which blocks a lesson should have: known types only, once each, in reading
 * order. `allowed` limits it to what one kind of lesson can have. Empty means
 * "use the default".
 */
export function normalizeBlueprint(v: unknown, allowed: readonly BlockType[] = BLOCK_TYPES): BlockType[] {
  const wanted = new Set(Array.isArray(v) ? v : []);
  return BLOCK_TYPES.filter((t) => wanted.has(t) && allowed.includes(t));
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  list(v).map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);

function normalizeTable(b: Record<string, unknown>): ComparisonTableBlock | null {
  const options = strList(b.options, BLOCK_LIMITS.options, 80);
  if (options.length < 2) return null;

  const rows = list(b.rows)
    .map(obj)
    .filter((r): r is Record<string, unknown> => !!r)
    .map((r) => {
      const criterion = str(r.criterion, 80);
      const raw = list(r.cells).map(obj);
      // One cell per option: pad a short row, trim a long one.
      const cells: TableCell[] = options.map((_, i) => {
        const c = raw[i];
        const text = c ? str(c.text, 200) : '';
        const rating = c && (c.rating === 1 || c.rating === 2 || c.rating === 3) ? c.rating : undefined;
        return { text: text || '—', ...(rating ? { rating } : {}), ...(c?.best === true ? { best: true } : {}) };
      });
      return { criterion, cells };
    })
    .filter((r) => r.criterion && r.cells.some((c) => c.text !== '—'))
    .slice(0, BLOCK_LIMITS.rows);
  if (rows.length === 0) return null;

  const note = str(b.note, 300);
  return { type: 'comparison_table', title: str(b.title, 120) || 'Comparison', options, rows, ...(note ? { note } : {}) };
}

function normalizeProsCons(b: Record<string, unknown>): ProsConsBlock | null {
  const items = list(b.items)
    .map(obj)
    .filter((i): i is Record<string, unknown> => !!i)
    .map((i) => ({
      option: str(i.option, 80),
      pros: strList(i.pros, BLOCK_LIMITS.proCon, 200),
      cons: strList(i.cons, BLOCK_LIMITS.proCon, 200),
    }))
    .filter((i) => i.option && (i.pros.length || i.cons.length))
    .slice(0, BLOCK_LIMITS.options);
  if (items.length === 0) return null;

  const note = str(b.note, 300);
  return { type: 'pros_cons', title: str(b.title, 120) || 'Strengths and weaknesses', items, ...(note ? { note } : {}) };
}

function normalizeCostChart(b: Record<string, unknown>): CostChartBlock | null {
  const scenarios = list(b.scenarios)
    .map(obj)
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ label: str(s.label, 40), assumption: str(s.assumption, 120) }))
    .filter((s) => s.label)
    .slice(0, BLOCK_LIMITS.scenarios);
  if (scenarios.length < 2) return null;

  // Each option needs a number for every scenario, or its bars can't be compared.
  const series = list(b.series)
    .map(obj)
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ option: str(s.option, 80), values: list(s.values).slice(0, scenarios.length).map((n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_COST) : NaN)) }))
    .filter((s) => s.option && s.values.length === scenarios.length && s.values.every((n) => !Number.isNaN(n)))
    .slice(0, BLOCK_LIMITS.options);
  if (series.length < 2) return null;

  const note = str(b.note, 300);
  return {
    type: 'cost_chart',
    title: str(b.title, 120) || 'Cost as you grow',
    unit: str(b.unit, 60) || 'USD per month, rough estimate',
    scenarios,
    series,
    ...(note ? { note } : {}),
  };
}

function normalizeAxis(v: unknown): { label: string; low: string; high: string } | null {
  const a = obj(v);
  const label = a ? str(a.label, 60) : '';
  return a && label ? { label, low: str(a.low, 40), high: str(a.high, 40) } : null;
}

function normalizeMatrix(b: Record<string, unknown>): Matrix2x2Block | null {
  const xAxis = normalizeAxis(b.xAxis);
  const yAxis = normalizeAxis(b.yAxis);
  if (!xAxis || !yAxis) return null;

  const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(10, Math.max(0, n)) * 10) / 10 : NaN);
  const points = list(b.points)
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({ option: str(p.option, 80), x: clamp(p.x), y: clamp(p.y) }))
    .filter((p) => p.option && !Number.isNaN(p.x) && !Number.isNaN(p.y))
    .slice(0, BLOCK_LIMITS.options);
  if (points.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'matrix_2x2', title: str(b.title, 120) || 'Trade-off map', xAxis, yAxis, points, ...(note ? { note } : {}) };
}

function normalizeLandscape(b: Record<string, unknown>): LandscapeBlock | null {
  const categories = list(b.categories)
    .map(obj)
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c) => ({
      name: str(c.name, 80),
      summary: str(c.summary, 240),
      items: list(c.items)
        .map(obj)
        .filter((i): i is Record<string, unknown> => !!i)
        .map((i) => ({ name: str(i.name, 80), note: str(i.note, 160) }))
        .filter((i) => i.name)
        .slice(0, BLOCK_LIMITS.categoryItems),
    }))
    .filter((c) => c.name && c.summary && c.items.length > 0)
    .slice(0, BLOCK_LIMITS.categories);
  if (categories.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'landscape', title: str(b.title, 120) || 'The landscape', categories, ...(note ? { note } : {}) };
}

function normalizeTimeline(b: Record<string, unknown>): TimelineBlock | null {
  const phases = list(b.phases)
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({
      label: str(p.label, 80),
      duration: str(p.duration, 40),
      goal: str(p.goal, 240),
      milestones: strList(p.milestones, BLOCK_LIMITS.milestones, 200),
    }))
    .filter((p) => p.label && p.goal)
    .slice(0, BLOCK_LIMITS.phases);
  if (phases.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'timeline', title: str(b.title, 120) || 'The path', phases, ...(note ? { note } : {}) };
}

function normalizeCaseStudy(b: Record<string, unknown>): CaseStudyBlock | null {
  const situation = str(b.situation, 600);
  const choice = str(b.choice, 400);
  const lesson = str(b.lesson, 400);
  if (!situation || !choice || !lesson) return null;

  const note = str(b.note, 300);
  return {
    type: 'case_study',
    title: str(b.title, 120) || 'A case',
    // Anything but an explicit "documented" is shown as illustrative: the safer label.
    basis: b.basis === 'documented' ? 'documented' : 'illustrative',
    situation,
    choice,
    reasons: strList(b.reasons, BLOCK_LIMITS.reasons, 240),
    outcome: str(b.outcome, 500),
    lesson,
    ...(note ? { note } : {}),
  };
}

function normalizeStateDiagram(b: Record<string, unknown>): StateDiagramBlock | null {
  const seenIds = new Set<string>();
  const seenCells = new Set<string>();
  const states: StateDiagramBlock['states'] = [];
  for (const raw of list(b.states).map(obj)) {
    if (!raw || states.length >= BLOCK_LIMITS.states) continue;
    const id = str(raw.id, 40);
    const label = str(raw.label, 40);
    const { col, row } = raw;
    const inGrid = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < max;
    if (!id || !label || seenIds.has(id) || !inGrid(col, BLOCK_LIMITS.stateCols) || !inGrid(row, BLOCK_LIMITS.stateRows)) continue;
    // Two states in one cell would be drawn on top of each other.
    if (seenCells.has(`${col},${row}`)) continue;
    seenIds.add(id);
    seenCells.add(`${col},${row}`);
    states.push({
      id,
      label,
      detail: str(raw.detail, 90),
      col,
      row,
      style: (STATE_STYLES as readonly unknown[]).includes(raw.style) ? (raw.style as StateStyle) : 'normal',
      start: raw.start === true,
    });
  }

  const pairs = new Set<string>();
  const transitions: StateDiagramBlock['transitions'] = [];
  for (const raw of list(b.transitions).map(obj)) {
    if (!raw || transitions.length >= BLOCK_LIMITS.transitions) continue;
    const from = str(raw.from, 40);
    const to = str(raw.to, 40);
    const label = str(raw.label, 60);
    // A label is what triggers the move; an arrow without one says nothing.
    if (!label || from === to || !seenIds.has(from) || !seenIds.has(to) || pairs.has(`${from}>${to}`)) continue;
    pairs.add(`${from}>${to}`);
    transitions.push({ from, to, label });
  }

  // A state nothing connects to is noise: drop it rather than draw an island.
  const connected = new Set(transitions.flatMap((t) => [t.from, t.to]));
  const kept = states.filter((s) => connected.has(s.id));
  if (kept.length < 3 || transitions.length < 3) return null;

  const note = str(b.note, 300);
  return { type: 'state_diagram', title: str(b.title, 120) || 'Lifecycle', states: kept, transitions, ...(note ? { note } : {}) };
}

function normalizeSteps(b: Record<string, unknown>): StepsBlock | null {
  const steps = list(b.steps)
    .map(obj)
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ title: str(s.title, 100), instruction: str(s.instruction, 500), check: str(s.check, 240), snag: str(s.snag, 240) }))
    .filter((s) => s.title && s.instruction)
    .slice(0, BLOCK_LIMITS.steps);
  if (steps.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'steps', title: str(b.title, 120) || 'Step by step', steps, ...(note ? { note } : {}) };
}

function normalizeRoutine(b: Record<string, unknown>): RoutineBlock | null {
  const parts = list(b.parts)
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({
      label: str(p.label, 80),
      minutes: typeof p.minutes === 'number' && Number.isFinite(p.minutes) ? Math.round(p.minutes) : NaN,
      instruction: str(p.instruction, 400),
      target: str(p.target, 200),
    }))
    // A part needs a name, an instruction and a believable duration, or the total at the top would be wrong.
    .filter((p) => p.label && p.instruction && p.minutes >= 1 && p.minutes <= BLOCK_LIMITS.routineMinutes)
    .slice(0, BLOCK_LIMITS.routineParts);
  if (parts.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'routine', title: str(b.title, 120) || 'Practice session', parts, ...(note ? { note } : {}) };
}

function normalizeMemoryList(b: Record<string, unknown>): MemoryListBlock | null {
  const seen = new Set<string>();
  const items = list(b.items)
    .map(obj)
    .filter((i): i is Record<string, unknown> => !!i)
    .map((i) => ({ term: str(i.term, 100), meaning: str(i.meaning, 300), hook: str(i.hook, 200) }))
    .filter((i) => {
      const key = i.term.toLowerCase();
      if (!i.term || !i.meaning || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, BLOCK_LIMITS.memoryItems);
  if (items.length < 3) return null;

  const note = str(b.note, 300);
  return { type: 'memory_list', title: str(b.title, 120) || 'Things to memorise', items, ...(note ? { note } : {}) };
}

function normalizeQuestionPatterns(b: Record<string, unknown>): QuestionPatternsBlock | null {
  const patterns = list(b.patterns)
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({ name: str(p.name, 100), asked: str(p.asked, 400), trap: str(p.trap, 300), tip: str(p.tip, 300) }))
    .filter((p) => p.name && p.asked)
    .slice(0, BLOCK_LIMITS.patterns);
  if (patterns.length < 2) return null;

  const note = str(b.note, 300);
  return { type: 'question_patterns', title: str(b.title, 120) || 'How it is asked', patterns, ...(note ? { note } : {}) };
}

const RESOURCE_KINDS = ['book', 'course', 'video', 'article', 'other'] as const;

function normalizeStudyGuide(b: Record<string, unknown>): StudyGuideBlock | null {
  const res = obj(b.resource);
  const resTitle = res ? str(res.title, 160) : '';
  const parts = list(b.parts)
    .map(obj)
    .filter((p): p is Record<string, unknown> => !!p)
    .map((p) => ({ label: str(p.label, 100), focus: str(p.focus, 400), questions: strList(p.questions, BLOCK_LIMITS.studyQuestions, 240) }))
    .filter((p) => p.label && p.focus)
    .slice(0, BLOCK_LIMITS.studyParts);
  if (!resTitle || parts.length < 2) return null;

  const kind = res && (RESOURCE_KINDS as readonly unknown[]).includes(res.kind) ? (res.kind as StudyGuideBlock['resource']['kind']) : 'other';
  const note = str(b.note, 300);
  return {
    type: 'study_guide',
    title: str(b.title, 120) || 'Study guide',
    resource: { title: resTitle, kind },
    // Anything but an explicit claim of real chapters is shown as a split by position: the safer label.
    basis: b.basis === 'real_structure' ? 'real_structure' : 'by_position',
    before: strList(b.before, BLOCK_LIMITS.studyQuestions, 240),
    parts,
    after: strList(b.after, BLOCK_LIMITS.studyQuestions, 240),
    ...(note ? { note } : {}),
  };
}

function normalizeKeyIdeas(b: Record<string, unknown>): KeyIdeasBlock | null {
  const ideas = list(b.ideas)
    .map(obj)
    .filter((i): i is Record<string, unknown> => !!i)
    .map((i) => ({ idea: str(i.idea, 160), why: str(i.why, 400) }))
    .filter((i) => i.idea && i.why)
    .slice(0, BLOCK_LIMITS.ideas);
  if (ideas.length < 3) return null;

  const note = str(b.note, 300);
  return { type: 'key_ideas', title: str(b.title, 120) || 'Ideas worth knowing', ideas, wonder: strList(b.wonder, BLOCK_LIMITS.wonder, 240), ...(note ? { note } : {}) };
}

function normalizeFlow(b: Record<string, unknown>): DecisionFlowBlock | null {
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const raw of list(b.nodes).map(obj)) {
    if (!raw || nodes.length >= BLOCK_LIMITS.flowNodes) continue;
    const id = str(raw.id, 40);
    if (!id || seen.has(id)) continue;
    const question = str(raw.question, 200);
    const outcome = str(raw.outcome, 200);
    const yes = str(raw.yes, 40);
    const no = str(raw.no, 40);
    if (question && yes && no) nodes.push({ id, question, yes, no });
    else if (outcome) nodes.push({ id, outcome });
    else continue;
    seen.add(id);
  }

  // Every branch must lead somewhere that exists, or the tree can't be drawn.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const resolves = (n: FlowNode) => n.outcome !== undefined || (byId.has(n.yes!) && byId.has(n.no!));
  if (!nodes.every(resolves)) return null;

  // Default to the first node as written (not the first that survived), and a
  // decision has to begin with a question, or a damaged flow shrinks to one outcome.
  const firstWritten = list(b.nodes).map(obj).find((n) => n && str(n.id, 40));
  const start = str(b.start, 40) || str(firstWritten?.id, 40);
  if (!start || !byId.has(start) || byId.get(start)!.outcome !== undefined) return null;

  // No loops, and a bounded drawing: walk from the start, counting every drawn node.
  let drawn = 0;
  const walk = (id: string, path: Set<string>): boolean => {
    if (path.has(id) || ++drawn > BLOCK_LIMITS.flowDrawn) return false;
    const n = byId.get(id)!;
    if (n.outcome !== undefined) return true;
    const next = new Set(path).add(id);
    return walk(n.yes!, next) && walk(n.no!, next);
  };
  if (!walk(start, new Set())) return null;

  const note = str(b.note, 300);
  return { type: 'decision_flow', title: str(b.title, 120) || 'How to decide', start, nodes, ...(note ? { note } : {}) };
}

/** Keeps the blocks that can be drawn, in order; anything else is dropped, not guessed at. */
export function normalizeBlocks(v: unknown): LessonBlock[] {
  const out: LessonBlock[] = [];
  for (const raw of list(v)) {
    const b = obj(raw);
    if (!b) continue;
    const block =
      b.type === 'comparison_table' ? normalizeTable(b)
      : b.type === 'pros_cons' ? normalizeProsCons(b)
      : b.type === 'cost_chart' ? normalizeCostChart(b)
      : b.type === 'matrix_2x2' ? normalizeMatrix(b)
      : b.type === 'decision_flow' ? normalizeFlow(b)
      : b.type === 'landscape' ? normalizeLandscape(b)
      : b.type === 'timeline' ? normalizeTimeline(b)
      : b.type === 'case_study' ? normalizeCaseStudy(b)
      : b.type === 'state_diagram' ? normalizeStateDiagram(b)
      : b.type === 'steps' ? normalizeSteps(b)
      : b.type === 'routine' ? normalizeRoutine(b)
      : b.type === 'memory_list' ? normalizeMemoryList(b)
      : b.type === 'question_patterns' ? normalizeQuestionPatterns(b)
      : b.type === 'study_guide' ? normalizeStudyGuide(b)
      : b.type === 'key_ideas' ? normalizeKeyIdeas(b)
      : null;
    if (block) out.push(block);
    if (out.length >= BLOCK_LIMITS.blocks) break;
  }
  return out;
}
