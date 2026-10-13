"use client";

import { useEffect, useRef, useState } from "react";


export interface Series {
  name: string;
  color: string;
}

export interface Bucket {
  key: string; // e.g. 2026-10-13
  label: string; // short axis label
  values: number[]; // one per series
}

function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  rows: { name: string; color: string; value: string }[];
}) {
  const flip = x > width * 0.65;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs shadow-md"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 10) }}
    >
      <p className="font-medium text-zinc-700">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
            <span className="font-semibold text-zinc-900">{r.value}</span>
            <span className="text-zinc-500">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Stacked columns (activity per day) ---------- */

export function StackedColumns({
  data,
  series,
  height = 180,
  emptyText = "No activity yet.",
}: {
  data: Bucket[];
  series: Series[];
  height?: number;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 8, right: 8, bottom: 22, left: 28 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(3, slot * 0.66));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 64))));
  const allZero = totals.every((t) => t === 0);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label="Activity per day" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#ececef" strokeWidth="1" />
            <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#8b8b93">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.left + slot * i + slot / 2;
          let acc = 0;
          const segs = d.values.map((v, si) => {
            const y0 = y(acc);
            acc += v;
            const y1 = y(acc);
            return { si, v, top: y1, h: Math.max(0, y0 - y1) };
          });
          const topIdx = [...segs].reverse().find((s) => s.v > 0)?.si;
          return (
            <g key={d.key}>
              {segs.map((s) =>
                s.v > 0 ? (
                  s.si === topIdx ? (
                    <path
                      key={s.si}
                      d={`M${cx - barW / 2},${s.top + s.h} V${s.top + 4} Q${cx - barW / 2},${s.top} ${cx - barW / 2 + 4},${s.top} H${cx + barW / 2 - 4} Q${cx + barW / 2},${s.top} ${cx + barW / 2},${s.top + 4} V${s.top + s.h} Z`}
                      fill={series[s.si].color}
                      stroke="#fff"
                      strokeWidth="2"
                      paintOrder="stroke"
                    />
                  ) : (
                    <rect
                      key={s.si}
                      x={cx - barW / 2}
                      y={s.top}
                      width={barW}
                      height={s.h}
                      fill={series[s.si].color}
                      stroke="#fff"
                      strokeWidth="2"
                      paintOrder="stroke"
                    />
                  )
                ) : null,
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill="#8b8b93">
                  {d.label}
                </text>
              )}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={innerH}
                fill={hover === i ? "rgba(79,70,229,0.06)" : "transparent"}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {allZero && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">{emptyText}</p>
      )}
      {hover != null && data[hover] && (
        <Tooltip
          x={pad.left + slot * hover + slot / 2}
          y={pad.top}
          width={width}
          title={`${data[hover].key} · ${totals[hover]} total`}
          rows={series.map((s, si) => ({ name: s.name, color: s.color, value: String(data[hover].values[si]) }))}
        />
      )}
      <Legend series={series} />
    </div>
  );
}

/* ---------- Line chart (cumulative growth) ---------- */

export function LineChart({
  data,
  series,
  height = 180,
  ariaLabel = "Line chart",
}: {
  data: Bucket[];
  series: Series[];
  height?: number;
  ariaLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 10, right: 12, bottom: 22, left: 36 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const n = data.length;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 72))));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = Math.round((px / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#ececef" strokeWidth="1" />
            <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#8b8b93">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          (i % labelEvery === 0 && i < n - 1 - labelEvery / 2) || i === n - 1 ? (
            <text
              key={d.key}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="10"
              fill="#8b8b93"
            >
              {d.label}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.values[si])}`).join(" ");
          const last = data[n - 1];
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {last && (
                <circle cx={x(n - 1)} cy={y(last.values[si])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
              )}
            </g>
          );
        })}
        {hover != null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#a1a1aa" strokeWidth="1" />
            {series.map((s, si) => (
              <circle
                key={s.name}
                cx={x(hover)}
                cy={y(data[hover].values[si])}
                r="4"
                fill={s.color}
                stroke="#fff"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>
      {n === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">No data yet.</p>
      )}
      {hover != null && data[hover] && (
        <Tooltip
          x={x(hover)}
          y={pad.top}
          width={width}
          title={data[hover].key}
          rows={series.map((s, si) => ({ name: s.name, color: s.color, value: String(data[hover].values[si]) }))}
        />
      )}
      <Legend series={series} />
    </div>
  );
}

/* ---------- Horizontal bars (categories, direct-labeled) ---------- */

export function HBars({
  rows,
  format = (v) => String(v),
  emptyText = "Nothing yet.",
}: {
  rows: { label: string; value: number; color: string; hint?: string }[];
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return <p className="mt-2 text-xs text-zinc-400">{emptyText}</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm" title={r.hint}>
          <span className="truncate text-zinc-600">{r.label}</span>
          <span className="h-3.5 overflow-hidden rounded-r bg-zinc-100">
            <span
              className="block h-full rounded-r"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color, minWidth: r.value > 0 ? 3 : 0 }}
            />
          </span>
          <span className="w-12 text-right tabular-nums text-zinc-900">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
