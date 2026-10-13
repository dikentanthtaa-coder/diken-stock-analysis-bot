import "server-only";
import { db } from "@/lib/db";
import { getIntradayBars } from "@/server/market/intraday";
import { INTERVAL_SPEC, isInterval, type Interval } from "@/server/market/intervals";
import { evaluateSignal, summarizeAccuracy, type AccuracyRow } from "./postmortem-calc";
import type { SignalReport } from "./engine";

// Live-record bookkeeping (ported in spirit from "signal-postmortem" /
// "trader-memory-core"): every BUY/SELL the engine emits is written once
// and later graded against what actually happened.

/** Bars to wait before calling a signal "expired" (same as the backtest's time stop). */
const MAX_BARS = 40;

export async function recordSignalEvent(input: {
  symbol: string;
  exchange: "NSE" | "BSE";
  interval: Interval;
  report: SignalReport;
  dataStatus: string;
}): Promise<string | null> {
  const { report } = input;
  const primary = report.timeframes.find((t) => t.interval === input.interval);
  if (!report.plan || !primary || primary.index < 0) return null;
  const stock = await db.stock.findUnique({
    where: { symbol_exchange: { symbol: input.symbol, exchange: input.exchange } },
    select: { id: true },
  });
  if (!stock) return null;
  const barTime = new Date(primary.barTime * 1000);
  // One event per (stock, interval, signal, bar); polling must not duplicate.
  const existing = await db.signalEvent.findFirst({
    where: { stockId: stock.id, interval: input.interval, signal: report.signal, barTime },
    select: { id: true },
  });
  if (existing) return existing.id;
  // Also skip if an identical-direction event is still pending within the last 20 bars
  // (the same setup re-firing bar after bar is one call, not twenty).
  const recent = await db.signalEvent.findFirst({
    where: {
      stockId: stock.id, interval: input.interval, signal: report.signal, outcome: "pending",
      barTime: { gte: new Date((primary.barTime - 20 * INTERVAL_SPEC[input.interval].seconds) * 1000) },
    },
    select: { id: true },
  });
  if (recent) return recent.id;
  const row = await db.signalEvent.create({
    data: {
      stockId: stock.id,
      interval: input.interval,
      signal: report.signal,
      confidence: report.confidence,
      combinedScore: report.combinedScore,
      barTime,
      entry: report.plan.entry,
      stop: report.plan.stop,
      target1: report.plan.target1,
      target2: report.plan.target2,
      dataStatus: input.dataStatus,
    },
    select: { id: true },
  });
  return row.id;
}

/** Grade pending events against the bars that followed. Returns how many changed. */
export async function evaluatePendingSignals(limit = 100): Promise<number> {
  const pending = await db.signalEvent.findMany({
    where: { outcome: "pending" },
    include: { stock: { select: { symbol: true, exchange: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (pending.length === 0) return 0;
  // Group by stock+interval so each series is fetched once.
  const groups = new Map<string, typeof pending>();
  for (const e of pending) {
    const k = `${e.stock.exchange}:${e.stock.symbol}:${e.interval}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  let changed = 0;
  for (const [, events] of groups) {
    const first = events[0];
    if (!isInterval(first.interval)) continue;
    let bars;
    try {
      const d = await getIntradayBars(first.stock.symbol, first.stock.exchange as "NSE" | "BSE", first.interval);
      bars = d.freshness.lastBarForming ? d.bars.slice(0, -1) : d.bars;
    } catch (e) {
      console.error("[postmortem] bars unavailable", first.stock.symbol, first.interval, e);
      continue;
    }
    for (const e of events) {
      const r = evaluateSignal(
        {
          direction: e.signal === "BUY" ? "long" : "short",
          entry: e.entry, stop: e.stop, target1: e.target1,
          barTime: Math.floor(e.barTime.getTime() / 1000),
          maxBars: MAX_BARS,
        },
        bars,
      );
      const changedOutcome = r.outcome !== "pending";
      if (changedOutcome || r.barsChecked !== e.barsChecked) {
        await db.signalEvent.update({
          where: { id: e.id },
          data: {
            outcome: r.outcome,
            barsChecked: r.barsChecked,
            mfeR: r.mfeR,
            maeR: r.maeR,
            resultR: r.resultR,
            evaluatedAt: changedOutcome ? new Date() : null,
          },
        });
        if (changedOutcome) changed++;
      }
    }
  }
  return changed;
}

export interface LiveRecord {
  rows: AccuracyRow[];
  recent: {
    id: string; symbol: string; exchange: string; interval: string; signal: string; confidence: number;
    barTime: string; entry: number; stop: number; target1: number; outcome: string; barsChecked: number; resultR: number | null; mfeR: number | null; maeR: number | null;
  }[];
  totals: { total: number; evaluated: number; hitRate: number | null; avgResultR: number | null };
  maxBars: number;
}

export async function getLiveRecord(opts: { symbol?: string; exchange?: string; interval?: string; take?: number } = {}): Promise<LiveRecord> {
  const where = {
    ...(opts.interval ? { interval: opts.interval } : {}),
    ...(opts.symbol && opts.exchange ? { stock: { symbol: opts.symbol, exchange: opts.exchange } } : {}),
  };
  const events = await db.signalEvent.findMany({
    where,
    include: { stock: { select: { symbol: true, exchange: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const rows = summarizeAccuracy(events.map((e) => ({ interval: e.interval, signal: e.signal, outcome: e.outcome, resultR: e.resultR })));
  const graded = events.filter((e) => e.outcome === "target1" || e.outcome === "stop" || e.outcome === "expired");
  const decided = events.filter((e) => e.outcome === "target1" || e.outcome === "stop");
  const rSum = graded.reduce((a, e) => a + (e.resultR ?? 0), 0);
  return {
    rows,
    recent: events.slice(0, opts.take ?? 25).map((e) => ({
      id: e.id, symbol: e.stock.symbol, exchange: e.stock.exchange, interval: e.interval, signal: e.signal, confidence: e.confidence,
      barTime: e.barTime.toISOString(), entry: e.entry, stop: e.stop, target1: e.target1, outcome: e.outcome, barsChecked: e.barsChecked,
      resultR: e.resultR, mfeR: e.mfeR, maeR: e.maeR,
    })),
    totals: {
      total: events.length,
      evaluated: graded.length,
      hitRate: decided.length ? decided.filter((e) => e.outcome === "target1").length / decided.length : null,
      avgResultR: graded.length ? Math.round((rSum / graded.length) * 100) / 100 : null,
    },
    maxBars: MAX_BARS,
  };
}
