"use client";

import { useEffect, useState } from "react";

/* ---------- Animated candlestick mark ---------- */

const BARS = [
  { x: 4, o: 30, c: 22, h: 18, l: 34, up: true },
  { x: 14, o: 22, c: 26, h: 20, l: 29, up: false },
  { x: 24, o: 26, c: 16, h: 12, l: 28, up: true },
  { x: 34, o: 16, c: 19, h: 13, l: 23, up: false },
  { x: 44, o: 19, c: 9, h: 6, l: 21, up: true },
  { x: 54, o: 9, c: 12, h: 7, l: 15, up: false },
];

export function CandleSpinner({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 64 48"
      aria-hidden="true"
      className="loader-candles"
    >
      <line x1="0" y1="40" x2="64" y2="40" stroke="#e4e4e7" strokeWidth="1" />
      {BARS.map((b, i) => (
        <g key={i} style={{ animationDelay: `${i * 0.18}s` }} className="loader-candle">
          <line
            x1={b.x + 3}
            x2={b.x + 3}
            y1={b.h}
            y2={b.l}
            stroke={b.up ? "#059669" : "#dc2626"}
            strokeWidth="1.5"
          />
          <rect
            x={b.x}
            y={Math.min(b.o, b.c)}
            width="6"
            height={Math.max(2, Math.abs(b.o - b.c))}
            rx="1"
            fill={b.up ? "#10b981" : "#ef4444"}
          />
        </g>
      ))}
      <path
        d="M4 32 L14 26 L24 22 L34 18 L44 14 L54 10 L62 7"
        fill="none"
        stroke="#4f46e5"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="loader-trend"
      />
    </svg>
  );
}

/* ---------- Step list that advances on a timer ---------- */

export function useSteppedProgress(count: number, intervalMs = 1400) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, count - 1)),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [count, intervalMs]);
  return step;
}

function StepList({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol className="mt-3 space-y-1.5 text-sm">
      {steps.map((label, i) => {
        const state = i < active ? "done" : i === active ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2.5">
            <span
              className={
                state === "done"
                  ? "flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
                  : state === "active"
                    ? "loader-dot h-4 w-4 rounded-full border-2 border-indigo-500"
                    : "h-4 w-4 rounded-full border-2 border-zinc-200"
              }
            >
              {state === "done" ? "✓" : ""}
            </span>
            <span
              className={
                state === "done"
                  ? "text-zinc-500"
                  : state === "active"
                    ? "font-medium text-zinc-900"
                    : "text-zinc-400"
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Skeleton blocks ---------- */

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`loader-shimmer rounded-md ${className}`} />;
}

export function AnalysisSkeleton() {
  return (
    <div aria-hidden="true" className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <Shimmer className="h-6 w-56" />
        <Shimmer className="h-6 w-28 rounded-full" />
      </div>
      <Shimmer className="h-4 w-3/4" />
      <div className="rounded-lg border border-zinc-200 p-2">
        <Shimmer className="h-[200px] w-full sm:h-[300px]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-4">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="mt-3 h-3 w-full" />
            <Shimmer className="mt-2 h-3 w-5/6" />
            <Shimmer className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Composed loaders ---------- */

const ANALYSIS_STEPS = [
  "Fetching end-of-day candles",
  "Mapping trend, structure & key levels",
  "Checking momentum, volume & volatility",
  "Matching knowledge-base rules",
  "Writing the research report",
];

export function AnalysisLoader({ symbol }: { symbol?: string }) {
  const active = useSteppedProgress(ANALYSIS_STEPS.length);
  return (
    <div role="status" aria-live="polite" className="mt-6">
      <div className="loader-card rounded-lg border border-zinc-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex items-center gap-3 sm:flex-col sm:items-center">
            <CandleSpinner size={96} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900">
              Analysing {symbol ? <span className="text-indigo-600">{symbol}</span> : "stock"}
              <span className="loader-ellipsis" />
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Deterministic analysis · end-of-day data · usually a few seconds
            </p>
            <StepList steps={ANALYSIS_STEPS} active={active} />
          </div>
        </div>
        <div className="loader-bar mt-4 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="loader-bar-fill h-full rounded-full" />
        </div>
      </div>
      <AnalysisSkeleton />
    </div>
  );
}

/** Full-page fallback for Suspense boundaries. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-5xl flex-col items-center px-4 py-24 text-center"
    >
      <CandleSpinner size={80} />
      <p className="mt-4 text-sm font-medium text-zinc-700">
        {label}
        <span className="loader-ellipsis" />
      </p>
      <div className="loader-bar mt-4 h-1 w-48 overflow-hidden rounded-full bg-zinc-100">
        <div className="loader-bar-fill h-full rounded-full" />
      </div>
    </main>
  );
}
