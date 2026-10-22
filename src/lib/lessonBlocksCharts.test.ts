import { describe, it, expect } from 'vitest';
import { normalizeBlocks, normalizeBlueprint } from './lessonBlocks';

describe('normalizeBlocks: cost_chart', () => {
  const chart = {
    type: 'cost_chart',
    title: 'Cost',
    unit: 'USD per month, rough estimate',
    scenarios: [{ label: 'Hobby', assumption: 'few visits' }, { label: 'Scale', assumption: '1M users' }],
    series: [{ option: 'A', values: [0, 900] }, { option: 'B', values: [6, 350] }],
  };

  it('keeps a valid chart', () => {
    expect(normalizeBlocks([chart])).toEqual([chart]);
  });

  it('drops an option without a number for every scenario, and needs two options and two scenarios', () => {
    const out = normalizeBlocks([{ ...chart, series: [...chart.series, { option: 'C', values: [1] }, { option: 'D', values: [1, 'lots'] }, { option: 'E', values: [1, -5] }] }]) as any[];
    expect(out[0].series.map((s: any) => s.option)).toEqual(['A', 'B']);
    expect(normalizeBlocks([{ ...chart, series: [chart.series[0]] }])).toEqual([]);
    expect(normalizeBlocks([{ ...chart, scenarios: [chart.scenarios[0]] }])).toEqual([]);
  });

  it('defaults the unit and caps absurd values', () => {
    const out = normalizeBlocks([{ ...chart, unit: '', series: [{ option: 'A', values: [0, 1e15] }, chart.series[1]] }]) as any[];
    expect(out[0].unit).toBe('USD per month, rough estimate');
    expect(out[0].series[0].values[1]).toBe(1_000_000_000);
  });
});

describe('normalizeBlocks: matrix_2x2', () => {
  const matrix = {
    type: 'matrix_2x2',
    title: 'Map',
    xAxis: { label: 'Ease', low: 'Hard', high: 'Easy' },
    yAxis: { label: 'Control', low: 'Less', high: 'More' },
    points: [{ option: 'A', x: 8, y: 3 }, { option: 'B', x: 5, y: 8 }],
  };

  it('keeps a valid map', () => {
    expect(normalizeBlocks([matrix])).toEqual([matrix]);
  });

  it('clamps positions to 0-10 and drops points that cannot be placed', () => {
    const out = normalizeBlocks([{ ...matrix, points: [{ option: 'A', x: 99, y: -4 }, { option: 'B', x: 5, y: 5 }, { option: 'C', x: 'left', y: 2 }, { option: '', x: 1, y: 1 }] }]) as any[];
    expect(out[0].points).toEqual([{ option: 'A', x: 10, y: 0 }, { option: 'B', x: 5, y: 5 }]);
  });

  it('needs both axis labels and two placeable options', () => {
    expect(normalizeBlocks([{ ...matrix, xAxis: { low: 'a' } }])).toEqual([]);
    expect(normalizeBlocks([{ ...matrix, points: [matrix.points[0]] }])).toEqual([]);
  });
});

describe('normalizeBlueprint', () => {
  it('keeps known sections once, in reading order', () => {
    expect(normalizeBlueprint(['decision_flow', 'banana', 'comparison_table', 'comparison_table', 7])).toEqual(['comparison_table', 'decision_flow']);
  });

  it('is empty for anything that is not a list of known sections', () => {
    expect(normalizeBlueprint(undefined)).toEqual([]);
    expect(normalizeBlueprint('comparison_table')).toEqual([]);
    expect(normalizeBlueprint([])).toEqual([]);
  });
});
