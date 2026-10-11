'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

/**
 * Single-series bar chart: thin bars with 2px gaps, rounded tops anchored to the
 * baseline, one recessive gridline, per-bar hover tooltip, and a screen-reader
 * table. Two measures of different scale go in two of these, never one dual-axis chart.
 */
export function BarChart({
  data,
  title,
  format,
  barClass = 'bg-auth-accent',
  height = 140,
  highlightLast,
}: {
  data: BarDatum[];
  title: string;
  format: (v: number) => string;
  barClass?: string;
  height?: number;
  highlightLast?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const tickIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <figure className="relative">
      <figcaption className="mb-2 flex items-baseline justify-between text-[12.5px] text-auth-text3">
        <span className="text-auth-text2">{title}</span>
        <span>
          {format(total)} total · peak {format(max)}
        </span>
      </figcaption>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-auth-line" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-auth-line2" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)} aria-hidden="true">
          {data.map((d, i) => {
            const h = d.value === 0 ? 0 : Math.max(2, (d.value / max) * 100);
            const isLast = i === data.length - 1;
            return (
              <div key={d.key} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <div
                  className={cn('w-full rounded-t-[4px] transition-opacity', isLast && highlightLast ? highlightLast : barClass, hover !== null && hover !== i && 'opacity-45')}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        {hover !== null && data[hover] && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-auth-line2 bg-auth-surface2 px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-lg"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <div className="text-auth-text3">{data[hover].label}</div>
            <div className="font-mono font-medium text-auth-text">{format(data[hover].value)}</div>
          </div>
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[11.5px] text-auth-text3" aria-hidden="true">
        {tickIdx.map((i, n) => (
          <span key={i} className={cn('absolute', n === 0 ? 'left-0' : n === 2 ? 'right-0' : 'left-1/2 -translate-x-1/2')}>
            {data[i]?.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
