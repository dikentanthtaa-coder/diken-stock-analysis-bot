// Pure forward evaluation of an emitted signal against the bars that came
// after it. Conservative intrabar convention: stop before target.

import type { Bar } from "@/server/market/intervals";

export interface PostmortemInput {
  direction: "long" | "short";
  entry: number;
  stop: number;
  target1: number;
  /** Unix seconds of the last closed bar the signal was based on. */
  barTime: number;
  maxBars: number;
}

export interface PostmortemResult {
  outcome: "pending" | "target1" | "stop" | "expired" | "invalid";
  barsChecked: number;
  mfeR: number | null;
  maeR: number | null;
  resultR: number | null;
}

export function evaluateSignal(input: PostmortemInput, bars: Bar[]): PostmortemResult {
  const dir = input.direction === "long" ? 1 : -1;
  const risk = dir * (input.entry - input.stop);
  if (!(risk > 0)) return { outcome: "invalid", barsChecked: 0, mfeR: null, maeR: null, resultR: null };
  const after = bars.filter((b) => b.time > input.barTime);
  if (after.length === 0) return { outcome: "pending", barsChecked: 0, mfeR: null, maeR: null, resultR: null };
  let mfe = 0, mae = 0;
  const n = Math.min(after.length, input.maxBars);
  for (let k = 0; k < n; k++) {
    const b = after[k];
    const fav = (dir * ((dir > 0 ? b.high : b.low) - input.entry)) / risk;
    const adv = (dir * (input.entry - (dir > 0 ? b.low : b.high))) / risk;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);
    const hitStop = dir > 0 ? b.low <= input.stop : b.high >= input.stop;
    const hitTarget = dir > 0 ? b.high >= input.target1 : b.low <= input.target1;
    if (hitStop) return { outcome: "stop", barsChecked: k + 1, mfeR: r2(mfe), maeR: r2(Math.max(mae, 1)), resultR: -1 };
    if (hitTarget) return { outcome: "target1", barsChecked: k + 1, mfeR: r2(Math.max(mfe, (dir * (input.target1 - input.entry)) / risk)), maeR: r2(mae), resultR: r2((dir * (input.target1 - input.entry)) / risk) };
  }
  const last = after[n - 1];
  const openR = (dir * (last.close - input.entry)) / risk;
  if (n >= input.maxBars) return { outcome: "expired", barsChecked: n, mfeR: r2(mfe), maeR: r2(mae), resultR: r2(openR) };
  return { outcome: "pending", barsChecked: n, mfeR: r2(mfe), maeR: r2(mae), resultR: r2(openR) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface AccuracyRow {
  interval: string;
  signal: string;
  total: number;
  evaluated: number;
  target1: number;
  stop: number;
  expired: number;
  hitRate: number | null; // target1 / (target1 + stop)
  avgResultR: number | null;
}

export function summarizeAccuracy(
  rows: { interval: string; signal: string; outcome: string; resultR: number | null }[],
): AccuracyRow[] {
  const map = new Map<string, AccuracyRow & { rSum: number; rN: number }>();
  for (const r of rows) {
    const key = `${r.interval}|${r.signal}`;
    const row = map.get(key) ?? { interval: r.interval, signal: r.signal, total: 0, evaluated: 0, target1: 0, stop: 0, expired: 0, hitRate: null, avgResultR: null, rSum: 0, rN: 0 };
    row.total++;
    if (r.outcome === "target1") { row.target1++; row.evaluated++; }
    if (r.outcome === "stop") { row.stop++; row.evaluated++; }
    if (r.outcome === "expired") { row.expired++; row.evaluated++; }
    if (r.resultR != null && r.outcome !== "pending" && r.outcome !== "invalid") { row.rSum += r.resultR; row.rN++; }
    map.set(key, row);
  }
  return [...map.values()].map(({ rSum, rN, ...row }) => ({
    ...row,
    hitRate: row.target1 + row.stop > 0 ? row.target1 / (row.target1 + row.stop) : null,
    avgResultR: rN > 0 ? Math.round((rSum / rN) * 100) / 100 : null,
  })).sort((a, b) => a.interval.localeCompare(b.interval) || a.signal.localeCompare(b.signal));
}
