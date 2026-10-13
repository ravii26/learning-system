import React from 'react';
import { StateDiagram } from './StateDiagram';
import { KeyIdeas, MemoryList, QuestionPatterns, Routine, Steps, StudyGuide } from './StudyBlocks';
import { BLOCK_LABEL, OPTION_MARKS, type CaseStudyBlock, type ComparisonTableBlock, type CostChartBlock, type DecisionFlowBlock, type FlowNode, type LandscapeBlock, type LessonBlock, type Matrix2x2Block, type ProsConsBlock, type TimelineBlock } from '@/lib/lessonBlocks';

/**
 * Draws lesson blocks (see lib/lessonBlocks.ts). Colour is reserved for
 * knowledge state in this app, so nothing here uses it: options are told
 * apart by a shape, ratings are dots, pros and cons are + and −.
 */

const mark = (i: number) => OPTION_MARKS[i % OPTION_MARKS.length];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-[1.15rem] font-semibold">{children}</h3>;
}

function Note({ children }: { children?: string }) {
  return children ? <p className="m-0 text-[0.85rem] text-fg-muted">{children}</p> : null;
}

function Dots({ rating }: { rating: 1 | 2 | 3 }) {
  return (
    <span className="mr-1.5 tracking-[0.15em] text-fg" role="img" aria-label={`${rating} out of 3`}>
      {'●'.repeat(rating)}
      <span className="text-fg-muted">{'○'.repeat(3 - rating)}</span>
    </span>
  );
}

function ComparisonTable({ block }: { block: ComparisonTableBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-collapse text-[0.9rem] leading-snug">
          <caption className="sr-only">{block.title}. Filled dots show how strong an option is on a criterion; a star marks the best option in that row.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[20%] border-b border-line p-2 text-left font-medium text-fg-secondary"><span className="sr-only">Criterion</span></th>
              {block.options.map((o, i) => (
                <th key={i} scope="col" className="border-b border-line p-2 text-left font-semibold">
                  <span aria-hidden="true" className="mr-1.5 text-fg-secondary">{mark(i)}</span>{o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, ri) => (
              <tr key={ri}>
                <th scope="row" className="border-b border-line p-2 text-left align-top font-medium text-fg-secondary">{r.criterion}</th>
                {r.cells.map((c, ci) => (
                  <td key={ci} className={`border-b border-line p-2 align-top ${c.best ? 'font-semibold' : ''}`}>
                    {c.rating && <Dots rating={c.rating} />}
                    {c.best && <span className="mr-1" role="img" aria-label="best in this row">★</span>}
                    {c.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{block.note}</Note>
    </section>
  );
}

function ProsCons({ block }: { block: ProsConsBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        {block.items.map((it, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <h4 className="m-0 text-[1rem] font-semibold"><span aria-hidden="true" className="mr-1.5 text-fg-secondary">{mark(i)}</span>{it.option}</h4>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[0.95rem] leading-snug">
              {it.pros.map((p, j) => (
                <li key={`p${j}`} className="flex gap-2"><span aria-label="Pro" role="img" className="w-3 shrink-0 font-semibold">+</span><span>{p}</span></li>
              ))}
              {it.cons.map((c, j) => (
                <li key={`c${j}`} className="flex gap-2 text-fg-secondary"><span aria-label="Con" role="img" className="w-3 shrink-0 font-semibold">−</span><span>{c}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Note>{block.note}</Note>
    </section>
  );
}

/** 1200 -> "1.2k", 60 -> "60". Bars carry "~" because these are estimates, not quotes. */
export function formatCost(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(Math.round(v / 100) / 10).toString()}k`;
  return String(Math.round(v));
}

// Options are told apart by a mark and a shade of ink, never by hue.
const SHADE = [1, 0.7, 0.5, 0.35, 0.22];

function CostChart({ block }: { block: CostChartBlock }) {
  // One scale for every bar, so "small" looks small next to "large" instead of each group stretching to fill.
  const max = Math.max(1, ...block.series.flatMap((s) => s.values));
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <p className="m-0 text-[0.85rem] text-fg-secondary">{block.unit}. Rough estimates, one scale for every bar.</p>
      <div className="flex flex-col gap-5">
        {block.scenarios.map((sc, si) => (
          <div key={si} className="flex flex-col gap-1.5">
            <p className="m-0 text-[0.95rem] font-semibold">
              {sc.label}
              {sc.assumption && <span className="ml-2 font-normal text-fg-muted">{sc.assumption}</span>}
            </p>
            {block.series.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(90px,28%)_1fr] items-center gap-3 text-[0.85rem]">
                <span className="truncate"><span aria-hidden="true" className="mr-1.5 text-fg-secondary">{mark(i)}</span>{s.option}</span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-3.5 rounded-sm bg-ink"
                    style={{ width: `${Math.max(1.5, (s.values[si] / max) * 100)}%`, opacity: SHADE[i % SHADE.length] }}
                    role="img"
                    aria-label={`${s.option}, ${sc.label}: about ${formatCost(s.values[si])}`}
                  />
                  <span className="shrink-0 tabular-nums text-fg-secondary">~{formatCost(s.values[si])}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Note>{block.note}</Note>
    </section>
  );
}

const W = 640, H = 330, L = 70, R = 620, T = 16, B = 280;
const px = (x: number) => L + (x / 10) * (R - L);
const py = (y: number) => B - (y / 10) * (B - T);

/** One distinct shape per option, drawn centred on (cx, cy). */
function Marker({ i, cx, cy }: { i: number; cx: number; cy: number }) {
  const fill = 'var(--ink)';
  switch (i % 5) {
    case 0: return <circle cx={cx} cy={cy} r={8} fill={fill} />;
    case 1: return <rect x={cx - 7.5} y={cy - 7.5} width={15} height={15} fill={fill} />;
    case 2: return <path d={`M${cx} ${cy - 9} L${cx + 9} ${cy + 7} L${cx - 9} ${cy + 7} Z`} fill={fill} />;
    case 3: return <path d={`M${cx} ${cy - 9} L${cx + 9} ${cy} L${cx} ${cy + 9} L${cx - 9} ${cy} Z`} fill={fill} />;
    default: return <path d={`M${cx - 3} ${cy - 9} h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 Z`} fill={fill} />;
  }
}

function Matrix2x2({ block }: { block: Matrix2x2Block }) {
  const desc = block.points.map((p) => `${p.option}: ${block.xAxis.label} ${p.x} of 10, ${block.yAxis.label} ${p.y} of 10`).join('. ');
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[720px]" role="img" aria-label={block.title}>
        <title>{block.title}</title>
        <desc>{desc}</desc>
        <rect x={L} y={T} width={R - L} height={B - T} fill="none" stroke="var(--border-strong)" />
        <line x1={(L + R) / 2} y1={T} x2={(L + R) / 2} y2={B} stroke="var(--border-color)" strokeDasharray="4 4" />
        <line x1={L} y1={(T + B) / 2} x2={R} y2={(T + B) / 2} stroke="var(--border-color)" strokeDasharray="4 4" />
        <g fontSize="12" fill="var(--color-text-muted)">
          <text x={L} y={B + 16}>{block.xAxis.low}</text>
          <text x={R} y={B + 16} textAnchor="end">{block.xAxis.high}</text>
          <text x={L - 8} y={B} textAnchor="end">{block.yAxis.low}</text>
          <text x={L - 8} y={T + 10} textAnchor="end">{block.yAxis.high}</text>
        </g>
        <g fontSize="13" fill="var(--color-text-secondary)" textAnchor="middle">
          <text x={(L + R) / 2} y={H - 8}>{block.xAxis.label} →</text>
          <text transform={`translate(14 ${(T + B) / 2}) rotate(-90)`}>{block.yAxis.label} →</text>
        </g>
        {block.points.map((p, i) => {
          const cx = px(p.x), cy = py(p.y);
          const flip = cx > R - 140;
          return (
            <g key={i}>
              <Marker i={i} cx={cx} cy={cy} />
              <text x={flip ? cx - 14 : cx + 14} y={cy + 4} fontSize="13" fontWeight="600" fill="var(--color-text-primary)" textAnchor={flip ? 'end' : 'start'}>{p.option}</text>
            </g>
          );
        })}
      </svg>
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[0.85rem] text-fg-secondary">
        {block.points.map((p, i) => <li key={i}><span aria-hidden="true" className="mr-1.5">{mark(i)}</span>{p.option}</li>)}
      </ul>
      <Note>{block.note}</Note>
    </section>
  );
}

function FlowBranch({ label, id, byId, path }: { label: 'Yes' | 'No'; id: string; byId: Map<string, FlowNode>; path: string[] }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">{label}</span>
      <FlowStep id={id} byId={byId} path={path} />
    </li>
  );
}

function FlowStep({ id, byId, path }: { id: string; byId: Map<string, FlowNode>; path: string[] }) {
  const n = byId.get(id);
  // normalizeBlocks already rejects loops and dangling ids; this keeps a hand-edited lesson from recursing forever.
  if (!n || path.includes(id)) return null;
  if (n.outcome !== undefined) {
    return <p className="m-0 w-fit rounded-lg border-[1.5px] border-ink px-3 py-1.5 text-[0.95rem] font-medium">{n.outcome}</p>;
  }
  const next = [...path, id];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[1rem] font-medium">{n.question}</p>
      <ul className="m-0 flex list-none flex-col gap-3 border-l border-line-strong pl-4">
        <FlowBranch label="Yes" id={n.yes!} byId={byId} path={next} />
        <FlowBranch label="No" id={n.no!} byId={byId} path={next} />
      </ul>
    </div>
  );
}

function DecisionFlow({ block }: { block: DecisionFlowBlock }) {
  const byId = new Map(block.nodes.map((n) => [n.id, n]));
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <FlowStep id={block.start} byId={byId} path={[]} />
      <Note>{block.note}</Note>
    </section>
  );
}

function Landscape({ block }: { block: LandscapeBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        {block.categories.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-4">
            <h4 className="m-0 text-[1rem] font-semibold">{c.name}</h4>
            <p className="m-0 text-[0.9rem] leading-snug text-fg-secondary">{c.summary}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.9rem] leading-snug">
              {c.items.map((it, j) => (
                <li key={j}><span className="font-medium">{it.name}</span>{it.note && <span className="text-fg-secondary">: {it.note}</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Note>{block.note}</Note>
    </section>
  );
}

function Timeline({ block }: { block: TimelineBlock }) {
  return (
    <section className="flex flex-col gap-3">
      <Heading>{block.title}</Heading>
      <ol className="m-0 flex list-none flex-col gap-0 p-0">
        {block.phases.map((p, i) => (
          <li key={i} className="grid grid-cols-[2rem_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink text-[0.8rem] font-semibold">{i + 1}</span>
              {i < block.phases.length - 1 && <span aria-hidden="true" className="w-px flex-1 bg-line-strong" />}
            </div>
            <div className="flex flex-col gap-1.5 pb-6">
              <p className="m-0 text-[1rem] font-semibold">
                {p.label}
                {p.duration && <span className="ml-2 text-[0.85rem] font-normal text-fg-muted">{p.duration}</span>}
              </p>
              <p className="m-0 text-[0.95rem] leading-snug text-fg-secondary">{p.goal}</p>
              {p.milestones.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.9rem] leading-snug">
                  {p.milestones.map((m, j) => (
                    <li key={j} className="flex gap-2"><span aria-hidden="true" className="shrink-0 text-fg-muted">☐</span><span>{m}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
      <Note>{block.note}</Note>
    </section>
  );
}

function CaseStudy({ block }: { block: CaseStudyBlock }) {
  const row = (label: string, body: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.8rem] font-semibold uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="m-0 text-[0.95rem] leading-relaxed">{body}</dd>
    </div>
  );
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <Heading>{block.title}</Heading>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[0.75rem] text-fg-secondary">
          {block.basis === 'documented' ? 'Documented case' : 'Illustrative scenario, not a real company'}
        </span>
      </div>
      <dl className="m-0 flex flex-col gap-3 rounded-xl border border-line p-4">
        {row('Situation', block.situation)}
        {row('What they chose', block.choice)}
        {block.reasons.length > 0 && row('Why', <ul className="m-0 list-disc pl-5">{block.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>)}
        {block.outcome && row('What happened', block.outcome)}
        {row('The lesson', <span className="font-medium">{block.lesson}</span>)}
      </dl>
      <Note>{block.note}</Note>
    </section>
  );
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case 'state_diagram': return <StateDiagram block={block} />;
    case 'steps': return <Steps block={block} />;
    case 'routine': return <Routine block={block} />;
    case 'memory_list': return <MemoryList block={block} />;
    case 'question_patterns': return <QuestionPatterns block={block} />;
    case 'study_guide': return <StudyGuide block={block} />;
    case 'key_ideas': return <KeyIdeas block={block} />;
    case 'landscape': return <Landscape block={block} />;
    case 'timeline': return <Timeline block={block} />;
    case 'case_study': return <CaseStudy block={block} />;
    case 'comparison_table': return <ComparisonTable block={block} />;
    case 'pros_cons': return <ProsCons block={block} />;
    case 'cost_chart': return <CostChart block={block} />;
    case 'matrix_2x2': return <Matrix2x2 block={block} />;
    case 'decision_flow': return <DecisionFlow block={block} />;
  }
}

export function LessonBlocks({ blocks, onRedo, redoing }: {
  blocks: LessonBlock[];
  /** When given, each section gets a "Redo" button that rewrites just that section. */
  onRedo?: (index: number) => void;
  /** Index of the section being rewritten right now. */
  redoing?: number | null;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="lesson-blocks flex flex-col gap-10">
      {blocks.map((b, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Block block={b} />
          {onRedo && (
            <button
              type="button"
              onClick={() => onRedo(i)}
              disabled={redoing != null}
              aria-label={`Redo the ${BLOCK_LABEL[b.type].toLowerCase()} section`}
              className="self-start text-[0.85rem] font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
            >
              {redoing === i ? 'Rewriting…' : 'Redo this section'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
