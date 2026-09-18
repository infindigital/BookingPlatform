'use client';

/**
 * Hand-built inline-SVG charts - no charting dependency (cost policy). Colors
 * come from the design tokens via `currentColor`: each element group sets a
 * Tailwind text color and the SVG shapes fill/stroke with `currentColor`, so
 * everything themes correctly in light and dark.
 */

const W = 720;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 44 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export interface SeriesChartProps {
  labels: string[];
  values: number[];
  /** Formats a value for the axis + tooltips (e.g. money or plain count). */
  format: (v: number) => string;
  /** 'area' for a filled line (bookings/revenue), unused variants reserved. */
  kind?: 'area';
}

export function TimeSeriesChart({ labels, values, format }: SeriesChartProps) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...values));
  const n = values.length;

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPath = n
    ? `M${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} ` +
      values.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
      ` L${x(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
    : '';

  const gridlines = [0, 0.25, 0.5, 0.75, 1];
  // Show at most ~7 x labels.
  const labelStep = Math.max(1, Math.ceil(n / 7));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" preserveAspectRatio="xMidYMid meet">
      {/* gridlines + y labels */}
      <g className="text-border" stroke="currentColor" strokeWidth={1}>
        {gridlines.map((g) => (
          <line key={g} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH * g} y2={PAD.top + innerH * g} strokeOpacity={0.5} />
        ))}
      </g>
      <g className="text-muted-foreground" fontSize={11}>
        {gridlines.map((g) => (
          <text key={g} x={PAD.left - 8} y={PAD.top + innerH * g + 3} textAnchor="end">
            {format(Math.round(max * (1 - g)))}
          </text>
        ))}
        {labels.map((label, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {label}
            </text>
          ) : null,
        )}
      </g>
      {/* area + line */}
      <g className="text-primary">
        {areaPath ? <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" /> : null}
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={n <= 31 ? 2.5 : 1.5} fill="currentColor">
            <title>{`${labels[i]}: ${format(v)}`}</title>
          </circle>
        ))}
      </g>
    </svg>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  sub?: string;
}

export function BarList({ items, format }: { items: BarDatum[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No data in this range.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format ? format(item.value) : item.value}
              {item.sub ? <span className="ml-2 text-xs opacity-70">{item.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface StatusSegment {
  key: string;
  label: string;
  count: number;
  className: string;
}

/** A single proportional stacked bar with a legend, for the status mix. */
export function StatusBar({ segments }: { segments: StatusSegment[] }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No bookings in this range.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.count > 0 ? (
            <div key={s.key} className={s.className} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
          ) : null,
        )}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-sm ${s.className}`} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto tabular-nums font-medium">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
