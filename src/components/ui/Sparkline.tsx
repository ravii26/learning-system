import React from 'react';

/**
 * Tiny inline trend line (SVG, no chart library). Shape only — the caller
 * always renders the actual numbers next to it, since a sparkline alone
 * can't be read precisely. Handles 0 and 1 points and flat series.
 */
export function Sparkline({ values, width = 120, height = 28, color = 'var(--color-primary-light)', label, fill = true }: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label: string; // accessible description, e.g. "notes added per week, last 8 weeks: 0,1,3,..."
  fill?: boolean;
}) {
  const pad = 2;
  if (values.length === 0) {
    return <svg width={width} height={height} role="img" aria-label={`${label}: no data`} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = values.length > 1 ? pad + i * stepX : width / 2;
    // flat series sits on the midline rather than the floor
    const y = max === min ? height / 2 : pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${(pts[pts.length - 1][0]).toFixed(1)},${height - pad}`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      {fill && values.length > 1 && <polygon points={area} fill={color} opacity={0.12} />}
      {values.length > 1 && <polyline points={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}
