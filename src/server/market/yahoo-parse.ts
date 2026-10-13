// Pure parser for Yahoo's v8 chart payload → grid-aligned bars + quote meta.
// Kept free of IO so it can be unit-tested against recorded fixtures.

import { INTERVAL_SPEC, isOnGrid, istDay, istMinuteOfDay, SESSION_CLOSE_MIN, type Bar, type Interval } from "./intervals";
import type { QuoteMeta } from "./provider";

export interface YahooChartBody {
  chart?: {
    result?: {
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        exchangeDataDelayedBy?: number | null;
        longName?: string;
        shortName?: string;
        dataGranularity?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export interface ParsedChart {
  bars: Bar[];
  lastBarForming: boolean;
  quote: QuoteMeta;
  /** Bars dropped because they were off the interval grid or incomplete. */
  dropped: number;
}

export function parseYahooChart(
  body: YahooChartBody,
  interval: Interval,
  nowSec: number,
): ParsedChart | { error: string } {
  const result = body.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) {
    return { error: body.chart?.error?.description ?? "Yahoo returned no data." };
  }
  const bars: Bar[] = [];
  let dropped = 0;
  for (let i = 0; i < result.timestamp.length; i++) {
    const ts = result.timestamp[i];
    const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
    if (o == null || h == null || l == null || c == null) {
      dropped++;
      continue;
    }
    if (!isOnGrid(ts, interval)) {
      // Yahoo appends a pseudo-bar stamped with the last trade time.
      dropped++;
      continue;
    }
    bars.push({
      time: ts,
      open: round(o),
      high: round(h),
      low: round(l),
      close: round(c),
      volume: quote.volume?.[i] ?? 0,
    });
  }
  // Defensive: ensure strictly increasing times (Yahoo occasionally repeats).
  const dedup: Bar[] = [];
  for (const b of bars) {
    const prev = dedup.at(-1);
    if (prev && b.time <= prev.time) {
      dedup[dedup.length - 1] = b;
      dropped++;
    } else dedup.push(b);
  }
  const last = dedup.at(-1);
  const lastBarForming =
    last != null &&
    (interval === "1d"
      ? istDay(last.time) === istDay(nowSec) && istMinuteOfDay(nowSec) < SESSION_CLOSE_MIN
      : nowSec < last.time + INTERVAL_SPEC[interval].seconds);
  const m = result.meta ?? {};
  return {
    bars: dedup,
    lastBarForming,
    dropped,
    quote: {
      lastPrice: m.regularMarketPrice ?? null,
      lastTradeTime: m.regularMarketTime ?? null,
      previousClose: m.previousClose ?? m.chartPreviousClose ?? null,
      declaredDelayMin:
        typeof m.exchangeDataDelayedBy === "number" ? m.exchangeDataDelayedBy : null,
      currency: m.currency ?? null,
      longName: m.longName ?? m.shortName ?? null,
    },
  };
}

/** Yahoo serves float32-ish noise (1165.699951…); round to paise. */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
